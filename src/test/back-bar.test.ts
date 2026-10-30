import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("destination back navigation contract", () => {
  it("provides a Finder fallback when a destination is opened directly", () => {
    expect(read("src/components/shell.tsx")).toContain("fallbackTo = \"/\"");
    expect(read("src/components/shell.tsx")).toContain('type="button"');
    expect(read("src/components/shell.tsx")).toContain("window.history.length > 1");
    expect(read("src/routes/destination.$code.tsx")).toContain(
      'fallbackTo="/esim/finder"',
    );
  });
});
