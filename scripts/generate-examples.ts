/**
 * Generate example sites for each style preset.
 *
 * Run: pnpm examples
 *
 * Produces examples/{preset}/ directories with index.html, post pages,
 * feed.xml, and feed.json — ready to open in a browser.
 */

import { mkdir, rm, writeFile, unlink, readdir, rename, cp } from "node:fs/promises";
import { join } from "node:path";
import { scaffoldSite, addContent } from "../src/generator/site.js";
import type {
  ClassifiedContent,
  SiteConfig,
  StylePreset,
} from "../src/config/types.js";

const EXAMPLES_DIR = join(import.meta.dirname, "..", "examples");

const PRESET_META: Record<StylePreset, { title: string; description: string }> =
  {
    minimal: {
      title: "Ada's Notes",
      description: "Thoughts on the open web",
    },
    brutalist: {
      title: "RAW FEED",
      description: "No CSS was harmed in the making of this site.",
    },
    magazine: {
      title: "The Evening Page",
      description: "Long reads and quiet links",
    },
    terminal: {
      title: "ada@localhost",
      description: "dispatches from /dev/brain",
    },
  };

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
  const meta = PRESET_META[preset];

  await rm(siteDir, { recursive: true, force: true });

  const config: SiteConfig = {
    domain: `${preset}.example.com`,
    title: meta.title,
    description: meta.description,
    author: "Ada Lovelace",
    language: "en",
    style: { preset },
    repo: "",
  };

  await scaffoldSite(siteDir, config);

  // Write a minimal 1x1 pixel JPEG so the image post has a valid file reference
  // GIF89a 1x1 transparent pixel — smallest valid image at 35 bytes
  const pixel = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64",
  );
  await writeFile(join(siteDir, "_site", "images", "sunset-1.jpg"), pixel);

  // Add content oldest-first so newest ends up on top (addContent uses unshift)
  for (const content of [...SAMPLE_CONTENT].reverse()) {
    await addContent(siteDir, content);
  }

  // Remove internal config/state files
  await unlink(join(siteDir, "rsslobster.json"));
  await unlink(join(siteDir, "posts.json"));
  await rm(join(siteDir, "drafts"), { recursive: true, force: true });

  // Move contents of _site/ up to the example dir (examples are just output)
  const siteOutput = join(siteDir, "_site");
  const entries = await readdir(siteOutput);
  for (const entry of entries) {
    await cp(join(siteOutput, entry), join(siteDir, entry), { recursive: true });
  }
  await rm(siteOutput, { recursive: true, force: true });

  console.log(`  ✓ ${preset}`);
}

async function main(): Promise<void> {
  console.log("Generating example sites...\n");

  await mkdir(EXAMPLES_DIR, { recursive: true });

  for (const preset of Object.keys(PRESET_META) as StylePreset[]) {
    await generatePresetExample(preset);
  }

  console.log(`\nDone. Open any examples/{preset}/index.html in a browser.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
