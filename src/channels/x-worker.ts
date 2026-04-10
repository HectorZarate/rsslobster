/**
 * Worker-compatible X (Twitter) OAuth 1.0a client.
 *
 * Uses WebCrypto for HMAC-SHA1 signing so it runs in Cloudflare Workers,
 * Deno, browsers, and Node.js — anywhere with `crypto.subtle`.
 *
 * The CLI (`rsslobster post-to-x`) uses the full twitter-api-v2 npm package
 * since it runs in Node. This module exists for Worker environments where
 * that package can't be used.
 */

export interface XCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

/** Percent-encode per RFC 3986 (OAuth 1.0a compliant). */
function rfc3986(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

/** Generate an OAuth 1.0a Authorization header for a request. */
export async function signOAuth1(
  method: string,
  url: string,
  creds: XCredentials,
  extraParams: Record<string, string> = {},
): Promise<string> {
  const params: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
    ...extraParams,
  };

  // Build signature base string
  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(params[k]!)}`)
    .join("&");
  const baseString = `${method.toUpperCase()}&${rfc3986(url)}&${rfc3986(paramString)}`;

  // Sign with HMAC-SHA1 (required by OAuth 1.0a spec)
  const signingKey = `${rfc3986(creds.apiSecret)}&${rfc3986(creds.accessSecret)}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingKey),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(baseString),
  );
  params.oauth_signature = btoa(String.fromCharCode(...new Uint8Array(sig)));

  // Only OAuth params go in the Authorization header
  const oauthParams = Object.keys(params)
    .filter((k) => k.startsWith("oauth_"))
    .sort();
  return (
    "OAuth " +
    oauthParams
      .map((k) => `${rfc3986(k)}="${rfc3986(params[k]!)}"`)
      .join(", ")
  );
}

/**
 * Post a tweet via the X API v2 using OAuth 1.0a user-context auth.
 *
 * Throws on any error, including non-2xx responses, with the X API
 * error body included in the message for debugging.
 */
export async function postTweet(
  text: string,
  creds: XCredentials,
): Promise<{ id: string }> {
  const url = "https://api.x.com/2/tweets";
  const authHeader = await signOAuth1("POST", url, creds);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`X API ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { data: { id: string; text: string } };
  return { id: data.data.id };
}
