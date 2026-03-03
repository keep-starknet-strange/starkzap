---
name: zktls
description: Integrate Reclaim Protocol to import User Data from any platform using ZKP verification into an existing app. Collects credentials, installs SDK, wires up verification flow and proof parsing into a target file.
user_invocable: true
allowed-tools: [Read, Edit, Write, Glob, Grep, Bash]
---

# Reclaim ZKP Integration

Integrate Reclaim Protocol's JS SDK into the user's existing application. This skill handles SDK setup, verification flow, and proof parsing — nothing else.

## Invocation

When the user invokes `/zktls`, follow this workflow:

### Step 1: Collect Everything Upfront

Use a single AskUserQuestion prompt to collect all inputs at once:

1. **APP_ID** — starts with `0x` followed by 40 hex characters
2. **APP_SECRET** — starts with `0x` followed by 64 hex characters
3. **PROVIDER_ID** — UUID format
4. **Target file** — the file where the verification button/trigger should be added

Before asking, **scan the codebase** using Glob and Grep to find likely integration points — files containing buttons, forms, pages, or components that could house a "Verify" action. Present the top candidates as options alongside a freeform "Let me specify" choice.

Example AskUserQuestion flow:
- Question 1: "Paste your Reclaim credentials (APP_ID, APP_SECRET, PROVIDER_ID)"
- Question 2: "Which file should I add the verification to?"
  - `src/components/Profile.tsx` (detected — has a verify button)
  - `src/pages/Settings.jsx` (detected — user settings page)
  - `src/App.tsx` (entry point)
  - Let me specify a file path

Refer to `PROVIDERS.md` in this skill directory for common provider examples to help the user.

### Step 2: Validate Credentials

- `APP_ID`: Must match `/^0x[0-9a-fA-F]{40}$/`
- `APP_SECRET`: Must match `/^0x[0-9a-fA-F]{64}$/`
- `PROVIDER_ID`: Must match `/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/`

If validation fails, tell the user which field is invalid and ask them to correct it.

### Step 3: Secure Credential Storage

**Credentials must NEVER be committed to git.** This is non-negotiable.

1. Add to the project's `.env` (create if it doesn't exist, append if it does):
   ```
   RECLAIM_APP_ID={app_id}
   RECLAIM_APP_SECRET={app_secret}
   RECLAIM_PROVIDER_ID={provider_id}
   ```
   - If the project uses Vite, prefix with `VITE_`
   - If Next.js, prefix with `NEXT_PUBLIC_`
   - Otherwise use the plain names above

2. **Check `.gitignore`** — if `.env` is not listed, add it. If `.gitignore` doesn't exist, create one with `.env` in it.

3. Create or update `.env.example` with placeholder values (no real credentials):
   ```
   RECLAIM_APP_ID=0x_your_app_id_here
   RECLAIM_APP_SECRET=0x_your_app_secret_here
   RECLAIM_PROVIDER_ID=your-provider-uuid-here
   ```

### Step 4: Install SDK

```bash
npm install @reclaimprotocol/js-sdk
```

### Step 5: Integrate Into Target File

Read the target file the user selected in Step 1. Understand its structure, then add:

1. **A config import** that reads the three env vars
2. **The verification function and proof parser:**

```js
import { ReclaimProofRequest } from '@reclaimprotocol/js-sdk'

async function startVerification() {
  const reclaimRequest = await ReclaimProofRequest.init(
    APP_ID,
    APP_SECRET,
    PROVIDER_ID,
    {
      useAppClip: false,
      customSharePageUrl: 'https://portal.reclaimprotocol.org/popcorn'
    }
  )

  const requestUrl = await reclaimRequest.getRequestUrl()

  await reclaimRequest.startSession({
    onSuccess: (proofs) => {
      const parsed = parseProof(proofs)
      console.log(JSON.stringify(parsed, null, 2))
      // Hand parsed result back to the UI
    },
    onError: (error) => {
      console.error('Verification failed:', error)
    }
  })

  return requestUrl // URL to show in an iframe or open in a new tab
}

function parseProof(proofs) {
  if (!proofs) return {}

  // Handle both single proof object and array of proofs
  const proof = Array.isArray(proofs) ? proofs[0] : proofs
  if (!proof) return {}

  if (proof.extractedParameterValues) {
    return typeof proof.extractedParameterValues === 'string'
      ? JSON.parse(proof.extractedParameterValues)
      : proof.extractedParameterValues
  }

  if (proof.claimData?.context) {
    const ctx = typeof proof.claimData.context === 'string'
      ? JSON.parse(proof.claimData.context)
      : proof.claimData.context
    return ctx.extractedParameters || ctx
  }

  if (proof.claimData?.parameters) {
    return typeof proof.claimData.parameters === 'string'
      ? JSON.parse(proof.claimData.parameters)
      : proof.claimData.parameters
  }

  if (proof.publicData) {
    return typeof proof.publicData === 'string'
      ? JSON.parse(proof.publicData)
      : proof.publicData
  }

  // Fallback: return the proof itself if it's a plain object
  return typeof proof === 'object' ? proof : {}
}
```

3. **Hook it to a button** in the target file — find an existing button or add a minimal one that calls `startVerification()`, shows the returned URL in an iframe, and renders the parsed proof as a JSON block.

### Step 6: Done

Tell the user which files were modified/created. Remind them:
- Credentials are in `.env` (gitignored, never committed)
- `requestUrl` should be displayed in an iframe for the user to complete verification
- Proof results come back as parsed JSON via `onSuccess`

## Rules

- Do NOT generate a new project. Integrate into the user's existing code.
- Do NOT create UI components, styles, themes, or layouts. Only add the verification logic and wire it to a button.
- Do NOT add deployment steps.
- Do NOT ever write real credentials into source files. Always read from env vars.
- Adapt to whatever framework the user is using (React, Vue, Svelte, vanilla JS, Next.js, etc.).
- Always ensure `.env` is gitignored before writing credentials to it.
