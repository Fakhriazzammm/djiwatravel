import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readFinderRoute = () =>
  readFileSync(join(process.cwd(), "src/routes/esim.finder.tsx"), "utf8");

describe("eSIM Finder destination selection contract", () => {
  it("filters live destinations and links each one to its available eSIM packages", () => {
    const source = readFinderRoute();

    expect(source).toContain("const [destinationQuery, setDestinationQuery] = useState(\"\")");
    expect(source).toContain("item.nameId} ${item.region} ${item.code");
    expect(source).toContain('fallback: "Cari negara atau kawasan"');
    expect(source).toContain("const destinationPlaceholder = useTypingPlaceholder");
    expect(source).toContain('aria-label="Cari destinasi eSIM"');
    expect(source).toContain('to="/destination/$code"');
    expect(source).toContain('search={{ availability: "all" }}');
    expect(source).toContain("Lihat semua paket eSIM untuk ${item.nameId}");
    expect(source).toContain('onClick={() => void router.invalidate()}');
  });
});
