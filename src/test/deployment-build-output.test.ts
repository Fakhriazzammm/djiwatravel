import path from "node:path";
import { loadConfigFromFile } from "vite";

describe("production build output", () => {
  it("uses Nitro to produce the Node server artifact consumed by the deploy script", async () => {
    const loaded = await loadConfigFromFile(
      { command: "build", mode: "production" },
      path.resolve(process.cwd(), "vite.config.ts"),
    );

    expect(loaded).not.toBeNull();
    expect(
      loaded?.config.plugins.flat(Infinity).some((plugin) => plugin?.name.includes("nitro")),
    ).toBe(true);
  });
});
