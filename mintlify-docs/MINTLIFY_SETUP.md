# Mintlify Setup Instructions

## Configuration Options

Mintlify can be configured in two ways:

### Option 1: Root Directory = `mintlify-docs` (Recommended)

**In Mintlify Dashboard:**

- Root Directory: `mintlify-docs`
- Branch: `docs/mintlify`
- Mintlify will look for `docs.json` or `mint.json` in `mintlify-docs/`

**File paths in navigation:**

- Use: `build/consumer-app-sdk/overview`
- NOT: `mintlify-docs/build/consumer-app-sdk/overview`

### Option 2: Root Directory = `.` (Repository Root)

**In Mintlify Dashboard:**

- Root Directory: `.` (or leave empty)
- Branch: `docs/mintlify`
- Mintlify will look for `docs.json` at repository root

**File paths in navigation:**

- Use: `mintlify-docs/build/consumer-app-sdk/overview`
- NOT: `build/consumer-app-sdk/overview`

## Current Setup

We have both configurations:

- `docs.json` at repo root (for Option 2)
- `docs.json` in `mintlify-docs/` (for Option 1)

## Troubleshooting

If Mintlify says "docs.json not found":

1. **Check Root Directory Setting:**
   - Go to Mintlify Dashboard → Settings → General
   - Verify the "Root Directory" matches your choice above

2. **Verify File Exists:**
   - For Option 1: Check `mintlify-docs/docs.json` exists
   - For Option 2: Check `docs.json` exists at repo root

3. **Check Branch:**
   - Ensure you're using branch `docs/mintlify`
   - The files must be committed and pushed to this branch

4. **File Paths:**
   - Paths in `docs.json` must match the root directory setting
   - Paths are relative to the root directory you set

## Recommended: Use Option 1

Set Root Directory to `mintlify-docs` in Mintlify dashboard. This keeps everything contained in one directory.
