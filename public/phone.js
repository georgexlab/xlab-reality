/* XLAB BEAM — phone (6-DoF). 8th Wall engine binary (SLAM world tracking) drives a three.js
   scene; the squishy X (balloon.js) is anchored IN THE ROOM and flies around it with real
   presence — walk around it, it stays put. Throw balls to smash the desktop glass, then hunt
   the balloon and pop it. XR8 is a global injected by @8thwall/engine-binary. */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { loadBalloon } from "/balloon.js";

window.THREE = THREE; // 8th Wall's XR8.Threejs builds its scene with window.THREE

const $ = (id) => document.getElementById(id);
const room = (new URLSearchParams(location.search).get("room") || "").toUpperCase();
const dot = $("dot"), status = $("status"), prompt = $("prompt");
const fx = $("fx"), fctx = fx.getContext("2d");

/* on-screen debug (so we can read what happens on the real phone) */
const dbg = $("dbg"); const _logs = [];
function log(s) { _logs.push(s); while (_logs.length > 10) _logs.shift(); if (dbg) dbg.textContent = _logs.join("\n"); }
addEventListener("error", (e) => log("ERR " + (e.message || e.error || e)));
addEventListener("unhandledrejection", (e) => log("REJ " + ((e.reason && e.reason.message) || e.reason)));
log("booted");

/* strip 8th Wall branding wherever/whenever it injects it (logo · powered-by · watermark), class names are hashed so
   match by substring/attr; never touches the camera-permission UI (buttons/prompts don't match these selectors) */
const BRAND_SEL = 'a[href*="8thwall" i], img[src*="8thwall" i], img[alt*="8th wall" i], [class*="poweredby" i], [class*="powered-by" i], [class*="-logo-section" i], [class*="watermark" i]';
function killBranding(root) {
  try {
    if (root.nodeType === 1 && root.matches && root.matches(BRAND_SEL)) { root.remove(); return; }
    root.querySelectorAll && root.querySelectorAll(BRAND_SEL).forEach((el) => el.remove());
  } catch {}
}
killBranding(document);
new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) killBranding(n); }))).observe(document.documentElement, { childList: true, subtree: true });

