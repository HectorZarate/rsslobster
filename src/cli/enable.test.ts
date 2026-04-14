import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readLobsterConfig,
  writeLobsterConfig,
} from "../config/lobster.js";
import { enableCommentsNonInteractive } from "./enable.js";

describe("enable commands", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "lobster-enable-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe("enable telegram (config write)", () => {
    it("writes telegram config to lobster.json", async () => {
      await writeFile(join(dir, "lobster.json"), "{}");

      await writeLobsterConfig(dir, {
        channel: "telegram",
        telegram: { token: "bot123:ABC", allowedUsers: ["42"] },
      });

      const config = await readLobsterConfig(dir);
      expect(config.channel).toBe("telegram");
      expect(config.telegram?.token).toBe("bot123:ABC");
      expect(config.telegram?.allowedUsers).toEqual(["42"]);
    });

    it("idempotent re-run preserves other config", async () => {
      await writeFile(
        join(dir, "lobster.json"),
        JSON.stringify({
          model: { baseUrl: "http://localhost:11434/v1", model: "llama3", apiKey: "ollama" },
        }),
      );

      await writeLobsterConfig(dir, {
        channel: "telegram",
        telegram: { token: "newtoken" },
      });

      const config = await readLobsterConfig(dir);
      expect(config.channel).toBe("telegram");
      expect(config.telegram?.token).toBe("newtoken");
      expect(config.model?.model).toBe("llama3");
    });
  });

  describe("enable model (config write)", () => {
    it("writes model config to lobster.json", async () => {
      await writeFile(join(dir, "lobster.json"), "{}");

      await writeLobsterConfig(dir, {
        model: {
          provider: "openai",
          baseUrl: "http://localhost:11434/v1",
          model: "llama3",
          apiKey: "ollama",
        },
      });

      const config = await readLobsterConfig(dir);
      expect(config.model?.provider).toBe("openai");
      expect(config.model?.model).toBe("llama3");
    });

    it("writes model with fallback", async () => {
      await writeFile(join(dir, "lobster.json"), "{}");

      await writeLobsterConfig(dir, {
        model: {
          provider: "openai",
          baseUrl: "http://localhost:11434/v1",
          model: "llama3",
          apiKey: "ollama",
          fallback: {
            provider: "anthropic",
            baseUrl: "https://api.anthropic.com/v1",
            model: "claude-sonnet-4-20250514",
            apiKey: "sk-ant-xxx",
          },
        },
      });

      const config = await readLobsterConfig(dir);
      expect(config.model?.fallback?.provider).toBe("anthropic");
    });
  });

  describe("enable --list (status dashboard)", () => {
    it("reads subscription count from reader directory", async () => {
      await writeFile(join(dir, "lobster.json"), "{}");
      await mkdir(join(dir, "reader"), { recursive: true });
      await writeFile(
        join(dir, "reader", "subscriptions.json"),
        JSON.stringify([
          { url: "https://example.com/feed", title: "Example" },
          { url: "https://other.com/rss", title: "Other" },
        ]),
      );

      const raw = await readFile(
        join(dir, "reader", "subscriptions.json"),
        "utf-8",
      );
      const subs = JSON.parse(raw) as unknown[];
      expect(subs).toHaveLength(2);
    });

    it("handles missing reader directory gracefully", async () => {
      await writeFile(join(dir, "lobster.json"), "{}");

      // Just verify readLobsterConfig works when no reader dir exists
      const config = await readLobsterConfig(dir);
      expect(config.reader).toBeUndefined();
    });
  });

  describe("enable creates lobster.json when missing", () => {
    it("writeLobsterConfig creates file if not present", async () => {
      await writeLobsterConfig(dir, { channel: "webhook" });

      const config = await readLobsterConfig(dir);
      expect(config.channel).toBe("webhook");
    });
  });

  describe("enable comments (config write)", () => {
    it("writes commentsEndpoint to rsslobster.json", async () => {
      await writeFile(
        join(dir, "rsslobster.json"),
        JSON.stringify({
          domain: "test.example.com",
          title: "Test",
          description: "Test",
          author: "Tester",
          language: "en",
          style: { preset: "minimal" },
          repo: "",
        }),
      );

      await enableCommentsNonInteractive(dir, "https://comments.example.com", "secret");

      const raw = await readFile(join(dir, "rsslobster.json"), "utf-8");
      const config = JSON.parse(raw);
      expect(config.commentsEndpoint).toBe("https://comments.example.com");
    });

    it("writes commentsAdminSecret to lobster.json", async () => {
      await writeFile(
        join(dir, "rsslobster.json"),
        JSON.stringify({
          domain: "test.example.com",
          title: "Test",
          description: "Test",
          author: "Tester",
          language: "en",
          style: { preset: "minimal" },
          repo: "",
        }),
      );

      await enableCommentsNonInteractive(dir, "https://comments.example.com", "my-secret");

      const config = await readLobsterConfig(dir);
      expect((config as Record<string, unknown>).commentsAdminSecret).toBe("my-secret");
    });

    it("preserves existing rsslobster.json fields", async () => {
      await writeFile(
        join(dir, "rsslobster.json"),
        JSON.stringify({
          domain: "keep-this.com",
          title: "Keep This",
          description: "Keep",
          author: "Keep",
          language: "en",
          style: { preset: "brutalist" },
          repo: "git@github.com:user/site.git",
        }),
      );

      await enableCommentsNonInteractive(dir, "https://comments.example.com", "secret");

      const raw = await readFile(join(dir, "rsslobster.json"), "utf-8");
      const config = JSON.parse(raw);
      expect(config.domain).toBe("keep-this.com");
      expect(config.style.preset).toBe("brutalist");
      expect(config.repo).toBe("git@github.com:user/site.git");
      expect(config.commentsEndpoint).toBe("https://comments.example.com");
    });
  });

  describe("enable command help text", () => {
    it("description lists 'comments' as a capability", async () => {
      const { enableCommand } = await import("./enable.js");
      const description = enableCommand.description();
      expect(description).toContain("comments");
    });
  });

  describe("atomic writes", () => {
    it("does not leave temp files on success", async () => {
      await writeLobsterConfig(dir, { channel: "telegram" });

      const { readdir } = await import("node:fs/promises");
      const files = await readdir(dir);
      const tmpFiles = files.filter((f) => f.startsWith(".lobster-") && f.endsWith(".tmp"));
      expect(tmpFiles).toHaveLength(0);
    });

    it("produces valid JSON after concurrent writes", async () => {
      // Simulate rapid sequential writes
      await writeLobsterConfig(dir, { channel: "telegram" });
      await writeLobsterConfig(dir, {
        model: { baseUrl: "http://localhost", model: "test", apiKey: "key" },
      });
      await writeLobsterConfig(dir, { reader: { defaultInterval: 5 } });

      const config = await readLobsterConfig(dir);
      expect(config.channel).toBe("telegram");
      expect(config.model?.model).toBe("test");
      expect(config.reader?.defaultInterval).toBe(5);
    });
  });
});
