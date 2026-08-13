#!/usr/bin/env bash
# Convert a QuickTime (.mov) screen recording to an optimized animated GIF.
#
# Usage:
#   scripts/mov-to-gif.sh <input.mov> [output.gif] [width] [fps]
#
# Defaults: output.gif = <input>.gif, width = 500, fps = 15

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <input.mov> [output.gif] [width] [fps]" >&2
  exit 1
fi

INPUT="$1"
OUTPUT="${2:-${INPUT%.*}.gif}"
WIDTH="${3:-500}"
FPS="${4:-15}"

if [ ! -f "$INPUT" ]; then
  echo "Input file not found: $INPUT" >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required. Install it with: brew install ffmpeg" >&2
  exit 1
fi

PALETTE="$(mktemp -t mov-to-gif-palette).png"
trap 'rm -f "$PALETTE"' EXIT

echo "Generating palette..."
ffmpeg -y -i "$INPUT" -vf "fps=$FPS,scale=$WIDTH:-1:flags=lanczos,palettegen=stats_mode=diff" "$PALETTE" -loglevel error

echo "Encoding GIF..."
ffmpeg -y -i "$INPUT" -i "$PALETTE" \
  -filter_complex "fps=$FPS,scale=$WIDTH:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" \
  "$OUTPUT" -loglevel error

echo "Wrote $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