let W = 0, H = 0, dpr = Math.min(devicePixelRatio || 1, 2);
function sizeFX() { W = innerWidth; H = innerHeight; fx.width = W * dpr; fx.height = H * dpr; fctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
addEventListener("resize", sizeFX); sizeFX();

/* ---------------- scene refs (filled in build()) ---------------- */
let scene = null, camera = null, renderer = null, built = false;
let balloon = null, hitSphere = null, rig = null; // rig = outer group we scale/move (keeps balloon's metre-normalization intact)

/* ---------------- game state (metres; 1 unit = 1 m via scale:'absolute') ---------------- */
let phase = "idle";   // idle | incoming | flying | popping | dead
let wantSpawn = false; // set by the WS "spawn" → consumed in tick once the camera is tracking
const anchor = new THREE.Vector3();   // the room point the balloon flies around
let s = 0, sVel = 0, wobbleAmp = 0, wanderT = 0, popClock = 0;
const SPRING_K = 90, SPRING_C = 19;   // pop-in spring (scale 0→1)
let firing = false, locked = false;
const ray = new THREE.Raycaster(); const centre = new THREE.Vector2(0, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _fwd = new THREE.Vector3(), _tap = new THREE.Vector2();
// (swat removed — the balloon just floats in the room with real-world presence; you walk up & shoot it)

/* ---------------- thrown ball (smash the desktop glass) ---------------- */
let ball = null, ballT = 0, ballActive = false; const ballDir = new THREE.Vector3();
function throwBall() {
  if (!ball) return;
  camera.getWorldDirection(ballDir);
  camera.getWorldPosition(ball.position); ball.position.addScaledVector(ballDir, 0.3).y -= 0.12;
  ball.scale.setScalar(1); ball.visible = true; ballActive = true; ballT = 0;
}
function stepBall(dt) {
  if (!ballActive) return;
  ballT += dt;
  ball.position.addScaledVector(ballDir, dt * 7);     // hurls forward (m/s) toward the screen
  ball.position.y += (0.3 - ballT * 1.4) * dt;        // slight arc
  ball.scale.setScalar(Math.max(0.1, 1 - ballT * 1.3));
  if (ballT > 0.5) { ballActive = false; ball.visible = false; }
}

/* ---------------- balloon POP (confetti shreds + shockwave ring), metres ---------------- */
const POP_N = 160; let popPts = null, ring = null, popVel = [], popT = 0;
const POP_COLS = [[0.48, 0.25, 0.94], [0.79, 0.72, 1.0], [1, 1, 1], [0.62, 0.38, 1.0]];
function popBurst(p) {
  if (!popPts) return;
  const pa = popPts.geometry.attributes.position.array, ca = popPts.geometry.attributes.color.array;
  popVel.length = 0;
  for (let i = 0; i < POP_N; i++) {
    pa[i * 3] = p.x; pa[i * 3 + 1] = p.y; pa[i * 3 + 2] = p.z;
    const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1), sp = 0.7 + Math.random() * 1.6;
    popVel.push(new THREE.Vector3(Math.sin(b) * Math.cos(a), Math.sin(b) * Math.sin(a), Math.cos(b)).multiplyScalar(sp));
    const c = POP_COLS[(Math.random() * POP_COLS.length) | 0]; ca[i * 3] = c[0]; ca[i * 3 + 1] = c[1]; ca[i * 3 + 2] = c[2];
  }
  popPts.geometry.attributes.position.needsUpdate = true; popPts.geometry.attributes.color.needsUpdate = true;
  popPts.visible = true; popT = 0; popPts.material.opacity = 1; popPts.material.size = 0.05;
  ring.position.copy(p); ring.quaternion.copy(camera.quaternion); ring.scale.setScalar(0.06); ring.visible = true; ring._t = 0;
}
function stepPop(dt) {
  if (popPts && popPts.visible) {
    popT += dt;
    const pa = popPts.geometry.attributes.position.array;
    for (let i = 0; i < POP_N; i++) { const v = popVel[i]; pa[i * 3] += v.x * dt; pa[i * 3 + 1] += v.y * dt - popT * 0.9 * dt; pa[i * 3 + 2] += v.z * dt; v.multiplyScalar(0.96); }
    popPts.geometry.attributes.position.needsUpdate = true;
    popPts.material.opacity = Math.max(0, 1 - popT / 0.9); popPts.material.size = 0.05 * Math.max(0.25, 1 - popT / 1.1);
    if (popT > 0.9) popPts.visible = false;
  }
  if (ring && ring.visible) {
    ring._t += dt; ring.scale.setScalar(0.06 + ring._t * 2.4); ring.quaternion.copy(camera.quaternion);
    ring.material.opacity = Math.max(0, 0.85 * (1 - ring._t / 0.42));
    if (ring._t > 0.42) ring.visible = false;
  }
}

const deform = (v, tt, rc) => { if (balloon) balloon.deform(v, tt, rc, wobbleAmp); };

/* While throwing, find the on-screen PURPLE balloon in the camera view (sample 8th Wall's rendered
   frame = display coords, so it maps straight to a camera ray). Lock its spot → spawn the AR balloon
   THERE, so it emerges exactly where the screen's balloon was. */
let lastPurpleNDC = null, purpleConf = 0, pframe = 0;
const psamp = document.createElement("canvas"), psctx = psamp.getContext("2d", { willReadFrequently: true });
function detectPurple() {
  try {
    const src = document.getElementById("camerafeed");
    if (!src || !src.width) return;
    const cw = 100, ch = Math.max(1, Math.round((100 * src.height) / src.width));
    psamp.width = cw; psamp.height = ch;
    psctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, cw, ch);
    const d = psctx.getImageData(0, 0, cw, ch).data;
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 4, R = d[i], G = d[i + 1], B = d[i + 2];
      if (B > 100 && B > R * 1.1 && R >= G && (B - G) > 40) { sx += x; sy += y; n++; } // violet: blue-dominant, low green
    }
    if (n > cw * ch * 0.004) { lastPurpleNDC = { x: (sx / n / cw) * 2 - 1, y: -((sy / n / ch) * 2 - 1) }; purpleConf = n; }
    else purpleConf = Math.max(0, purpleConf - 1);
  } catch (e) {}
}

