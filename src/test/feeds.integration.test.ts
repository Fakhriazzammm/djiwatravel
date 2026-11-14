/**
 * Feeds end to end against a real Postgres. Skipped unless TEST_DATABASE_URL points at a
 * throwaway database that has every migration applied (including 069_feeds.sql):
 *   TEST_DATABASE_URL=postgresql://apple@127.0.0.1:5432/feeds_verify npx vitest run src/test/feeds.integration.test.ts
 */
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });

const url = process.env["TEST_DATABASE_URL"];
const holder = vi.hoisted(() => ({
  pool: null as unknown,
  user: { id: "u-rani", email: "rani@test.id" } as { id: string; email: string } | null,
  names: { "u-rani": "Rani Putri", "u-dimas": "Dimas" } as Record<string, string>,
  notifications: [] as { subject: string; type: string; href: string }[],
  agenda: [] as unknown[],
}));
vi.mock("@/db/client.server", () => ({
  get pool() {
    return holder.pool;
  },
}));
vi.mock("@/lib/customer-session.fn", () => ({
  getAuthenticatedUser: async () => {
    if (!holder.user) throw new Error("Autentikasi diperlukan");
    return holder.user;
  },
}));
vi.mock("@/lib/customer-profile.server", () => ({
  readCustomerProfile: async (user: { id: string }) => ({
    displayName: holder.names[user.id] ?? null,
  }),
}));
vi.mock("@/lib/admin-guard", () => ({ requireAdmin: async () => undefined }));
vi.mock("@/lib/admin-guard.server", () => ({ getAdminEmailHandler: async () => "ops@djiwa.test" }));
vi.mock("@/lib/push.server", () => ({
  createCustomerNotification: async (n: { subject: string; type: string; href: string }) => {
    holder.notifications.push(n);
    return { created: true };
  },
}));
vi.mock("@/lib/my-trips.server", () => ({
  addItineraryItem: async (input: unknown) => {
    holder.agenda.push(input);
    return { id: "item-1" };
  },
}));

const describeDb = url ? describe : describe.skip;
const JPEG = (() => {
  const bytes = new Uint8Array(32).fill(9);
  bytes.set([255, 216, 255]);
  return bytes;
})();
const as = (id: string | null) => (holder.user = id ? { id, email: `${id}@test.id` } : null);

