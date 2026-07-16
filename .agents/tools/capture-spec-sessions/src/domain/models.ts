/**
 * Domain models for the Warp Spec-Bundle Adapter.
 *
 * The adapter reads Warp's local SQLite DB and exports, raw and time-ordered,
 * every conversation belonging to one spec across the three spec-driven phases.
 * These types are pure (no I/O, no dependencies) so they can be reused by every
 * port and adapter.
 */

/** The three spec-driven phases, in lifecycle order. */
export const PHASES = ["specify", "implement", "review"] as const;
export type Phase = (typeof PHASES)[number];

/**
 * Normalize a phase label. Historical markers emitted `implementation-gate`
 * before the phase was renamed to `review`; legacy labels are mapped to the
 * canonical form so old sessions keep parsing without manual migration.
 */
export function normalizePhase(phase: string): Phase {
  return phase === "implementation-gate" ? "review" : (phase as Phase);
}

/** Who emitted an event in the conversation. */
export type Role = "user" | "assistant" | "tool";

/**
 * Kind of conversation event.
 * - query        : a user prompt (from ai_queries.input)
 * - agent_message: assistant text (recovered from agent_tasks protobuf walk)
 * - command      : a shell command execution (from blocks)
 * - tool_call    : a tool invocation (from agent_tasks walk)
 * - tool_result  : a tool/command output (from agent_tasks walk or blocks output)
 */
export type EventKind =
  | "query"
  | "agent_message"
  | "command"
  | "tool_call"
  | "tool_result";

/** A single time-ordered conversation event, serialized as one JSONL line. */
export interface ConversationEvent {
  spec_id: string;
  phase: Phase;
  conversation_id: string;
  /** Monotonic sequence number within the whole bundle (time-ordered). */
  seq: number;
  /** ISO-8601 timestamp (from the source row's start_ts). */
  ts: string;
  role: Role;
  kind: EventKind;
  content: string;
  meta: Record<string, unknown>;
}

/** A reader-produced event before the use-case attaches spec_id, phase, and seq. */
export type EventDraft = Omit<ConversationEvent, "spec_id" | "phase" | "seq">;

/** Uniform return shape for every reader. */
export interface ReaderResult {
  drafts: EventDraft[];
  skipped: SkippedRow[];
}

/** First line of every bundle file. */
export type BundleSource = "warp" | "claude-code" | "hermes";

export interface BundleHeader {
  type: "bundle_header";
  spec_id: string;
  phases_present: Phase[];
  phases_missing: Phase[];
  conversations_per_phase: Record<Phase, number>;
  complete: boolean;
  conversation_ids: string[];
  extracted_at: string;
  source: BundleSource;
}

export interface SpecBundle {
  header: BundleHeader;
  events: ConversationEvent[];
}

/** Result of binding one marker emission to a conversation. */
export type SeedStatus = "bound" | "unbindable" | "collision";

export interface SeedMatch {
  /** The conversation id, or null when the marker could not be bound. */
  conversation_id: string | null;
  phase: Phase;
  marker_command: string;
  start_ts: string;
  status: SeedStatus;
}

export interface SkippedRow {
  table: string;
  reason: string;
  detail: string;
}

/** Human-readable run summary (also returned to the CLI). */
export interface RunSummary {
  spec_id: string;
  complete: boolean;
  conversations: number;
  events: number;
  phases_present: Phase[];
  phases_missing: Phase[];
  unbindable: SeedMatch[];
  collisions: SeedMatch[];
  skipped_rows: SkippedRow[];
  /** Set when the fresh external-source read failed and the result fell back to a stored bundle. */
  fresh_read_error: string | null;
  output_path: string | null;
}

// --- Raw DB row shapes (what the readers pull from the snapshot) -------------

export interface TaskRow {
  conversation_id: string;
  task_id: string;
  /** Protobuf BLOB. */
  task: Buffer;
  last_modified_at: string;
}
