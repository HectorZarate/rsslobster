import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifySignature, parseWebhookPayload } from "./webhook.js";

describe("verifySignature", () => {
  const secret = "test-secret-key";

  function sign(body: string): string {
    return createHmac("sha256", secret).update(body).digest("hex");
  }

  it("accepts a valid signature", () => {
    const body = '{"text":"hello"}';
    expect(verifySignature(body, secret, sign(body))).toBe(true);
  });

  it("rejects an invalid signature", () => {
    const body = '{"text":"hello"}';
    expect(verifySignature(body, secret, "0".repeat(64))).toBe(false);
  });

  it("rejects a signature of wrong length", () => {
    expect(verifySignature("body", secret, "tooshort")).toBe(false);
  });

  it("rejects empty signature", () => {
    expect(verifySignature("body", secret, "")).toBe(false);
  });

  it("is sensitive to body changes", () => {
    const body1 = '{"text":"hello"}';
    const body2 = '{"text":"world"}';
    const sig = sign(body1);
    expect(verifySignature(body1, secret, sig)).toBe(true);
    expect(verifySignature(body2, secret, sig)).toBe(false);
  });
});

describe("parseWebhookPayload", () => {
  it("parses a valid text-only payload", () => {
    const body = JSON.stringify({ text: "Hello webhook" });
    const result = parseWebhookPayload(body, "req-1");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("req-1");
    expect(result!.text).toBe("Hello webhook");
    expect(result!.sender.id).toBe("webhook");
    expect(result!.sender.name).toBe("Webhook");
    expect(result!.images).toEqual([]);
    expect(result!.mediaFiles).toEqual([]);
  });

  it("returns null for invalid JSON", () => {
    expect(parseWebhookPayload("not json", "req-1")).toBeNull();
  });

  it("returns null for empty text", () => {
    expect(parseWebhookPayload(JSON.stringify({ text: "" }), "req-1")).toBeNull();
  });

  it("returns null for whitespace-only text", () => {
    expect(parseWebhookPayload(JSON.stringify({ text: "   " }), "req-1")).toBeNull();
  });

  it("returns null for missing text field", () => {
    expect(parseWebhookPayload(JSON.stringify({ images: [] }), "req-1")).toBeNull();
  });

  it("returns null for non-string text", () => {
    expect(parseWebhookPayload(JSON.stringify({ text: 42 }), "req-1")).toBeNull();
  });

  it("extracts image URLs as pending images", () => {
    const body = JSON.stringify({
      text: "With images",
      images: [{ url: "https://example.com/a.jpg" }, { url: "https://example.com/b.png" }],
    });
    const result = parseWebhookPayload(body, "req-1");
    expect(result!.pendingImages).toHaveLength(2);
    expect(result!.pendingImages![0].fileId).toBe("https://example.com/a.jpg");
  });

  it("filters out image entries with invalid URLs", () => {
    const body = JSON.stringify({
      text: "Mixed",
      images: [{ url: "https://example.com/a.jpg" }, { url: 42 }, {}],
    });
    const result = parseWebhookPayload(body, "req-1");
    expect(result!.pendingImages).toHaveLength(1);
  });

  it("accepts a valid custom sender", () => {
    const body = JSON.stringify({
      text: "From script",
      sender: { id: "my-script", name: "Deploy Bot" },
    });
    const result = parseWebhookPayload(body, "req-1");
    expect(result!.sender.id).toBe("my-script");
    expect(result!.sender.name).toBe("Deploy Bot");
  });

  it("falls back to default sender for invalid sender shape", () => {
    const body = JSON.stringify({
      text: "Bad sender",
      sender: { id: 42, name: {} },
    });
    const result = parseWebhookPayload(body, "req-1");
    expect(result!.sender.id).toBe("webhook");
    expect(result!.sender.name).toBe("Webhook");
  });
});
