# StarkZap MCP Server (`starkzap-mcp`)

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that exposes Starknet wallet operations to AI agents via the [StarkZap SDK](https://github.com/keep-starknet-strange/starkzap).

Any MCP-compatible client (Claude, Cursor, OpenAI Agents SDK, etc.) can use these tools to manage wallets, transfer tokens, stake STRK, and execute contract calls on Starknet.

Package and binary names are `@keep-starknet-strange/starkzap-mcp` and `starkzap-mcp`.

## Why

Following the pattern established by [Stripe](https://github.com/stripe/agent-toolkit), [Coinbase](https://github.com/coinbase/payments-mcp), and [Alchemy](https://github.com/alchemyplatform/alchemy-mcp-server): the SDK owner ships the MCP server. This keeps tool definitions in sync with the SDK and makes the tools available to any MCP client — not just one framework.

## Quick Start

```bash
# In repo root
cd packages/mcp-server
npm install
npm run build

# Read-only mode (balance checks, fee estimates, and pool position if staking is configured)
STARKNET_PRIVATE_KEY=0x... node dist/index.js --network mainnet

# Enable transfers and staking writes
STARKNET_PRIVATE_KEY=0x... STARKNET_STAKING_CONTRACT=0x... node dist/index.js --network mainnet --enable-write
```

## Security Model

This server handles real funds. The following protections are built in:

1. **All state-changing tools are disabled by default.** Read-only tools are available without write flags. Write tools (`starkzap_transfer`, staking, `starkzap_deploy_account`) require `--enable-write`. The unrestricted `starkzap_execute` tool requires its own `--enable-execute` flag.
2. **Amount caps are enforced for both single ops and transfer batches.** All amount-bearing operations (transfers and staking) are bounded by `--max-amount` (default: 1000 tokens). Transfer batches are also bounded by `--max-batch-amount` (default: same as `--max-amount`). For state-dependent staking exits/claims, caps use multi-check preflight validation and remain best-effort with a residual chain-state race window between final check and inclusion (typically 1-3 Starknet blocks). Keep `--max-amount` conservative and reconcile tx hashes before retrying.
3. **Batch size limits.** Maximum 20 transfers per batch, 10 calls per execute batch.
4. **Address validation.** All addresses are validated against Starknet felt252 format before use.
5. **Runtime argument validation.** Every tool's arguments are validated with zod schemas before execution. Malformed inputs are rejected with clear error messages.
6. **Transaction timeout.** `tx.wait()` has a 2-minute timeout to prevent the server from hanging on stuck transactions.
7. **Token allowlist.** Only tokens in the StarkZap SDK's built-in presets are accepted. Arbitrary contract addresses for unknown tokens are rejected.
8. **stdio transport only.** The server runs locally via stdio — no network exposure.
9. **Early CLI validation.** Invalid/unknown CLI flags and malformed `--network`/amount/rate-limit values are rejected immediately at startup with a clear error.
10. **Staking tool gating by config.** Staking tools are hidden unless `STARKNET_STAKING_CONTRACT` is configured.
11. **Pool class-hash validation.** Staking pool calls verify deployed contract class hash before SDK metadata resolution. You can pin expected hashes explicitly via `STARKNET_STAKING_POOL_CLASS_HASHES`.

**Recommendations for production use:**

- Use a dedicated agent wallet with limited funds, not your main wallet
- Set `--max-amount` to the lowest value that makes sense for your use case
- Do NOT pass `--enable-execute` unless you understand the risk (arbitrary contract calls)
- Store `STARKNET_PRIVATE_KEY` in a secret manager, not in plaintext config
- If a write op times out while waiting for confirmation, reconcile with tx hash/explorer first; do not blindly retry

## Configuration

### Environment Variables

| Variable                             | Required | Description                                                                                     |
| ------------------------------------ | -------- | ----------------------------------------------------------------------------------------------- |
| `STARKNET_PRIVATE_KEY`               | Yes      | Stark curve private key (`0x` + exactly 64 hex chars, cryptographically valid)                  |
| `STARKNET_RPC_URL`                   | No       | Custom RPC endpoint (overrides network preset; HTTPS required except localhost HTTP)            |
| `STARKNET_RPC_TIMEOUT_MS`            | No       | RPC timeout in milliseconds (default: `30000`)                                                  |
| `STARKNET_POOL_CACHE_TTL_MS`         | No       | Pool class-hash cache TTL in ms (default: `30000`, set `0` to disable cache)                    |
| `STARKNET_STAKING_CONTRACT`          | No       | Staking contract address (enables staking tools)                                                |
| `STARKNET_STAKING_POOL_CLASS_HASHES` | No       | Comma-separated allowlist of pool contract class hashes (0x...) for strict pool-type validation |

### CLI Arguments

| Argument                 | Default                | Description                                                                                               |
| ------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `--network`              | `mainnet`              | Network preset: `mainnet` or `sepolia` (validated at startup)                                             |
| `--max-amount`           | `1000`                 | Max tokens per individual amount-bearing operation                                                        |
| `--max-batch-amount`     | `same as --max-amount` | Max total tokens across one `starkzap_transfer` batch call                                                |
| `--rate-limit-rpm`       | `0` (disabled)         | Global MCP tool-call rate limit per minute                                                                |
| `--read-rate-limit-rpm`  | `0` (disabled)         | Optional read-only bucket (`starkzap_get_balance`, `starkzap_get_pool_position`, `starkzap_estimate_fee`) |
| `--write-rate-limit-rpm` | `0` (disabled)         | Optional state-changing bucket (transfer/staking/deploy/execute)                                          |
| `--enable-write`         | off                    | Enable state-changing tools (transfer, stake, deploy)                                                     |
| `--enable-execute`       | off                    | Enable only the unrestricted `starkzap_execute` tool                                                      |

## MCP Client Configuration

### Claude Desktop / Cursor

Add to your MCP config (`mcp.json` or Claude Desktop settings):

```json
{
  "mcpServers": {
    "starkzap-wallet": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/REPO/packages/mcp-server/dist/index.js",
        "--network",
        "mainnet",
        "--enable-write"
      ],
      "env": {
        "STARKNET_PRIVATE_KEY": "0xYOUR_PRIVATE_KEY"
      }
    }
  }
}
```

### OpenAI Agents SDK

```typescript
import { McpServerStdio } from "@openai/agents/mcp";

const mcpServer = new McpServerStdio({
  command: "node",
  args: [
    "/ABSOLUTE/PATH/TO/REPO/packages/mcp-server/dist/index.js",
    "--network",
    "mainnet",
    "--enable-write",
  ],
  env: {
    STARKNET_PRIVATE_KEY: "0x...",
  },
});
```

## Available Tools

### Wallet

| Tool                      | Description                                                 |
| ------------------------- | ----------------------------------------------------------- |
| `starkzap_get_account`    | Get connected account address/deployment/class hash details |
| `starkzap_get_balance`    | Get ERC20 token balance (human-readable + raw)              |
| `starkzap_transfer`       | Transfer tokens to one or more recipients                   |
| `starkzap_execute`        | Execute raw contract calls atomically                       |
| `starkzap_deploy_account` | Deploy the account contract on-chain                        |
| `starkzap_estimate_fee`   | Estimate gas cost for contract calls                        |

### Staking

| Tool                         | Description                                                           |
| ---------------------------- | --------------------------------------------------------------------- |
| `starkzap_enter_pool`        | Enter a staking/delegation pool (pool token is chain-derived)         |
| `starkzap_add_to_pool`       | Add more tokens to an existing stake (pool token is chain-derived)    |
| `starkzap_claim_rewards`     | Claim accumulated staking rewards                                     |
| `starkzap_exit_pool_intent`  | Start exit process (tokens stop earning, pool token is chain-derived) |
| `starkzap_exit_pool`         | Complete exit after waiting period                                    |
| `starkzap_get_pool_position` | Query staking position, rewards, commission                           |

## Tool Examples

### Check balance

```text
Agent: "What's my STRK balance?"
→ calls starkzap_get_balance { token: "STRK" }
← { token: "STRK", balance: "150.25", formatted: "150.25 STRK", raw: "150250000000000000000", decimals: 18 }
```

### Check connected account

```text
Agent: "What account am I using?"
→ calls starkzap_get_account {}
← { address: "0x...", deployed: true, expectedClassHash: "0x...", deployedClassHash: "0x..." }
```

### Transfer tokens

```text
Agent: "Send 10 USDC to 0x1111111111111111111111111111111111111111 and 5 USDC to 0x2222222222222222222222222222222222222222"
→ calls starkzap_transfer {
    token: "USDC",
    transfers: [
      { to: "0x1111111111111111111111111111111111111111", amount: "10" },
      { to: "0x2222222222222222222222222222222222222222", amount: "5" }
    ]
  }
← { hash: "0x...", explorerUrl: "https://voyager.online/tx/0x...", transfers: [...] }
```

### Stake STRK

```text
Agent: "Stake 100 STRK in pool 0x3333333333333333333333333333333333333333"
→ calls starkzap_enter_pool { pool: "0x3333333333333333333333333333333333333333", amount: "100" }
← { hash: "0x...", pool: "0x3333333333333333333333333333333333333333", amount: "100", symbol: "STRK" }
```

## Token Resolution

Tools accept token symbols (`ETH`, `STRK`, `USDC`, etc.) or contract addresses. The server uses the StarkZap SDK's built-in token presets for the configured network.

## Sepolia Write-Path Checklist

Use this sequence when validating real writes (not just tests):

1. Start with write enabled:
   `STARKNET_PRIVATE_KEY=0x... node dist/index.js --network sepolia --enable-write`
2. Call `starkzap_get_account` first to confirm the **derived** address and class hash.
3. Confirm fees balance with `starkzap_get_balance` for `STRK` (and optionally `ETH`).
4. If account is not deployed, call `starkzap_deploy_account`.
5. Execute a tiny self-transfer (e.g. `0.00001`) with `starkzap_transfer`.

Troubleshooting from live runs:

- If startup says private key is invalid, check key length: it must be 64 hex chars after `0x` (32 bytes). If your source omits a leading zero, left-pad before use.
- If your expected wallet address does not match, trust `starkzap_get_account` output. The MCP uses StarkZap wallet derivation from the private key.
- If sponsored deploy/transfer fails with paymaster errors (e.g. invalid API key), use funded user-pays mode or configure a valid paymaster setup in your environment.
- In sponsored mode, account class-hash validation runs after tx confirmation as a safety audit check. This detects unexpected account classes but cannot prevent a misbehaving paymaster from submitting the first tx.
- If write tx fails with undeployed account errors, run `starkzap_deploy_account` first, then retry transfer.

## Security Checklist

- [ ] Using a **dedicated agent wallet** with limited funds (not your main wallet)
- [ ] `STARKNET_PRIVATE_KEY` stored in a secret manager, not plaintext
- [ ] `--max-amount` set to the lowest practical value for your use case
- [ ] `--rate-limit-rpm` set for global throttling in shared/server environments
- [ ] `--read-rate-limit-rpm` / `--write-rate-limit-rpm` set when you need separate read/write buckets
- [ ] `--enable-write` only passed when the agent needs to send transactions
- [ ] `--enable-execute` is **NOT** passed unless explicitly needed
- [ ] Running via **stdio** (local) — not exposed over HTTP without auth

## Development

```bash
# Install dependencies
cd packages/mcp-server
npm install

# Build
npm run build

# Type-check
npm run typecheck

# Tests (includes schema parity checks)
npm run test

# Release precheck (verifies StarkZap version range is published)
npm view starkzap@^1.0.0 version

# Run locally
STARKNET_PRIVATE_KEY=0x... node dist/index.js --network sepolia
```

## Architecture

```text
┌──────────────────┐     stdio      ┌──────────────────┐     RPC      ┌──────────┐
│  MCP Client      │◄──────────────►│ StarkZap MCP     │◄────────────►│ Starknet │
│  (Claude/Cursor) │                │  (this package)  │              │          │
└──────────────────┘                └───────┬──────────┘              └──────────┘
                                    │
                                    │ imports
                                    ▼
                                   ┌──────────────────┐
                                   │  StarkZap SDK    │
                                   │  (npm: starkzap) │
                                   └──────────────────┘
```

## License

MIT
