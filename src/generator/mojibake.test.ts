import { describe, it, expect } from "vitest";
import { repairMojibake } from "./mojibake.js";

describe("repairMojibake", () => {
  it("leaves plain ASCII unchanged", () => {
    expect(repairMojibake("hello world")).toBe("hello world");
  });

  it("leaves already-correct unicode unchanged", () => {
    expect(repairMojibake("sustained — p95")).toBe("sustained — p95");
    expect(repairMojibake("café")).toBe("café");
    expect(repairMojibake("naïve 你好 🦞")).toBe("naïve 你好 🦞");
  });

  it("repairs single-round utf-8-as-latin-1 mojibake", () => {
    // "café" → UTF-8 bytes 63 61 66 c3 a9 → misread as latin-1 → "cafÃ©"
    expect(repairMojibake("cafÃ©")).toBe("café");
  });

  it("repairs double-round em dash mojibake from posts.json", () => {
    // Actual bytes observed in the wild: c3 83 c2 a2 c3 82 c2 80 c3 82 c2 94
    // Decoded as UTF-8 is the string below.
    const input = "sustained \u00C3\u00A2\u00C2\u0080\u00C2\u0094 p95";
    expect(repairMojibake(input)).toBe("sustained — p95");
  });

  it("does not corrupt strings where latin-1 roundtrip fails", () => {
    // Lone 0xE9 is not valid UTF-8 start; repair must leave input alone.
    expect(repairMojibake("\u00E9")).toBe("\u00E9");
  });

  it("stops iterating once a round produces invalid utf-8", () => {
    // Safeguard: never return a string worse than the input.
    const clean = "normal text";
    expect(repairMojibake(repairMojibake(clean))).toBe(clean);
  });
});
