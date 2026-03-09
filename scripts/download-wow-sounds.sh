#!/bin/bash
# Download World of Warcraft sound effects from Wowhead CDN
# Usage: ./scripts/download-wow-sounds.sh

set -e

# Target directory
SFX_DIR="apps/server/public/shared/assets/sfx"
mkdir -p "$SFX_DIR"

# CDN base URL
CDN="https://wow.zamimg.com/wowsounds"

echo "Downloading WoW sound effects..."
echo "Target directory: $SFX_DIR"
echo ""

download_sound() {
  local name="$1"
  local id="$2"
  local url="$CDN/$id.mp3"
  local output="$SFX_DIR/$name.mp3"

  if [[ -f "$output" ]]; then
    echo "  [SKIP] $name.mp3 (already exists)"
  else
    echo "  [GET]  $name.mp3 (ID: $id)"
    if curl -sSfL "$url" -o "$output" 2>/dev/null; then
      echo "         -> Downloaded successfully"
    else
      echo "         -> FAILED (trying .ogg format)"
      # Try OGG format as fallback
      local url_ogg="$CDN/$id.ogg"
      if curl -sSfL "$url_ogg" -o "${output%.mp3}.ogg" 2>/dev/null; then
        echo "         -> Downloaded as .ogg"
      else
        echo "         -> FAILED: Sound ID $id not found"
      fi
    fi
  fi
}

# Tier 1 - Essential
download_sound "dice" 47770
download_sound "turn" 8960
download_sound "build" 4614
download_sound "trade" 120
download_sound "robber" 3325
download_sound "win" 619
download_sound "ui-tick" 11590
download_sound "ui-confirm" 31578
download_sound "ui-bonk" 11903

# Tier 2 - Major Moments
download_sound "dev-card" 1641
download_sound "knight" 13879
download_sound "largest-army" 8233
download_sound "longest-road" 12891
download_sound "event-drawn" 888

# Tier 3 - Polish
download_sound "monopoly" 5274
download_sound "year-of-plenty" 618
download_sound "road-building" 3782
download_sound "steal-success" 13279
download_sound "steal-fail" 56120
download_sound "discard" 7140
download_sound "collect" 1165
download_sound "turn-nudge" 162888
download_sound "event-ended" 7355
download_sound "segment-start" 47615
download_sound "dev-buy" 1209

echo ""
echo "Download complete!"
echo "Files saved to: $SFX_DIR"
ls -la "$SFX_DIR"
