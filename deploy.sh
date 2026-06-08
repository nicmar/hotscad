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

# Version sanity check: warn if package.json is still on the previously
# released version, because the in-app badge won't change and there's no way
# to verify the new code actually shipped. Set ALLOW_SAME_VERSION=1 to skip.
VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo unknown)"
LAST_TAG="$(git describe --tags --abbrev=0 2>/dev/null || true)"
LAST_TAG_VERSION="${LAST_TAG#v}"

if [ "$VERSION" != "unknown" ] && [ -n "$LAST_TAG_VERSION" ] && [ "$VERSION" = "$LAST_TAG_VERSION" ]; then
  echo ""
  echo "WARNING: package.json is still at v$VERSION, same as the last tag ($LAST_TAG)."
  echo "         The in-app version badge won't change, so you won't be able to"
  echo "         tell whether the new code actually landed on the server."
  echo ""
  echo "         Bump the version first with one of:"
  echo "             npm version patch    # 0.1.0 -> 0.1.1  (bug fixes)"
  echo "             npm version minor    # 0.1.0 -> 0.2.0  (new features)"
  echo "             npm version major    # 0.1.0 -> 1.0.0  (breaking)"
  echo "         Then:  git push --follow-tags"
  echo ""
  if [ "${ALLOW_SAME_VERSION:-0}" = "1" ]; then
    echo "         ALLOW_SAME_VERSION=1 set, continuing anyway."
    echo ""
  elif [ -t 0 ]; then
    read -rp "         Continue anyway? [y/N] " ans
    case "$ans" in
      y|Y|yes|YES) echo "         Continuing." ; echo "" ;;
      *) echo "         Aborted." ; exit 1 ;;
    esac
  else
    echo "         Non-interactive shell, aborting. Set ALLOW_SAME_VERSION=1 to override."
    exit 1
  fi
fi

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

# If the target is itself a git checkout (e.g. a "deploy repo" that the remote
# pulls from), stage everything, commit with the current package.json version,
# and push. Set DEPLOY_PUSH=0 in .env to commit without pushing.
if git -C "$DEPLOY_TARGET" rev-parse --git-dir >/dev/null 2>&1; then
  echo "==> Staging changes in $DEPLOY_TARGET"
  git -C "$DEPLOY_TARGET" add -A
  if git -C "$DEPLOY_TARGET" diff --cached --quiet; then
    echo "    (nothing to commit in $DEPLOY_TARGET)"
  else
    echo "==> Committing as 'deploy v$VERSION'"
    git -C "$DEPLOY_TARGET" commit -m "deploy v$VERSION"
    if [ "${DEPLOY_PUSH:-1}" = "1" ]; then
      echo "==> Pushing $DEPLOY_TARGET"
      git -C "$DEPLOY_TARGET" push
    else
      echo "    (DEPLOY_PUSH=0, skipping push)"
    fi
  fi
else
  echo "    ($DEPLOY_TARGET is not a git repo, skipping commit)"
fi

if [ -n "${DEPLOY_COMMAND:-}" ]; then
  echo "==> Running deploy command: $DEPLOY_COMMAND"
  # eval so aliases / multi-arg commands work.
  eval "$DEPLOY_COMMAND"
fi

echo "==> Done."
