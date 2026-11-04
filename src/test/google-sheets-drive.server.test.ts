import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client.server", () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));

import { multipartBody } from "@/lib/google-drive.server";

describe("Drive multipart upload body", () => {
  it("wraps metadata and the exact image bytes between boundaries", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x10]);
    const { boundary, body } = multipartBody(
      { name: "a.jpg", parents: ["f1"] },
      "image/jpeg",
      bytes,
    );
    const text = body.toString("latin1");
    expect(text.startsWith(`--${boundary}\r\n`)).toBe(true);
    expect(text.endsWith(`\r\n--${boundary}--`)).toBe(true);
    expect(text).toContain('"parents":["f1"]');
    expect(text).toContain("Content-Type: image/jpeg");
    const start = body.indexOf(Buffer.from("image/jpeg\r\n\r\n")) + "image/jpeg\r\n\r\n".length;
    expect([...body.subarray(start, start + bytes.length)]).toEqual([...bytes]);
  });
});
