# Configuration Notes

## Format Differences

There are **two different formats** needed:

### 1. Local Development (`mint.json`)

- Used by `mintlify dev` command
- **Navigation**: Must be an **array**
- **Theme**: Must be `'venus' | 'quill' | 'prism'`
- **Favicon**: Required field

### 2. Production Platform (`docs.json`)

- Used by Mintlify hosting platform
- **Navigation**: Must be an **object** with `pages` and `groups` properties
- **Theme**: Can be `'mint' | 'maple' | 'palm' | 'willow' | 'linden' | 'almond' | 'aspen' | 'sequoia'`
- **Favicon**: Optional

## Current Setup

- `mint.json` - Array format for local development
- `docs.json` - Object format for production deployment

When deploying to Mintlify platform, it will use `docs.json` (or `mint.json` if `docs.json` doesn't exist).

## To Test Locally

```bash
cd mintlify-docs
mintlify dev
```

This uses `mint.json` with array navigation format.

## To Deploy

Mintlify platform will read `docs.json` (or `mint.json`) from the configured root directory and use the object format for navigation.
