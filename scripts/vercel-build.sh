#!/usr/bin/env bash
# Vercel's build command: pushes the Convex functions with CONVEX_DEPLOY_KEY, then builds the web app with
# VITE_CONVEX_URL pointing at the deployment that key names.
set -euo pipefail

environment="${VERCEL_ENV:-unknown}"
if [[ -z "${CONVEX_DEPLOY_KEY:-}" ]]; then
  echo "error: CONVEX_DEPLOY_KEY is not set for the $environment environment in Vercel." >&2
  echo "Production needs a Convex production deploy key and Preview a Convex preview deploy key." >&2
  echo "Without one the site would have no backend, so the build stops here." >&2
  exit 1
fi
if [[ "$environment" != "production" && "$CONVEX_DEPLOY_KEY" == prod:* ]]; then
  echo "error: this $environment build has a production deploy key, so it would push this branch to production." >&2
  echo "Scope that CONVEX_DEPLOY_KEY to Production only in Vercel, and give Preview a preview deploy key." >&2
  exit 1
fi

cd "$(dirname "$0")/../packages/backend"
exec bunx convex deploy --cmd 'cd ../../apps/web && bun run build' --cmd-url-env-var-name VITE_CONVEX_URL
