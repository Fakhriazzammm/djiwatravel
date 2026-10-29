import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readFinderRoute = () =>
  readFileSync(join(process.cwd(), "src/routes/esim.finder.tsx"), "utf8");

describe("eSIM Finder preference sheet contract", () => {
  it("opens the preference form from the bottom after choosing a destination", () => {
    const source = readFinderRoute();

    expect(source).toContain("import { Sheet, SheetContent, SheetDescription, SheetTitle }");
    expect(source).toContain("const [formOpen, setFormOpen] = useState(false)");
    expect(source).toContain("onClick={() => {");
    expect(source).toContain("setFormOpen(true);");
    expect(source).toContain("<Sheet open={formOpen} onOpenChange={setFormOpen}>");
    expect(source).toContain('side="bottom"');
    expect(source).toContain('aria-describedby="finder-preferences-description"');
    expect(source).not.toContain("</section>\n        <form");
  });
});
