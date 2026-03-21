#!/usr/bin/env node
import { Command } from "commander";
import { generateCommand } from "./cli/generate.js";
import { draftsCommand } from "./cli/drafts.js";
import { initCommand } from "./cli/init.js";
import { startCommand } from "./cli/start.js";
import { onboardCommand } from "./cli/onboard.js";
import { publishCommand } from "./cli/publish.js";

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

program.parse();
