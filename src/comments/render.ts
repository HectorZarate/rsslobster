import { escHtml } from "../generator/html.js";

/** A comment on a post */
export interface Comment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  slug: string;
  status: "pending" | "approved" | "rejected";
}

/** Render a single comment as an HTML article element */
export function renderComment(comment: Comment): string {
  const date = new Date(comment.createdAt);
  const formatted = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `<article class="comment">
        <header class="comment-header">
          <strong class="comment-author">${escHtml(comment.author)}</strong>
          <time datetime="${escHtml(comment.createdAt)}">${formatted}</time>
        </header>
        <p class="comment-body">${escHtml(comment.body)}</p>
      </article>`;
}

/** Render a list of approved comments wrapped in a section */
export function renderCommentList(comments: Comment[]): string {
  const approved = comments.filter((c) => c.status === "approved");
  const count = approved.length;

  const heading =
    count === 0
      ? `<h2>Comments</h2>\n      <p>No comments yet — be the first to comment.</p>`
      : `<h2>${count} ${count === 1 ? "Comment" : "Comments"}</h2>`;

  const items = approved.map((c) => renderComment(c)).join("\n      ");

  return `<section id="comments" class="comments-section">
      ${heading}
      ${items}
    </section>`;
}

/** Render the comment submission form */
export function renderCommentForm(
  slug: string,
  submitUrl: string,
): string {
  return `<form method="POST" action="${escHtml(submitUrl)}" class="comment-form">
      <input type="hidden" name="slug" value="${escHtml(slug)}">
      <div class="hp-field" aria-hidden="true">
        <label for="comment-website">Website</label>
        <input type="text" name="website" id="comment-website" tabindex="-1" autocomplete="off">
      </div>
      <div>
        <label for="comment-author">Name</label>
        <input type="text" name="author" id="comment-author" required>
      </div>
      <div>
        <label for="comment-body">Comment</label>
        <textarea name="body" id="comment-body" rows="4" required></textarea>
      </div>
      <button type="submit">Post Comment</button>
    </form>`;
}

/** Render the full comments section: list + form */
export function renderCommentsSection(
  comments: Comment[],
  slug: string,
  submitUrl: string,
): string {
  return `${renderCommentList(comments)}
    ${renderCommentForm(slug, submitUrl)}`;
}
