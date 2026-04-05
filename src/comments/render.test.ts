import { describe, it, expect } from "vitest";
import {
  type Comment,
  renderComment,
  renderCommentList,
  renderCommentForm,
  renderCommentsSection,
} from "./render.js";

const COMMENT: Comment = {
  id: "abc123",
  author: "Ada Lovelace",
  body: "This is a thoughtful comment about the post.",
  createdAt: "2026-03-25T12:00:00Z",
  slug: "test-post",
  status: "approved",
};

const XSS_COMMENT: Comment = {
  id: "xss1",
  author: '<script>alert("xss")</script>',
  body: '<img onerror="alert(1)" src=x>',
  createdAt: "2026-03-25T12:00:00Z",
  slug: "test-post",
  status: "approved",
};

describe("renderComment", () => {
  it("renders a single comment as article element with comment class", () => {
    const html = renderComment(COMMENT);
    expect(html).toContain("<article");
    expect(html).toContain('class="comment"');
  });

  it("renders the author name", () => {
    const html = renderComment(COMMENT);
    expect(html).toContain("Ada Lovelace");
  });

  it("renders the comment body", () => {
    const html = renderComment(COMMENT);
    expect(html).toContain("This is a thoughtful comment about the post.");
  });

  it("renders createdAt as human-readable date inside time element", () => {
    const html = renderComment(COMMENT);
    expect(html).toContain("<time");
    expect(html).toContain("March 25, 2026");
  });

  it("includes machine-readable datetime attribute", () => {
    const html = renderComment(COMMENT);
    expect(html).toContain('datetime="2026-03-25T12:00:00Z"');
  });

  it("escapes HTML in author name to prevent XSS", () => {
    const html = renderComment(XSS_COMMENT);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes HTML in comment body to prevent XSS", () => {
    const html = renderComment(XSS_COMMENT);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("renderCommentList", () => {
  it("wraps comments in section with id='comments'", () => {
    const html = renderCommentList([COMMENT]);
    expect(html).toContain('<section id="comments"');
  });

  it("includes comment count in heading", () => {
    const two = [COMMENT, { ...COMMENT, id: "2", author: "Bob" }];
    const html = renderCommentList(two);
    expect(html).toContain("2");
    expect(html).toMatch(/<h2[^>]*>.*2.*<\/h2>/s);
  });

  it("renders singular when one comment", () => {
    const html = renderCommentList([COMMENT]);
    expect(html).toMatch(/1\s+Comment/);
    expect(html).not.toMatch(/1\s+Comments/);
  });

  it("renders empty state message when no comments", () => {
    const html = renderCommentList([]);
    expect(html).toContain('<section id="comments"');
    expect(html).toMatch(/no comments|be the first/i);
  });

  it("only renders approved comments", () => {
    const pending: Comment = { ...COMMENT, id: "p1", status: "pending", author: "Pending Person" };
    const rejected: Comment = { ...COMMENT, id: "r1", status: "rejected", author: "Rejected Person" };
    const html = renderCommentList([COMMENT, pending, rejected]);
    expect(html).toContain("Ada Lovelace");
    expect(html).not.toContain("Pending Person");
    expect(html).not.toContain("Rejected Person");
  });

  it("renders comments in the order provided", () => {
    const second: Comment = { ...COMMENT, id: "2", author: "Bob", createdAt: "2026-03-26T12:00:00Z" };
    const html = renderCommentList([COMMENT, second]);
    const adaPos = html.indexOf("Ada Lovelace");
    const bobPos = html.indexOf("Bob");
    expect(adaPos).toBeLessThan(bobPos);
  });
});

describe("renderCommentForm", () => {
  const SUBMIT_URL = "https://comments.example.com/submit";

  it("renders a form with POST method", () => {
    const html = renderCommentForm("test-post", SUBMIT_URL);
    expect(html).toContain("<form");
    expect(html).toContain('method="POST"');
  });

  it("form action points to submit URL", () => {
    const html = renderCommentForm("test-post", SUBMIT_URL);
    expect(html).toContain(`action="${SUBMIT_URL}"`);
  });

  it("includes hidden slug field", () => {
    const html = renderCommentForm("test-post", SUBMIT_URL);
    expect(html).toContain('name="slug"');
    expect(html).toContain('value="test-post"');
    expect(html).toContain('type="hidden"');
  });

  it("includes name input field with label", () => {
    const html = renderCommentForm("test-post", SUBMIT_URL);
    expect(html).toContain('name="author"');
    expect(html).toContain("<label");
  });

  it("includes body textarea with label", () => {
    const html = renderCommentForm("test-post", SUBMIT_URL);
    expect(html).toContain("<textarea");
    expect(html).toContain('name="body"');
  });

  it("has accessible labels for all visible inputs", () => {
    const html = renderCommentForm("test-post", SUBMIT_URL);
    // Each visible input should have a corresponding label with for attribute
    expect(html).toMatch(/for="comment-author"/);
    expect(html).toMatch(/for="comment-body"/);
    expect(html).toMatch(/id="comment-author"/);
    expect(html).toMatch(/id="comment-body"/);
  });

  it("includes submit button", () => {
    const html = renderCommentForm("test-post", SUBMIT_URL);
    expect(html).toContain('type="submit"');
  });

  it("includes redirect field when redirectUrl provided", () => {
    const html = renderCommentForm("test-post", SUBMIT_URL, { redirectUrl: "https://example.com/posts/test-post/" });
    expect(html).toContain('name="redirect"');
    expect(html).toContain('value="https://example.com/posts/test-post/"');
  });

  it("omits redirect field when redirectUrl not provided", () => {
    const html = renderCommentForm("test-post", SUBMIT_URL);
    expect(html).not.toContain('name="redirect"');
  });
});

describe("renderCommentsSection", () => {
  const SUBMIT_URL = "https://comments.example.com/submit";

  it("combines comment list and form into output", () => {
    const html = renderCommentsSection([COMMENT], "test-post", SUBMIT_URL);
    // Has both comments and form
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("<form");
  });

  it("places form after comment list", () => {
    const html = renderCommentsSection([COMMENT], "test-post", SUBMIT_URL);
    const commentsEnd = html.indexOf("</section>");
    const formStart = html.indexOf("<form");
    expect(commentsEnd).toBeLessThan(formStart);
  });

  it("works with empty comments", () => {
    const html = renderCommentsSection([], "test-post", SUBMIT_URL);
    expect(html).toContain('<section id="comments"');
    expect(html).toContain("<form");
  });
});
