import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Post } from "../config/types.js";
import { outputDir } from "../config/paths.js";

/**
 * A search index entry — minimal data needed for client-side search.
 * Kept small so the JSON file loads fast even on slow connections.
 * All text fields are pre-lowercased for O(1) comparison at search time.
 */
interface SearchEntry {
  /** Post slug (used to build URL) */
  s: string;
  /** Title, lowercased for search matching */
  t: string;
  /** Display title — original casing for rendering */
  d: string;
  /** Body preview (first 200 chars, lowercased for search) */
  b: string;
  /** Tags joined by space */
  g: string;
}

/** Build a search index from published posts. */
export function buildSearchIndex(posts: Post[]): SearchEntry[] {
  return posts.map((p) => {
    const displayTitle = p.title ?? truncate(p.body, 80);
    return {
      s: p.slug,
      t: displayTitle.toLowerCase(),
      d: displayTitle,
      b: p.body.slice(0, 200).toLowerCase(),
      g: p.tags.join(" "),
    };
  });
}

/** Write the search index JSON file to the site directory. */
export async function writeSearchIndex(
  siteDir: string,
  posts: Post[],
): Promise<void> {
  const index = buildSearchIndex(posts);
  await writeFile(join(outputDir(siteDir), "search-index.json"), JSON.stringify(index));
}

/**
 * Inline JavaScript for client-side search.
 * As-you-type with debounce, Cmd/Ctrl+K shortcut, result snippets.
 * No dependencies, < 2KB.
 */
export const SEARCH_SCRIPT = `<script>
(function(){
var f=document.getElementById('search-form');
var i=document.getElementById('search-input');
var r=document.getElementById('search-results');
if(!f||!i||!r)return;
var idx=null,tm=0;
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function tags(g){if(!g)return '';return g.split(' ').map(function(t){return '<span class="tag">'+esc(t)+'</span>';}).join(' ');}
function show(q){
var w=q.split(/\\s+/);
var h=idx.filter(function(e){return w.every(function(v){return e.t.indexOf(v)!==-1||e.b.indexOf(v)!==-1||e.g.indexOf(v)!==-1;});});
var n=h.length;
if(!n){r.innerHTML='<p class="search-count">No results for \\u201c'+esc(q)+'\\u201d</p>';return;}
var out='<p class="search-count">'+n+' result'+(n===1?'':'s')+'</p>';
out+=h.slice(0,20).map(function(e){return '<article><h3><a href="/posts/'+esc(e.s)+'/">'+esc(e.d)+'</a></h3>'+(e.b?'<p class="snippet">'+esc(e.b.slice(0,120))+'\\u2026</p>':'')+(e.g?tags(e.g):'')+'</article>';}).join('');
r.innerHTML=out;}
function run(){
var q=i.value.trim().toLowerCase();
if(!q){r.innerHTML='';return;}
if(idx){show(q);return;}
r.innerHTML='<p class="search-count">Searching\\u2026</p>';
fetch('/search-index.json').then(function(x){return x.json();}).then(function(d){idx=d;show(q);}).catch(function(){r.innerHTML='<p>Search unavailable.</p>';});}
i.addEventListener('input',function(){clearTimeout(tm);tm=setTimeout(run,250);});
f.addEventListener('submit',function(e){e.preventDefault();clearTimeout(tm);run();});
document.addEventListener('keydown',function(e){if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();i.focus();i.select();}});
})();
</script>`;

/**
 * HTML fragment for the search form, inserted into the index page.
 */
export const SEARCH_HTML = `<form id="search-form" role="search" aria-label="Search posts">
      <input id="search-input" type="search" placeholder="Search posts\u2026" aria-label="Search">
    </form>
    <div id="search-results" aria-live="polite"></div>`;

/**
 * CSS for the search UI. Uses only CSS custom properties for theme compatibility.
 */
export const SEARCH_CSS = `
/* === Search === */
#search-form {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

#search-input {
  flex: 1;
  min-height: 44px;
  padding: 0.5rem 0.75rem;
  font-family: var(--font-body);
  font-size: 0.9rem;
  color: var(--color-text);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  outline: none;
}

#search-input:focus {
  border-color: var(--color-link);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-link) 25%, transparent);
}

#search-input::placeholder {
  color: var(--color-muted);
}

#search-results {
  margin-bottom: 1.5rem;
}

#search-results article {
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--color-border);
}

#search-results article:last-child {
  border-bottom: none;
}

#search-results h3 {
  margin-top: 0;
  margin-bottom: 0.25em;
  font-size: 1rem;
}

.search-count {
  color: var(--color-muted);
  font-size: 0.85rem;
  font-family: var(--font-heading);
  margin-bottom: 0.75rem;
}

.snippet {
  color: var(--color-muted);
  font-size: 0.85rem;
  margin-bottom: 0.25em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
`;

function truncate(s: string, len: number): string {
  if (s.length <= len) return s;
  return s.slice(0, len - 1) + "\u2026";
}
