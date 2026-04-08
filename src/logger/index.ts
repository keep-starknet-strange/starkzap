/**
 * Logger-agnostic logging system for StarkZap.
 *
 * Public API: {@link Logger} interface (console-compatible),
 * {@link LogLevel}, and {@link LoggerConfig}.
 * Internal: {@link StarkZapLogger} wraps the user-provided logger with
 * level gating and lazy message evaluation.
 *
 * @example
 * ```ts
 * // Quick debugging with console
 * const sdk = new StarkZap({ network: "mainnet", logging: { logger: console } });
 *
 * // Production with pino (zero adapter — pino is a superset of Logger)
 * import pino from "pino";
 * const sdk = new StarkZap({ network: "mainnet", logging: { logger: pino(), logLevel: "debug" } });
 * ```
 *
 * @module
 */

/**
 * Minimal logger interface accepted by the SDK.
 *
 * Compatible with `console`, pino, winston, bunyan, react-native-logs,
 * and any object that exposes these four methods.
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Log severity levels used by the SDK.
 *
 * Ordered from most verbose (`"trace"`) to least (`"fatal"`).
 * `"silent"` disables all output.
 */
export type LogLevel =
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal"
  | "silent";

/**
 * Bundled logging configuration for the SDK.
 *
 * When provided, the SDK wraps the given {@link Logger} in an internal
 * level-gated logger. When omitted, the SDK is silent.
 *
 * @example
 * ```ts
 * // All levels forwarded
 * { logger: console }
 *
 * // Only warn and above
 * { logger: console, logLevel: "warn" }
 * ```
 */
export interface LoggerConfig {
  /** Logger implementation to receive SDK diagnostic output. */
  logger: Logger;
  /**
   * Minimum severity level the SDK will emit.
   * Defaults to `"trace"` (all levels) when omitted.
   */
  logLevel?: LogLevel;
}

/** A message that is either a plain string or a thunk evaluated only when the level is active. */
export type LogMessage = string | (() => string);

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
  silent: 6,
};

const LEVEL_TO_LOGGER_METHOD: Record<
  Exclude<LogLevel, "silent">,
  keyof Logger
> = {
  fatal: "error",
  error: "error",
  warn: "warn",
  info: "info",
  debug: "debug",
  trace: "debug",
};

const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

/**
 * Internal SDK logger that wraps a user-provided {@link Logger}.
 *
 * - Six severity methods matching the Log4j / pino convention.
 * - Accepts `string | (() => string)` — thunks are only evaluated when the
 *   level is active, so expensive serialization is never paid when logging
 *   is disabled.
 * - Level gating controlled by the resolved {@link LogLevel}.
 *
 * This class is exported from `@/logger` for use inside the SDK; it is not
 * re-exported from the package entry (`starkzap`) public API surface.
 */
export class StarkZapLogger {
  readonly level: LogLevel;
  private readonly target: Logger;
  private readonly minPriority: number;

  constructor(target: Logger, level: LogLevel) {
    this.target = target;
    this.level = level;
    this.minPriority = LEVEL_PRIORITY[level];
  }

  fatal(message: LogMessage, ...args: unknown[]): void {
    this.emit("fatal", message, args);
  }

  error(message: LogMessage, ...args: unknown[]): void {
    this.emit("error", message, args);
  }

  warn(message: LogMessage, ...args: unknown[]): void {
    this.emit("warn", message, args);
  }

  info(message: LogMessage, ...args: unknown[]): void {
    this.emit("info", message, args);
  }

  debug(message: LogMessage, ...args: unknown[]): void {
    this.emit("debug", message, args);
  }

  trace(message: LogMessage, ...args: unknown[]): void {
    this.emit("trace", message, args);
  }

  /**
   * Returns `true` if the given severity would emit for this instance's
   * configured minimum.
   *
   * Uses `LEVEL_PRIORITY[level] >= this.minPriority`, where `this.minPriority`
   * comes from the logger's configured {@link LogLevel} at construction.
   *
   * The `silent` level is special: it is only a threshold meaning "emit
   * nothing", not a severity you can query as enabled — `isLevelEnabled("silent")`
   * is always `false` even when the instance itself is configured at `silent`.
   */
  isLevelEnabled(level: LogLevel): boolean {
    // `silent` is a config threshold ("emit nothing"), not a real severity —
    // never treat it as an enabled log level.
    if (level === "silent") return false;
    return LEVEL_PRIORITY[level] >= this.minPriority;
  }

  private emit(
    level: Exclude<LogLevel, "silent">,
    message: LogMessage,
    args: unknown[]
  ): void {
    if (!this.isLevelEnabled(level)) return;
    const resolved = typeof message === "function" ? message() : message;
    const target = this.target[LEVEL_TO_LOGGER_METHOD[level]];
    target.call(this.target, resolved, ...args);
  }
}

/** Singleton silent logger used when no logger is configured. */
export const NOOP_LOGGER = new StarkZapLogger(noopLogger, "silent");

/**
 * Create a {@link StarkZapLogger} from a {@link LoggerConfig}.
 *
 * Resolution rules:
 * - No config provided -> silent no-op.
 * - Config provided without logLevel -> all levels forwarded (`"trace"`).
 * - Config provided with logLevel -> SDK-side filtering at that level.
 */
export function createLogger(config?: LoggerConfig): StarkZapLogger {
  if (!config) return NOOP_LOGGER;
  return new StarkZapLogger(config.logger, config.logLevel ?? "trace");
}
