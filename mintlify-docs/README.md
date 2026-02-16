# Starkzap Mintlify Documentation

This directory contains the Mintlify documentation structure for the Starkzap that should be integrated into the [starknet-docs](https://github.com/starknet-io/starknet-docs) repository.

## Structure

The documentation is organized as follows:

```
build/consumer-app-sdk/
├── overview.mdx              # Main overview page
├── installation.mdx          # Installation and quick start
├── configuration.mdx         # SDK configuration guide
├── connecting-wallets.mdx    # Wallet connection methods
├── transactions.mdx          # Transaction execution guide
├── erc20.mdx                 # ERC20 token operations
├── staking.mdx               # Staking and delegation
├── troubleshooting.mdx       # Common issues and solutions
└── api-reference.mdx        # Complete API reference
```

## Integration Instructions

### 1. Copy Files to starknet-docs

Copy the `build/consumer-app-sdk/` directory to the starknet-docs repository:

```bash
cp -r mintlify-docs/build/consumer-app-sdk /path/to/starknet-docs/build/
```

### 2. Update Navigation

Add the consumer-app-sdk section to the Mintlify navigation configuration. This is typically done in one of these ways:

- **Mintlify Dashboard**: Add the section through the Mintlify dashboard navigation settings
- **docs.json or mint.json**: Update the navigation configuration file

The navigation should look similar to:

```json
{
  "group": "Build",
  "pages": [
    "build/quickstart/overview",
    "build/consumer-app-sdk/overview",
    "build/cairo/overview",
    "build/examples/overview",
    "build/core-lib/overview"
  ]
}
```

### 3. Verify Links

All internal links use the format `/build/consumer-app-sdk/...` which should work once the files are in place and navigation is configured.

### 4. Test Locally

To test the documentation locally:

```bash
cd /path/to/starknet-docs
npm install -g mint
mint dev
```

Then navigate to `http://localhost:3000` to preview the documentation.

## Documentation Features

- ✅ Complete overview and getting started guide
- ✅ Installation and quick start examples
- ✅ Comprehensive configuration guide
- ✅ Multiple wallet connection methods
- ✅ Transaction execution patterns
- ✅ ERC20 token operations
- ✅ Staking and delegation guide
- ✅ Troubleshooting section
- ✅ Full API reference

## Notes

- All code examples use TypeScript
- Links are relative to the `/build/consumer-app-sdk/` path
- The documentation follows Mintlify MDX format with frontmatter
- Warning and Note callouts are used where appropriate

## Next Steps

After integration:

1. Review all pages for accuracy
2. Test all code examples
3. Verify all links work correctly
4. Update any SDK-specific details if needed
5. Add any additional examples or use cases