/* place the balloon in the ROOM — where the purple was seen if we have it, else straight ahead */
function doSpawn() {
  camera.getWorldPosition(_v);
  if (lastPurpleNDC && purpleConf > 4) {                 // emerge exactly where the screen's purple balloon was
    ray.setFromCamera(_tap.set(lastPurpleNDC.x, lastPurpleNDC.y), camera);
    _fwd.copy(ray.ray.direction).normalize();
    anchor.copy(_v).addScaledVector(_fwd, 2.0);
    log("spawn @ purple " + lastPurpleNDC.x.toFixed(2) + "," + lastPurpleNDC.y.toFixed(2) + " (conf " + purpleConf + ")");
  } else {                                               // fallback: straight ahead at head height
    camera.getWorldDirection(_fwd); _fwd.y = 0; if (_fwd.lengthSq() < 1e-4) _fwd.set(0, 0, -1); _fwd.normalize();
    anchor.copy(_v).addScaledVector(_fwd, 2.0); anchor.y = Math.max(1.0, Math.min(1.8, _v.y));
    log("spawn @ centre (no purple seen)");
  }
  rig.position.copy(anchor); rig.scale.setScalar(0.001); rig.rotation.set(0, 0, 0);
  rig.visible = true; phase = "incoming";
  s = 0; sVel = 4; wobbleAmp = 0.05; wanderT = 0; deform(0.06, 0, true);
  prompt.textContent = "IT'S IN YOUR ROOM — WALK UP & SHOOT IT";
  $("fire").classList.remove("hidden"); $("release").classList.add("hidden");
  log("spawn · balloon in room @ " + anchor.toArray().map((n) => n.toFixed(1)));
}
function shoot() { phase = "popping"; popClock = 0; wobbleAmp = 0.05; $("fire").classList.add("hidden"); setFire(false); }
function burstNow() {
  phase = "dead";
  rig.getWorldPosition(_v); popBurst(_v);
  rig.visible = false;
  send({ type: "hit" });
  prompt.textContent = "POP! ✦ THROW TO SMASH ANOTHER";
  $("release").classList.remove("hidden");
}

/* ---------------- per-frame game tick (called from the pipeline, BEFORE render) ---------------- */
function tick(dt) {
  if (!built || !balloon) return;
  const tt = performance.now() / 1000;

  if (wantSpawn) { wantSpawn = false; doSpawn(); }

  if (phase === "incoming") {                          // spring the balloon into existence + inflate
    sVel += ((1 - s) * SPRING_K - sVel * SPRING_C) * dt; s += sVel * dt;
    const k = Math.max(0, Math.min(1.2, s));
    rig.scale.setScalar(Math.max(0.001, k));
    deform(Math.max(0, 0.06 + 0.84 * s), tt, true);
    rig.rotation.y += dt * 0.5;
    wobbleAmp *= Math.pow(0.05, dt);
    if (s > 0.92 && Math.abs(sVel) < 0.3) { phase = "flying"; rig.scale.setScalar(1); }
  } else if (phase === "flying") {                      // drifts around the room (world-anchored) + battable
    wanderT += dt;
    const amp = Math.min(1, wanderT / 1.5);             // ease the drift IN from 0 → no jump off the spawn point
    rig.position.set(
      anchor.x + amp * (Math.sin(wanderT * 0.5) * 0.6 + Math.sin(wanderT * 0.23 + 1.1) * 0.3),
      anchor.y + amp * (Math.sin(wanderT * 0.4 + 2.0) * 0.25),
      anchor.z + amp * (Math.sin(wanderT * 0.31 + 0.6) * 0.5 + Math.sin(wanderT * 0.6 + 3.3) * 0.2)
    );
    rig.rotation.y += dt * 0.3;
    deform(0.55 + (Math.sin(tt * 1.3) * 0.5 + 0.5) * 0.05, tt, true);   // it just floats, world-anchored — no swat
  } else if (phase === "popping") {                     // taut over-stretch → BANG
    popClock += dt; const u = Math.min(1, popClock / 0.12);
    deform(0.9 + 1.3 * u, tt, true); rig.scale.setScalar(1 + 0.35 * u);
    if (popClock >= 0.12) burstNow();
  }

  // lock test — raycast the screen centre at the balloon's generous hit proxy
  locked = false;
  if (hitSphere && (phase === "incoming" || phase === "flying")) {
    ray.setFromCamera(centre, camera);
    if (ray.intersectObject(hitSphere, false).length) locked = true;
  }
  if (firing && locked && (phase === "incoming" || phase === "flying")) shoot();

  stepBall(dt);
  stepPop(dt);
  drawFX();
}

