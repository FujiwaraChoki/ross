#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <dmg-path> [<dmg-path> ...]" >&2
  exit 1
fi

: "${APPLE_API_KEY:?APPLE_API_KEY is required}"
: "${APPLE_API_KEY_ID:?APPLE_API_KEY_ID is required}"
: "${APPLE_API_ISSUER:?APPLE_API_ISSUER is required}"

SIGNING_IDENTITY="${APPLE_CODESIGN_IDENTITY:-Developer ID Application: SAMI HINDI (HL34V4TRZ5)}"

for dmg in "$@"; do
  if [ ! -f "$dmg" ]; then
    echo "DMG not found: $dmg" >&2
    exit 1
  fi

  echo "Signing $dmg"
  codesign --force --sign "$SIGNING_IDENTITY" --timestamp "$dmg"

  echo "Submitting $dmg for notarization"
  xcrun notarytool submit "$dmg" \
    --key "$APPLE_API_KEY" \
    --key-id "$APPLE_API_KEY_ID" \
    --issuer "$APPLE_API_ISSUER" \
    --wait

  echo "Stapling $dmg"
  xcrun stapler staple "$dmg"

  echo "Validating $dmg"
  spctl -a -vv -t open --context context:primary-signature "$dmg"
  xcrun stapler validate "$dmg"
done
