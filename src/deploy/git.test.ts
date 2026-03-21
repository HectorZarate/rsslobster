import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { gitAdd, gitCommit, gitPush, gitStatus, deployToGit } from "./git.js";

function git(dir: string, cmd: string): string {
  return execSync(`git -C "${dir}" ${cmd}`, { encoding: "utf-8" }).trim();
}

describe("git deploy", () => {
  let siteDir: string;
  let bareRepo: string;

  beforeEach(async () => {
    // Create a temp site dir with a git repo (signing disabled for tests)
    siteDir = await mkdtemp(join(tmpdir(), "rsslobster-deploy-"));
    execSync(`git -C "${siteDir}" init -b main`, { encoding: "utf-8" });
    execSync(`git -C "${siteDir}" config user.email "test@test.com"`, {
      encoding: "utf-8",
    });
    execSync(`git -C "${siteDir}" config user.name "Test"`, {
      encoding: "utf-8",
    });
    execSync(`git -C "${siteDir}" config commit.gpgsign false`, {
      encoding: "utf-8",
    });
    execSync(`git -C "${siteDir}" config init.defaultBranch main`, {
      encoding: "utf-8",
    });

    // Create a bare repo to push to
    bareRepo = await mkdtemp(join(tmpdir(), "rsslobster-bare-"));
    execSync(`git -C "${bareRepo}" init --bare -b main`, {
      encoding: "utf-8",
    });
    execSync(
      `git -C "${siteDir}" remote add origin "file://${bareRepo}"`,
      { encoding: "utf-8" },
    );

    // Initial commit so we have a branch
    await writeFile(join(siteDir, "init.txt"), "init");
    git(siteDir, "add -A");
    git(siteDir, 'commit -m "init"');
    git(siteDir, "push -u origin main");
  });

  afterEach(async () => {
    await rm(siteDir, { recursive: true, force: true });
    await rm(bareRepo, { recursive: true, force: true });
  });

  describe("gitStatus", () => {
    it("returns clean when no changes", async () => {
      const status = await gitStatus(siteDir);
      expect(status.clean).toBe(true);
      expect(status.files).toHaveLength(0);
    });

    it("detects new files", async () => {
      await writeFile(join(siteDir, "new.html"), "<h1>hi</h1>");
      const status = await gitStatus(siteDir);
      expect(status.clean).toBe(false);
      expect(status.files.length).toBeGreaterThan(0);
    });

    it("detects modified files", async () => {
      await writeFile(join(siteDir, "init.txt"), "changed");
      const status = await gitStatus(siteDir);
      expect(status.clean).toBe(false);
    });
  });

  describe("gitAdd", () => {
    it("stages specific files", async () => {
      await writeFile(join(siteDir, "a.html"), "a");
      await writeFile(join(siteDir, "b.html"), "b");
      await gitAdd(siteDir, ["a.html"]);

      const staged = git(siteDir, "diff --cached --name-only");
      expect(staged).toContain("a.html");
      expect(staged).not.toContain("b.html");
    });

    it("stages all site output files", async () => {
      await writeFile(join(siteDir, "index.html"), "index");
      await writeFile(join(siteDir, "feed.xml"), "rss");
      await writeFile(join(siteDir, "feed.json"), "json");
      await writeFile(join(siteDir, "hello.html"), "post");
      await gitAdd(siteDir);

      const staged = git(siteDir, "diff --cached --name-only");
      expect(staged).toContain("index.html");
      expect(staged).toContain("feed.xml");
      expect(staged).toContain("feed.json");
      expect(staged).toContain("hello.html");
    });
  });

  describe("gitCommit", () => {
    it("commits with a message", async () => {
      await writeFile(join(siteDir, "post.html"), "content");
      await gitAdd(siteDir);
      await gitCommit(siteDir, "publish: hello-world");

      const log = git(siteDir, "log --oneline -1");
      expect(log).toContain("publish: hello-world");
    });

    it("returns the commit hash", async () => {
      await writeFile(join(siteDir, "post.html"), "content");
      await gitAdd(siteDir);
      const hash = await gitCommit(siteDir, "test commit");
      expect(hash).toMatch(/^[\da-f]{7,40}$/);
    });
  });

  describe("gitPush", () => {
    it("pushes to remote", async () => {
      await writeFile(join(siteDir, "post.html"), "content");
      await gitAdd(siteDir);
      await gitCommit(siteDir, "push test");
      await gitPush(siteDir);

      // Verify the bare repo received the commit
      const bareLog = execSync(`git -C "${bareRepo}" log --oneline -1`, {
        encoding: "utf-8",
      }).trim();
      expect(bareLog).toContain("push test");
    });
  });

  describe("deployToGit", () => {
    it("full pipeline: add, commit, push", async () => {
      await writeFile(join(siteDir, "index.html"), "home");
      await writeFile(join(siteDir, "feed.xml"), "<rss/>");
      await writeFile(join(siteDir, "hello.html"), "post");

      const result = await deployToGit(siteDir, "micro", "hello-world");
      expect(result.committed).toBe(true);
      expect(result.hash).toMatch(/^[\da-f]{7,40}$/);

      const bareLog = execSync(`git -C "${bareRepo}" log --oneline -1`, {
        encoding: "utf-8",
      }).trim();
      expect(bareLog).toContain("publish: micro — hello-world");
    });

    it("skips commit when nothing changed", async () => {
      const result = await deployToGit(siteDir, "micro", "nothing");
      expect(result.committed).toBe(false);
      expect(result.hash).toBeUndefined();
    });

    it("returns push error without throwing", async () => {
      // Remove remote to cause push failure
      git(siteDir, "remote remove origin");
      await writeFile(join(siteDir, "post.html"), "content");

      const result = await deployToGit(siteDir, "micro", "fail-push");
      expect(result.committed).toBe(true);
      expect(result.pushError).toBeDefined();
    });
  });
});