/* ---------------- 2D overlay (reticle + laser) ---------------- */
function drawFX() {
  fctx.clearRect(0, 0, W, H);
  if (!built) return;
  const cx = W / 2, cy = H * 0.46;
  // crosshair always on — aim your throws at the glass AND your shots at the balloon
  const col = locked ? "#ff3b1f" : "rgba(239,231,211,0.55)";
  fctx.strokeStyle = col; fctx.lineWidth = 1.6; fctx.shadowColor = "#ff6a1f"; fctx.shadowBlur = locked ? 14 : 0;
  fctx.beginPath(); fctx.arc(cx, cy, locked ? 30 : 24, 0, Math.PI * 2); fctx.stroke();
  fctx.beginPath();
  fctx.moveTo(cx - 42, cy); fctx.lineTo(cx - 16, cy); fctx.moveTo(cx + 16, cy); fctx.lineTo(cx + 42, cy);
  fctx.moveTo(cx, cy - 42); fctx.lineTo(cx, cy - 16); fctx.moveTo(cx, cy + 16); fctx.lineTo(cx, cy + 42);
  fctx.stroke(); fctx.shadowBlur = 0;
  if (firing) {
    const jit = (Math.random() - 0.5) * 6;
    const g = fctx.createLinearGradient(cx, H + 20, cx + jit, cy);
    g.addColorStop(0, "rgba(255,106,31,0)"); g.addColorStop(0.6, "rgba(255,106,31,0.6)"); g.addColorStop(1, "rgba(255,255,255,0.95)");
    fctx.strokeStyle = g; fctx.lineWidth = 5; fctx.lineCap = "round"; fctx.shadowColor = "#ff6a1f"; fctx.shadowBlur = 22;
    fctx.beginPath(); fctx.moveTo(cx, H + 20); fctx.lineTo(cx + jit, cy); fctx.stroke(); fctx.shadowBlur = 0;
  }
}

/* ---------------- build the scene (8th Wall onStart) ---------------- */
function build() {
  const xr = XR8.Threejs.xrScene();
  scene = xr.scene; camera = xr.camera; renderer = xr.renderer;
  try {
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  } catch (e) { log("env FAIL " + (e && e.message || e)); }
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const key = new THREE.DirectionalLight(0xfff0e0, 2.0); key.position.set(3, 6, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff7a30, 1.2); rim.position.set(-4, -1, -3); scene.add(rim);

  // thrown ball
  ball = new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xff6a1f, emissive: 0x812f00, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.1 }));
  ball.visible = false; scene.add(ball);

  // pop fx
  const pg = new THREE.BufferGeometry();
  pg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(POP_N * 3), 3));
  pg.setAttribute("color", new THREE.BufferAttribute(new Float32Array(POP_N * 3), 3));
  popPts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  popPts.visible = false; scene.add(popPts);
  ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 48), new THREE.MeshBasicMaterial({ color: 0xe9d4ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.visible = false; ring._t = 0; scene.add(ring);

  // the balloon (≈0.6 m), anchored in the room when it spawns
  loadBalloon("/models/x.obj", 0.6).then((b) => {
    balloon = b;
    hitSphere = new THREE.Mesh(new THREE.SphereGeometry(b.sphereR * 1.25, 16, 12), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    b.group.add(hitSphere);
    rig = new THREE.Group(); rig.add(b.group); rig.visible = false; scene.add(rig); // scale/move the RIG, not the normalized balloon group
    log("X balloon loaded");
  }).catch((e) => log("OBJ load FAIL " + (e && e.message || e)));

  // camera starts ~1.4 m above the floor (so room heights read right)
  camera.position.set(0, 1.4, 0);
  XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });

  built = true; sizeFX();
  dot.classList.add("live"); status.textContent = "AR LIVE";
  prompt.textContent = room ? "AIM AT THE SCREEN — THROW TO SMASH" : "NO ROOM — REOPEN FROM THE QR";
  log("AR scene built");
}

