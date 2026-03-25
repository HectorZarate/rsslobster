import { execFile } from "node:child_process";

/**
 * Lifecycle hook events:
 *
 * - afterClassify: Fired after LLM classification, before publishing.
 *   Receives JSON on stdin: { type, title, body, slug, tags, isDraft }
 *   Can modify and return JSON on stdout to override classification.
 *
 * - afterPublish: Fired after HTML + feeds are generated.
 *   Receives JSON on stdin: { url, slug, type, tags }
 *
 * - afterDeploy: Fired after git commit + push.
 *   Receives JSON on stdin: { url, slug, committed, pushError? }
 */
export type HookEvent = "afterClassify" | "afterPublish" | "afterDeploy" | "afterPreview" | "afterFeedItem";

export interface HookDefinition {
  /** Shell command to run, or path to a script */
  run: string;
  /** Only fire for specific content types (optional, fires for all if omitted) */
  types?: string[];
}

export interface HooksConfig {
  afterClassify?: HookDefinition[];
  afterPublish?: HookDefinition[];
  afterDeploy?: HookDefinition[];
  afterPreview?: HookDefinition[];
  afterFeedItem?: HookDefinition[];
}

/** Result of running a hook. */
export interface HookResult {
  /** stdout from the hook process */
  stdout: string;
  /** stderr from the hook process */
  stderr: string;
  /** exit code */
  exitCode: number;
}

const HOOK_TIMEOUT = 30_000; // 30 seconds

/**
 * Run a single hook command.
 * Data is passed as JSON on stdin. stdout/stderr are captured.
 */
export function runHook(
  command: string,
  data: Record<string, unknown>,
  cwd: string,
): Promise<HookResult> {
  return new Promise((res) => {
    const child = execFile(
      "/bin/sh",
      ["-c", command],
      { cwd, timeout: HOOK_TIMEOUT, maxBuffer: 1024 * 256 },
      (error: Error | null, stdout: string, stderr: string) => {
        const exitCode = error
          ? ((error as NodeJS.ErrnoException).code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
              ? 1
              : 1)
          : 0;
        res({ stdout, stderr, exitCode });
      },
    );
    // Pass data as JSON on stdin, ignoring EPIPE if the process exits early
    if (child.stdin) {
      child.stdin.on("error", () => {});
      child.stdin.write(JSON.stringify(data));
      child.stdin.end();
    }
  });
}

/**
 * Fire all hooks for a given event.
 * Returns merged stdout from hooks that exited 0.
 * Hook failures are logged but do not block the pipeline.
 */
export async function fireHooks(
  event: HookEvent,
  hooks: HooksConfig | undefined,
  data: Record<string, unknown>,
  cwd: string,
  contentType?: string,
): Promise<string | undefined> {
  if (!hooks) return undefined;
  const definitions = hooks[event];
  if (!definitions || definitions.length === 0) return undefined;

  let lastOutput: string | undefined;

  for (const hook of definitions) {
    // Skip if hook is type-filtered and doesn't match
    if (hook.types && contentType && !hook.types.includes(contentType)) {
      continue;
    }

    const result = await runHook(hook.run, data, cwd);

    if (result.exitCode !== 0) {
      console.error(
        `Hook "${hook.run}" failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
      );
      continue;
    }

    if (result.stdout.trim()) {
      lastOutput = result.stdout.trim();
    }
  }

  return lastOutput;
}

/**
 * Try to parse hook stdout as a JSON override for classification.
 * Returns the parsed object if valid JSON, undefined otherwise.
 */
export function parseHookOverride(
  stdout: string | undefined,
): Record<string, unknown> | undefined {
  if (!stdout) return undefined;
  try {
    const parsed = JSON.parse(stdout);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Not JSON — that's fine, ignore
  }
  return undefined;
}
