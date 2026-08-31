/**
 * Parse a `relationships:` frontmatter block into typed tuples.
 *
 * PROPOSAL-003 §1: type-as-key YAML. Each list entry is a single-key
 * map where the first key is the relationship type and the value is
 * the target `id`. Additional sibling keys are metadata; reserved
 * metadata keys are `context`, `anchor_text`, and `role`. Unknown
 * metadata keys are tolerated and dropped (forward-compat).
 *
 * This module is mechanical parsing only — no registry lookup, no
 * target resolution. The extractor runs before PROPOSAL-003's two-pass
 * indexer's pass 2 and its output feeds the edge reconciler.
 *
 * FRICTION-028: the forward-compat tolerance above is what made the
 * *other* plausible shape — `- type: X` / `target: Y` — parse as a
 * well-formed edge to a record named `X` of type `type`, dropping the
 * real edge and warning about nothing. So `type` and `target` are
 * reserved: an entry carrying either is the wrong shape by
 * construction, and is refused rather than reinterpreted. Refused, not
 * repaired — the markdown is the source of truth (DD-070), and a cache
 * that quietly fixes what the file says would diverge from it while
 * the file stays wrong. Guessing the author's intent is DP-001 tier 3
 * regardless; naming the mistake is tier 1.
 */

export interface RelationshipTuple {
  type: string;
  target_id: string;
  context: string | null;
  anchor_text: string | null;
  role: string | null;
}

export interface ExtractionWarning {
  kind:
    | "relationships_not_a_list"
    | "entry_not_a_map"
    | "entry_empty"
    | "entry_uses_type_target_shape"
    | "target_not_a_string";
  index: number;
  message: string;
}

export interface ExtractionResult {
  tuples: RelationshipTuple[];
  warnings: ExtractionWarning[];
}

const METADATA_KEYS = new Set(["context", "anchor_text", "role"]);

/**
 * Keys that can never legitimately appear in an entry (FRICTION-028).
 * `target` is in no schema, and a relation type literally named `type`
 * does not exist — either one means the author wrote the type/target
 * shape. Zero false positives, which is why this can refuse the entry
 * outright instead of merely warning about it.
 */
const FORBIDDEN_KEYS = new Set(["type", "target"]);

export function extractRelationships(frontmatter: Record<string, unknown>): ExtractionResult {
  const tuples: RelationshipTuple[] = [];
  const warnings: ExtractionWarning[] = [];

  const raw = frontmatter.relationships;
  if (raw == null) return { tuples, warnings };

  if (!Array.isArray(raw)) {
    warnings.push({
      kind: "relationships_not_a_list",
      index: -1,
      message: "`relationships:` must be a list of type-keyed maps",
    });
    return { tuples, warnings };
  }

  raw.forEach((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      warnings.push({
        kind: "entry_not_a_map",
        index,
        message: `relationships[${index}] is not a map`,
      });
      return;
    }

    const keys = Object.keys(entry as Record<string, unknown>);
    if (keys.length === 0) {
      warnings.push({
        kind: "entry_empty",
        index,
        message: `relationships[${index}] is empty`,
      });
      return;
    }

    const forbidden = keys.filter((k) => FORBIDDEN_KEYS.has(k));
    if (forbidden.length > 0) {
      warnings.push({
        kind: "entry_uses_type_target_shape",
        index,
        message:
          `relationships[${index}] uses the type/target shape ` +
          `(${forbidden.map((k) => `\`${k}:\``).join(" + ")}) — the relation type IS the key. ` +
          `Write "- <relation_type>: <TARGET-ID>", e.g. "- references: DD-070". Entry skipped.`,
      });
      return;
    }

    // First non-metadata key is the relationship type. If every key is a
    // metadata key, treat the first as the type anyway (per §1 "first key").
    const obj = entry as Record<string, unknown>;
    const typeKey = keys.find((k) => !METADATA_KEYS.has(k)) ?? keys[0];
    const targetValue = obj[typeKey];

    if (typeof targetValue !== "string" || targetValue.trim() === "") {
      warnings.push({
        kind: "target_not_a_string",
        index,
        message: `relationships[${index}].${typeKey} must be a non-empty string target id`,
      });
      return;
    }

    tuples.push({
      type: typeKey,
      target_id: targetValue.trim(),
      context: stringField(obj.context),
      anchor_text: stringField(obj.anchor_text),
      role: stringField(obj.role),
    });
  });

  return { tuples, warnings };
}

function stringField(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}
