import { describe, it, expect } from "vitest";
import { runHook, fireHooks, parseHookOverride, type HooksConfig } from "./hooks.js";
import { tmpdir } from "node:os";

const cwd = tmpdir();

describe("runHook", () => {
  it("runs a command and captures stdout", async () => {
    const result = await runHook("echo hello", {}, cwd);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello");
  });

  it("receives JSON on stdin", async () => {
    const result = await runHook("cat", { foo: "bar" }, cwd);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ foo: "bar" });
  });

  it("captures stderr", async () => {
    const result = await runHook("echo oops >&2", {}, cwd);
    expect(result.stderr.trim()).toBe("oops");
  });

  it("returns non-zero exit code on failure", async () => {
    const result = await runHook("exit 42", {}, cwd);
    expect(result.exitCode).not.toBe(0);
  });
});

describe("fireHooks", () => {
  it("returns undefined when no hooks configured", async () => {
    const result = await fireHooks("afterPublish", undefined, {}, cwd);
    expect(result).toBeUndefined();
  });

  it("returns undefined when event has no hooks", async () => {
    const hooks: HooksConfig = { afterClassify: [{ run: "echo hi" }] };
    const result = await fireHooks("afterPublish", hooks, {}, cwd);
    expect(result).toBeUndefined();
  });

  it("runs hooks and returns last stdout", async () => {
    const hooks: HooksConfig = {
      afterPublish: [{ run: 'echo "first"' }, { run: 'echo "second"' }],
    };
    const result = await fireHooks("afterPublish", hooks, {}, cwd);
    expect(result).toBe("second");
  });

  it("skips hooks filtered by content type", async () => {
    const hooks: HooksConfig = {
      afterPublish: [{ run: "echo matched", types: ["post"] }],
    };
    const result = await fireHooks(
      "afterPublish",
      hooks,
      {},
      cwd,
      "micro",
    );
    expect(result).toBeUndefined();
  });

  it("runs hooks matching content type", async () => {
    const hooks: HooksConfig = {
      afterPublish: [{ run: "echo matched", types: ["post", "micro"] }],
    };
    const result = await fireHooks(
      "afterPublish",
      hooks,
      {},
      cwd,
      "post",
    );
    expect(result).toBe("matched");
  });

  it("continues past failed hooks", async () => {
    const hooks: HooksConfig = {
      afterPublish: [
        { run: "exit 1" },
        { run: "echo survived" },
      ],
    };
    const result = await fireHooks("afterPublish", hooks, {}, cwd);
    expect(result).toBe("survived");
  });
});

describe("parseHookOverride", () => {
  it("returns undefined for undefined input", () => {
    expect(parseHookOverride(undefined)).toBeUndefined();
  });

  it("returns undefined for non-JSON string", () => {
    expect(parseHookOverride("not json")).toBeUndefined();
  });

  it("returns undefined for JSON array", () => {
    expect(parseHookOverride("[1,2,3]")).toBeUndefined();
  });

  it("returns parsed object for valid JSON object", () => {
    const result = parseHookOverride('{"title":"Override"}');
    expect(result).toEqual({ title: "Override" });
  });

  it("returns undefined for JSON primitive", () => {
    expect(parseHookOverride('"hello"')).toBeUndefined();
  });
});
