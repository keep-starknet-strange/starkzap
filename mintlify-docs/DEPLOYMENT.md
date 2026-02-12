# Deployment Guide

## Option 1: Mintlify Hosting (Recommended - Use This!)

**This is the recommended approach.** Mintlify provides free hosting and is designed for this purpose.

1. **Connect your repository to Mintlify:**
   - Go to [Mintlify Dashboard](https://mintlify.com)
   - Sign up or log in (free account)
   - Click "New Project" and connect your GitHub repository
   - Select the branch: `docs/mintlify`
   - Set the root directory to: `mintlify-docs`
   - Mintlify will automatically detect `mint.json`

2. **Automatic deployments:**
   - Mintlify will automatically deploy on every push to your main branch
   - Preview deployments are created for pull requests

3. **Custom domain (optional):**
   - Configure a custom domain in Mintlify dashboard settings

## Option 2: Vercel Deployment

**⚠️ Important Note:** Mintlify is designed for Mintlify hosting. For Vercel, you need to ensure the build output is correct. If you get 404 errors, the build might not be generating static files properly.

**⚠️ Important:** Mintlify is designed to be hosted on Mintlify's platform. While you can try to deploy to Vercel, Mintlify doesn't build traditional static files, which can cause 404 errors.

**Recommended:** Use Mintlify hosting (Option 1) for the best experience.

If you still want to deploy to Vercel, you have two options:

### Option 2A: Use Mintlify's Vercel Integration

Mintlify provides a Vercel integration that handles the deployment properly:

1. Connect your repository to Mintlify (see Option 1)
2. In Mintlify dashboard, go to Settings → Deployment
3. Enable Vercel integration
4. Follow the setup instructions

### Option 2B: Manual Vercel Setup (May Not Work)

If you prefer to deploy to Vercel manually, follow these steps:

### Prerequisites

1. Install dependencies:

   ```bash
   cd mintlify-docs
   npm install
   ```

2. Test locally:
   ```bash
   npm run dev
   ```

### Deploy to Vercel

1. **Install Vercel CLI** (if not already installed):

   ```bash
   npm i -g vercel
   ```

2. **Deploy:**

   ```bash
   cd mintlify-docs
   vercel
   ```

   Or connect your repository to Vercel:
   - Go to [Vercel Dashboard](https://vercel.com)
   - Import your GitHub repository
   - Set the root directory to `mintlify-docs`
   - Vercel will automatically detect the configuration

### Vercel Configuration

The `vercel.json` file is already configured with:

- Build command: `npm run build`
- Output directory: `.mint` (Mintlify's build output)
- Framework: None (static site)

### Important Notes

- **Logo files**: Make sure logo files exist at the paths specified in `mint.json`:
  - `/logo/dark.svg`
  - `/logo/light.svg`
  - `/favicon.svg`

  If they don't exist, either:
  1. Create placeholder logo files, or
  2. Update `mint.json` to remove logo references

- **Environment variables**: No environment variables are required for basic deployment

- **Build output**: Mintlify builds to `.mint` directory, which is configured in `vercel.json`

## Local Development

```bash
cd mintlify-docs
npm install
npm run dev
```

Visit `http://localhost:3000` to preview your documentation.

## Troubleshooting

### Build fails on Vercel

- Ensure `mint.json` is valid JSON
- Check that all referenced pages exist
- Verify logo file paths if configured

### Logo not showing

- Check that logo files exist at the specified paths
- Verify file paths in `mint.json` are correct
- Ensure files are committed to the repository

### Navigation not working

- Verify `mint.json` navigation structure is correct
- Ensure all page paths are valid
- Check that pages are referenced as strings, not objects
