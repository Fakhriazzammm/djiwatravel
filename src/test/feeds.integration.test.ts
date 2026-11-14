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
});
