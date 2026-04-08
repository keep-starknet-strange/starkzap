import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createLogger,
  NOOP_LOGGER,
  StarkZapLogger,
  type Logger,
} from "@/logger";

/** Console-shaped log method; used so `vi.fn` is typed as a plain function (no construct signature). */
type LogCall = (message: string, ...args: unknown[]) => void;

function mockLogger() {
  return {
    debug: vi.fn<LogCall>(),
    info: vi.fn<LogCall>(),
    warn: vi.fn<LogCall>(),
    error: vi.fn<LogCall>(),
  } satisfies Logger;
}

describe("createLogger", () => {
  it("returns NOOP_LOGGER when config is undefined", () => {
    expect(createLogger(undefined)).toBe(NOOP_LOGGER);
  });

  it("uses trace as default logLevel when omitted", () => {
    const target = mockLogger();
    const log = createLogger({ logger: target });
    expect(log.level).toBe("trace");
  });

  it("respects explicit logLevel", () => {
    const target = mockLogger();
    const log = createLogger({ logger: target, logLevel: "error" });
    expect(log.level).toBe("error");
  });
});

describe("StarkZapLogger", () => {
  let target: ReturnType<typeof mockLogger>;

  beforeEach(() => {
    target = mockLogger();
  });

  describe("level gating", () => {
    it("at warn forwards only warn, error, and fatal", () => {
      const log = new StarkZapLogger(target, "warn");
      log.trace("t");
      log.debug("d");
      log.info("i");
      log.warn("w");
      log.error("e");
      log.fatal("f");
      expect(target.debug).not.toHaveBeenCalled();
      expect(target.info).not.toHaveBeenCalled();
      expect(target.warn).toHaveBeenCalledTimes(1);
      expect(target.warn).toHaveBeenCalledWith("w");
      expect(target.error).toHaveBeenCalledTimes(2);
      expect(target.error).toHaveBeenNthCalledWith(1, "e");
      expect(target.error).toHaveBeenNthCalledWith(2, "f");
    });

    it("silent threshold never calls the target", () => {
      const log = new StarkZapLogger(target, "silent");
      log.error("x");
      log.fatal("y");
      expect(target.error).not.toHaveBeenCalled();
      expect(target.warn).not.toHaveBeenCalled();
    });
  });

  describe("routing to Logger (four methods)", () => {
    it("maps trace to target.debug", () => {
      const log = new StarkZapLogger(target, "trace");
      log.trace("ping");
      expect(target.debug).toHaveBeenCalledWith("ping");
    });

    it("maps fatal to target.error", () => {
      const log = new StarkZapLogger(target, "trace");
      log.fatal("panic");
      expect(target.error).toHaveBeenCalledWith("panic");
    });
  });

  describe("lazy LogMessage thunks", () => {
    it("does not evaluate thunk when level is disabled", () => {
      const log = new StarkZapLogger(target, "silent");
      const thunk = vi.fn(() => "should-not-run");
      log.info(thunk);
      expect(thunk).not.toHaveBeenCalled();
    });

    it("evaluates thunk once when level is enabled and passes resolved string", () => {
      const log = new StarkZapLogger(target, "info");
      const thunk = vi.fn(() => "resolved");
      log.info(thunk);
      expect(thunk).toHaveBeenCalledOnce();
      expect(target.info).toHaveBeenCalledWith("resolved");
    });
  });

  describe("extra args", () => {
    it("forwards additional arguments to the target method", () => {
      const log = new StarkZapLogger(target, "error");
      const err = new Error("boom");
      log.error("failed", err, { code: 1 });
      expect(target.error).toHaveBeenCalledWith("failed", err, { code: 1 });
    });
  });

  describe("isLevelEnabled", () => {
    it("returns false for level silent regardless of configured threshold", () => {
      const verbose = new StarkZapLogger(target, "trace");
      expect(verbose.isLevelEnabled("silent")).toBe(false);
      const quiet = new StarkZapLogger(target, "warn");
      expect(quiet.isLevelEnabled("silent")).toBe(false);
    });

    it("returns false for all severities when logger is configured silent", () => {
      const log = new StarkZapLogger(target, "silent");
      for (const level of [
        "trace",
        "debug",
        "info",
        "warn",
        "error",
        "fatal",
      ] as const) {
        expect(log.isLevelEnabled(level)).toBe(false);
      }
      expect(log.isLevelEnabled("silent")).toBe(false);
    });

    it("matches gating used by emit for an info threshold", () => {
      const log = new StarkZapLogger(target, "info");
      expect(log.isLevelEnabled("trace")).toBe(false);
      expect(log.isLevelEnabled("debug")).toBe(false);
      expect(log.isLevelEnabled("info")).toBe(true);
      expect(log.isLevelEnabled("warn")).toBe(true);
      expect(log.isLevelEnabled("error")).toBe(true);
      expect(log.isLevelEnabled("fatal")).toBe(true);
    });
  });
});

describe("NOOP_LOGGER", () => {
  it("does not throw when any severity is invoked", () => {
    expect(() => {
      NOOP_LOGGER.trace("a");
      NOOP_LOGGER.debug("b");
      NOOP_LOGGER.info("c");
      NOOP_LOGGER.warn("d");
      NOOP_LOGGER.error("e");
      NOOP_LOGGER.fatal("f");
    }).not.toThrow();
  });

  it("is configured at silent level", () => {
    expect(NOOP_LOGGER.level).toBe("silent");
  });
});
