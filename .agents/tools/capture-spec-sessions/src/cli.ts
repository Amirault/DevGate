#!/usr/bin/env node
import { parseArgs as parseNodeArgs } from "node:util";
import { WarpSqliteAdapter } from "./adapters/warpSqliteAdapter.js";
import { WarpConversationReader } from "./adapters/warpConversationReader.js";
import { ClaudeCodeTranscriptReader } from "./adapters/claudeCodeTranscriptReader.js";
import { HermesConversationReader } from "./adapters/hermesConversationReader.js";
import { JsonlSink } from "./adapters/jsonlSink.js";
import { JsonlBundleReader } from "./adapters/jsonlBundleReader.js";
import { extractSpecBundle } from "./usecases/extractSpecBundle.js";
import type { ExtractResult } from "./usecases/extractSpecBundle.js";
import { listSpecSlugs } from "./backlogLister.js";
import { formatRunReport } from "./formatRunReport.js";
import type { ConversationReader } from "./domain/ports.js";
import type { SpecBundle } from "./domain/models.js";

type CliSource = "warp" | "claude-code" | "hermes";

interface CliArgs {
  spec?: string;
  completeOnly: boolean;
  noMerge: boolean;
  out?: string;
  list: boolean;
  dbPath?: string;
  hermesDbPath?: string;
  source: CliSource;
  claudeRoot?: string;
  backlogRoot: string;
}

/** Attempt the parse; return the Error instead of throwing so callers can report it uniformly. */
function safeParseNodeArgs(argv: string[]) {
  try {
    return parseNodeArgs({
      args: argv,
      options: {
        spec: { type: "string" },
        "complete-only": { type: "boolean", default: false },
        "no-merge": { type: "boolean", default: false },
        out: { type: "string" },
        list: { type: "boolean", default: false },
        "db-path": { type: "string" },
        "hermes-db-path": { type: "string" },
        source: { type: "string", default: "warp" },
        "claude-root": { type: "string" },
        "backlog-root": { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
    });
  } catch (e) {
    return e as Error;
  }
}

function parseArgs(argv: string[]): CliArgs {
  const result = safeParseNodeArgs(argv);
  if (result instanceof Error) {
    console.error(`error: ${result.message}`);
    printUsage();
    process.exit(2);
  }
  const { values } = result;

  if (values.help) {
    printUsage();
    process.exit(0);
  }

  const source = parseSource(values.source);

  return {
    spec: values.spec,
    completeOnly: values["complete-only"],
    noMerge: values["no-merge"],
    out: values.out,
    list: values.list,
    dbPath: values["db-path"],
    hermesDbPath: values["hermes-db-path"],
    source,
    claudeRoot: values["claude-root"],
    backlogRoot: values["backlog-root"] ?? process.cwd(),
  };
}

function parseSource(value: string | undefined): CliSource {
  if (value === undefined || value === "warp") return "warp";
  if (value === "claude-code") return "claude-code";
  if (value === "hermes") return "hermes";
  console.error(
    `error: --source must be "warp", "claude-code", or "hermes" (got "${value}")`
  );
  printUsage();
  process.exit(2);
}

function printUsage(): void {
  console.error(`usage: tsx src/cli.ts --spec <slug> [--source warp|claude-code|hermes] [--complete-only] [--no-merge] [--out dir] [--db-path path] [--claude-root dir] [--hermes-db-path path]
       tsx src/cli.ts --list [--backlog-root dir]`);
}

function readerFor(args: CliArgs): ConversationReader {
  if (args.source === "claude-code") {
    return new ClaudeCodeTranscriptReader({ rootDir: args.claudeRoot });
  }
  if (args.source === "hermes") {
    return new HermesConversationReader({ dbPath: args.hermesDbPath });
  }
  return new WarpConversationReader(
    new WarpSqliteAdapter({ liveDbPath: args.dbPath })
  );
}

/**
 * Detect a previously-captured bundle for decay-safe merge. Returns the loaded
 * bundle (or null when none exists) and whether --no-merge is replacing one.
 * Guards: a corrupt prior file or a spec_id mismatch errors loudly instead of
 * silently overwriting (default merge only; --no-merge skips loading entirely).
 */
function loadExistingBundle(
  specId: string,
  outDir: string,
  noMerge: boolean
): { existingBundle: SpecBundle | null; replacedExisting: boolean } {
  const bundleReader = new JsonlBundleReader(outDir);
  if (!bundleReader.exists(specId)) {
    return { existingBundle: null, replacedExisting: false };
  }
  if (noMerge) {
    return { existingBundle: null, replacedExisting: true };
  }
  let loaded: SpecBundle | null;
  try {
    loaded = bundleReader.load(specId);
  } catch (e) {
    console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
    console.error(
      `refusing to overwrite "${bundleReader.pathFor(specId)}" — fix or remove the corrupt bundle, or re-run with --no-merge to replace it.`
    );
    process.exit(1);
  }
  if (loaded && loaded.header.spec_id !== specId) {
    console.error(
      `error: existing bundle spec_id mismatch: file has "${loaded.header.spec_id}", run expects "${specId}"`
    );
    console.error(
      `refusing to overwrite "${bundleReader.pathFor(specId)}" — this looks like a collision or manual tampering.`
    );
    process.exit(1);
  }
  return { existingBundle: loaded, replacedExisting: false };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    const slugs = listSpecSlugs(args.backlogRoot);
    if (slugs.length === 0) {
      console.log(`No specs found under ${args.backlogRoot}/docs/backlog`);
    } else {
      console.log(slugs.join("\n"));
    }
    return;
  }

  if (!args.spec) {
    console.error("error: --spec <slug> is required (or use --list)");
    printUsage();
    process.exit(2);
  }

  const outDir = args.out ?? "out";
  const { existingBundle, replacedExisting } = loadExistingBundle(
    args.spec,
    outDir,
    args.noMerge
  );

  const reader = readerFor(args);
  let result: ExtractResult;
  try {
    result = extractSpecBundle(reader, args.spec, {
      completeOnly: args.completeOnly,
      noMerge: args.noMerge,
      existingBundle,
    });
  } catch (e) {
    console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  const { bundle, summary } = result;

  // Never write a header-only file: zero bound conversations means there is
  // nothing worth persisting, regardless of --complete-only.
  let outPath: string | null = null;
  if (bundle && summary.conversations > 0) {
    outPath = new JsonlSink(outDir).write(bundle);
  }

  const report = formatRunReport(summary, outPath);
  if (replacedExisting && outPath !== null) {
    report.stderr.unshift(`replacing existing bundle (--no-merge): ${outPath}`);
  }
  for (const line of report.stdout) console.log(line);
  for (const line of report.stderr) console.error(line);
  process.exit(report.exitCode);
}

main();
