# x MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that exposes Starknet wallet operations to AI agents via the [x SDK](https://github.com/keep-starknet-strange/x).

Any MCP-compatible client (Claude, Cursor, OpenAI Agents SDK, etc.) can use these tools to manage wallets, transfer tokens, stake STRK, and execute contract calls on Starknet.

## Why

Following the pattern established by [Stripe](https://github.com/stripe/agent-toolkit), [Coinbase](https://github.com/coinbase/payments-mcp), and [Alchemy](https://github.com/alchemyplatform/alchemy-mcp-server): the SDK owner ships the MCP server. This keeps tool definitions in sync with the SDK and makes the tools available to any MCP client — not just one framework.

## Quick Start

```bash
STARKNET_PRIVATE_KEY=0x... npx @keep-starknet-strange/x-mcp --network mainnet
```

## Security Model

This server handles real funds. The following protections are built in:

1. **`x_execute` is disabled by default.** The raw contract call tool is only available when you explicitly pass `--enable-execute`. Without it, agents can only use the typed, bounded tools (transfer, stake, etc.).
2. **Per-transfer amount cap.** Transfers are bounded by `--max-transfer` (default: 1000 tokens). An agent cannot send more than this in a single transfer entry.
3. **Batch size limits.** Maximum 20 transfers per batch, 10 calls per execute batch.
4. **Address validation.** All addresses are validated against Starknet felt252 format before use.
5. **Runtime argument validation.** Every tool's arguments are validated with zod schemas before execution. Malformed inputs are rejected with clear error messages.
6. **Transaction timeout.** `tx.wait()` has a 2-minute timeout to prevent the server from hanging on stuck transactions.
7. **Token allowlist.** Only tokens in the x SDK's built-in presets are accepted. Arbitrary contract addresses for unknown tokens are rejected.
8. **stdio transport only.** The server runs locally via stdio — no network exposure.

**Recommendations for production use:**

- Use a dedicated agent wallet with limited funds, not your main wallet
- Set `--max-transfer` to the lowest value that makes sense for your use case
- Do NOT pass `--enable-execute` unless you understand the risk (arbitrary contract calls)
- Store `STARKNET_PRIVATE_KEY` in a secret manager, not in plaintext config

## Configuration

### Environment Variables

| Variable                    | Required | Description                                      |
| --------------------------- | -------- | ------------------------------------------------ |
| `STARKNET_PRIVATE_KEY`      | Yes      | Stark curve private key (0x...)                  |
| `STARKNET_RPC_URL`          | No       | Custom RPC endpoint (overrides network preset)   |
| `STARKNET_STAKING_CONTRACT` | No       | Staking contract address (enables staking tools) |

### CLI Arguments

| Argument           | Default   | Description                                         |
| ------------------ | --------- | --------------------------------------------------- |
| `--network`        | `mainnet` | Network preset: `mainnet` or `sepolia`              |
| `--max-transfer`   | `1000`    | Max tokens per individual transfer (human-readable) |
| `--enable-execute` | off       | Enable the unrestricted `x_execute` tool            |

## MCP Client Configuration

### Claude Desktop / Cursor

Add to your MCP config (`mcp.json` or Claude Desktop settings):

```json
{
  "mcpServers": {
    "x-wallet": {
      "command": "npx",
      "args": ["-y", "@keep-starknet-strange/x-mcp", "--network", "mainnet"],
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
  command: "npx",
  args: ["-y", "@keep-starknet-strange/x-mcp", "--network", "mainnet"],
  env: {
    STARKNET_PRIVATE_KEY: "0x...",
  },
});
```

## Available Tools

### Wallet

| Tool               | Description                                    |
| ------------------ | ---------------------------------------------- |
| `x_get_balance`    | Get ERC20 token balance (human-readable + raw) |
| `x_transfer`       | Transfer tokens to one or more recipients      |
| `x_execute`        | Execute raw contract calls atomically          |
| `x_deploy_account` | Deploy the account contract on-chain           |
| `x_estimate_fee`   | Estimate gas cost for contract calls           |

### Staking

| Tool                  | Description                                     |
| --------------------- | ----------------------------------------------- |
| `x_enter_pool`        | Enter a staking/delegation pool (auto-approves) |
| `x_add_to_pool`       | Add more tokens to an existing stake            |
| `x_claim_rewards`     | Claim accumulated staking rewards               |
| `x_exit_pool_intent`  | Start exit process (tokens stop earning)        |
| `x_exit_pool`         | Complete exit after waiting period              |
| `x_get_pool_position` | Query staking position, rewards, commission     |

## Tool Examples

### Check balance

```
Agent: "What's my STRK balance?"
→ calls x_get_balance { token: "STRK" }
← { token: "STRK", balance: "150.25", formatted: "150.25 STRK", raw: "150250000000000000000", decimals: 18 }
```

### Transfer tokens

```
Agent: "Send 10 USDC to 0xALICE and 5 USDC to 0xBOB"
→ calls x_transfer {
    token: "USDC",
    transfers: [
      { to: "0xALICE", amount: "10" },
      { to: "0xBOB", amount: "5" }
    ]
  }
← { hash: "0x...", explorerUrl: "https://voyager.online/tx/0x...", transfers: [...] }
```

### Stake STRK

```
Agent: "Stake 100 STRK in pool 0xPOOL"
→ calls x_enter_pool { pool: "0xPOOL", amount: "100" }
← { hash: "0x...", pool: "0xPOOL", amount: "100", symbol: "STRK" }
```

## Token Resolution

Tools accept token symbols (`ETH`, `STRK`, `USDC`, etc.) or contract addresses. The server uses the x SDK's built-in token presets for the configured network.

## Security Checklist

- [ ] Using a **dedicated agent wallet** with limited funds (not your main wallet)
- [ ] `STARKNET_PRIVATE_KEY` stored in a secret manager, not plaintext
- [ ] `--max-transfer` set to the lowest practical value for your use case
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

# Run locally
STARKNET_PRIVATE_KEY=0x... node dist/index.js --network sepolia
```

## Architecture

```
┌──────────────────┐     stdio      ┌──────────────────┐     RPC      ┌──────────┐
│  MCP Client      │◄──────────────►│  x MCP Server    │◄────────────►│ Starknet │
│  (Claude/Cursor) │                │  (this package)  │              │          │
└──────────────────┘                └───────┬──────────┘              └──────────┘
                                            │
                                            │ imports
                                            ▼
                                   ┌──────────────────┐
                                   │  x SDK           │
                                   │  (../src/)       │
                                   └──────────────────┘
```

## License

MIT
