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
import { styleCommand } from "./cli/style.js";
import { feedsCommand } from "./cli/feeds.js";
import { enableCommand } from "./cli/enable.js";
import { sitesCommand } from "./cli/sites.js";
import { deleteCommand } from "./cli/delete.js";
import { commentsCommand } from "./cli/comments.js";
import { postToXCommand } from "./cli/post-to-x.js";
import { adminCommand } from "./cli/admin.js";
import { lobsterConfigExists } from "./config/lobster.js";

const program = new Command();

program
  .name("rsslobster")
  .description(
    "Publish to the open web from your phone. Unplatform yourself.\n\n" +
    "Run with no arguments in a site directory to see a status dashboard.",
  )
  .version("0.4.1");

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
program.addCommand(styleCommand);
program.addCommand(feedsCommand);
program.addCommand(enableCommand);
program.addCommand(sitesCommand);
program.addCommand(deleteCommand);
program.addCommand(commentsCommand);
program.addCommand(postToXCommand);
program.addCommand(adminCommand);

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
