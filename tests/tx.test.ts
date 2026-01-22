import { describe, it, expect } from "vitest";
import { RpcProvider } from "starknet";
import { Tx } from "../src/tx/index.js";
import { getTestConfig } from "./config.js";

describe("Tx", () => {
  const { config } = getTestConfig();

  it("should build voyager explorer URL for testnet", () => {
    const provider = new RpcProvider({
      nodeUrl: "https://starknet-sepolia.example.com",
    });
    const hash = "0x123abc";

    const tx = new Tx(hash, provider, { provider: "voyager" });

    expect(tx.explorerUrl).toContain("voyager.online");
    expect(tx.explorerUrl).toContain(hash);
  });

  it("should build starkscan explorer URL", () => {
    const provider = new RpcProvider({
      nodeUrl: "https://starknet-sepolia.example.com",
    });
    const hash = "0x123abc";

    const tx = new Tx(hash, provider, { provider: "starkscan" });

    expect(tx.explorerUrl).toContain("starkscan.co");
    expect(tx.explorerUrl).toContain(hash);
  });

  it("should use custom base URL", () => {
    const provider = new RpcProvider({
      nodeUrl: "https://starknet-sepolia.example.com",
    });
    const hash = "0x123abc";

    const tx = new Tx(hash, provider, {
      baseUrl: "https://my-explorer.com",
    });

    expect(tx.explorerUrl).toBe("https://my-explorer.com/tx/0x123abc");
  });

  it("should store hash correctly", () => {
    const provider = new RpcProvider({ nodeUrl: config.rpcUrl });
    const hash = "0xdeadbeef";

    const tx = new Tx(hash, provider);

    expect(tx.hash).toBe(hash);
  });
});
