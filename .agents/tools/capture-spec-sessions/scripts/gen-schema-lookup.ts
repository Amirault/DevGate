/**
 * Dev-time generator for the protobuf schema lookup (checked in).
 *
 * Reads the pinned `warp-proto-apis` protos from `schemas/multi_agent/v1/`,
 * applies the SAME preprocessing the upstream Rust build does (build.rs):
 *   - `edition = "2023";` -> `syntax = "proto3";`
 *   - drop `option features.*` lines
 *   - drop the `google/protobuf/go_features.proto` import
 *   - drop `reserved` declarations (proto3 wants bare names quoted; reserved
 *     fields carry no signal for the overlay, so strip rather than quote)
 * then reflects the parsed schema with protobufjs and emits
 * `src/adapters/protoSchema.ts` — a plain TS constant the runtime overlay
 * reads. No protobuf dependency at runtime.
 *
 * String ops only (no regex — team rule). Run with:
 *   npx tsx scripts/gen-schema-lookup.ts
 */
import protobuf from "protobufjs";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
/** Path to protobufjs's bundled google well-known protos. */
const BUNDLED_GOOGLE_DIR = path.join(
  path.dirname(require.resolve("protobufjs/package.json")),
  "google",
  "protobuf"
);

const SCHEMA_DIR = process.env.PROTO_SCHEMA_DIR
  ?? path.resolve(import.meta.dirname, "..", "schemas", "multi_agent", "v1");
const OUT_PATH = process.env.PROTO_OUT
  ?? path.resolve(import.meta.dirname, "..", "src", "adapters", "protoSchema.ts");
const SCHEMA_REV = "ac1af7303d2931b0fb485be650a1fbc8b80d5667";

type FieldInfo = {
  name: string;
  kind: "message" | "leaf";
  child?: string;
  oneof?: string;
};
type Schema = Record<string, Record<number, FieldInfo>>;

/** Mirror build.rs preprocessing with plain string ops (no regex). */
function preprocess(content: string): string {
  const keepLines = content.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("option features")) return false;
    if (trimmed === 'import "google/protobuf/go_features.proto";') return false;
    if (trimmed.startsWith("reserved ") || trimmed === "reserved") return false;
    return true;
  });
  return keepLines.join("\n").replace('edition = "2023";', 'syntax = "proto3";');
}

function collectTypes(namespace: protobuf.NamespaceBase, schema: Schema): void {
  for (const nested of namespace.nestedArray) {
    if (nested instanceof protobuf.Type) {
      const fields: Record<number, FieldInfo> = {};
      for (const field of nested.fieldsArray) {
        const isMessage = field.resolvedType instanceof protobuf.Type;
        fields[field.id] = {
          name: field.name,
          kind: isMessage ? "message" : "leaf",
          child: isMessage
            ? (field.resolvedType as protobuf.Type).fullName.replace(/^\./, "")
            : undefined,
          oneof: field.partOf ? field.partOf.name : undefined,
        };
      }
      schema[nested.fullName.replace(/^\./, "")] = fields;
      collectTypes(nested, schema);
    } else if (nested instanceof protobuf.Namespace) {
      collectTypes(nested, schema);
    }
    // Enums intentionally not captured: oneof variants are field-number based
    // and the walker emits no varint leaves, so enum values carry no signal.
  }
}

function main(): void {
  if (!fs.existsSync(SCHEMA_DIR)) {
    throw new Error(`schema dir not found: ${SCHEMA_DIR}`);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proto-schema-"));
  try {
    for (const entry of fs.readdirSync(SCHEMA_DIR)) {
      if (!entry.endsWith(".proto")) continue;
      const src = fs.readFileSync(path.join(SCHEMA_DIR, entry), "utf8");
      fs.writeFileSync(path.join(tmp, entry), preprocess(src));
    }

    // Copy protobufjs's bundled google well-known protos (descriptor, timestamp,
    // duration, struct, empty, ...) so cross-file imports resolve without protoc.
    const tmpGoogle = path.join(tmp, "google", "protobuf");
    fs.mkdirSync(tmpGoogle, { recursive: true });
    for (const entry of fs.readdirSync(BUNDLED_GOOGLE_DIR)) {
      if (!entry.endsWith(".proto")) continue;
      fs.copyFileSync(path.join(BUNDLED_GOOGLE_DIR, entry), path.join(tmpGoogle, entry));
    }

    const root = new protobuf.Root();
    root.loadSync(path.join(tmp, "task.proto"), { keepCase: true });
    root.resolveAll();

    const schema: Schema = {};
    collectTypes(root, schema);

    const taskKey = "warp.multi_agent.v1.Task";
    if (!schema[taskKey]) {
      throw new Error(`root type ${taskKey} not found in parsed schema`);
    }

    const sorted: Schema = {};
    for (const key of Object.keys(schema).sort()) {
      const fields = schema[key];
      const sortedFields: Record<number, FieldInfo> = {};
      for (const num of Object.keys(fields).map(Number).sort((a, b) => a - b)) {
        sortedFields[num] = fields[num];
      }
      sorted[key] = sortedFields;
    }

    const relSchemaDir = path.relative(import.meta.dirname, SCHEMA_DIR).replace(/\\/g, "/");
    const header = [
      "// @generated by scripts/gen-schema-lookup.ts — DO NOT EDIT.",
      `// Source: warpdotdev/warp-proto-apis @ ${SCHEMA_REV}`,
      `// Regenerate: PROTO_SCHEMA_DIR=${relSchemaDir} npx tsx scripts/gen-schema-lookup.ts`,
      "// Captures message field numbers -> names (oneof variants are field-number based).",
      "// Enums omitted (no varint leaves emitted by the walker).",
      "",
    ].join("\n");

    const body = [
      `export const SCHEMA_REV = ${JSON.stringify(SCHEMA_REV)};`,
      "",
      "export interface FieldInfo {",
      "  name: string;",
      '  kind: "message" | "leaf";',
      "  child?: string;",
      "  oneof?: string;",
      "}",
      "",
      "export type Schema = Record<string, Record<number, FieldInfo>>;",
      "",
      `export const ROOT_TYPE = ${JSON.stringify(taskKey)};`,
      "",
      "export const PROTO_SCHEMA: Schema = " + JSON.stringify(sorted, null, 2) + ";",
      "",
    ].join("\n");

    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, header + body);
    console.log(`wrote ${OUT_PATH} (${Object.keys(sorted).length} types)`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
