# Vercel Deployment Setup

## The Problem

Mintlify is designed as a SaaS platform and doesn't natively build static files for Vercel. The `mintlify build` command may not create deployable static files.

## Solution: Use Mintlify Hosting (Recommended)

**This is the easiest way to get your docs online exactly like local dev:**

1. Go to https://mintlify.com
2. Sign up (free)
3. Click "New Project"
4. Connect your GitHub repo
5. Select branch: `docs/mintlify`
6. Set root directory: `mintlify-docs`
7. Deploy!

You'll get a URL like `your-docs.mintlify.app` that works exactly like `mintlify dev` locally.

## Alternative: Check Build Output

If you must use Vercel, first check what `mintlify build` actually creates:

```bash
cd mintlify-docs
npm install
npm run build
ls -la .mint  # Check if this directory exists and has files
```

If `.mint` directory is created with HTML/CSS/JS files, then Vercel should work. If it's empty or doesn't exist, Mintlify doesn't build static files and you need to use Mintlify hosting.

## Vercel Configuration

The `vercel.json` is configured to:

- Build command: `npm run build`
- Output directory: `.mint`
- Framework: None (static site)

If the build doesn't create `.mint` with static files, Vercel won't work and you'll get 404 errors.
