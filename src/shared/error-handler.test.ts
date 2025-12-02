import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { StructuredLogger, ErrorSeverity } from "./error-handler";

describe("error-handler serialization", () => {
  let mockConsoleError: ReturnType<typeof mock>;

  beforeEach(() => {
    // Mock console.error
    mockConsoleError = mock(() => {});
    global.console = { ...console, error: mockConsoleError };
  });

  afterEach(() => {
    // Restore console.error
    global.console = console;
  });

  it("handles circular references safely", () => {
    const circular: any = { prop: "value" };
    circular.self = circular;

    expect(() => {
      StructuredLogger.error("system" as any, "Test circular reference", { circular });
    }).not.toThrow();

    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining("JSON.stringify failed, falling back to safe serializer"),
      expect.any(String),
    );
  });

  it("handles BigInt values safely", () => {
    expect(() => {
      StructuredLogger.error("system" as any, "Test BigInt", {
        bigNumber: BigInt(12345678901234567890n),
      });
    }).not.toThrow();
  });

  it("handles functions safely", () => {
    expect(() => {
      StructuredLogger.error("system" as any, "Test function", {
        fn: () => "test",
        arrow: () => {},
      });
    }).not.toThrow();
  });

  it("handles symbols safely", () => {
    expect(() => {
      StructuredLogger.error("system" as any, "Test symbol", { sym: Symbol("test") });
    }).not.toThrow();
  });

  it("falls back to string representation when all serialization fails", () => {
    // Create an object that will cause even the safe serializer to fail
    const problematic: any = {};
    Object.defineProperty(problematic, "problem", {
      get() {
        throw new Error("Property access failed");
      },
      enumerable: true,
    });

    expect(() => {
      StructuredLogger.error("system" as any, "Test problematic object", { problematic });
    }).not.toThrow();

    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining("Safe serializer failed, using string fallback"),
      expect.any(String),
    );
  });
});

describe("StructuredLogger severity levels", () => {
  let mockConsoleDebug: ReturnType<typeof mock>;
  let mockConsoleLog: ReturnType<typeof mock>;

  beforeEach(() => {
    // Mock console methods
    mockConsoleDebug = mock(() => {});
    mockConsoleLog = mock(() => {});
    global.console = {
      ...console,
      debug: mockConsoleDebug,
      log: mockConsoleLog,
    };
  });

  afterEach(() => {
    // Restore console
    global.console = console;
  });

  it("debug uses DEBUG severity and console.debug", () => {
    StructuredLogger.debug("system" as any, "Debug message", { key: "value" });

    expect(mockConsoleDebug).toHaveBeenCalledWith(expect.stringContaining('"level":"debug"'));
    expect(mockConsoleLog).not.toHaveBeenCalled();
  });

  it("info uses LOW severity and console.log", () => {
    StructuredLogger.info("system" as any, "Info message", { key: "value" });

    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"level":"low"'));
    expect(mockConsoleDebug).not.toHaveBeenCalled();
  });

  it("DEBUG severity is distinct from LOW severity", () => {
    expect(ErrorSeverity.DEBUG).not.toBe(ErrorSeverity.LOW);
    expect(ErrorSeverity.DEBUG).toBe("debug" as ErrorSeverity);
    expect(ErrorSeverity.LOW).toBe("low" as ErrorSeverity);
  });
});
