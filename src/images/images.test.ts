import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ingestImage,
  ingestImages,
  mimeFromExtension,
  generateFilename,
} from "./images.js";
import type { InboundImage } from "../channels/types.js";

describe("image handling", () => {
  let siteDir: string;
  let tempDir: string;

  beforeEach(async () => {
    siteDir = await mkdtemp(join(tmpdir(), "rsslobster-images-site-"));
    tempDir = await mkdtemp(join(tmpdir(), "rsslobster-images-temp-"));
  });

  afterEach(async () => {
    await rm(siteDir, { recursive: true, force: true });
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("mimeFromExtension", () => {
    it("detects jpeg", () => {
      expect(mimeFromExtension("photo.jpg")).toBe("image/jpeg");
      expect(mimeFromExtension("photo.jpeg")).toBe("image/jpeg");
      expect(mimeFromExtension("PHOTO.JPG")).toBe("image/jpeg");
    });

    it("detects png", () => {
      expect(mimeFromExtension("screenshot.png")).toBe("image/png");
    });

    it("detects webp", () => {
      expect(mimeFromExtension("modern.webp")).toBe("image/webp");
    });

    it("detects gif", () => {
      expect(mimeFromExtension("animation.gif")).toBe("image/gif");
    });

    it("defaults to jpeg for unknown extensions", () => {
      expect(mimeFromExtension("file.xyz")).toBe("image/jpeg");
      expect(mimeFromExtension("noext")).toBe("image/jpeg");
    });
  });

  describe("generateFilename", () => {
    it("generates a slug-based filename with original extension", () => {
      const name = generateFilename("my-post", "photo.jpg", 0);
      expect(name).toBe("my-post-1.jpg");
    });

    it("preserves png extension", () => {
      const name = generateFilename("sunset", "screenshot.png", 0);
      expect(name).toBe("sunset-1.png");
    });

    it("increments index for multiple images", () => {
      expect(generateFilename("trip", "a.jpg", 0)).toBe("trip-1.jpg");
      expect(generateFilename("trip", "b.jpg", 1)).toBe("trip-2.jpg");
      expect(generateFilename("trip", "c.jpg", 2)).toBe("trip-3.jpg");
    });

    it("defaults to .jpg when no extension", () => {
      const name = generateFilename("post", "file_123", 0);
      expect(name).toBe("post-1.jpg");
    });

    it("handles uppercase extensions", () => {
      const name = generateFilename("post", "photo.PNG", 0);
      expect(name).toBe("post-1.png");
    });
  });

  describe("ingestImage", () => {
    it("copies file to site images dir with slug-based name", async () => {
      const srcPath = join(tempDir, "telegram_photo.jpg");
      await writeFile(srcPath, Buffer.from("fake-jpeg-data"));

      const attachment = await ingestImage(
        siteDir,
        { localPath: srcPath, filename: "telegram_photo.jpg" },
        "my-post",
        0,
      );

      expect(attachment.src).toBe("/images/my-post-1.jpg");
      expect(attachment.alt).toBe("my-post image 1");

      // Verify file was copied
      const destPath = join(siteDir, "_site", "images", "my-post-1.jpg");
      const content = await readFile(destPath);
      expect(content.toString()).toBe("fake-jpeg-data");
    });

    it("creates images directory if missing", async () => {
      const srcPath = join(tempDir, "photo.jpg");
      await writeFile(srcPath, Buffer.from("data"));

      await ingestImage(
        siteDir,
        { localPath: srcPath, filename: "photo.jpg" },
        "slug",
        0,
      );

      const dirStat = await stat(join(siteDir, "_site", "images"));
      expect(dirStat.isDirectory()).toBe(true);
    });

    it("preserves original file content exactly", async () => {
      // Simulate a real binary image (random bytes)
      const binaryData = Buffer.alloc(1024);
      for (let i = 0; i < 1024; i++) binaryData[i] = i % 256;

      const srcPath = join(tempDir, "binary.png");
      await writeFile(srcPath, binaryData);

      const attachment = await ingestImage(
        siteDir,
        { localPath: srcPath, filename: "binary.png" },
        "test",
        0,
      );

      const copied = await readFile(join(siteDir, "_site", attachment.src.slice(1)));
      expect(Buffer.compare(copied, binaryData)).toBe(0);
    });

    it("uses mime type from inbound image when provided", async () => {
      const srcPath = join(tempDir, "file_12345");
      await writeFile(srcPath, Buffer.from("data"));

      const attachment = await ingestImage(
        siteDir,
        {
          localPath: srcPath,
          filename: "file_12345",
          mimeType: "image/webp",
        },
        "post",
        0,
      );

      // Should use webp extension from mime type
      expect(attachment.src).toBe("/images/post-1.webp");
    });
  });

  describe("ingestImages", () => {
    it("returns empty array when no images", async () => {
      const result = await ingestImages(siteDir, [], "slug");
      expect(result).toEqual([]);
    });

    it("ingests multiple images with sequential names", async () => {
      const images: InboundImage[] = [];
      for (let i = 0; i < 3; i++) {
        const path = join(tempDir, `photo${i}.jpg`);
        await writeFile(path, Buffer.from(`image-${i}`));
        images.push({ localPath: path, filename: `photo${i}.jpg` });
      }

      const attachments = await ingestImages(siteDir, images, "trip");

      expect(attachments).toHaveLength(3);
      expect(attachments[0]!.src).toBe("/images/trip-1.jpg");
      expect(attachments[1]!.src).toBe("/images/trip-2.jpg");
      expect(attachments[2]!.src).toBe("/images/trip-3.jpg");

      // All files exist
      for (const att of attachments) {
        const fileStat = await stat(join(siteDir, "_site", att.src.slice(1)));
        expect(fileStat.isFile()).toBe(true);
      }
    });

    it("skips images that fail to copy without crashing", async () => {
      const goodPath = join(tempDir, "good.jpg");
      await writeFile(goodPath, Buffer.from("ok"));

      const attachments = await ingestImages(
        siteDir,
        [
          { localPath: "/nonexistent/bad.jpg", filename: "bad.jpg" },
          { localPath: goodPath, filename: "good.jpg" },
        ],
        "post",
      );

      // Only the good image should be in results
      expect(attachments).toHaveLength(1);
      expect(attachments[0]!.src).toBe("/images/post-2.jpg");
    });

    it("cleans up temp files after ingestion", async () => {
      const srcPath = join(tempDir, "cleanup.jpg");
      await writeFile(srcPath, Buffer.from("temp-data"));

      await ingestImages(
        siteDir,
        [{ localPath: srcPath, filename: "cleanup.jpg" }],
        "slug",
        true, // cleanup flag
      );

      // Source file should be deleted
      await expect(stat(srcPath)).rejects.toThrow();
    });
  });
});
