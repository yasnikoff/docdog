/**
 * Embedding generation.
 * Primary: @huggingface/transformers (in-process ONNX) — DD-051.
 * Fallback: Ollama HTTP API.
 *
 * Returns 768-dimensional float array (nomic-embed-text).
 */
import { homedir } from "node:os";
import { join } from "node:path";
import type { DocdogConfig } from "../types/config.js";
import { AppError } from "../types/errors.js";

/**
 * Where transformers.js looks for a locally-provided model before reaching
 * for the network — docdog's offline drop-in path (FRICTION-018). Relative
 * to the process cwd, i.e. the project root in normal CLI use.
 */
export const LOCAL_MODEL_PATH = ".docdog/models/";

/**
 * Where transformers.js caches models it *downloads* — a different question
 * from `LOCAL_MODEL_PATH`, which is where a human drops files for an offline
 * machine. Its own default is a `.cache` folder *inside the installed package*
 * (`node_modules/@huggingface/transformers/.cache/`), so an `npm ci` deletes
 * the 547 MB model and the next index re-downloads it (FRICTION-018 item 2).
 *
 * The model is byte-identical across every project and every clone on a
 * machine, so the durable home is the user's home dir, not any one repo:
 * downloaded once per machine, reused everywhere — the same reasoning that
 * put the embed *store* in the git common dir rather than a worktree
 * (PROPOSAL-029), one scope wider because the model does not even vary by
 * clone.
 *
 * An existing transformers.js / HF cache override wins, so a user who has
 * already pointed their whole toolchain at one cache is not second-guessed —
 * docdog only supplies a durable default where there was a self-erasing one.
 * Tier 2 (DP-001): a visible default location, overridable.
 */
export const MODEL_CACHE_DIR =
  process.env.TRANSFORMERS_CACHE ??
  process.env.HF_HOME ??
  join(homedir(), ".docdog", "models");

/**
 * Cache pipeline instances across calls within the same process, keyed by
 * `model::dtype`. Keyed rather than a lone slot because dtype makes "one model
 * per process" false: a measurement (OBS-022) embeds the same corpus at fp32
 * then q8 in one run, and a single slot would hand the second dtype the first
 * one's pipeline.
 */
const pipelineCache = new Map<string, (text: string) => Promise<number[]>>();

export async function generateEmbedding(config: DocdogConfig, text: string): Promise<number[]> {
  const { provider, model, ollama_url } = config.embed;

  if (provider === "ollama") {
    return embedViaOllama(text, model, ollama_url);
  }

  return embedViaOnnx(text, model, config.embed.dtype);
}

/** Batch embeddings — more efficient than calling generateEmbedding in a loop. */
export async function generateEmbeddings(
  config: DocdogConfig,
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const { provider, model, ollama_url } = config.embed;

  if (provider === "ollama") {
    // Ollama doesn't batch — call sequentially
    return Promise.all(texts.map((t) => embedViaOllama(t, model, ollama_url)));
  }

  return embedBatchViaOnnx(texts, model, config.embed.dtype);
}

async function embedViaOnnx(text: string, model: string, dtype?: string | null): Promise<number[]> {
  const pipeline = await getOnnxPipeline(model, dtype);
  return pipeline(text);
}

async function embedBatchViaOnnx(
  texts: string[],
  model: string,
  dtype?: string | null,
): Promise<number[][]> {
  const pipeline = await getOnnxPipeline(model, dtype);
  return Promise.all(texts.map((t) => pipeline(t)));
}

async function getOnnxPipeline(
  model: string,
  dtype?: string | null,
): Promise<(text: string) => Promise<number[]>> {
  const cacheKey = `${model}::${dtype ?? "default"}`;
  const cached = pipelineCache.get(cacheKey);
  if (cached) return cached;

  try {
    const { pipeline, env } = await import("@huggingface/transformers");
    // Checked before the network: an adopter on a restricted network can
    // drop model files here and index offline (FRICTION-018). Remote models
    // stay allowed, so the normal case still just downloads.
    env.localModelPath = LOCAL_MODEL_PATH;
    env.allowRemoteModels = true;
    // ...and a download lands in a durable, machine-wide cache instead of the
    // package's own `.cache`, which `npm ci` wipes (FRICTION-018 item 2).
    env.cacheDir = MODEL_CACHE_DIR;

    // `dtype` undefined → transformers.js picks its default (fp32). A named
    // dtype loads a quantized variant instead (FRICTION-018 item 3). The cast
    // delegates validation to the library: `config.embed.dtype` is free-text
    // YAML, and an unknown value should fail at load with transformers.js's own
    // message rather than be re-checked here (DP-001 — don't duplicate the
    // library's own guard).
    const pipe = await pipeline("feature-extraction", model, {
      revision: "main",
      ...(dtype ? { dtype: dtype as import("@huggingface/transformers").DataType } : {}),
    });

    const wrapped = async (text: string): Promise<number[]> => {
      const output = await pipe(text, { pooling: "mean", normalize: true });
      // output is a Tensor — extract float array
      const data = output.data as Float32Array | number[];
      return Array.from(data);
    };

    pipelineCache.set(cacheKey, wrapped);
    return wrapped;
  } catch (err) {
    // FRICTION-018: the old message offered only ollama, which also needs a
    // network download — circular advice in the one situation that produces
    // this error. The local path below is the offline answer and it already
    // works; it was just never mentioned anywhere.
    throw AppError.embedError(
      `Failed to load ONNX embedding model "${model}". ` +
        `If the machine is offline or cannot reach huggingface.co, drop the model's ` +
        `files (model.onnx, config.json, tokenizer.json, tokenizer_config.json) into ` +
        `${LOCAL_MODEL_PATH}${model}/ and re-run — docdog loads from there first. ` +
        `Otherwise, set embed.provider to "ollama" in .docdog/config.yaml if a local ` +
        `ollama server is available.`,
      err,
    );
  }
}

async function embedViaOllama(text: string, model: string, ollamaUrl: string): Promise<number[]> {
  // nomic-embed-text requires the "search_document: " prefix for asymmetric retrieval
  const prompt = text.startsWith("search_") ? text : `search_document: ${text}`;

  let resp: Response;
  try {
    resp = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt }),
    });
  } catch (err) {
    throw AppError.embedError(
      `Cannot reach Ollama at ${ollamaUrl}. Is Ollama running?`,
      err,
    );
  }

  if (!resp.ok) {
    const body = await resp.text();
    throw AppError.embedError(`Ollama embedding failed (${resp.status}): ${body}`);
  }

  const data = (await resp.json()) as { embedding: number[] };
  return data.embedding;
}
