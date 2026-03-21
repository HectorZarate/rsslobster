/**
 * Generate example sites for each style preset.
 *
 * Run: npx tsx scripts/generate-examples.ts
 *
 * Produces examples/{preset}/ directories with index.html, post pages,
 * feed.xml, and feed.json — ready to open in a browser.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { scaffoldSite, addContent } from "../src/generator/site.js";
import type {
  ClassifiedContent,
  SiteConfig,
  StylePreset,
} from "../src/config/types.js";

const PRESETS: StylePreset[] = ["minimal", "brutalist", "magazine", "terminal"];

const EXAMPLES_DIR = join(import.meta.dirname, "..", "examples");

const SAMPLE_CONTENT: ClassifiedContent[] = [
  {
    type: "micro",
    body: "The mass of men lead lives of quiet desperation. What is called resignation is confirmed desperation.",
    slug: "quiet-desperation",
    tags: ["quote", "thoreau"],
    createdAt: "2025-03-15T10:30:00Z",
    updatedAt: "2025-03-15T10:30:00Z",
  },
  {
    type: "post",
    title: "Why RSS Still Matters",
    body: "In an age of algorithmic feeds and walled gardens, RSS remains the only open standard that puts readers in control. No algorithm decides what you see. No company can enshittify your timeline. You subscribe, you read, you move on. The protocol is simple: an XML file at a known URL. Any client can fetch it. No API key, no OAuth dance, no rate limits. This is how the web was supposed to work.",
    slug: "why-rss-still-matters",
    tags: ["rss", "indieweb", "web"],
    createdAt: "2025-03-14T08:00:00Z",
    updatedAt: "2025-03-14T08:00:00Z",
  },
  {
    type: "link",
    body: "The best explanation of the indie web I've found. Start here if you want to own your corner of the internet.",
    slug: "getting-started-indieweb",
    tags: ["indieweb"],
    linkUrl: "https://indieweb.org/Getting_Started",
    linkTitle: "Getting Started with the IndieWeb",
    linkDescription:
      "A step-by-step guide to owning your online identity and publishing on your own domain.",
    createdAt: "2025-03-13T16:45:00Z",
    updatedAt: "2025-03-13T16:45:00Z",
  },
  {
    type: "image",
    body: "Sunset from the office window. Sometimes you have to stop and look up.",
    slug: "sunset-from-the-office",
    tags: ["photo"],
    images: [
      {
        src: "/images/sunset-1.jpg",
        alt: "Golden sunset over city rooftops with scattered clouds",
        width: 1200,
        height: 800,
      },
    ],
    createdAt: "2025-03-12T18:20:00Z",
    updatedAt: "2025-03-12T18:20:00Z",
  },
  {
    type: "micro",
    body: "Just shipped a new feature. Zero dependencies, zero JavaScript in the output, four seconds to deploy. This is what building for the web should feel like.",
    slug: "just-shipped",
    tags: ["building"],
    createdAt: "2025-03-11T22:00:00Z",
    updatedAt: "2025-03-11T22:00:00Z",
  },
];

async function generatePresetExample(preset: StylePreset): Promise<void> {
  const siteDir = join(EXAMPLES_DIR, preset);

  // Clean and create
  await rm(siteDir, { recursive: true, force: true });

  const config: SiteConfig = {
    domain: `${preset}.example.com`,
    title:
      preset === "minimal"
        ? "Ada's Notes"
        : preset === "brutalist"
          ? "RAW FEED"
          : preset === "magazine"
            ? "The Evening Page"
            : "ada@localhost",
    description:
      preset === "minimal"
        ? "Thoughts on the open web"
        : preset === "brutalist"
          ? "No CSS was harmed in the making of this site."
          : preset === "magazine"
            ? "Long reads and quiet links"
            : "dispatches from /dev/brain",
    author: "Ada Lovelace",
    language: "en",
    style: { preset },
    repo: "",
  };

  await scaffoldSite(siteDir, config);

  // Create a placeholder image directory and a 1x1 JPEG placeholder
  // so the image post doesn't reference a missing file
  const placeholder = Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoH" +
      "BwYIDAoMCwsKCwsNCxAPDhANDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQME" +
      "BAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU" +
      "FBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAA" +
      "AAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEG" +
      "E1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RF" +
      "RkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKj" +
      "pKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP0" +
      "9fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgEC" +
      "BAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLR" +
      "ChYkNOEl8RcYI4Q/RFhScJMnZGj/xAAZAQADAQEBAAAAAAAAAAAAAAAAAgMEAQX/" +
      "xAAiEQACAgICAQUBAAAAAAAAAAAAAQIRAyESMUFRYXGB8JH/2gAMAwEAAhEDEQA/AP1T" +
      "ooooA//Z",
    "base64",
  );
  await writeFile(join(siteDir, "images", "sunset-1.jpg"), placeholder);

  // Add content in chronological order (oldest first, so newest ends up on top)
  for (const content of [...SAMPLE_CONTENT].reverse()) {
    await addContent(siteDir, content);
  }

  console.log(`  ✓ ${preset}`);
}

async function main(): Promise<void> {
  console.log("Generating example sites...\n");

  await mkdir(EXAMPLES_DIR, { recursive: true });

  for (const preset of PRESETS) {
    await generatePresetExample(preset);
  }

  console.log(`\nDone. Open any examples/{preset}/index.html in a browser.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