/* ---------------- websocket (phone ↔ screen relay) ---------------- */
let ws, releaseTimer = null;
function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => { ws.send(JSON.stringify({ type: "join", room, role: "phone" })); log("ws open · room " + room); };
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.type === "ready") { log("ready · screen=" + m.screen); if (built) prompt.textContent = m.screen ? "AIM AT THE SCREEN — THROW TO SMASH" : "WAITING FOR SCREEN…"; }
    else if (m.type === "screen-here") { log("screen linked"); if (built) prompt.textContent = "SCREEN LINKED — THROW TO SMASH"; }
    else if (m.type === "noscreen") { log("NO SCREEN in room"); prompt.textContent = "SCREEN NOT LINKED — refresh the screen page"; }
    else if (m.type === "crack") { log("crack " + m.n + "/" + m.total); prompt.textContent = m.n >= m.total ? "GLASS DOWN! 💥" : "CRACK! " + m.n + "/" + m.total + " — KEEP THROWING"; }
    else if (m.type === "spawn") { log("spawn recv"); prompt.textContent = "RELEASING…"; wantSpawn = true; }
  };
  ws.onclose = () => { status.textContent = built ? "RECONNECTING…" : status.textContent; log("ws closed"); setTimeout(connect, 1000); };
}
connect();
const send = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };

/* ---------------- controls ---------------- */
const fireBtn = $("fire");
const setFire = (v) => { firing = v; fireBtn.classList.toggle("held", v); };
for (const ev of ["touchstart", "mousedown"]) fireBtn.addEventListener(ev, (e) => { setFire(true); e.preventDefault(); }, { passive: false });
for (const ev of ["touchend", "touchcancel", "mouseup", "mouseleave"]) fireBtn.addEventListener(ev, () => setFire(false));
function doThrow() {
  if (!ws || ws.readyState !== 1) { prompt.textContent = "NOT CONNECTED — REOPEN FROM THE QR"; return; }
  if (phase !== "idle" && phase !== "dead") return;
  throwBall();
  if (navigator.vibrate) { try { navigator.vibrate(16); } catch {} }
  setTimeout(() => { send({ type: "throw" }); log("ball hit → crack"); if (navigator.vibrate) { try { navigator.vibrate(12); } catch {} } }, 360);
}
$("release").addEventListener("click", doThrow);

/* ---------------- 8th Wall pipeline ---------------- */
let lastT = performance.now();
const updateModule = () => ({ name: "beam-update", onUpdate: () => { const now = performance.now(); const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; try { tick(dt); } catch (e) { log("TICK ERR " + (e && e.message || e)); } } });
const sceneModule = () => ({
  name: "beam-scene",
  onStart: () => { try { build(); } catch (e) { log("BUILD ERR " + (e && e.message || e)); } },
  // runs AFTER the Threejs render → the camera frame is on the canvas → sample it for the purple lock
  onUpdate: () => { if (built && (phase === "idle" || phase === "dead") && (++pframe % 4 === 0)) detectPurple(); },
});

const onxrloaded = () => {
  log("xr loaded");
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),    // camera feed
    updateModule(),                            // (A) game tick — BEFORE render
    XR8.Threejs.pipelineModule(),              // three.js scene + render
    XR8.XrController.pipelineModule(),         // SLAM 6-DoF world tracking
    LandingPage.pipelineModule(),
    XRExtras.FullWindowCanvas.pipelineModule(),
    XRExtras.Loading.pipelineModule(),
    XRExtras.RuntimeError.pipelineModule(),
    sceneModule(),                             // (B) build scene — AFTER Threejs
  ]);
  XR8.XrController.configure({ scale: "absolute", disableWorldTracking: false }); // 1 unit = 1 m, world-locked
  XR8.run({ canvas: $("camerafeed") });
};
const onReady = () => (window.XRExtras ? XRExtras.Loading.showLoading({ onxrloaded }) : window.XR8 ? onxrloaded() : null);
window.XRExtras ? onReady() : window.addEventListener("xrextrasloaded", onReady);
window.XR8 || window.addEventListener("xrloaded", () => { if (window.XRExtras) onReady(); });
