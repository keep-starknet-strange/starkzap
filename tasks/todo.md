## [Bugfix]: Sponsored Transfer Fallback in Mobile Example

### Problem
Sponsored transfer calls fail when the paymaster upstream endpoint is temporarily unavailable, causing transfers to hard-fail even when user-paid execution could work.

### Context
- Relevant files:
  - /Users/lucas/x/examples/mobile/app/(tabs)/transfers.tsx
- Dependencies/services:
  - AVNU paymaster RPC via `executePaymasterTransaction`
  - Mobile wallet execution path in example app
- Risks:
  - Accidental fallback on non-paymaster errors
  - Unexpected gas payment if fallback triggers too broadly

### Acceptance Criteria
- [x] Sponsored transfer failures caused by paymaster transport/outage errors retry once with `feeMode: "user_pays"`
- [x] Non-paymaster transfer errors remain unchanged
- [x] Mobile lint passes

### Scope Boundaries
- Not included:
  - SDK core fee-mode behavior changes
  - Changes to staking/other transaction flows

### Tasks
- [x] Add paymaster failure classifier helper in transfers screen
- [x] Add one-time sponsored -> user_pays retry logic with logs
- [x] Validate with mobile lint

### Review
- Implemented in `/Users/lucas/x/examples/mobile/app/(tabs)/transfers.tsx`.
- Added `isPaymasterUnavailableError()` and `getErrorMessage()` helpers.
- Sponsored transfer submission now retries once in `user_pays` only for paymaster transport/outage signatures.
- Non-matching errors are re-thrown unchanged.
- Verification:
  - `npm --prefix /Users/lucas/x/examples/mobile run lint` (pass)
  - `npm run typecheck` (pass)

## [Observability]: Paymaster Proxy Server Logs

### Problem
The paymaster proxy logs were too minimal to diagnose why sponsored requests fail.

### Context
- Relevant files:
  - /Users/lucas/x/examples/server/server.ts
- Dependencies/services:
  - AVNU paymaster upstream (`AVNU_PAYMASTER_URL`)
  - Local proxy route (`POST /api/paymaster`)
- Risks:
  - Logging too little to diagnose upstream errors
  - Logging too much (sensitive or noisy output)

### Acceptance Criteria
- [x] Each paymaster request logs request id + method summary
- [x] Upstream response status, duration, and body snippet are logged
- [x] Non-JSON upstream responses are clearly logged and surfaced
- [x] Exceptions include request id and stack in server logs
- [x] HTTP `200` JSON-RPC `error` envelopes are logged explicitly
- [x] Logs include sanitized request headers and upstream response headers
- [x] Logs include first-call details (`to`, `selector`, calldata length)

### Scope Boundaries
- Not included:
  - Changes to mobile transfer logic
  - Changes to SDK fee-mode behavior

### Tasks
- [x] Add structured paymaster request summary logging
- [x] Add response parsing/logging with non-JSON handling
- [x] Add detailed exception logging with request id
- [x] Type-check `server.ts`
- [x] Add sanitized incoming headers and payload snippet logging
- [x] Add upstream response header logging and result/error breakdown
- [x] Add slow-upstream warning with total/upstream duration

### Review
- Implemented in `/Users/lucas/x/examples/server/server.ts`.
- Added helpers:
  - `createRequestId()`
  - `safeStringify()`
  - `truncateForLog()`
  - `summarizePaymasterRequest()`
- Follow-up update:
  - `summarizePaymasterRequest()` now parses both payload shapes:
    - `invoke.calls` (build flow)
    - `typed_data.message.Calls` (execute flow)
  - Added execute-flow diagnostics:
    - `callsSource`
    - `caller`, `nonce`
    - `executeAfter`, `executeBefore`, `executeBeforeIso`
    - `executeWindowSec`, `expiresInSec`
    - `signatureLen`
- Paymaster route now logs:
  - request summary (`method`, `rpcId`, `user`, `calls`, `feeMode`)
  - request context (`clientIp`, `user-agent`, first call details)
  - sanitized incoming headers and body snippet
  - upstream `status` + `durationMs`
  - upstream response headers (`content-type`, `content-length`, `server`, request ids when present)
  - JSON-RPC `result` summary on success
  - JSON-RPC `error` summary on logical failures (including HTTP `200`)
  - error payload snippets for non-2xx responses
  - non-JSON upstream bodies with `contentType`
  - exception message and stack with request id
- Verification:
  - `npx tsc --pretty false --noEmit --module nodenext --moduleResolution nodenext --target es2022 --esModuleInterop --skipLibCheck /Users/lucas/x/examples/server/server.ts` (pass)

## [Bugfix]: Sponsored Execute Error Fallback Detection

### Problem
Some sponsored failures from `paymaster_executeTransaction` were not always classified as paymaster failures, so the mobile fallback to `user_pays` could be skipped.

### Context
- Relevant files:
  - /Users/lucas/x/examples/mobile/app/(tabs)/transfers.tsx
- Dependencies/services:
  - Mobile transfer fallback classifier `isPaymasterUnavailableError`
- Risks:
  - Over-broad matching could trigger fallback on non-paymaster errors

### Acceptance Criteria
- [x] `paymaster_executeTransaction` RPC method errors are detected as paymaster call failures
- [x] `"execution call was rejected"` is treated as retryable sponsored failure for fallback
- [x] Mobile lint passes

### Scope Boundaries
- Not included:
  - SDK core paymaster implementation changes
  - Changes to server proxy behavior

### Review
- Updated paymaster call detection to include `paymaster_executetransaction`.
- Added `execution call was rejected` to failure signatures that trigger sponsored -> user_pays retry.
- Verification:
  - `npm --prefix /Users/lucas/x/examples/mobile run lint` (pass)
