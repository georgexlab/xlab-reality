#!/bin/bash
# XLAB BEAM — start the server + a public Cloudflare tunnel, print the share URL.
cd "$(dirname "$0")"
pkill -f "xlab-beam/server.js" 2>/dev/null; pkill -f "cloudflared tunnel" 2>/dev/null; sleep 1
( node server.js >/tmp/xlab-beam.log 2>&1 & ); sleep 2
nohup cloudflared tunnel --url http://localhost:8099 >/tmp/cf-beam.log 2>&1 &
echo "starting tunnel…"; sleep 9
echo ""; echo "  ▶ SHARE THIS LINK (open on a computer, scan the QR with a phone):"
grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/cf-beam.log | head -1 | sed 's/^/    /'
echo ""; echo "  (keep this Mac awake + this window's processes running while your friend tests)"
