/**
 * Parser registry — dispatch by parser type.
 */
import type { Parser } from "./types.js";
import type { ParserType } from "../../types/config.js";
import { defaultParser } from "./default.js";
import { splitParser } from "./split.js";
import { tableParser } from "./table.js";
import { scriptParser } from "./script.js";

const REGISTRY: Record<ParserType, Parser> = {
  default: defaultParser,
  split: splitParser,
  table: tableParser,
  script: scriptParser,
};

export function getParser(type: ParserType | undefined): Parser {
  return REGISTRY[type ?? "default"];
}

export type { Parser, ParsedSection, ParseInput } from "./types.js";
