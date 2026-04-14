import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { lobsterConfigExists, readLobsterConfig } from "../config/lobster.js";
import { initCommand } from "./init.js";

// Mock scaffoldSite to avoid actual file generation
vi.mock("../generator/site.js", () => ({
  scaffoldSite: vi.fn(async (dir: string, config: Record<string, unknown>) => {
    const { writeFile: wf } = await import("node:fs/promises");
    const { join: jn } = await import("node:path");
    await wf(jn(dir, "rsslobster.json"), JSON.stringify(config, null, 2));
  }),
}));

describe("onboard command", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "lobster-onboard-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("detects existing project", async () => {
    await writeFile(join(dir, "lobster.json"), "{}");
    expect(await lobsterConfigExists(dir)).toBe(true);
  });

  it("non-interactive mode creates site with flags", async () => {
    const { onboardCommand } = await import("./onboard.js");
    onboardCommand.exitOverride();

    await onboardCommand.parseAsync(
      ["--domain", "test.com", "--title", "Test", "--style", "brutalist", dir],
      { from: "user" },
    );

    const siteRaw = await readFile(join(dir, "rsslobster.json"), "utf-8");
    const site = JSON.parse(siteRaw);
    expect(site.domain).toBe("test.com");
    expect(site.title).toBe("Test");
    expect(site.style.preset).toBe("brutalist");
  });

  it("non-interactive mode defaults title to domain", async () => {
    const { onboardCommand } = await import("./onboard.js");
    onboardCommand.exitOverride();

    await onboardCommand.parseAsync(
      ["--domain", "example.com", dir],
      { from: "user" },
    );

    const siteRaw = await readFile(join(dir, "rsslobster.json"), "utf-8");
    const site = JSON.parse(siteRaw);
    expect(site.title).toBe("example.com");
  });

  it("creates .gitignore with lobster.json", async () => {
    const { onboardCommand } = await import("./onboard.js");
    onboardCommand.exitOverride();

    await onboardCommand.parseAsync(
      ["--domain", "test.com", dir],
      { from: "user" },
    );

    const gitignore = await readFile(join(dir, ".gitignore"), "utf-8");
    expect(gitignore).toContain("lobster.json");
  });

  it("appends to existing .gitignore", async () => {
    await writeFile(join(dir, ".gitignore"), "_site/\n");

    const { onboardCommand } = await import("./onboard.js");
    onboardCommand.exitOverride();

    await onboardCommand.parseAsync(
      ["--domain", "test.com", dir],
      { from: "user" },
    );

    const gitignore = await readFile(join(dir, ".gitignore"), "utf-8");
    expect(gitignore).toContain("_site/");
    expect(gitignore).toContain("lobster.json");
  });

  it("does not duplicate lobster.json in .gitignore", async () => {
    await writeFile(join(dir, ".gitignore"), "lobster.json\n_site/\n");

    const { onboardCommand } = await import("./onboard.js");
    onboardCommand.exitOverride();

    await onboardCommand.parseAsync(
      ["--domain", "test.com", dir],
      { from: "user" },
    );

    const gitignore = await readFile(join(dir, ".gitignore"), "utf-8");
    const count = (gitignore.match(/lobster\.json/g) || []).length;
    expect(count).toBe(1);
  });

  it("lobster.json starts empty for progressive setup", async () => {
    const { onboardCommand } = await import("./onboard.js");
    onboardCommand.exitOverride();

    await onboardCommand.parseAsync(
      ["--domain", "test.com", dir],
      { from: "user" },
    );

    const config = await readLobsterConfig(dir);
    expect(config).toEqual({});
  });

  it("--force allows re-scaffold of existing project", async () => {
    await writeFile(join(dir, "lobster.json"), JSON.stringify({ channel: "telegram" }));

    const { onboardCommand } = await import("./onboard.js");
    onboardCommand.exitOverride();

    await onboardCommand.parseAsync(
      ["--domain", "new.com", "--force", dir],
      { from: "user" },
    );

    const siteRaw = await readFile(join(dir, "rsslobster.json"), "utf-8");
    const site = JSON.parse(siteRaw);
    expect(site.domain).toBe("new.com");
  });

  it("exits when project exists without --force", async () => {
    await writeFile(join(dir, "lobster.json"), "{}");

    const { onboardCommand } = await import("./onboard.js");
    onboardCommand.exitOverride();

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });

    await expect(
      onboardCommand.parseAsync(["--domain", "test.com", dir], {
        from: "user",
      }),
    ).rejects.toThrow("exit");

    exitSpy.mockRestore();
  });
});

describe("init command (alias for onboard)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "lobster-init-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("init command is named 'init'", () => {
    expect(initCommand.name()).toBe("init");
  });

  it("init routes to the same action as onboard: creates rsslobster.json", async () => {
    initCommand.exitOverride();

    await initCommand.parseAsync(
      ["--domain", "alias.com", dir],
      { from: "user" },
    );

    const siteRaw = await readFile(join(dir, "rsslobster.json"), "utf-8");
    const site = JSON.parse(siteRaw);
    expect(site.domain).toBe("alias.com");
  });

  it("init creates lobster.json (progressive setup)", async () => {
    initCommand.exitOverride();

    await initCommand.parseAsync(
      ["--domain", "alias.com", dir],
      { from: "user" },
    );

    const config = await readLobsterConfig(dir);
    expect(config).toEqual({});
  });

  it("init creates .gitignore with lobster.json", async () => {
    initCommand.exitOverride();

    await initCommand.parseAsync(
      ["--domain", "alias.com", dir],
      { from: "user" },
    );

    const gitignore = await readFile(join(dir, ".gitignore"), "utf-8");
    expect(gitignore).toContain("lobster.json");
  });
});
