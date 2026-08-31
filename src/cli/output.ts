export type OutputFormat = "summary" | "full" | "json";

export function formatOutput(result: unknown, format: OutputFormat): string {
  if (format === "json") {
    return JSON.stringify(result, null, 2);
  }
  return JSON.stringify(result, null, 2);
}

export function printError(code: string, message: string, hint?: string): void {
  console.error(`Error [${code}]: ${message}`);
  if (hint) console.error(`  ${hint}`);
}
