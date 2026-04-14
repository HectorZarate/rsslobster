import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setStyle, styleCommand } from "./style.js";

describe("style command", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "lobster-style-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("changes the style preset in rsslobster.json", async () => {
    await writeFile(
      join(dir, "rsslobster.json"),
      JSON.stringify({
        domain: "test.com",
        title: "Test",
        style: { preset: "minimal" },
      }),
    );

    await setStyle(dir, "terminal");

    const raw = await readFile(join(dir, "rsslobster.json"), "utf-8");
    const config = JSON.parse(raw);
    expect(config.style.preset).toBe("terminal");
  });

  it("preserves other config fields", async () => {
    await writeFile(
      join(dir, "rsslobster.json"),
      JSON.stringify({
        domain: "test.com",
        title: "Test",
        author: "Someone",
        style: { preset: "minimal", overrides: { maxWidth: "800px" } },
      }),
    );

    await setStyle(dir, "brutalist");

    const raw = await readFile(join(dir, "rsslobster.json"), "utf-8");
    const config = JSON.parse(raw);
    expect(config.style.preset).toBe("brutalist");
    expect(config.style.overrides.maxWidth).toBe("800px");
    expect(config.domain).toBe("test.com");
    expect(config.author).toBe("Someone");
  });

  it("rejects invalid presets", async () => {
    await writeFile(
      join(dir, "rsslobster.json"),
      JSON.stringify({
        domain: "test.com",
        title: "Test",
        style: { preset: "minimal" },
      }),
    );

    await expect(setStyle(dir, "neon")).rejects.toThrow("Invalid style preset");
  });

  it("throws when rsslobster.json is missing", async () => {
    await expect(setStyle(dir, "terminal")).rejects.toThrow();
  });
});

describe("styleCommand --site-dir flag", () => {
  it("has a --site-dir option", () => {
    const longFlags = styleCommand.options.map((o) => o.long);
    expect(longFlags).toContain("--site-dir");
  });

  it("--site-dir option defaults to '.'", () => {
    const opt = styleCommand.options.find((o) => o.long === "--site-dir");
    expect(opt?.defaultValue).toBe(".");
  });

  it("--site-dir flag is accepted alongside <preset> positional argument", () => {
    // Verify the command has both the positional <preset> argument and --site-dir option.
    // This confirms backward-compatible dual-input design without invoking the action.
    const presetArg = styleCommand.registeredArguments.find(
      (a) => a.name() === "preset",
    );
    expect(presetArg).toBeDefined();
    expect(presetArg?.required).toBe(true);

    const siteDirOpt = styleCommand.options.find((o) => o.long === "--site-dir");
    expect(siteDirOpt).toBeDefined();
  });
});
