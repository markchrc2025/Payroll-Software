#!/usr/bin/env bash
# Fetch a PINNED, CHECKSUM-VERIFIED gitleaks binary (unit 0.9).
#
# Prints the absolute path of the binary on stdout. All progress and error
# chatter goes to stderr, so callers can do:  BIN="$(bash scripts/install-gitleaks.sh)"
#
# WHY A PINNED BINARY AND NOT AN npm DEPENDENCY
#   gitleaks is a Go program. Every npm wrapper for it downloads the same
#   release tarball from a postinstall script — which would put a network fetch
#   inside `npm ci`, i.e. inside the Railpack production build. That is exactly
#   the failure mode unit 0.2 closed off. So the binary is fetched lazily, by the
#   pre-commit hook, on a developer machine only, and never by the build.
#
# WHERE IT LANDS
#   ~/.cache/sentire-gitleaks/<version>/gitleaks  (XDG_CACHE_HOME respected)
#   Outside the repo on purpose: a fresh clone reuses it, and it can never be
#   staged by an over-eager `git add -A` — the very mistake unit 0.8 cleaned up.
set -euo pipefail

GITLEAKS_VERSION="0.0.0-does-not-exist"

# sha256 of the official release tarballs for v8.30.1, taken from
# https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_checksums.txt
# Bump these together with GITLEAKS_VERSION, never separately.
CHECKSUM_linux_x64="551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
CHECKSUM_linux_arm64="e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080"
CHECKSUM_darwin_x64="dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709"
CHECKSUM_darwin_arm64="b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5"

log() { printf '%s\n' "$*" >&2; }

case "$(uname -s)" in
  Linux)  OS="linux" ;;
  Darwin) OS="darwin" ;;
  *) log "install-gitleaks: unsupported OS $(uname -s). Install gitleaks manually and set GITLEAKS_BIN."; exit 1 ;;
esac

case "$(uname -m)" in
  x86_64|amd64)  ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) log "install-gitleaks: unsupported architecture $(uname -m). Install gitleaks manually and set GITLEAKS_BIN."; exit 1 ;;
esac

CACHE_ROOT="${SENTIRE_GITLEAKS_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/sentire-gitleaks}"
DEST_DIR="$CACHE_ROOT/$GITLEAKS_VERSION"
DEST="$DEST_DIR/gitleaks"

# Already installed and runnable? Say so and stop — this is the common path.
if [ -x "$DEST" ] && "$DEST" version >/dev/null 2>&1; then
  printf '%s\n' "$DEST"
  exit 0
fi

ASSET="gitleaks_${GITLEAKS_VERSION}_${OS}_${ARCH}.tar.gz"
URL="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${ASSET}"
eval "EXPECTED=\${CHECKSUM_${OS}_${ARCH}:-}"

if [ -z "$EXPECTED" ]; then
  log "install-gitleaks: no pinned checksum for ${OS}_${ARCH}. Refusing to install an unverified binary."
  exit 1
fi

command -v curl >/dev/null 2>&1 || { log "install-gitleaks: curl is required."; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

log "install-gitleaks: fetching gitleaks ${GITLEAKS_VERSION} (${OS}/${ARCH})…"
if ! curl -fsSL --retry 2 --connect-timeout 10 --max-time 120 -o "$TMP/$ASSET" "$URL"; then
  log "install-gitleaks: download failed (offline?). URL: $URL"
  exit 1
fi

# A secret scanner you did not verify is a supply-chain hole wearing a hi-vis
# vest. Verify before it is ever made executable.
ACTUAL="$(sha256sum "$TMP/$ASSET" 2>/dev/null | awk '{print $1}')"
if [ -z "$ACTUAL" ]; then
  ACTUAL="$(shasum -a 256 "$TMP/$ASSET" | awk '{print $1}')"   # macOS
fi

if [ "$ACTUAL" != "$EXPECTED" ]; then
  log "install-gitleaks: CHECKSUM MISMATCH for $ASSET"
  log "  expected: $EXPECTED"
  log "  actual:   $ACTUAL"
  log "Refusing to install. Do not bypass this."
  exit 1
fi

mkdir -p "$DEST_DIR"
tar xzf "$TMP/$ASSET" -C "$TMP" gitleaks
chmod +x "$TMP/gitleaks"
mv "$TMP/gitleaks" "$DEST"

log "install-gitleaks: installed $("$DEST" version) at $DEST"
printf '%s\n' "$DEST"
