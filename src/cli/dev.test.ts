import { describe, it, expect } from "vitest";
import { devCommand } from "./dev.js";

describe("devCommand", () => {
  it("is named dev", () => {
    expect(devCommand.name()).toBe("dev");
  });

  it("accepts optional site-dir argument", () => {
    const args = devCommand.registeredArguments;
    expect(args.length).toBeGreaterThanOrEqual(1);
  });

  it("has a port option", () => {
    const opts = devCommand.options.map((o) => o.long);
    expect(opts).toContain("--port");
  });
});
