/**
 * Repair UTF-8 text that was round-tripped through Latin-1 one or more times.
 *
 * The common case: an upstream step produced valid UTF-8 bytes, a downstream
 * step misinterpreted those bytes as Latin-1, then re-encoded as UTF-8. This
 * turns "—" (U+2014, bytes E2 80 94) into "â\x80\x94" or, after another round,
 * "Ã¢Â\x80Â\x94".
 *
 * Strategy: re-encode the string as Latin-1 and re-decode as strict UTF-8. If
 * every character is ≤ U+00FF and the Latin-1 bytes are valid UTF-8, that's a
 * strong signal the string was double-encoded — apply the fix. Iterate until
 * the string stabilizes or a round fails. A failed round means the current
 * state is already correct (or not Latin-1 round-trippable), so we stop.
 */
export function repairMojibake(s: string): string {
  const MAX_ROUNDS = 3;
  for (let i = 0; i < MAX_ROUNDS; i++) {
    const next = tryLatin1Utf8RoundTrip(s);
    if (next === null || next === s) return s;
    s = next;
  }
  return s;
}

function tryLatin1Utf8RoundTrip(s: string): string | null {
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code > 0xff) return null;
    bytes[i] = code;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
