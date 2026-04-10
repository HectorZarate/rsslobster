import { describe, it, expect } from "vitest";
import {
  imageExtensionFromMime,
  safeImageKey,
  determineImagePostType,
  buildImageAttachments,
  ALLOWED_IMAGE_MIMES,
} from "./upload.js";

describe("imageExtensionFromMime", () => {
  it("returns .jpg for image/jpeg", () => {
    expect(imageExtensionFromMime("image/jpeg")).toBe(".jpg");
  });

  it("returns .png for image/png", () => {
    expect(imageExtensionFromMime("image/png")).toBe(".png");
  });

  it("returns .webp for image/webp", () => {
    expect(imageExtensionFromMime("image/webp")).toBe(".webp");
  });

  it("returns .gif for image/gif", () => {
    expect(imageExtensionFromMime("image/gif")).toBe(".gif");
  });

  it("returns null for unsupported types", () => {
    expect(imageExtensionFromMime("image/svg+xml")).toBeNull();
    expect(imageExtensionFromMime("application/pdf")).toBeNull();
    expect(imageExtensionFromMime("text/html")).toBeNull();
    expect(imageExtensionFromMime("")).toBeNull();
  });

  it("ALLOWED_IMAGE_MIMES exposes the supported set", () => {
    expect(ALLOWED_IMAGE_MIMES).toContain("image/jpeg");
    expect(ALLOWED_IMAGE_MIMES).toContain("image/png");
    expect(ALLOWED_IMAGE_MIMES).toContain("image/webp");
    expect(ALLOWED_IMAGE_MIMES).toContain("image/gif");
  });
});

describe("safeImageKey", () => {
  it("combines slug, index, and extension", () => {
    expect(safeImageKey("my-post", 0, ".jpg")).toBe("my-post-0.jpg");
  });

  it("handles multi-image indexing", () => {
    expect(safeImageKey("trip", 0, ".jpg")).toBe("trip-0.jpg");
    expect(safeImageKey("trip", 1, ".jpg")).toBe("trip-1.jpg");
    expect(safeImageKey("trip", 9, ".jpg")).toBe("trip-9.jpg");
  });

  it("strips unsafe characters from the slug", () => {
    expect(safeImageKey("My Post!", 0, ".jpg")).toBe("my-post-0.jpg");
    expect(safeImageKey("foo/bar", 0, ".png")).toBe("foo-bar-0.png");
    expect(safeImageKey("HELLO WORLD", 0, ".webp")).toBe("hello-world-0.webp");
  });

  it("collapses multiple separators", () => {
    expect(safeImageKey("foo---bar", 0, ".jpg")).toBe("foo-bar-0.jpg");
    expect(safeImageKey("a   b", 0, ".jpg")).toBe("a-b-0.jpg");
  });
});

describe("determineImagePostType", () => {
  it("returns 'image' for a single uploaded image", () => {
    expect(determineImagePostType(1, "post")).toBe("image");
  });

  it("returns 'carousel' for multiple images", () => {
    expect(determineImagePostType(2, "post")).toBe("carousel");
    expect(determineImagePostType(5, "micro")).toBe("carousel");
  });

  it("returns the original type when no images", () => {
    expect(determineImagePostType(0, "post")).toBe("post");
    expect(determineImagePostType(0, "micro")).toBe("micro");
    expect(determineImagePostType(0, "link")).toBe("link");
  });
});

describe("buildImageAttachments", () => {
  it("returns one attachment per image with correct src + alt", () => {
    const result = buildImageAttachments("my-post", [
      { mime: "image/jpeg", alt: "Sunset" },
      { mime: "image/png", alt: "Diagram" },
    ]);
    expect(result).toEqual([
      { src: "/img/my-post-0.jpg", alt: "Sunset" },
      { src: "/img/my-post-1.png", alt: "Diagram" },
    ]);
  });

  it("returns empty array for no images", () => {
    expect(buildImageAttachments("my-post", [])).toEqual([]);
  });

  it("uses empty string alt when not provided", () => {
    const result = buildImageAttachments("post", [{ mime: "image/jpeg" }]);
    expect(result).toEqual([{ src: "/img/post-0.jpg", alt: "" }]);
  });

  it("throws on unsupported mime types", () => {
    expect(() =>
      buildImageAttachments("post", [{ mime: "application/pdf" }]),
    ).toThrow(/unsupported/i);
  });
});
