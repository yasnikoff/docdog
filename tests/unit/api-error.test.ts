import { describe, it, expect } from "vitest";
import { AppError } from "../../src/types/errors.js";

describe("AppError", () => {
  it("creates a not found error", () => {
    const err = AppError.notFound("Section xyz not found");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("Section xyz not found");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AppError");
  });

  it("creates a validation error with details", () => {
    const err = AppError.validation("Title is required", { field: "title" });
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details).toEqual({ field: "title" });
  });

  it("creates a conflict error", () => {
    const err = AppError.conflict("Document already exists", { _key: "abc" });
    expect(err.code).toBe("CONFLICT");
    expect(err.details).toEqual({ _key: "abc" });
  });

  it("creates a config error", () => {
    const err = AppError.configError("Missing embed.model");
    expect(err.code).toBe("CONFIG_ERROR");
    expect(err.message).toBe("Missing embed.model");
  });

  it("creates an embed error", () => {
    const err = AppError.embedError("ONNX runtime failed");
    expect(err.code).toBe("EMBED_ERROR");
    expect(err.message).toBe("ONNX runtime failed");
  });
});
