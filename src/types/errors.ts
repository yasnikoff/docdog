export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "EMBED_ERROR"
  | "CONFIG_ERROR"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }

  static notFound(message: string): AppError {
    return new AppError("NOT_FOUND", message);
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError("VALIDATION_ERROR", message, details);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError("CONFLICT", message, details);
  }

  static configError(message: string): AppError {
    return new AppError("CONFIG_ERROR", message);
  }

  static embedError(message: string, details?: unknown): AppError {
    return new AppError("EMBED_ERROR", message, details);
  }
}
