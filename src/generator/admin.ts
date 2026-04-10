import type { Post, SiteConfig } from "../config/types.js";
import type { LobsterConfig } from "../config/lobster.js";
import { resolveStyle, generateStylesheet } from "../styles/presets.js";
import { escHtml } from "./html.js";

/**
 * Generate the RSS Lobster admin panel — a static HTML page for composing
 * and publishing micro blog posts with optional images.
 *
 * Design constraints:
 * - Static HTML with minimal inline JS (char counter only)
 * - Works without JavaScript for core form submission
 * - CSS classes prefixed with `lb-` to avoid collision with ziscus
 * - Served at /lobster-admin/ (not /admin/)
 * - Inherits the site's style preset for visual consistency
 */
export function generateAdminPage(
  posts: Post[],
  config: SiteConfig,
  lobster: LobsterConfig,
): string {
  const resolved = resolveStyle(config.style.preset, config.style.overrides);
  const baseStylesheet = generateStylesheet(resolved);
  const hasX = !!lobster.twitter;

  const recentPostsHtml = posts.length > 0
    ? posts.map((p) => renderPostRow(p)).join("\n")
    : `<p class="lb-empty">No posts yet</p>`;

  return `<!DOCTYPE html>
<html lang="${escHtml(config.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>RSS Lobster Admin</title>
  <style>${baseStylesheet}${adminStyles()}</style>
</head>
<body>
  <header>
    <h1>RSS Lobster Admin</h1>
    <p class="lb-site-info">${escHtml(config.domain)}</p>
  </header>

  <main id="main">
    <section class="lb-compose">
      <h2>Compose</h2>
      <form method="POST" action="/lobster-admin/publish" enctype="multipart/form-data">
        <label for="lb-body" class="lb-label">What's on your mind?</label>
        <textarea
          id="lb-body"
          name="body"
          class="lb-textarea"
          rows="4"
          maxlength="280"
          placeholder="Write a micro post\u2026"
          required
        ></textarea>
        <div class="lb-char-count" id="lb-char-count">280</div>

        <label for="lb-image" class="lb-label">Image (optional)</label>
        <input
          type="file"
          id="lb-image"
          name="image"
          accept="image/*"
          class="lb-file-input"
        >

        <fieldset class="lb-targets">
          <legend class="lb-label">Publish to</legend>
          <label class="lb-target-option">
            <input type="checkbox" name="target_site" value="1" checked>
            Site &amp; RSS
          </label>
${hasX ? `          <label class="lb-target-option">
            <input type="checkbox" name="target_x" value="1">
            X (Twitter)
          </label>` : ""}
        </fieldset>

        <button type="submit" class="lb-submit">Publish</button>
      </form>
    </section>

    <section class="lb-posts">
      <h2>Recent posts</h2>
      ${recentPostsHtml}
    </section>
  </main>

  <script>
  (function() {
    var ta = document.getElementById('lb-body');
    var counter = document.getElementById('lb-char-count');
    if (ta && counter) {
      ta.addEventListener('input', function() {
        counter.textContent = 280 - ta.value.length;
      });
    }
  })();
  </script>
</body>
</html>`;
}

function renderPostRow(post: Post): string {
  const date = post.publishedAt.slice(0, 10);
  const body = escHtml(post.body.length > 120 ? post.body.slice(0, 117) + "\u2026" : post.body);
  const typeClass = `lb-type-${post.type}`;

  const thumbnail = post.images?.[0]
    ? `<img class="lb-thumb" src="${escHtml(post.images[0].src)}" alt="${escHtml(post.images[0].alt)}" width="48" height="48">`
    : "";

  return `      <article class="lb-post-row">
        <div class="lb-post-meta">
          <span class="lb-type ${typeClass}">${escHtml(post.type)}</span>
          <time datetime="${escHtml(post.publishedAt)}">${date}</time>
        </div>
        <div class="lb-post-body">
          ${thumbnail}
          <a href="${escHtml(post.url)}">${body}</a>
        </div>
      </article>`;
}

function adminStyles(): string {
  return `
/* RSS Lobster Admin — lb- prefix to avoid collisions */
.lb-compose, .lb-posts {
  margin: 2rem 0;
}
.lb-textarea {
  width: 100%;
  min-height: 6rem;
  padding: 0.75rem;
  font: inherit;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  resize: vertical;
  box-sizing: border-box;
}
.lb-char-count {
  text-align: right;
  font-size: 0.85em;
  color: var(--color-muted);
  margin-top: 0.25rem;
}
.lb-label {
  display: block;
  font-weight: bold;
  margin: 1rem 0 0.25rem;
}
.lb-file-input {
  display: block;
  margin: 0.5rem 0;
}
.lb-targets {
  border: 1px solid var(--color-border);
  padding: 0.75rem;
  margin: 1rem 0;
}
.lb-targets legend {
  font-weight: bold;
}
.lb-target-option {
  display: block;
  margin: 0.25rem 0;
  cursor: pointer;
}
.lb-submit {
  padding: 0.5rem 1.5rem;
  font: inherit;
  font-weight: bold;
  background: var(--color-accent);
  color: var(--color-bg);
  border: none;
  cursor: pointer;
  margin-top: 0.5rem;
}
.lb-submit:hover { opacity: 0.85; }
.lb-post-row {
  border-bottom: 1px solid var(--color-border);
  padding: 0.75rem 0;
}
.lb-post-meta {
  display: flex;
  gap: 0.75rem;
  font-size: 0.85em;
  color: var(--color-muted);
  margin-bottom: 0.25rem;
}
.lb-type {
  font-weight: bold;
  text-transform: uppercase;
  font-size: 0.75em;
  letter-spacing: 0.05em;
}
.lb-post-body {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
}
.lb-post-body a { color: var(--color-link); }
.lb-thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border: 1px solid var(--color-border);
  flex-shrink: 0;
}
.lb-empty {
  color: var(--color-muted);
  font-style: italic;
}
.lb-site-info {
  color: var(--color-muted);
  margin-top: -0.5rem;
}
`;
}
