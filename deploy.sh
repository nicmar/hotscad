#!/usr/bin/env bash
# Build HotSCAD and publish dist/ to a target directory.
#
# Reads ./.env (gitignored). Copy .env.example to .env and edit for your machine.

set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "deploy.sh: .env not found. Copy .env.example to .env and edit it." >&2
  exit 1
fi

# Allow comments and blank lines in .env.
set -a
# shellcheck disable=SC1091
source .env
set +a

: "${DEPLOY_TARGET:?DEPLOY_TARGET must be set in .env}"
BUILD_SCRIPT="${BUILD_SCRIPT:-build}"
MIRROR="${MIRROR:-0}"

# Expand ~ if .env used a literal ~ instead of $HOME.
DEPLOY_TARGET="${DEPLOY_TARGET/#\~/$HOME}"

echo "==> Building (npm run $BUILD_SCRIPT)"
npm run "$BUILD_SCRIPT"

if [ ! -d dist ]; then
  echo "deploy.sh: dist/ missing after build. Aborting." >&2
  exit 1
fi

mkdir -p "$DEPLOY_TARGET"

echo "==> Copying dist/ -> $DEPLOY_TARGET"
if [ "$MIRROR" = "1" ] && command -v rsync >/dev/null 2>&1; then
  rsync -a --delete dist/ "$DEPLOY_TARGET/"
else
  # -R is recursive; trailing /. copies dist's contents (not dist itself).
  cp -R dist/. "$DEPLOY_TARGET/"
fi

if [ -n "${DEPLOY_COMMAND:-}" ]; then
  echo "==> Running deploy command: $DEPLOY_COMMAND"
  # eval so aliases / multi-arg commands work.
  eval "$DEPLOY_COMMAND"
fi

echo "==> Done."
