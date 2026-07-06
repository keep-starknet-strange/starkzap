import { writable } from "svelte/store";
import type { Logger } from "starkzap";

// Keeps the logging mechanism from the old main.ts, minus the UI. Entries are
// collected in a store (for a future log panel) and mirrored to the console.

export type LogLevel = "debug" | "info" | "warn" | "error" | "success";
export interface LogEntry {
  time: string;
  source: "app" | "starkzap";
  level: LogLevel;
  message: string;
}

export const logs = writable<LogEntry[]>([]);

function push(source: LogEntry["source"], level: LogLevel, message: string) {
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  logs.update((prev) => [...prev, { time, source, level, message }]);
  const line = `[${source}][${level}] ${message}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

// App-level logging (replaces the old `log(message, level)`).
export function log(message: string, level: LogLevel = "info"): void {
  push("app", level, message);
}

// SDK logger passed to `new StarkZap({ logging: { logger: sdkLogger } })`.
export const sdkLogger: Logger = {
  debug: (msg, ...args) => push("starkzap", "debug", fmt(msg, args)),
  info: (msg, ...args) => push("starkzap", "info", fmt(msg, args)),
  warn: (msg, ...args) => push("starkzap", "warn", fmt(msg, args)),
  error: (msg, ...args) => push("starkzap", "error", fmt(msg, args)),
};

function fmt(message: string, args: unknown[]): string {
  return args.length ? `${message} ${args.map(String).join(" ")}` : message;
}
