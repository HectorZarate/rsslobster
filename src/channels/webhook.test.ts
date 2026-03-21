import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  verifySignature,
  verifyToken,
  parseWebhookPayload,
  authenticateRequest,
  type WebhookConfig,
} from "./webhook.js";

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

describe("verifyToken", () => {
  it("accepts a matching token", () => {
    expect(verifyToken("abc123", ["abc123", "def456"])).toBe(true);
  });

  it("rejects a non-matching token", () => {
    expect(verifyToken("wrong", ["abc123", "def456"])).toBe(false);
  });

  it("rejects when token list is empty", () => {
    expect(verifyToken("abc123", [])).toBe(false);
  });

  it("rejects tokens of different length", () => {
    expect(verifyToken("short", ["longertoken"])).toBe(false);
  });
});

describe("authenticateRequest", () => {
  it("allows all when no auth is configured", () => {
    const config: WebhookConfig = {};
    expect(authenticateRequest(config, "body", {})).toBeNull();
  });

  it("accepts valid HMAC signature", () => {
    const secret = "mysecret";
    const body = '{"text":"hello"}';
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    const config: WebhookConfig = { secret };
    expect(
      authenticateRequest(config, body, { "x-lobster-signature": sig }),
    ).toBeNull();
  });

  it("accepts valid bearer token", () => {
    const config: WebhookConfig = { tokens: ["mytoken123"] };
    expect(
      authenticateRequest(config, "body", {
        authorization: "Bearer mytoken123",
      }),
    ).toBeNull();
  });

  it("rejects invalid HMAC when only HMAC is configured", () => {
    const config: WebhookConfig = { secret: "mysecret" };
    expect(
      authenticateRequest(config, "body", {
        "x-lobster-signature": "invalid",
      }),
    ).toBe("Unauthorized");
  });

  it("rejects invalid token when only tokens are configured", () => {
    const config: WebhookConfig = { tokens: ["correct"] };
    expect(
      authenticateRequest(config, "body", {
        authorization: "Bearer wrong!!",
      }),
    ).toBe("Unauthorized");
  });

  it("accepts HMAC when both methods configured but token is wrong", () => {
    const secret = "mysecret";
    const body = "test";
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    const config: WebhookConfig = { secret, tokens: ["sometoken"] };
    expect(
      authenticateRequest(config, body, {
        "x-lobster-signature": sig,
        authorization: "Bearer wrongtoken",
      }),
    ).toBeNull();
  });

  it("accepts token when both methods configured but HMAC is missing", () => {
    const config: WebhookConfig = { secret: "mysecret", tokens: ["tok123"] };
    expect(
      authenticateRequest(config, "body", {
        authorization: "Bearer tok123",
      }),
    ).toBeNull();
  });

  it("rejects when no auth headers are provided but auth is required", () => {
    const config: WebhookConfig = { secret: "mysecret" };
    expect(authenticateRequest(config, "body", {})).toBe("Unauthorized");
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
    expect(
      parseWebhookPayload(JSON.stringify({ text: "" }), "req-1"),
    ).toBeNull();
  });

  it("returns null for whitespace-only text", () => {
    expect(
      parseWebhookPayload(JSON.stringify({ text: "   " }), "req-1"),
    ).toBeNull();
  });

  it("returns null for missing text field", () => {
    expect(
      parseWebhookPayload(JSON.stringify({ images: [] }), "req-1"),
    ).toBeNull();
  });

  it("returns null for non-string text", () => {
    expect(
      parseWebhookPayload(JSON.stringify({ text: 42 }), "req-1"),
    ).toBeNull();
  });

  it("extracts image URLs as pending images", () => {
    const body = JSON.stringify({
      text: "With images",
      images: [
        { url: "https://example.com/a.jpg" },
        { url: "https://example.com/b.png" },
      ],
    });
    const result = parseWebhookPayload(body, "req-1");
    expect(result!.pendingImages).toHaveLength(2);
    expect(result!.pendingImages![0]!.fileId).toBe(
      "https://example.com/a.jpg",
    );
  });

  it("filters out image entries with invalid URLs", () => {
    const body = JSON.stringify({
      text: "Mixed",
      images: [{ url: "https://example.com/a.jpg" }, { url: 42 }, {}],
    });
    const result = parseWebhookPayload(body, "req-1");
    expect(result!.pendingImages).toHaveLength(1);
  });

  it("extracts media URLs as pending media", () => {
    const body = JSON.stringify({
      text: "With video",
      media: [
        {
          url: "https://example.com/clip.mp4",
          mimeType: "video/mp4",
        },
        {
          url: "https://example.com/voice.ogg",
          mimeType: "audio/ogg",
        },
      ],
    });
    const result = parseWebhookPayload(body, "req-1");
    expect(result!.pendingMedia).toHaveLength(2);
    expect(result!.pendingMedia![0]!.fileId).toBe(
      "https://example.com/clip.mp4",
    );
    expect(result!.pendingMedia![0]!.mimeType).toBe("video/mp4");
    expect(result!.pendingMedia![1]!.mimeType).toBe("audio/ogg");
  });

  it("handles media without explicit mimeType", () => {
    const body = JSON.stringify({
      text: "Media no mime",
      media: [{ url: "https://example.com/file.mp4" }],
    });
    const result = parseWebhookPayload(body, "req-1");
    expect(result!.pendingMedia).toHaveLength(1);
    expect(result!.pendingMedia![0]!.mimeType).toBeUndefined();
  });

  it("filters out media entries with invalid URLs", () => {
    const body = JSON.stringify({
      text: "Mixed media",
      media: [{ url: "https://example.com/a.mp4" }, { url: 42 }, {}],
    });
    const result = parseWebhookPayload(body, "req-1");
    expect(result!.pendingMedia).toHaveLength(1);
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
