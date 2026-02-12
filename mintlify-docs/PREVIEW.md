# Previewing the Documentation

To preview the Mintlify documentation locally, follow these steps:

## Option 1: Using npx (No Installation Required)

From the `mintlify-docs` directory:

```bash
cd mintlify-docs
npx mintlify dev
```

This will start the preview server at `http://localhost:3000` without needing to install anything globally.

## Option 2: Install Mintlify CLI Globally

If you prefer to install it globally:

```bash
npm install -g mintlify
# or
npm install -g mint
```

Then run:

```bash
cd mintlify-docs
mintlify dev
# or
mint dev
```

## What You'll See

Once the server starts, you can:

- View the documentation at `http://localhost:3000`
- See live reload as you edit the `.mdx` files
- Navigate through all the pages:
  - Overview
  - Installation
  - Configuration
  - Connecting Wallets
  - Transactions
  - ERC20
  - Staking
  - Troubleshooting
  - API Reference

## Troubleshooting

If you encounter issues:

1. **Port already in use**: Use a different port

   ```bash
   mintlify dev --port 3001
   ```

2. **Configuration errors**: Make sure `mint.json` is in the `mintlify-docs` directory

3. **Missing files**: Ensure all `.mdx` files are in `build/consumer-app-sdk/`

## Next Steps

After previewing, you can:

- Copy the `build/consumer-app-sdk/` directory to the starknet-docs repository
- Update the navigation in starknet-docs to include the new section
- Test the integration in the full docs site
