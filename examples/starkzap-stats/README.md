# Starkzap Stats Dashboard

Static dashboard for npm download analytics of the `starkzap` package.

## Metrics

- Daily downloads
- Weekly downloads
- Monthly downloads
- Cumulative downloads

## Date range

The dashboard uses a fixed start date and always queries up to the current day:

- Start: `2026-02-01`
- End: `today` (local date in browser)

## Run locally

```bash
cd examples/starkzap-stats
python3 -m http.server 4173
```

Then open `http://localhost:4173`.
