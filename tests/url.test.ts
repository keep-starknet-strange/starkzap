import { describe, it, expect } from "vitest";
import { assertSafeHttpUrl } from "@/utils";

describe("assertSafeHttpUrl", () => {
  it("accepts a valid https URL", () => {
    const result = assertSafeHttpUrl("https://example.com", "test");
    expect(result).toBeInstanceOf(URL);
    expect(result.href).toBe("https://example.com/");
  });

  it("accepts a valid http URL", () => {
    const result = assertSafeHttpUrl("http://localhost:5050", "rpcUrl");
    expect(result).toBeInstanceOf(URL);
    expect(result.port).toBe("5050");
  });

  it("preserves path, query, and fragment", () => {
    const result = assertSafeHttpUrl(
      "https://rpc.example.com/v1?key=abc#section",
      "endpoint"
    );
    expect(result.pathname).toBe("/v1");
    expect(result.search).toBe("?key=abc");
    expect(result.hash).toBe("#section");
  });

  it("throws on malformed URL", () => {
    expect(() => assertSafeHttpUrl("not-a-url", "rpcUrl")).toThrow(
      "rpcUrl must be a valid URL"
    );
  });

  it("throws on empty string", () => {
    expect(() => assertSafeHttpUrl("", "endpoint")).toThrow(
      "endpoint must be a valid URL"
    );
  });

  it("throws on ftp protocol", () => {
    expect(() =>
      assertSafeHttpUrl("ftp://files.example.com", "explorer")
    ).toThrow("explorer must use http:// or https://");
  });

  it("throws on javascript protocol", () => {
    expect(() =>
      assertSafeHttpUrl("javascript:alert(1)", "explorer")
    ).toThrow("explorer must use http:// or https://");
  });

  it("throws on data URI", () => {
    expect(() =>
      assertSafeHttpUrl("data:text/html,<h1>hi</h1>", "baseUrl")
    ).toThrow("baseUrl must use http:// or https://");
  });

  it("uses the label in error messages", () => {
    expect(() => assertSafeHttpUrl("bad", "explorer.baseUrl")).toThrow(
      "explorer.baseUrl must be a valid URL"
    );
  });
});
