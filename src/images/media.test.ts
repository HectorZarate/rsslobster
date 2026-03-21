import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateMediaFilename, ingestMediaFile, ingestMedia } from "./media.js";
import type { InboundMedia } from "../channels/types.js";

describe("generateMediaFilename", () => {
  it("generates filename with slug, index, and correct extension", () => {
    expect(generateMediaFilename("my-post", "video.mp4", 0, "video/mp4")).toBe("my-post-media-1.mp4");
  });

  it("uses MIME type to determine extension", () => {
    expect(generateMediaFilename("post", "file", 0, "audio/ogg")).toBe("post-media-1.ogg");
    expect(generateMediaFilename("post", "file", 0, "audio/mpeg")).toBe("post-media-1.mp3");
    expect(generateMediaFilename("post", "file", 0, "video/webm")).toBe("post-media-1.webm");
  });

  it("increments index correctly", () => {
    expect(generateMediaFilename("post", "a.mp4", 0, "video/mp4")).toBe("post-media-1.mp4");
    expect(generateMediaFilename("post", "b.mp4", 1, "video/mp4")).toBe("post-media-2.mp4");
    expect(generateMediaFilename("post", "c.mp4", 2, "video/mp4")).toBe("post-media-3.mp4");
  });

  it("falls back to original extension for unknown MIME types", () => {
    expect(generateMediaFilename("post", "file.flac", 0, "audio/flac")).toBe("post-media-1.flac");
  });

  it("uses .bin for unknown MIME with no original extension", () => {
    expect(generateMediaFilename("post", "file", 0, "application/octet-stream")).toBe("post-media-1.bin");
  });
});

describe("ingestMediaFile", () => {
  let siteDir: string;
  let srcDir: string;

  beforeEach(async () => {
    siteDir = await mkdtemp(join(tmpdir(), "rsslobster-media-test-site-"));
    srcDir = await mkdtemp(join(tmpdir(), "rsslobster-media-test-src-"));
  });

  afterEach(async () => {
    await rm(siteDir, { recursive: true, force: true });
    await rm(srcDir, { recursive: true, force: true });
  });

  it("copies a media file to site/media/ with correct name", async () => {
    const srcPath = join(srcDir, "voice.ogg");
    await writeFile(srcPath, "fake audio data");

    const media: InboundMedia = {
      localPath: srcPath,
      mimeType: "audio/ogg",
      filename: "voice.ogg",
    };

    const result = await ingestMediaFile(siteDir, media, "my-post", 0);
    expect(result.src).toBe("/media/my-post-media-1.ogg");
    expect(result.mimeType).toBe("audio/ogg");

    const files = await readdir(join(siteDir, "media"));
    expect(files).toContain("my-post-media-1.ogg");
  });
});

describe("ingestMedia", () => {
  let siteDir: string;
  let srcDir: string;

  beforeEach(async () => {
    siteDir = await mkdtemp(join(tmpdir(), "rsslobster-media-test-site-"));
    srcDir = await mkdtemp(join(tmpdir(), "rsslobster-media-test-src-"));
  });

  afterEach(async () => {
    await rm(siteDir, { recursive: true, force: true });
    await rm(srcDir, { recursive: true, force: true });
  });

  it("returns the first successfully ingested media file", async () => {
    const srcPath = join(srcDir, "clip.mp4");
    await writeFile(srcPath, "fake video data");

    const result = await ingestMedia(siteDir, [
      { localPath: srcPath, mimeType: "video/mp4", filename: "clip.mp4" },
    ], "test-post");

    expect(result).toBeDefined();
    expect(result!.src).toBe("/media/test-post-media-1.mp4");
    expect(result!.mimeType).toBe("video/mp4");
  });

  it("returns undefined for empty media list", async () => {
    const result = await ingestMedia(siteDir, [], "test-post");
    expect(result).toBeUndefined();
  });

  it("skips failed ingestions and returns first success", async () => {
    const goodPath = join(srcDir, "good.ogg");
    await writeFile(goodPath, "good data");

    const result = await ingestMedia(siteDir, [
      { localPath: "/nonexistent/bad.mp4", mimeType: "video/mp4", filename: "bad.mp4" },
      { localPath: goodPath, mimeType: "audio/ogg", filename: "good.ogg" },
    ], "test-post");

    expect(result).toBeDefined();
    expect(result!.mimeType).toBe("audio/ogg");
  });
});
