// XLAB Beam — phone-as-wand → live beam drawn on the big screen.
// HTTPS static server + WebSocket room relay (phone <-> screen).
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const zlib = require("zlib");
const { WebSocketServer } = require("ws");
const QRCode = require("qrcode");

const PORT = process.env.PORT || 8443;       // HTTPS (phone needs this for motion sensors)
const HTTP_PORT = process.env.HTTP_PORT || 8099; // HTTP (desktop / local preview)
const PUBLIC = path.join(__dirname, "public");

// pick the LAN IP so the QR points somewhere the phone can reach
function lanIP() {
  const os = require("os");
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list) {
      if (ni.family === "IPv4" && !ni.internal) return ni.address;
    }
  }
  return "127.0.0.1";
}
const IP = process.env.HOST_IP || lanIP();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".glb": "model/gltf-binary",
  ".obj": "text/plain; charset=utf-8",
  ".wav": "audio/wav",
  ".json": "application/json",
};

// Text-ish assets worth gzipping (binary like .glb/.png/.wav is already compressed,
// and .wasm is left raw so WebAssembly streaming compilation stays happy).
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".svg", ".json", ".obj"]);

async function handler(req, res) {
  {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // LAN info → so the screen builds a QR that points the phone at the Mac's IP (not localhost)
    if (url.pathname === "/lan") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify({ ip: IP, httpsPort: PORT }));
    }

    // QR endpoint → SVG of any data string
    if (url.pathname === "/qr") {
      try {
        const svg = await QRCode.toString(url.searchParams.get("data") || "", {
          type: "svg",
          margin: 1,
          color: { dark: "#0e0b07", light: "#0000" },
        });
        res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
        return res.end(svg);
      } catch (e) {
        res.writeHead(400);
        return res.end("bad qr");
      }
    }

    // cheap health probe (doesn't touch the filesystem)
    if (url.pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
      return res.end("ok");
    }

    // static — streamed (low memory, never blocks the event loop), gzipped for text,
    // and 304-revalidated so a refresh doesn't re-pull ~13MB of assets.
    let p = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = path.join(PUBLIC, path.normalize(p).replace(/^(\.\.[/\\])+/, ""));
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        return res.end("not found");
      }
      const ext = path.extname(file);
      const lastMod = st.mtime.toUTCString();
      const etag = `"${st.size.toString(16)}-${Math.round(st.mtimeMs).toString(16)}"`;
      // browser already has this exact version → tiny 304, no re-download
      if (req.headers["if-none-match"] === etag || req.headers["if-modified-since"] === lastMod) {
        res.writeHead(304);
        return res.end();
      }
      const headers = {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Last-Modified": lastMod,
        "ETag": etag,
        "Cache-Control": "public, max-age=300, must-revalidate",
      };
      const stream = fs.createReadStream(file);
      stream.on("error", () => { if (!res.headersSent) res.writeHead(500); res.end(); });
      const wantsGzip = /\bgzip\b/.test(req.headers["accept-encoding"] || "");
      if (wantsGzip && COMPRESSIBLE.has(ext)) {
        headers["Content-Encoding"] = "gzip";
        headers["Vary"] = "Accept-Encoding";
        res.writeHead(200, headers);
        stream.pipe(zlib.createGzip()).pipe(res);
      } else {
        headers["Content-Length"] = st.size;
        res.writeHead(200, headers);
        stream.pipe(res);
      }
    });
  }
}

/* -------- servers --------
   CLOUD (deployed): one HTTP server on the platform's $PORT; the host (Fly/Render) terminates real TLS,
   so the public URL is https://reality.xlab.agency. LOCAL (Mac dev): self-signed HTTPS (phone motion
   sensors need a secure context on the LAN) + plain HTTP for desktop preview. */
const CLOUD = !!process.env.CLOUD;
const plain = http.createServer(handler);
let secure = null;
if (!CLOUD) {
  const TLS = {
    key: fs.readFileSync(path.join(__dirname, "key.pem")),
    cert: fs.readFileSync(path.join(__dirname, "cert.pem")),
  };
  secure = https.createServer(TLS, handler);
}

/* ---------------- WebSocket room relay ---------------- */
const rooms = new Map(); // code -> { screen, phones:Set }

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function handleConnection(ws) {
  ws.room = null;
  ws.role = null;
  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === "join") {
      ws.room = String(msg.room || "").toUpperCase();
      ws.role = msg.role === "phone" ? "phone" : "screen";
      if (!rooms.has(ws.room)) rooms.set(ws.room, { screen: null, phones: new Set() });
      const r = rooms.get(ws.room);
      if (ws.role === "screen") { r.screen = ws; for (const p of r.phones) send(p, { type: "screen-here" }); }
      else {
        r.phones.add(ws);
        send(r.screen, { type: "phone-join" }); // tell the screen a wand connected
        send(ws, { type: "ready", screen: !!r.screen }); // tell the phone if a screen is present
      }
      return;
    }

    const r = rooms.get(ws.room);
    if (!r) return;
    // phone -> screen (forward; if no screen, tell the phone so it isn't stuck silently)
    if (ws.role === "phone") { if (r.screen) send(r.screen, msg); else send(ws, { type: "noscreen" }); }
    else for (const p of r.phones) send(p, msg);
  });

  ws.on("close", () => {
    const r = rooms.get(ws.room);
    if (!r) return;
    if (ws.role === "screen") r.screen = null;
    else {
      r.phones.delete(ws);
      send(r.screen, { type: "phone-leave" });
    }
    if (!r.screen && r.phones.size === 0) rooms.delete(ws.room);
  });
}

new WebSocketServer({ server: plain }).on("connection", handleConnection);
if (secure) new WebSocketServer({ server: secure }).on("connection", handleConnection);

if (CLOUD) {
  const port = process.env.PORT || 8080;
  plain.listen(port, "0.0.0.0", () => console.log(`XLAB REALITY (cloud) listening on :${port}`));
} else {
  secure.listen(PORT, "0.0.0.0", () => {
    console.log(`\n  XLAB REALITY running:\n`);
    console.log(`  • Phone (scan target, HTTPS):  https://${IP}:${PORT}/`);
    console.log(`  • Desktop (HTTPS):             https://localhost:${PORT}/`);
  });
  plain.listen(HTTP_PORT, "0.0.0.0", () => {
    console.log(`  • Desktop (HTTP / preview):    http://localhost:${HTTP_PORT}/\n`);
    console.log(`  (self-signed cert — accept the warning once on each device)\n`);
  });
}
