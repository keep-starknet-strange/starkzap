# Example Integration

A sample React + Vite app built with the `/zktls` skill: [reclaim-test-app](https://github.com/RealAdii/reclaim-test-app)

## What was done

1. Started with a minimal React app with a "Verify Your Workplace Using Zero Knowledge Proofs" page and a placeholder Verify button
2. Ran `/zktls` — provided APP_ID, APP_SECRET, PROVIDER_ID and selected `src/App.jsx` as the target file
3. The skill:
   - Stored credentials in `.env` (Vite-prefixed as `VITE_RECLAIM_*`)
   - Added `.env` to `.gitignore`
   - Created `.env.example` with placeholders
   - Installed `@reclaimprotocol/js-sdk`
   - Wired `ReclaimProofRequest.init()` into the existing Verify button
   - Added iframe overlay for the verification flow
   - Added proof result display as parsed JSON

## Result

Clicking Verify opens the Reclaim verification iframe. After completing verification, the proof is parsed and displayed as a JSON block on the page.