describeDb("feeds against a real database", () => {
  let server: typeof import("@/lib/feeds.server");
  let pool: pg.Pool;

  const setConfig = async (patch: Record<string, unknown>) => {
    await pool.query(
      `insert into admin_settings (setting_key, value_json, version, updated_at)
       values ('feeds', $1::jsonb, 1, now())
       on conflict (setting_key) do update set value_json = excluded.value_json, version = admin_settings.version + 1`,
      [JSON.stringify({ enabled: true, ...patch })],
    );
    // The config cache lasts 30 s; saving through the handler clears it.
    const row = await pool.query("select version from admin_settings where setting_key='feeds'");
    await server.saveFeedsConfigHandler({
      data: {
        config: { enabled: true, ...patch },
        expectedVersion: Number(row.rows[0].version),
        reason: "test setup",
      },
    });
  };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    holder.pool = pool;
    server = await import("@/lib/feeds.server");
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await pool.query(
      "truncate feed_reports, feed_likes, feed_comments, feed_bans, feed_posts cascade",
    );
    await pool.query("delete from admin_settings where setting_key='feeds'");
    await pool.query(
      "delete from admin_audit_logs where action like 'feeds.%' or entity_id = 'feeds'",
    );
    // Posting and commenting need "community"; every test user has agreed unless a test says otherwise.
    await pool.query("truncate customer_data_consents, customer_consent_prompts");
    await pool.query(
      `insert into customer_data_consents (customer_auth_subject, purpose, granted, policy_version, source)
       select s, 'community', true, 'test', 'settings'
         from unnest(array['u-rani','u-dimas','u-lain']) s`,
    );
    server.setGuideSyncClock(Date.now());
    holder.notifications.length = 0;
    holder.agenda.length = 0;
    as("u-rani");
    await setConfig({ reviewFirstPosts: 1 });
  });

  const post = (body: string, extra: Partial<Parameters<typeof server.createFeedPost>[0]> = {}) =>
    server.createFeedPost({ subject: holder.user!.id, body, kind: "tips", ...extra });
  const list = (data: Record<string, unknown> = {}) =>
    server.listFeedHandler({ data: server.feedListInput(data) });

  it("is off by default: nothing is listed and posting is refused", async () => {
    await pool.query("delete from admin_settings where setting_key='feeds'");
    await server.saveFeedsConfigHandler({
      data: { config: { enabled: false }, expectedVersion: 0, reason: "off" },
    });
    expect((await list()).enabled).toBe(false);
    await expect(post("halo")).rejects.toThrow(/belum tersedia/);
  });

  it("holds the first post for review, shows it only to its author, then approves it", async () => {
    const created = await post("Ichiran jam 15.00 sepi", {
      placeName: "Ichiran Shibuya",
      destinationCode: "jp",
    });
    expect(created.pending).toBe(true);
    expect(created.post.authorName).toBe("Rani");
    expect(created.post.destinationCode).toBe("JP");

    expect((await list()).posts).toHaveLength(0);
    expect((await list()).pending.map((p) => p.id)).toEqual([created.post.id]);
    as("u-dimas");
    expect((await list()).pending).toHaveLength(0);

    const admin = await server.getAdminFeedsHandler();
    expect(admin.stats.pending).toBe(1);
    expect(admin.pending[0]?.flag).toBe("post_awal");

    await server.adminFeedActionHandler({
      data: server.adminFeedActionInput({ postId: created.post.id, action: "approve" }),
    });
    expect((await list()).posts.map((p) => p.id)).toEqual([created.post.id]);
    expect(holder.notifications.map((n) => n.type)).toContain("feed_post");
    const audit = await pool.query(
      "select action from admin_audit_logs where action='feeds.approve'",
    );
    expect(audit.rowCount).toBe(1);

    // After one approved post the next one goes live at once (reviewFirstPosts = 1).
    as("u-rani");
    const second = await post("Tips kedua");
    expect(second.pending).toBe(false);
    expect((await list()).posts).toHaveLength(2);
  });

  it("holds a post containing a banned word, even from a trusted account", async () => {
    await setConfig({ reviewFirstPosts: 0, bannedWords: ["judi"] });
    const clean = await post("Tips aman");
    expect(clean.pending).toBe(false);
    const held = await post("Main judi online");
    expect(held.pending).toBe(true);
    const admin = await server.getAdminFeedsHandler();
    expect(admin.pending[0]?.flag).toBe("kata: judi");
  });

  it("limits posts per day and pending posts, and ignores a double tap", async () => {
    await setConfig({ reviewFirstPosts: 0, postsPerDay: 2 });
    const first = await post("satu");
    const again = await post("satu");
    expect(again.post.id).toBe(first.post.id);
    await post("dua");
    await expect(post("tiga")).rejects.toThrow(/Batas posting/);

    await setConfig({ reviewFirstPosts: 9, postsPerDay: 20 });
    as("u-dimas");
    await post("a1");
    await post("a2");
    await post("a3");
    await expect(post("a4")).rejects.toThrow(/3 postingan/);
  });

  it("validates the body and the photo", async () => {
    await expect(post("   ")).rejects.toThrow();
    await expect(post("x".repeat(501))).rejects.toThrow();
    await expect(post("foto palsu", { photo: new Uint8Array(40).fill(5) })).rejects.toThrow(
      /JPG, PNG atau WebP/,
    );
    await setConfig({ reviewFirstPosts: 0, allowPhotos: false });
    await expect(post("foto", { photo: JPEG })).rejects.toThrow(/Foto belum diizinkan/);
    await setConfig({ reviewFirstPosts: 0, allowPhotos: true });
    const ok = await post("dengan foto", { photo: JPEG });
    expect(ok.post.photoUrl).toBe(`/api/feed-photo/${ok.post.id}`);
    const photo = await server.feedPhoto(ok.post.id, false, null);
    expect(photo?.mime).toBe("image/jpeg");
    expect(photo?.cacheable).toBe(true);
  });

  it("serves a pending photo only to its owner or the team", async () => {
    await setConfig({ reviewFirstPosts: 5 });
    const held = await post("menunggu", { photo: JPEG });
    expect(await server.feedPhoto(held.post.id, false, null)).toBeNull();
    expect(await server.feedPhoto(held.post.id, false, "u-dimas")).toBeNull();
    expect(await server.feedPhoto(held.post.id, false, "u-rani")).not.toBeNull();
    expect(await server.feedPhoto(held.post.id, true, null)).not.toBeNull();
  });

  it("filters by kind and destination and paginates with a cursor", async () => {
    await setConfig({ reviewFirstPosts: 0, postsPerDay: 50 });
    await post("cerita jepang", { kind: "cerita", destinationCode: "JP" });
    await post("tanya korea?", { kind: "tanya", destinationCode: "KR" });
    await post("tips jepang", { kind: "tips", destinationCode: "JP" });
    expect((await list({ kind: "tanya" })).posts).toHaveLength(1);
    expect((await list({ destination: "jp" })).posts).toHaveLength(2);
    const page1 = await list({ limit: 2 });
    expect(page1.posts).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = await list({ limit: 2, cursor: page1.nextCursor });
    expect(page2.posts).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
    const ids = [...page1.posts, ...page2.posts].map((p) => p.id);
    expect(new Set(ids).size).toBe(3);
    expect(page1.facets.map((f) => f.code).sort()).toEqual(["JP", "KR"]);
  });

  it("likes toggle once per member and need an account", async () => {
    await setConfig({ reviewFirstPosts: 0 });
    const { post: p } = await post("suka ini");
    as("u-dimas");
    expect(await server.toggleFeedLikeHandler({ data: { id: p.id } })).toEqual({
      liked: true,
      likeCount: 1,
    });
    expect((await list()).posts[0]?.liked).toBe(true);
    expect(await server.toggleFeedLikeHandler({ data: { id: p.id } })).toEqual({
      liked: false,
      likeCount: 0,
    });
    as(null);
    await expect(server.toggleFeedLikeHandler({ data: { id: p.id } })).rejects.toThrow(/Masuk/);
    // Guests can still read.
    expect((await list()).posts).toHaveLength(1);
  });

  it("comments: notify the author, respect the switch, limits and banned words", async () => {
    await setConfig({ reviewFirstPosts: 0, bannedWords: ["spamlink"], commentsPerDay: 2 });
    const { post: p } = await post("tanya komentar");
    as("u-dimas");
    const c = await server.addFeedCommentHandler({ data: { postId: p.id, body: "Aman kok" } });
    expect(c.comment.authorName).toBe("Dimas");
    expect(holder.notifications.at(-1)).toMatchObject({
      subject: "u-rani",
      type: "feed_comment",
      href: `/feeds/${p.id}`,
    });
    await expect(
      server.addFeedCommentHandler({ data: { postId: p.id, body: "klik spamlink" } }),
    ).rejects.toThrow(/tidak diizinkan/);
    await server.addFeedCommentHandler({ data: { postId: p.id, body: "dua" } });
    await expect(
      server.addFeedCommentHandler({ data: { postId: p.id, body: "tiga" } }),
    ).rejects.toThrow(/Batas komentar/);

    const detail = await server.getFeedPostHandler({ data: { id: p.id } });
    expect(detail.enabled && detail.post?.commentCount).toBe(2);
    expect(detail.enabled && detail.comments.filter((x) => x.mine)).toHaveLength(2);

    await server.deleteOwnFeedCommentHandler({ data: { id: c.comment.id } });
    const after = await server.getFeedPostHandler({ data: { id: p.id } });
    expect(after.enabled && after.post?.commentCount).toBe(1);

    await setConfig({ reviewFirstPosts: 0, allowComments: false });
    await expect(
      server.addFeedCommentHandler({ data: { postId: p.id, body: "x" } }),
    ).rejects.toThrow(/dimatikan/);
  });

  it("reports hide the post from the reporter, auto-hide at the threshold, and can be undone", async () => {
    await setConfig({ reviewFirstPosts: 0, reportHideThreshold: 2 });
    const { post: p } = await post("laporkan aku");
    as("u-rani");
    await expect(
      server.reportFeedPostHandler({ data: { postId: p.id, reason: "spam" } }),
    ).rejects.toThrow(/postinganmu/);

    as("u-dimas");
    await server.reportFeedPostHandler({ data: { postId: p.id, reason: "spam" } });
    expect((await list()).posts).toHaveLength(0); // hidden for the reporter at once
    as("u-lain");
    expect((await list()).posts).toHaveLength(1); // still public for others (1 < 2)

    await server.reportFeedPostHandler({ data: { postId: p.id, reason: "kasar" } });
    expect((await list()).posts).toHaveLength(0); // auto-hidden for everyone
    const admin = await server.getAdminFeedsHandler();
    expect(admin.reported[0]?.reportCount).toBe(2);
    expect(admin.reported[0]?.status).toBe("HIDDEN");

    as("u-lain");
    await server.undoFeedReportHandler({ data: { id: p.id } });
    expect((await list()).posts).toHaveLength(1); // below threshold again: restored
    expect((await list()).posts).toHaveLength(1);
  });

  it("admin: hide, restore, dismiss, remove and ban an author", async () => {
    await setConfig({ reviewFirstPosts: 0 });
    const a = await post("satu");
    const b = await post("dua");
    const act = (postId: string, action: string, note?: string) =>
      server.adminFeedActionHandler({
        data: server.adminFeedActionInput({ postId, action, note }),
      });
    await act(a.post.id, "hide", "melanggar");
    expect((await list()).posts.map((p) => p.id)).toEqual([b.post.id]);
    await act(a.post.id, "restore");
    expect((await list()).posts).toHaveLength(2);
    await act(b.post.id, "remove", "spam");
    expect((await list()).posts).toHaveLength(1);

    await act(a.post.id, "ban", "berulang");
    expect((await list()).posts).toHaveLength(0);
    expect((await server.getFeedsStatusHandler()).banned).toBe(true);
    await expect(post("masih mau posting")).rejects.toThrow(/tidak dapat memposting/);
    await act(a.post.id, "unban");
    expect((await list()).posts).toHaveLength(1);
    expect((await server.getFeedsStatusHandler()).banned).toBe(false);

    const audit = await pool.query(
      "select action from admin_audit_logs where action like 'feeds.%'",
    );
    expect(audit.rowCount).toBe(5);
  });

  it("admin can hide a comment and the count follows", async () => {
    await setConfig({ reviewFirstPosts: 0 });
    const { post: p } = await post("komentari");
    as("u-dimas");
    const { comment } = await server.addFeedCommentHandler({
      data: { postId: p.id, body: "halo" },
    });
    await server.adminFeedCommentActionHandler({
      data: server.adminFeedCommentActionInput({ commentId: comment.id, action: "hide" }),
    });
    const detail = await server.getFeedPostHandler({ data: { id: p.id } });
    expect(detail.enabled && detail.comments).toHaveLength(0);
    expect(detail.enabled && detail.post?.commentCount).toBe(0);
  });

  it("the author can delete their own post, others cannot", async () => {
    await setConfig({ reviewFirstPosts: 0 });
    const { post: p } = await post("hapus aku");
    as("u-dimas");
    await expect(server.deleteOwnFeedPostHandler({ data: { id: p.id } })).rejects.toThrow();
    as("u-rani");
    await server.deleteOwnFeedPostHandler({ data: { id: p.id } });
    expect((await list()).posts).toHaveLength(0);
  });

  it("saves a place to the Agenda through the trip-ownership check", async () => {
    await setConfig({ reviewFirstPosts: 0 });
    const withPlace = await post("Datang jam 15.00", { placeName: "Ichiran Shibuya" });
    const noPlace = await post("tanpa tempat");
    as("u-dimas");
    const trip = "11111111-1111-4111-8111-111111111111";
    await server.saveFeedPostToAgendaHandler({
      data: server.feedSaveInput({
        postId: withPlace.post.id,
        tripId: trip,
        activityDate: "2026-12-13",
      }),
    });
    expect(holder.agenda[0]).toMatchObject({
      tripId: trip,
      activityDate: "2026-12-13",
      title: "Ichiran Shibuya",
    });
    await expect(
      server.saveFeedPostToAgendaHandler({
        data: server.feedSaveInput({
          postId: noPlace.post.id,
          tripId: trip,
          activityDate: "2026-12-13",
        }),
      }),
    ).rejects.toThrow(/tidak bisa disimpan/);
  });

  it("saving the Admin setting is versioned and audit logged", async () => {
    const row = await pool.query("select version from admin_settings where setting_key='feeds'");
    const version = Number(row.rows[0].version);
    const conflict = await server.saveFeedsConfigHandler({
      data: { config: { enabled: true }, expectedVersion: version - 1, reason: "basi" },
    });
    expect(conflict.ok).toBe(false);
    const saved = await server.saveFeedsConfigHandler({
      data: { config: { enabled: true, postsPerDay: 7 }, expectedVersion: version, reason: "naik" },
    });
    expect(saved.ok && saved.config.postsPerDay).toBe(7);
    const audit = await pool.query(
      "select count(*)::int as n from admin_audit_logs where entity_id='feeds' and action='settings.change'",
    );
    expect(audit.rows[0].n).toBeGreaterThanOrEqual(2);
  });

  it("publishes every guide once as Travo Guide, never notifies synthetic authors", async () => {
    server.setGuideSyncClock(0);
    const first = await server.listFeedHandler({ data: { limit: 30 } });
    const { travelGuides } = await import("@/lib/travel-guides");
    const due = travelGuides.filter((g) => g.publishedAt <= new Date().toISOString().slice(0, 10));
    const guides = first.posts.filter((p) => p.source === "guide");
    expect(guides).toHaveLength(due.length);
    expect(guides[0]).toMatchObject({ authorName: "Travo Guide", mine: false });
    expect(guides[0]?.linkPath).toMatch(/^\/panduan\//);

    server.setGuideSyncClock(0);
    await server.listFeedHandler({ data: { limit: 30 } });
    const count = await pool.query(
      "select count(*)::int as n from feed_posts where source='guide'",
    );
    expect(count.rows[0].n).toBe(due.length);

    await server.addFeedCommentHandler({ data: { postId: guides[0]!.id, body: "Terima kasih!" } });
    expect(holder.notifications).toHaveLength(0);
  });

  it("migration 070 ships seven example posts that Admin can recognise", async () => {
    // The migration seeds rows with fixed ids; truncate in beforeEach removed them, so re-run it.
    const fs = await import("node:fs");
    await pool.query(fs.readFileSync("migrations/070_feeds_sources.sql", "utf8"));
    const rows = await pool.query(
      "select count(*)::int as n from feed_posts where source='seed' and status='PUBLISHED'",
    );
    expect(rows.rows[0].n).toBe(7);
    const admin = await server.getAdminFeedsHandler();
    expect(JSON.stringify(admin)).toContain('"source":"seed"');
  });

  it("previews the most liked comment (else the newest) and lets members like comments", async () => {
    as("u-rani");
    const post = await server.createFeedPost({
      subject: "u-rani",
      body: "Tips tiket kereta",
      kind: "tips",
      destinationCode: "JP",
    });
    await pool.query("update feed_posts set status='PUBLISHED', published_at=now() where id=$1", [
      post.post.id,
    ]);
    as("u-dimas");
    const first = await server.addFeedCommentHandler({
      data: { postId: post.post.id, body: "Pertama" },
    });
    const second = await server.addFeedCommentHandler({
      data: { postId: post.post.id, body: "Kedua" },
    });
    let feed = await server.listFeedHandler({ data: { limit: 10 } });
    expect(feed.posts.find((p) => p.id === post.post.id)?.topComment).toMatchObject({
      body: "Kedua",
      likeCount: 0,
    });

    as("u-rani");
    const liked = await server.toggleFeedCommentLikeHandler({ data: { id: first.comment.id } });
    expect(liked).toEqual({ liked: true, likeCount: 1 });
    feed = await server.listFeedHandler({ data: { limit: 10 } });
    expect(feed.posts.find((p) => p.id === post.post.id)?.topComment).toMatchObject({
      body: "Pertama",
      likeCount: 1,
    });
    const detail = await server.getFeedPostHandler({ data: { id: post.post.id } });
    expect(detail.enabled && detail.comments.find((c) => c.id === first.comment.id)).toMatchObject({
      liked: true,
      likeCount: 1,
    });
    const undone = await server.toggleFeedCommentLikeHandler({ data: { id: first.comment.id } });
    expect(undone).toEqual({ liked: false, likeCount: 0 });
    expect(second.comment.id).not.toBe(first.comment.id);
  });

  it("migration 071 adds ten example comments and keeps the counts consistent", async () => {
    const fs = await import("node:fs");
    await pool.query(fs.readFileSync("migrations/070_feeds_sources.sql", "utf8"));
    await pool.query(fs.readFileSync("migrations/071_feed_comment_likes.sql", "utf8"));
    const rows = await pool.query(
      `select count(*)::int as n,
              (select count(*)::int from feed_posts p where p.source='seed' and p.comment_count <>
                (select count(*) from feed_comments c where c.post_id=p.id and c.status='PUBLISHED')) as off
         from feed_comments where source='seed'`,
    );
    expect(rows.rows[0]).toEqual({ n: 10, off: 0 });
  });

  it("migration 072 allows the Titip Belanja kind and ships four photo posts", async () => {
    const fs = await import("node:fs");
    for (const f of ["070_feeds_sources", "071_feed_comment_likes", "072_feeds_titip"])
      await pool.query(fs.readFileSync(`migrations/${f}.sql`, "utf8"));
    const titip = await pool.query(
      "select count(*)::int as n, count(image_url)::int as photos from feed_posts where kind='titip' and source='seed'",
    );
    expect(titip.rows[0]).toEqual({ n: 4, photos: 4 });
    for (const row of (await pool.query("select image_url from feed_posts where kind='titip'"))
      .rows)
      expect(fs.existsSync(`public${row.image_url}`)).toBe(true);
    const feed = await server.listFeedHandler({ data: { kind: "titip", limit: 10 } });
    expect(feed.posts).toHaveLength(4);
    expect(feed.posts[0]?.photoUrl).toMatch(/^\/assets\/feeds\//);
    // A member can post it too.
    const made = await server.createFeedPost({
      subject: "u-rani",
      body: "Titipanku sampai!",
      kind: "titip",
    });
    expect(made.post.kind).toBe("titip");
  });

  it("posting and commenting wait for the Komunitas consent; withdrawing hides posts, agreeing again restores them", async () => {
    const consent = await import("@/lib/consent.server");
    as("u-rani");
    const made = await post("Tips dari Rani");
    await pool.query("update feed_posts set status='PUBLISHED', published_at=now() where id=$1", [
      made.post.id,
    ]);

    await pool.query("delete from customer_data_consents where customer_auth_subject='u-rani'");
    await expect(post("Tanpa izin")).rejects.toThrow(/Komunitas/);
    await expect(
      server.addFeedCommentHandler({ data: { postId: made.post.id, body: "halo" } }),
    ).rejects.toThrow(/Komunitas/);
    expect((await server.getFeedsStatusHandler()).communityConsent).toBe(false);

    await consent.saveMyConsentHandler({
      data: { purposes: { community: true }, source: "just_in_time" },
    });
    expect((await server.getFeedsStatusHandler()).communityConsent).toBe(true);
    await expect(post("Dengan izin")).resolves.toBeDefined();

    await consent.saveMyConsentHandler({
      data: { purposes: { community: false }, source: "settings" },
    });
    expect(
      (await server.listFeedHandler({ data: { limit: 10 } })).posts.map((p) => p.id),
    ).not.toContain(made.post.id);
    await consent.saveMyConsentHandler({
      data: { purposes: { community: true }, source: "settings" },
    });
    expect(
      (await server.listFeedHandler({ data: { limit: 10 } })).posts.map((p) => p.id),
    ).toContain(made.post.id);
  });

  it("records each change once, snoozes the prompt, and Admin sees counts without identities", async () => {
    const consent = await import("@/lib/consent.server");
    as("u-newbie");
    let state = await consent.readConsentState("u-newbie");
    expect(state).toMatchObject({ needsPrompt: true, answered: false });
    expect(state.purposes).toEqual({
      community: false,
      ai: false,
      personalization: false,
      promo: false,
    });

    state = await consent.snoozeConsentPromptHandler();
    expect(state.needsPrompt).toBe(false);
    expect(state.snoozedUntil).not.toBeNull();

    await consent.saveMyConsentHandler({
      data: { purposes: { community: true, ai: true, personalization: true }, source: "prompt" },
    });
    // The same answer again writes nothing new.
    await consent.saveMyConsentHandler({
      data: { purposes: { community: true, ai: true }, source: "settings" },
    });
    const rows = await pool.query(
      "select purpose, granted, source from customer_data_consents where customer_auth_subject='u-newbie' order by purpose",
    );
    expect(rows.rows).toEqual([
      { purpose: "ai", granted: true, source: "prompt" },
      { purpose: "community", granted: true, source: "prompt" },
      { purpose: "personalization", granted: true, source: "prompt" },
    ]);
    state = await consent.readConsentState("u-newbie");
    expect(state).toMatchObject({ answered: true, needsPrompt: false });
    expect(await consent.hasConsent("u-newbie", "ai")).toBe(true);
    expect(await consent.hasConsent("u-newbie", "promo")).toBe(false);
    await expect(consent.assertConsent("u-newbie", "promo")).rejects.toThrow(/Kabar & promo/);
    expect(await consent.consentBlock("u-newbie", "ai")).toBeNull();

    const admin = await consent.getAdminConsentHandler();
    expect(admin.purposes.find((p) => p.purpose === "ai")?.granted).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(admin)).not.toContain("u-newbie");
    expect(admin.prompts.answered).toBeGreaterThanOrEqual(1);
  });

  describe("tabs: Untuk kamu, Terbaru, Tujuanku", () => {
    const seed = async () => {
      const row = (id: string, body: string, dest: string, hoursAgo: number, likes: number) =>
        pool.query(
          `insert into feed_posts (id, customer_auth_subject, author_name, source, kind, body, destination_code,
                                   status, like_count, created_at, published_at)
           values ($1, 'u-lain', 'Lain', 'member', 'tips', $2, $3, 'PUBLISHED', $4,
                   now() - make_interval(hours => $5), now() - make_interval(hours => $5))`,
          [id, body, dest, likes, hoursAgo],
        );
      await row("00000000-0000-4000-8000-0000000000a1", "Jepang dua jam lalu", "JP", 2, 0);
      await row("00000000-0000-4000-8000-0000000000a2", "Korea sejam lalu", "KR", 1, 0);
      await row("00000000-0000-4000-8000-0000000000a3", "Jepang tiga jam lalu", "JP", 3, 0);
    };
    const trip = (subject: string, code: string, archived = false) =>
      pool.query(
        `insert into travel_trips (customer_auth_subject, name, destination_code, destination_name,
                                   departure_date, return_date, archived_at)
         values ($1, 'Trip', $2, 'Tujuan', '2026-12-14', '2026-12-18', ${archived ? "now()" : "null"})`,
        [subject, code],
      );
    const grant = (subject: string) =>
      pool.query(
        `insert into customer_data_consents (customer_auth_subject, purpose, granted, policy_version, source)
         values ($1, 'personalization', true, 'test', 'settings')`,
        [subject],
      );
    const bodies = async (sort: "new" | "foryou" | "mine", limit = 10, cursor?: string) =>
      (
        await server.listFeedHandler({ data: { sort, limit, ...(cursor ? { cursor } : {}) } })
      ).posts.map((p) => p.body);

    beforeEach(async () => {
      await pool.query("delete from travel_trips");
      await seed();
      as("u-dimas");
    });

    it("Terbaru is newest first", async () => {
      expect(await bodies("new")).toEqual([
        "Korea sejam lalu",
        "Jepang dua jam lalu",
        "Jepang tiga jam lalu",
      ]);
    });

    it("Untuk kamu favours the destinations of the member's trips, but only with Personalisasi", async () => {
      await trip("u-dimas", "JP");
      // No consent: plain ranking, the newer Korea post leads.
      expect((await bodies("foryou"))[0]).toBe("Korea sejam lalu");
      await grant("u-dimas");
      expect((await bodies("foryou"))[0]).toBe("Jepang dua jam lalu");
    });

    it("Untuk kamu pages by offset without repeating posts", async () => {
      const first = await server.listFeedHandler({ data: { sort: "foryou", limit: 2 } });
      expect(first.nextCursor).toBe("2");
      const second = await server.listFeedHandler({
        data: { sort: "foryou", limit: 2, cursor: first.nextCursor! },
      });
      const ids = [...first.posts, ...second.posts].map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(second.nextCursor).toBeNull();
    });

    it("Tujuanku shows only the destinations of the member's active trips", async () => {
      await grant("u-dimas");
      await trip("u-dimas", "JP");
      await trip("u-dimas", "KR", true);
      const result = await server.listFeedHandler({ data: { sort: "mine", limit: 10 } });
      expect(result.blocked).toBeNull();
      expect(result.tripDestinations).toEqual(["JP"]);
      expect(result.posts.map((p) => p.body)).toEqual([
        "Jepang dua jam lalu",
        "Jepang tiga jam lalu",
      ]);
    });

    it("Tujuanku explains why it is empty: signed out, no consent, no trips", async () => {
      as(null);
      expect((await server.listFeedHandler({ data: { sort: "mine", limit: 10 } })).blocked).toBe(
        "signin",
      );
      as("u-dimas");
      await trip("u-dimas", "JP");
      expect((await server.listFeedHandler({ data: { sort: "mine", limit: 10 } })).blocked).toBe(
        "consent",
      );
      await pool.query("delete from travel_trips");
      await grant("u-dimas");
      expect((await server.listFeedHandler({ data: { sort: "mine", limit: 10 } })).blocked).toBe(
        "notrips",
      );
    });

    it("counts posts by others published since the list loaded, never the member's own", async () => {
      const since = new Date(Date.now() - 30 * 60_000).toISOString();
      expect((await server.countNewFeedPostsHandler({ data: { since } })).count).toBe(0);
      await pool.query(
        `insert into feed_posts (customer_auth_subject, author_name, source, kind, body, status, published_at)
         values ('u-lain', 'Lain', 'member', 'tips', 'baru dari orang lain', 'PUBLISHED', now()),
                ('u-dimas', 'Dimas', 'member', 'tips', 'baru dari saya', 'PUBLISHED', now())`,
      );
      expect((await server.countNewFeedPostsHandler({ data: { since } })).count).toBe(1);
    });
  });

  describe("dock: Cari, Aktivitas, Aku and Tersimpan", () => {
    const publish = async (id: string, body: string, extra: Record<string, unknown> = {}) =>
      pool.query(
        `insert into feed_posts (id, customer_auth_subject, author_name, source, kind, body, place_name,
                                 destination_code, status, comment_count, published_at)
         values ($1, $2, $3, 'member', $4, $5, $6, 'JP', 'PUBLISHED', $7, now())`,
        [
          id,
          (extra["subject"] as string) ?? "u-lain",
          (extra["author"] as string) ?? "Lain",
          (extra["kind"] as string) ?? "tips",
          body,
          (extra["place"] as string) ?? null,
          (extra["comments"] as number) ?? 0,
        ],
      );
    const A = "00000000-0000-4000-8000-0000000000b1";
    const B = "00000000-0000-4000-8000-0000000000b2";
    const C = "00000000-0000-4000-8000-0000000000b3";

    beforeEach(async () => {
      await publish(A, "Antre Ichiran Shibuya cuma sebentar", { place: "Ichiran Shibuya" });
      await publish(B, "Ada ryokan murah di Hakone?", { kind: "tanya" });
      await publish(C, "Jawaban sudah ada di sini?", { kind: "tanya", comments: 2 });
      as("u-dimas");
    });

    it("Cari finds posts by text, place or author, and lists unanswered questions", async () => {
      const find = async (q: string) =>
        (await server.listFeedHandler({ data: { q, limit: 10 } })).posts.map((p) => p.id);
      expect(await find("ichiran")).toEqual([A]);
      expect(await find("hakone")).toEqual([B]);
      expect(await find("lain")).toHaveLength(3); // the author's first name
      expect(await find("%%")).toEqual([]); // wildcards are plain text
      const open = await server.listFeedHandler({ data: { unanswered: true, limit: 10 } });
      expect(open.posts.map((p) => p.id)).toEqual([B]);
    });

    it("Tersimpan is private, toggles, and only lists published posts", async () => {
      expect(await server.toggleFeedBookmarkHandler({ data: { id: A } })).toEqual({
        bookmarked: true,
      });
      let profile = await server.getMyFeedProfileHandler();
      expect(profile.bookmarks.map((p) => p.id)).toEqual([A]);
      expect(profile.bookmarks[0]?.bookmarked).toBe(true);
      expect(profile.counts.bookmarks).toBe(1);
      const feed = await server.listFeedHandler({ data: { limit: 10 } });
      expect(feed.posts.find((p) => p.id === A)?.bookmarked).toBe(true);

      as("u-lain"); // someone else sees none of it
      expect((await server.getMyFeedProfileHandler()).bookmarks).toEqual([]);
      expect(
        (await server.listFeedHandler({ data: { limit: 10 } })).posts.find((p) => p.id === A)
          ?.bookmarked,
      ).toBe(false);

      as("u-dimas");
      await pool.query("update feed_posts set status = 'HIDDEN' where id = $1", [A]);
      profile = await server.getMyFeedProfileHandler();
      expect(profile.bookmarks).toEqual([]);
      await expect(server.toggleFeedBookmarkHandler({ data: { id: A } })).rejects.toThrow(
        /tidak ditemukan/,
      );
      expect(await server.toggleFeedBookmarkHandler({ data: { id: B } })).toEqual({
        bookmarked: true,
      });
      expect(await server.toggleFeedBookmarkHandler({ data: { id: B } })).toEqual({
        bookmarked: false,
      });
    });

    it("Aku shows the member's counts, posts and the ones waiting for review", async () => {
      await pool.query(
        `insert into feed_posts (customer_auth_subject, author_name, source, kind, body, status)
         values ('u-dimas', 'Dimas', 'member', 'tips', 'Sedang menunggu', 'PENDING'),
                ('u-dimas', 'Dimas', 'member', 'cerita', 'Sudah tayang', 'PUBLISHED'),
                ('u-dimas', 'Dimas', 'member', 'cerita', 'Disembunyikan tim', 'HIDDEN')`,
      );
      const profile = await server.getMyFeedProfileHandler();
      expect(profile.counts.posts).toBe(2);
      expect(profile.pending.map((p) => p.body)).toEqual(["Sedang menunggu"]);
      expect(profile.posts.map((p) => p.body)).toEqual(["Sudah tayang"]);
      as(null);
      expect((await server.getMyFeedProfileHandler()).signedIn).toBe(false);
    });

    it("Aktivitas lists the member's Feeds notifications, counts unread and marks them read", async () => {
      const notify = async (type: string, title: string, subject: string) => {
        const event = await pool.query(
          "insert into notification_events (event_key, event_type, authoritative_source) values ($1, $2, 'feeds') returning id",
          [`t-${Math.random()}`, type],
        );
        await pool.query(
          `insert into customer_notifications (event_id, recipient_customer_auth_subject, type, title, body, action_href)
           values ($1, $2, $3, $4, 'isi', '/feeds/x')`,
          [event.rows[0].id, subject, type, title],
        );
      };
      await pool.query("delete from customer_notification_states");
      await pool.query("delete from customer_notifications");
      await notify("feed_comment", "Komentar baru di postinganmu", "u-dimas");
      await notify("feed_post", "Postinganmu sudah tayang", "u-dimas");
      await notify("order_paid", "Pesanan dibayar", "u-dimas"); // not a Feeds notification
      await notify("feed_comment", "Untuk orang lain", "u-lain");

      const before = await server.getFeedActivityHandler();
      expect(before.items.map((i) => i.title).sort()).toEqual([
        "Komentar baru di postinganmu",
        "Postinganmu sudah tayang",
      ]);
      expect(before.unread).toBe(2);
      expect((await server.getFeedsUnreadCountHandler()).unread).toBe(2);

      expect((await server.markFeedActivityReadHandler()).marked).toBe(2);
      expect((await server.getFeedsUnreadCountHandler()).unread).toBe(0);
      expect((await server.getFeedActivityHandler()).unread).toBe(0);
      // The other member and the order notification were left alone.
      const state = await pool.query("select count(*)::int as n from customer_notification_states");
      expect(state.rows[0].n).toBe(2);
    });
  });
});
