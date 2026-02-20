# SDK adaptations for account deployment

Summary of changes made in the SDK to support account deployment, including Braavos without a paymaster.

---

## 1. Fee estimation fallback (`src/wallet/index.ts`)

**Problem:** When the app calls `estimateAccountDeployFee`, the RPC simulates a **deploy_account** with an **empty signature** (and zero resource bounds). The account’s validation logic then runs and fails with e.g. "Index out of bounds", so estimation fails and the whole deploy was aborted.

**Change:** The deploy flow no longer fails when estimation fails. It catches the error and uses a **default set of resource bounds** instead of the estimated one. The actual `deployAccount()` call is still built and **signed** by the signer, so the transaction sent to the network has a valid signature and can succeed.

```ts
try {
  const estimateFee = await this.account.estimateAccountDeployFee({ ... });
  resourceBounds = { l1_gas: multiply2x(...), l2_gas: multiply2x(...), l1_data_gas: multiply2x(...) };
} catch {
  resourceBounds = DEFAULT_DEPLOY_RESOURCE_BOUNDS;
}
```

---

## 2. Default deploy resource bounds (`src/wallet/index.ts`)

**Problem:** When estimation is skipped, we need resource bounds that:

- Satisfy **network minimums** (e.g. L1 gas price, minimal L2 gas amount).
- Are **high enough** for the actual deploy (e.g. Braavos uses ~1M L2 gas).
- Optionally stay under a rough “max fee” so small balances still work (earlier iterations hit "exceed balance" and "max price lower than actual").

**Change:** Introduced `DEFAULT_DEPLOY_RESOURCE_BOUNDS` used in the `catch` above:

- **L2 gas:** `max_amount: 1_100_000` (covers Braavos deploy ~997k), `max_price_per_unit: 50_000_000_000_000` (meets L1-style minimums).
- **L1 gas / L1 data gas:** `max_amount: 50_000`, same `max_price_per_unit`, so the total max fee is bounded while still valid.

Values were tuned after RPC errors:

- "Max L2Gas amount (300000) is lower than the minimal gas amount: 560000" → L2 `max_amount` raised.
- "Max L1Gas price (...) is lower than the actual gas price" → `max_price_per_unit` raised to meet network.
- "Resources bounds exceed balance" → bounds lowered then re-raised as needed for Braavos.
- "Insufficient max L2Gas: max amount: 600000, actual used: 996780" → L2 `max_amount` set to 1_100_000.

---

## 3. Braavos 15-element deploy signature (`src/signer/adapter.ts`)

**Problem:** Braavos Base Account is deployed with a normal **ACCOUNT_DEPLOY** transaction, but the **additional deployment parameters** (implementation class hash, chain id, etc.) must be sent **in the signature**, not in constructor calldata (see [Braavos account contract](https://github.com/myBraavos/braavos-account-cairo)). Sending only the usual 2-element tx signature `(r, s)` caused constructor/validation failures (e.g. "u32_sub Overflow").

**Change:** In `SignerAdapter.signDeployAccountTransaction`, when the deploy is for **Braavos Base** (`det.classHash === BraavosPreset.classHash`):

1. Sign the standard deploy-account transaction hash → `(r, s)`.
2. Build **auxiliary data**: `[BRAAVOS_IMPL_CLASS_HASH, 9× "0x0", chainId]`.
3. Compute **Poseidon hash** of that array and sign it → `(r_aux, s_aux)`.
4. Return the **15-element signature**:  
   `[r, s, BRAAVOS_IMPL_CLASS_HASH, 9× "0x0", chainId, r_aux, s_aux]`.

For non-Braavos accounts, the adapter still returns the usual 2-element signature. No new signer type was added; the same adapter handles both cases.

Imports added in the adapter: `BraavosPreset` and `BRAAVOS_IMPL_CLASS_HASH` from `@/account/presets`.

---

## 4. Braavos without paymaster

**Problem:** An earlier workaround forced Braavos to use the **paymaster (factory)** path when a paymaster was configured, and threw if it was not. The Braavos docs state that deployment via **ACCOUNT_DEPLOY** (or generic deploy syscall) is supported by sending the extra params in the signature.

**Change:** That special-case was **reverted**. Braavos now uses the **same direct deploy path** as other account types when `feeMode !== "sponsored"`. The signer adapter’s 15-element signature (above) is what makes direct Braavos deploy valid. Sponsored Braavos deploy via factory is unchanged (`feeMode === "sponsored"` → `deployPaymasterWith` → `deployBraavosViaFactory`).

---

## 5. Summary table

| Area | File | What changed |
|------|------|----------------|
| Fee estimation | `src/wallet/index.ts` | Try/catch around `estimateAccountDeployFee`; on failure use `DEFAULT_DEPLOY_RESOURCE_BOUNDS`. |
| Resource bounds | `src/wallet/index.ts` | Define default bounds (L2 ≥ 1.1M, prices ≥ network minimums) for deploy when estimate fails. |
| Braavos signature | `src/signer/adapter.ts` | For Braavos Base, return 15-element deploy signature (tx sig + impl hash + zeros + chain id + aux sig). |
| Braavos deploy path | `src/wallet/index.ts` | No forced paymaster for Braavos; direct `deployAccount()` used when not sponsored. |

---

## 6. Out of scope (app-side)

- **Deploy error copyable:** The “Deployment failed” alert in the mobile app was given a “Copy” button that copies the error string to the clipboard and triggers a “Copied” toast. This is in `examples/mobile/stores/wallet.ts`, not in the SDK.
