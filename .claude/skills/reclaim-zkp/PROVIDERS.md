# Common Reclaim Protocol Providers

Quick reference for popular Reclaim Protocol data providers. Get your credentials at [dev.reclaimprotocol.org](https://dev.reclaimprotocol.org).

| Provider | Description | Example Data Extracted |
|----------|-------------|----------------------|
| Gmail | Verify Google/Gmail account ownership | Email address |
| GitHub | Verify GitHub account ownership | Username, profile URL |
| Instagram | Verify Instagram account ownership | Username, follower count |
| Twitter/X | Verify Twitter/X account ownership | Username, handle |
| LinkedIn | Verify LinkedIn profile | Name, headline |
| Steam | Verify Steam gaming account | Username, level |
| Spotify | Verify Spotify account | Username, subscription type |
| Amazon | Verify Amazon account | Order history |

## How to Get Credentials

1. Go to [dev.reclaimprotocol.org](https://dev.reclaimprotocol.org)
2. Create a new application
3. Select your desired provider from the catalog
4. Copy your **APP_ID**, **APP_SECRET**, and **PROVIDER_ID**

## Credential Format Reference

| Field | Format | Example |
|-------|--------|---------|
| APP_ID | `0x` + 40 hex chars | `0xFF01cc85cf34cfDE492d70b8AccE5d215690c808` |
| APP_SECRET | `0x` + 64 hex chars | `0x74430a0644d88534889100e843afa6e701a301ed16d5108e61ebad709a340273` |
| PROVIDER_ID | UUID v4 | `f9f383fd-32d9-4c54-942f-5e9fda349762` |
