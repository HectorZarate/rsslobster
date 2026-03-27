import { Command } from "commander";
import { resolve } from "node:path";
import pc from "picocolors";
import {
  addSite,
  removeSite,
  setDefault,
  readWorkspace,
} from "../config/workspace.js";
import { readPostsIndex } from "../generator/site.js";

export const sitesCommand = new Command("sites")
  .description("Manage registered sites")
  .action(async () => {
    const workspace = await readWorkspace();
    if (workspace.sites.length === 0) {
      console.log("No sites registered.");
      console.log("");
      console.log("Register a site:");
      console.log(`  rsslobster sites add blog .`);
      console.log(`  rsslobster sites add photo ~/workspace/photohectorzaratecom`);
      return;
    }

    // Table header
    console.log(
      `${pc.bold("Name".padEnd(14))} ${pc.bold("Domain".padEnd(30))} ${pc.bold("Posts".padEnd(6))} ${pc.bold("Path")}`,
    );
    console.log("-".repeat(80));

    for (const site of workspace.sites) {
      const isDefault = workspace.defaultSite === site.name;
      const name = isDefault
        ? pc.green(`${site.name} *`.padEnd(14))
        : site.name.padEnd(14);

      let postCount = "?";
      try {
        const posts = await readPostsIndex(site.path);
        postCount = String(posts.length);
      } catch {
        postCount = "-";
      }

      console.log(
        `${name} ${site.domain.padEnd(30)} ${postCount.padEnd(6)} ${site.path}`,
      );
    }
  });

sitesCommand
  .command("add <name> [path]")
  .description("Register a site (path defaults to current directory)")
  .action(async (name: string, pathArg?: string) => {
    const sitePath = resolve(pathArg ?? ".");
    try {
      const entry = await addSite(name, sitePath);
      console.log(
        pc.green(`Registered "${entry.name}" → ${entry.domain} (${entry.path})`),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to register site";
      console.error(pc.red(msg));
      process.exit(1);
    }
  });

sitesCommand
  .command("remove <name>")
  .description("Unregister a site")
  .action(async (name: string) => {
    try {
      await removeSite(name);
      console.log(pc.green(`Removed "${name}" from registry.`));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to remove site";
      console.error(pc.red(msg));
      process.exit(1);
    }
  });

sitesCommand
  .command("default <name>")
  .description("Set the default site")
  .action(async (name: string) => {
    try {
      await setDefault(name);
      console.log(pc.green(`Default site set to "${name}".`));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to set default";
      console.error(pc.red(msg));
      process.exit(1);
    }
  });
