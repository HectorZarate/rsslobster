/**
 * WebSub (PubSubHubbub) notification.
 * Pings the hub after publishing so RSS readers get instant updates.
 */

const HUB_URL = "https://pubsubhubbub.appspot.com";

/** Ping the WebSub hub to notify it that a feed has been updated. */
export async function pingWebSubHub(feedUrl: string): Promise<void> {
  const body = new URLSearchParams({
    "hub.mode": "publish",
    "hub.url": feedUrl,
  });

  try {
    const res = await fetch(HUB_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      // Non-fatal — feed is still published, just not instantly pushed
      console.error(`WebSub ping failed: ${res.status}`);
    }
  } catch {
    // Network error — non-fatal, readers will poll eventually
  }
}
