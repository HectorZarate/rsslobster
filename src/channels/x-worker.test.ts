import { describe, it, expect } from "vitest";
import { signOAuth1 } from "./x-worker.js";

describe("signOAuth1", () => {
  const creds = {
    apiKey: "test-consumer-key",
    apiSecret: "test-consumer-secret",
    accessToken: "test-access-token",
    accessSecret: "test-access-secret",
  };

  it("produces an OAuth Authorization header", async () => {
    const header = await signOAuth1("POST", "https://api.x.com/2/tweets", creds);
    expect(header).toMatch(/^OAuth /);
  });

  it("uses HMAC-SHA1 signature method (required by OAuth 1.0a spec)", async () => {
    const header = await signOAuth1("POST", "https://api.x.com/2/tweets", creds);
    expect(header).toContain('oauth_signature_method="HMAC-SHA1"');
    expect(header).not.toContain("HMAC-SHA256");
  });

  it("includes all required OAuth parameters", async () => {
    const header = await signOAuth1("POST", "https://api.x.com/2/tweets", creds);
    expect(header).toContain("oauth_consumer_key=");
    expect(header).toContain("oauth_nonce=");
    expect(header).toContain("oauth_timestamp=");
    expect(header).toContain("oauth_token=");
    expect(header).toContain("oauth_version=");
    expect(header).toContain("oauth_signature=");
  });

  it("uses the provided consumer key and access token", async () => {
    const header = await signOAuth1("POST", "https://api.x.com/2/tweets", creds);
    expect(header).toContain('oauth_consumer_key="test-consumer-key"');
    expect(header).toContain('oauth_token="test-access-token"');
  });

  it("generates a different nonce each call", async () => {
    const h1 = await signOAuth1("POST", "https://api.x.com/2/tweets", creds);
    const h2 = await signOAuth1("POST", "https://api.x.com/2/tweets", creds);
    const extractNonce = (h: string) => h.match(/oauth_nonce="([^"]+)"/)?.[1];
    expect(extractNonce(h1)).not.toBe(extractNonce(h2));
  });

  it("produces deterministic signature for the same inputs with fixed nonce/timestamp", async () => {
    // Sign with deterministic extras to verify reproducibility
    const h1 = await signOAuth1("POST", "https://api.x.com/2/tweets", creds, {
      oauth_nonce: "fixed-nonce",
      oauth_timestamp: "1700000000",
    });
    const h2 = await signOAuth1("POST", "https://api.x.com/2/tweets", creds, {
      oauth_nonce: "fixed-nonce",
      oauth_timestamp: "1700000000",
    });
    const extractSig = (h: string) => h.match(/oauth_signature="([^"]+)"/)?.[1];
    expect(extractSig(h1)).toBe(extractSig(h2));
  });

  it("percent-encodes special characters per RFC 3986", async () => {
    const header = await signOAuth1("POST", "https://api.x.com/2/tweets", {
      ...creds,
      apiKey: "key with spaces!",
    });
    // Spaces should become %20, ! should become %21
    expect(header).toContain("key%20with%20spaces%21");
  });
});
