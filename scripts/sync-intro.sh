#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Sync the XLAB reveal scroller into the live experience (reality.xlab.agency).
# Run this whenever you re-render the reveal in "Video Sequence/XLAB Site/".
#
# THE PROCESS (2 parts):
#   1. FRAMES (your new visuals)  → this script copies BOTH sets (full 1280x720
#      + light 854x480) and pushes them to the Cloudflare CDN
#      (xlab-reveal-frames.pages.dev → /frames + /frames-sm). Live instantly, no Render deploy.
#   2. PAGE (only if you changed the frame COUNT, beat copy/timings, or the ending)
#      → public/index.html's FRAMES constant + beats must be re-merged onto your
#      updated page, preserving the single-page hand-off (the #scroller layer cross-fades
#      into the inlined #breakglass layer; no navigation). See the memory note [[xlab-beam]]
#      for the exact edits. Then commit + push (georgexlab) and Render auto-deploys.
# ---------------------------------------------------------------------------
set -euo pipefail
ORIG="/Users/georgeeid/Downloads/XLAB Memory/Video Sequence/XLAB Site"
BEAM="/Users/georgeeid/Developer/xlab-beam"
DST="$BEAM/public/intro"

[ -d "$ORIG/frames" ] || { echo "❌ original frames not found: $ORIG/frames"; exit 1; }
n_full=$(ls "$ORIG/frames"/*.webp 2>/dev/null | wc -l | tr -d ' ')
n_sm=$(ls "$ORIG/frames-sm"/*.webp 2>/dev/null | wc -l | tr -d ' ')
echo "→ copying frames (full=$n_full, sm=$n_sm) from the original…"
rm -rf "$DST/frames" "$DST/frames-sm"; mkdir -p "$DST/frames" "$DST/frames-sm"
cp "$ORIG/frames/"*.webp "$DST/frames/"
cp "$ORIG/frames-sm/"*.webp "$DST/frames-sm/"

echo "→ deploying BOTH sets to the Cloudflare CDN (dedup skips unchanged)…"
cd "$BEAM"
wrangler pages deploy public/intro --project-name xlab-reveal-frames --branch main --commit-dirty=true

echo "✅ frames live → https://xlab-reveal-frames.pages.dev/frames  (+ /frames-sm)"
page_frames=$(grep -m1 -oE 'const FRAMES = [0-9]+' public/index.html | grep -oE '[0-9]+' || echo '?')
echo "   public/index.html FRAMES=$page_frames · your reveal has $n_full frames."
[ "$page_frames" = "$n_full" ] || echo "   ⚠ counts differ → re-merge index.html (FRAMES + beats), then commit + push."
