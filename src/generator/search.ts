import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Post } from "../config/types.js";

/**
 * A search index entry — minimal data needed for client-side search.
 * Kept small so the JSON file loads fast even on slow connections.
 */
interface SearchEntry {
  /** Post slug (used to build URL) */
  s: string;
  /** Title or first 80 chars of body */
  t: string;
  /** Body preview (first 200 chars, lowercased for search) */
  b: string;
  /** Tags joined by space */
  g: string;
}

/** Build a search index from published posts. */
export function buildSearchIndex(posts: Post[]): SearchEntry[] {
  return posts.map((p) => ({
    s: p.slug,
    t: p.title ?? truncate(p.body, 80),
    b: p.body.slice(0, 200).toLowerCase(),
    g: p.tags.join(" "),
  }));
}

/** Write the search index JSON file to the site directory. */
export async function writeSearchIndex(
  siteDir: string,
  posts: Post[],
): Promise<void> {
  const index = buildSearchIndex(posts);
  await writeFile(join(siteDir, "search-index.json"), JSON.stringify(index));
}

/**
 * Inline JavaScript for client-side search.
 * Fetches search-index.json, filters by query, renders results.
 * No dependencies, < 1KB minified.
 */
export const SEARCH_SCRIPT = `<script>
(function(){
  var form=document.getElementById('search-form');
  var input=document.getElementById('search-input');
  var results=document.getElementById('search-results');
  if(!form||!input||!results)return;
  var index=null;
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var q=input.value.trim().toLowerCase();
    if(!q){results.innerHTML='';return;}
    if(index){show(q);return;}
    fetch('/search-index.json').then(function(r){return r.json()}).then(function(data){
      index=data;show(q);
    }).catch(function(){results.innerHTML='<p>Search unavailable.</p>';});
  });
  function show(q){
    var words=q.split(/\\s+/);
    var hits=index.filter(function(e){
      return words.every(function(w){
        return e.t.toLowerCase().indexOf(w)!==-1||e.b.indexOf(w)!==-1||e.g.indexOf(w)!==-1;
      });
    });
    if(!hits.length){results.innerHTML='<p>No results for &ldquo;'+esc(q)+'&rdquo;</p>';return;}
    results.innerHTML=hits.slice(0,20).map(function(e){
      return '<article><h3><a href="/'+esc(e.s)+'.html">'+esc(e.t)+'</a></h3></article>';
    }).join('');
  }
  function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
})();
</script>`;

/**
 * HTML fragment for the search form, inserted into the index page.
 */
export const SEARCH_HTML = `<form id="search-form" role="search" aria-label="Search posts">
      <input id="search-input" type="search" placeholder="Search posts\u2026" aria-label="Search">
      <button type="submit">Search</button>
    </form>
    <div id="search-results" aria-live="polite"></div>`;

function truncate(s: string, len: number): string {
  if (s.length <= len) return s;
  return s.slice(0, len - 1) + "\u2026";
}
