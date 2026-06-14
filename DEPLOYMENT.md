# Cloudflare Deployment

This repository now contains the Cloudflare Worker deployment structure for `tc888`.

## Local checks

```bash
npm run prepare:worker-assets
npm run check:worker
npx wrangler deploy --dry-run --keep-vars --outdir .wrangler-dryrun-github
```

The dry run must show these bindings before a real deploy:

- `env.ASSETS`
- `env.STORAGE`
- `env.DB`
- `env.AI_ANALYZER`
- `env.LOGO_PRECACHER`
- `env.SCORE_POLLER`

## GitHub Actions

The workflow is at `.github/workflows/deploy-cloudflare.yml`.

Required repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Automatic deploys on push are disabled by default. To enable them, add a repository variable:

- `CLOUDFLARE_AUTO_DEPLOY=true`

Manual deploys can be started from the workflow dispatch button.

## Current migration note

The GitHub Worker covers the public schedule API, team-logo proxy, daily image lookup, schedule import, manual score edits, and existing Cloudflare bindings.

The API-Football automatic score update endpoint is intentionally left as a placeholder until that polling logic is ported from the local Python server. Do not run a production deploy if automatic score polling is required before that migration is complete.
