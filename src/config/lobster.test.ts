import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readLobsterConfig,
  writeLobsterConfig,
  lobsterConfigExists,
  validateLobsterConfig,
} from "./lobster.js";

describe("lobster config", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "lobster-cfg-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe("readLobsterConfig", () => {
    it("returns empty object when file does not exist", async () => {
      const config = await readLobsterConfig(dir);
      expect(config).toEqual({});
    });

    it("reads valid config", async () => {
      await writeFile(
        join(dir, "lobster.json"),
        JSON.stringify({ channel: "telegram", telegram: { token: "abc" } }),
      );
      const config = await readLobsterConfig(dir);
      expect(config.channel).toBe("telegram");
      expect(config.telegram?.token).toBe("abc");
    });

    it("reads partial config", async () => {
      await writeFile(
        join(dir, "lobster.json"),
        JSON.stringify({ reader: { defaultInterval: 30 } }),
      );
      const config = await readLobsterConfig(dir);
      expect(config.model).toBeUndefined();
      expect(config.channel).toBeUndefined();
      expect(config.reader?.defaultInterval).toBe(30);
    });

    it("throws on invalid JSON", async () => {
      await writeFile(join(dir, "lobster.json"), "not json{");
      await expect(readLobsterConfig(dir)).rejects.toThrow();
    });
  });

  describe("writeLobsterConfig", () => {
    it("creates new file", async () => {
      await writeLobsterConfig(dir, { channel: "telegram" });
      const raw = await readFile(join(dir, "lobster.json"), "utf-8");
      const config = JSON.parse(raw);
      expect(config.channel).toBe("telegram");
    });

    it("merges into existing config", async () => {
      await writeFile(
        join(dir, "lobster.json"),
        JSON.stringify({ channel: "telegram", telegram: { token: "old" } }),
      );
      await writeLobsterConfig(dir, {
        model: { baseUrl: "http://localhost:11434/v1", model: "llama3", apiKey: "ollama" },
      });
      const config = await readLobsterConfig(dir);
      expect(config.channel).toBe("telegram");
      expect(config.model?.model).toBe("llama3");
    });

    it("preserves unrelated fields", async () => {
      await writeFile(
        join(dir, "lobster.json"),
        JSON.stringify({ hooks: { afterPublish: "echo hi" }, reader: { defaultInterval: 10 } }),
      );
      await writeLobsterConfig(dir, { channel: "webhook" });
      const config = await readLobsterConfig(dir);
      expect(config.channel).toBe("webhook");
      expect(config.reader?.defaultInterval).toBe(10);
    });
  });

  describe("lobsterConfigExists", () => {
    it("returns false when file does not exist", async () => {
      expect(await lobsterConfigExists(dir)).toBe(false);
    });

    it("returns true when file exists", async () => {
      await writeFile(join(dir, "lobster.json"), "{}");
      expect(await lobsterConfigExists(dir)).toBe(true);
    });
  });

  describe("validateLobsterConfig", () => {
    it("returns no errors for empty config", () => {
      expect(validateLobsterConfig({})).toEqual([]);
    });

    it("returns no errors for valid full config", () => {
      const errors = validateLobsterConfig({
        channel: "telegram",
        telegram: { token: "abc123" },
        model: {
          provider: "openai",
          baseUrl: "http://localhost:11434/v1",
          model: "llama3",
          apiKey: "ollama",
        },
      });
      expect(errors).toEqual([]);
    });

    it("detects invalid channel type", () => {
      const errors = validateLobsterConfig({
        channel: "invalid" as never,
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe("channel");
    });

    it("detects empty model.baseUrl", () => {
      const errors = validateLobsterConfig({
        model: { baseUrl: "", model: "llama3", apiKey: "ollama" },
      });
      expect(errors.some((e) => e.field === "model.baseUrl")).toBe(true);
    });

    it("detects empty model.model", () => {
      const errors = validateLobsterConfig({
        model: { baseUrl: "http://localhost", model: "", apiKey: "ollama" },
      });
      expect(errors.some((e) => e.field === "model.model")).toBe(true);
    });

    it("detects empty model.apiKey", () => {
      const errors = validateLobsterConfig({
        model: { baseUrl: "http://localhost", model: "llama3", apiKey: "" },
      });
      expect(errors.some((e) => e.field === "model.apiKey")).toBe(true);
    });

    it("detects invalid model.provider", () => {
      const errors = validateLobsterConfig({
        model: {
          provider: "invalid" as never,
          baseUrl: "http://localhost",
          model: "llama3",
          apiKey: "ollama",
        },
      });
      expect(errors.some((e) => e.field === "model.provider")).toBe(true);
    });

    it("detects empty telegram token when channel is telegram", () => {
      const errors = validateLobsterConfig({
        channel: "telegram",
        telegram: { token: "" },
      });
      expect(errors.some((e) => e.field === "telegram.token")).toBe(true);
    });
  });
});
