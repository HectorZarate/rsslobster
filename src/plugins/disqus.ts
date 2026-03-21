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
export function activate(
  api: PluginAPI,
  options?: Record<string, unknown>,
): void {
  const shortname = options?.["shortname"];
  if (typeof shortname !== "string" || !shortname) {
    console.error("Disqus plugin: missing 'shortname' option");
    return;
  }

  api.injectHTML(
    (content, config) => {
      if (!content) return {};

      const pageUrl = `https://${config.domain}/${content.slug}.html`;
      const pageId = content.slug;

      return {
        articleFooter: `<div id="disqus_thread"></div>`,
        bodyEnd: `<script>
var disqus_config = function () {
  this.page.url = "${pageUrl}";
  this.page.identifier = "${pageId}";
};
(function() {
  var d = document, s = d.createElement('script');
  s.src = 'https://${shortname}.disqus.com/embed.js';
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
