import type { PluginAPI } from "./types.js";

/**
 * Disqus comments plugin for rsslobster.
 *
 * Usage in rsslobster.json:
 *   "plugins": [{
 *     "name": "./plugins/disqus.js",
 *     "options": { "shortname": "your-disqus-shortname" }
 *   }]
 *
 * This injects the Disqus embed script into post pages only.
 * No Disqus on index, archive, or static pages.
 */

/** Escape a string for safe embedding in a JavaScript string literal */
function escJs(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\n/g, "\\n");
}

/** Validate that a Disqus shortname contains only safe characters */
function isValidShortname(s: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(s);
}

export function activate(
  api: PluginAPI,
  options?: Record<string, unknown>,
): void {
  const shortname = options?.["shortname"];
  if (typeof shortname !== "string" || !shortname) {
    console.error("Disqus plugin: missing 'shortname' option");
    return;
  }

  if (!isValidShortname(shortname)) {
    console.error("Disqus plugin: shortname contains invalid characters (only alphanumeric, hyphens, underscores allowed)");
    return;
  }

  api.injectHTML(
    (content, config) => {
      if (!content) return {};

      const pageUrl = escJs(`https://${config.domain}/${content.slug}.html`);
      const pageId = escJs(content.slug);
      const safeShortname = escJs(shortname);

      return {
        articleFooter: `<div id="disqus_thread"></div>`,
        bodyEnd: `<script>
var disqus_config = function () {
  this.page.url = "${pageUrl}";
  this.page.identifier = "${pageId}";
};
(function() {
  var d = document, s = d.createElement('script');
  s.src = 'https://${safeShortname}.disqus.com/embed.js';
  s.setAttribute('data-timestamp', +new Date());
  (d.head || d.body).appendChild(s);
})();
</script>
<noscript>Enable JavaScript to view <a href="https://disqus.com/?ref_noscript">comments powered by Disqus.</a></noscript>`,
      };
    },
    { postPagesOnly: true },
  );
}
