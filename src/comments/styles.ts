/** CSS styles for the comments section, using the existing design system custom properties */
export function commentStyles(): string {
  return `
#comments { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--color-border); }
#comments h2 { font-size: 1.2rem; margin-bottom: 1rem; }
.comment { margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--color-border); }
.comment-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.25rem; }
.comment-author { color: var(--color-text); }
.comment-header time { font-size: 0.85rem; color: var(--color-muted); }
.comment-body { margin: 0; color: var(--color-text); }
.comment-form { margin-top: 1.5rem; }
.comment-form label { display: block; margin-bottom: 0.25rem; font-size: 0.9rem; color: var(--color-muted); }
.comment-form input[type="text"], .comment-form textarea { width: 100%; padding: 0.5rem; margin-bottom: 0.75rem; border: 1px solid var(--color-border); background: var(--color-bg); color: var(--color-text); font: inherit; box-sizing: border-box; }
.comment-form textarea { resize: vertical; }
.comment-form button { padding: 0.5rem 1.25rem; border: 1px solid var(--color-border); background: var(--color-text); color: var(--color-bg); font: inherit; cursor: pointer; }
.comment-form button:hover { opacity: 0.85; }
.hp-field { display: none; }
`;
}
