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

  it.each([
    "http://localhost:5050",
    "http://127.0.0.1:5050",
    "http://127.1.2.3:5050",
    "http://127.1:5050",
    "http://[::1]:5050",
  ])("accepts plain http on the loopback host %s", (url) => {
    expect(assertSafeHttpUrl(url, "rpcUrl").href).toBe(new URL(url).href);
  });

  it.each([
    "http://10.0.2.2:5050",
    "http://192.168.1.20:5050",
    "http://rpc.example.com",
    "http://localhost.example.com",
    "http://devnet.localhost:5050",
    "http://127.attacker.example",
    "http://127.0.0.1.nip.io",
  ])("rejects plain http on the non-loopback host %s", (url) => {
    expect(() => assertSafeHttpUrl(url, "rpcUrl")).toThrow(
      /rpcUrl uses plain http:\/\/ on a non-loopback host.*allowInsecureHttp/
    );
  });

  it("accepts plain http anywhere when allowInsecureHttp is set", () => {
    const result = assertSafeHttpUrl("http://10.0.2.2:5050", "rpcUrl", {
      allowInsecureHttp: true,
    });
    expect(result.hostname).toBe("10.0.2.2");
  });

  it("does not let allowInsecureHttp open other schemes", () => {
    expect(() =>
      assertSafeHttpUrl("javascript:alert(1)", "rpcUrl", {
        allowInsecureHttp: true,
      })
    ).toThrow("rpcUrl must use http:// or https://");
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
    expect(() => assertSafeHttpUrl("javascript:alert(1)", "explorer")).toThrow(
      "explorer must use http:// or https://"
    );
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
