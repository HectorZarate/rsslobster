#!/usr/bin/env node
import { Command } from "commander";
import { generateCommand } from "./cli/generate.js";
import { draftsCommand } from "./cli/drafts.js";
import { initCommand } from "./cli/init.js";
import { startCommand } from "./cli/start.js";
import { onboardCommand } from "./cli/onboard.js";
import { publishCommand } from "./cli/publish.js";
import { previewsCommand } from "./cli/previews.js";
import { pagesCommand } from "./cli/pages.js";
import { regenerateCommand } from "./cli/regenerate.js";
import { devCommand } from "./cli/dev.js";
import { feedsCommand } from "./cli/feeds.js";
import { enableCommand } from "./cli/enable.js";
import { sitesCommand } from "./cli/sites.js";
import { lobsterConfigExists } from "./config/lobster.js";

const program = new Command();

program
  .name("rsslobster")
  .description("Publish to the open web from your phone. Unplatform yourself.")
  .version("0.1.0");

program.addCommand(onboardCommand);
program.addCommand(startCommand);
program.addCommand(generateCommand);
program.addCommand(draftsCommand);
program.addCommand(initCommand);
program.addCommand(publishCommand);
program.addCommand(previewsCommand);
program.addCommand(pagesCommand);
program.addCommand(regenerateCommand);
program.addCommand(devCommand);
program.addCommand(feedsCommand);
program.addCommand(enableCommand);
program.addCommand(sitesCommand);

// Bare `rsslobster` with no subcommand: show status dashboard if in a configured directory
const args = process.argv.slice(2);
if (args.length === 0) {
  lobsterConfigExists(".").then((exists) => {
    if (exists) {
      // Run enable --list (status dashboard)
      process.argv.push("enable", "--list");
      program.parse();
    } else {
      program.parse();
    }
  });
} else {
  program.parse();
}
