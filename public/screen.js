/* XLAB BEAM — screen = a GLASS DISPLAY CASE. The same squishy X (balloon.js) is trapped
   inside a framed box and physically BOUNCES around — ricocheting off the walls, squashing
   on each hit, bonking the front glass pane. The phone throws balls (relayed): each cracks
   the front glass where the balloon is; enough hits SHATTER it and the balloon RUSHES out
   through a white flash, synced to the phone spawning it in AR. */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { loadBalloon } from "/balloon.js";

const $ = (id) => document.getElementById(id);
const flash = $("flash"), statusLine = $("statusLine");

/* room + QR */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = Array.from({ length: 4 }, () => ALPHABET[(Math.random() * ALPHABET.length) | 0]).join("");
$("code").textContent = code.split("").join(" ");
let qrImg = null;
function setQR(base) { const url = `${base}/phone.html?room=${code}`; $("qr").innerHTML = `<img alt="scan" src="/qr?data=${encodeURIComponent(url)}" />`;
  const im = $("qr").querySelector("img"); im.addEventListener("load", () => { qrImg = im; drawPlacard(); });   // feed the QR into the 3D glass decal
}
setQR(location.origin); // default: same origin — correct for a public/tunnel URL (friend scans → opens the tunnel)
// only when running locally do we redirect the phone to the Mac's LAN IP over HTTPS (same-WiFi)
if (/^(localhost|127\.|0\.0\.0\.0|::1|\[)/.test(location.hostname)) {
  fetch("/lan").then((r) => r.json()).then((d) => { if (d && d.ip) setQR(`https://${d.ip}:${d.httpsPort}`); }).catch(() => {});
}

/* ---------------- three ---------------- */
const renderer = new THREE.WebGLRenderer({ canvas: $("balloon"), alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene();
let bgTex;  // dark case backdrop — nulled during Act 1 (so the title column shows through), restored at the cage
{ // deep-violet backdrop — the transmission glass transmits this → ethereal purple, not a grey film
  const bc = document.createElement("canvas"); bc.width = bc.height = 512;
  const bx = bc.getContext("2d"); const grd = bx.createRadialGradient(256, 210, 20, 256, 256, 470);
  grd.addColorStop(0, "#241252"); grd.addColorStop(0.55, "#110a2e"); grd.addColorStop(1, "#05030f"); bx.fillStyle = grd; bx.fillRect(0, 0, 512, 512);
  bgTex = new THREE.CanvasTexture(bc); bgTex.colorSpace = THREE.SRGBColorSpace; scene.background = bgTex;
}
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100); camera.position.set(0, 0, 3.9); camera.lookAt(0, 0, 0);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.AmbientLight(0x8a7bff, 0.42));                                  // cool violet ambient (raised → even base, box reads enclosed)
const keyL = new THREE.DirectionalLight(0xf3eeff, 1.7); keyL.position.set(2.4, 4, 5); scene.add(keyL);   // cool key (softened, lights the LEFT inner wall)
const rimL = new THREE.DirectionalLight(0x9a78ff, 1.9); rimL.position.set(-3.4, 1.4, 3); scene.add(rimL); // violet — from the LEFT-front so it lights the RIGHT inner wall symmetrically (kills the "open right side")
const fillL = new THREE.DirectionalLight(0x5aa0ff, 0.5); fillL.position.set(0, -2.5, 4); scene.add(fillL); // faint techy cyan fill from the front

/* ---------------- ethereal haze: violet motes REVEALED as we climb to them (not a constant field) ---------------- */
const PCOUNT = 340, PVOL = { x: 3.4, y0: -6.0, y1: 2.6, z: 2.4 };   // start ABOVE the phone → clean launch, motes discovered as we climb into them
const pPos = new Float32Array(PCOUNT * 3), pSpd = new Float32Array(PCOUNT), pPh = new Float32Array(PCOUNT);
for (let i = 0; i < PCOUNT; i++) {
  pPos[i * 3] = (Math.random() * 2 - 1) * PVOL.x;
  pPos[i * 3 + 1] = PVOL.y0 + Math.random() * (PVOL.y1 - PVOL.y0);
  pPos[i * 3 + 2] = (Math.random() * 2 - 1) * PVOL.z;
  pSpd[i] = 0.1 + Math.random() * 0.22; pPh[i] = Math.random() * 6.28;
}
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
const pSprite = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, "rgba(210,185,255,1)"); rg.addColorStop(0.35, "rgba(150,110,255,0.55)"); rg.addColorStop(1, "rgba(120,80,255,0)");
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64); const tx = new THREE.CanvasTexture(c); return tx; })();
const pUniforms = { uCamY: { value: -10.8 } };
const pMat = new THREE.PointsMaterial({ size: 0.13, map: pSprite, transparent: true, opacity: 0.58, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
pMat.onBeforeCompile = (sh) => {                  // each mote fades in only once the camera has risen to within ~3 units below it
  sh.uniforms.uCamY = pUniforms.uCamY;
  sh.vertexShader = sh.vertexShader
    .replace("void main() {", "uniform float uCamY;\nvarying float vReveal;\nvoid main() {")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\n vReveal = smoothstep(position.y - 3.2, position.y - 0.6, uCamY);");
  sh.fragmentShader = sh.fragmentShader
    .replace("void main() {", "varying float vReveal;\nvoid main() {")
    .replace("#include <map_particle_fragment>", "#include <map_particle_fragment>\n diffuseColor.a *= vReveal;");
};
const particles = new THREE.Points(pGeo, pMat);
particles.frustumCulled = false; scene.add(particles);
function updateParticles(dt) {
  const f = dt / FRAME;
  pUniforms.uCamY.value = camera.position.y;
  const a = pGeo.attributes.position.array;
  for (let i = 0; i < PCOUNT; i++) {
    a[i * 3 + 1] += pSpd[i] * dt;                                      // drift up slowly (everything floats — dreamy)
    a[i * 3] += Math.sin(t * 0.25 + pPh[i]) * 0.0006 * f;             // gentle lateral sway
    if (a[i * 3 + 1] > PVOL.y1) { a[i * 3 + 1] = PVOL.y0; a[i * 3] = (Math.random() * 2 - 1) * PVOL.x; a[i * 3 + 2] = (Math.random() * 2 - 1) * PVOL.z; }
  }
  pGeo.attributes.position.needsUpdate = true;
}

const glass = $("glass"), gx = glass.getContext("2d");
let W = 0, H = 0;
function resize() { W = innerWidth; H = innerHeight; renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix(); glass.width = W; glass.height = H; }
addEventListener("resize", resize); resize();

/* ---------------- the glass display case ---------------- */
const HX = 1.4, HY = 1.05, HZ = 1.3;          // box half-extents (deeper Z → more visible depth travel; front glass at z=+HZ)
const caseGroup = new THREE.Group(); scene.add(caseGroup);
const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a140d, metalness: 0.7, roughness: 0.34, envMapIntensity: 1.0 });
const FW = 0.05;
function bar(x, y, z, w, h, d) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat); m.position.set(x, y, z); caseGroup.add(m); }
for (const sy of [-HY, HY]) for (const sz of [-HZ, HZ]) bar(0, sy, sz, 2 * HX + FW, FW, FW);   // 4 along X
for (const sx of [-HX, HX]) for (const sz of [-HZ, HZ]) bar(sx, 0, sz, FW, 2 * HY + FW, FW);   // 4 along Y
for (const sx of [-HX, HX]) for (const sy of [-HY, HY]) bar(sx, sy, 0, FW, FW, 2 * HZ + FW);   // 4 along Z (depth)
// dark back wall (enclosed case with depth). The BOTTOM is OPEN — the balloon flew up in through it and is trapped by buoyancy.
const wallMat = new THREE.MeshStandardMaterial({ color: 0x130c28, metalness: 0.2, roughness: 0.85, side: THREE.DoubleSide });   // dark VIOLET interior (on-theme, reads as a surface so the box looks enclosed)
const back = new THREE.Mesh(new THREE.PlaneGeometry(2 * HX, 2 * HY), wallMat); back.position.set(0, 0, -HZ); caseGroup.add(back);
// frosted-glass helpers
function frostTex() { // grainy noise → roughnessMap, so the frost has texture (the reference's "Noise")
  const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d"), im = x.createImageData(256, 256);
  for (let i = 0; i < im.data.length; i += 4) { const v = 150 + Math.random() * 105; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4); return t;
}
function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return new THREE.ShapeGeometry(s, 16);
}
// FROSTED milky glass — high-roughness transmission so what's behind blooms soft + diffuse (Spline-glass look)
const frost = frostTex();
const glassMat = new THREE.MeshPhysicalMaterial({
  transmission: 1.0, thickness: 1.6, roughness: 0.52, roughnessMap: frost, ior: 1.5, metalness: 0.0,
  clearcoat: 1.0, clearcoatRoughness: 0.25, reflectivity: 0.5, envMapIntensity: 0.6,
  color: 0xc9beff, transparent: true, side: THREE.DoubleSide,                 // violet-tinted frost (ethereal, not white-milky)
});
// FRESNEL — grazing edges glow violet (the frosted signature, dialed cooler so it reads purple not white)
glassMat.onBeforeCompile = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <emissivemap_fragment>",
    `#include <emissivemap_fragment>
     float fres = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.2);
     totalEmissiveRadiance += vec3(0.46, 0.34, 0.95) * fres * 1.7;`
  );
};
const glassPane = new THREE.Mesh(roundedRect(2 * HX, 2 * HY, 0.34), glassMat);  // rounded-corner frosted panel
glassPane.position.set(0, 0, HZ); caseGroup.add(glassPane);
// solid dark enclosing walls (top/left/right) — these were glass (to force Fresnel), but the frosted
// FRONT pane carries the look now, so dark sides keep the case clean (no blown-out bright panel).
function sideWall(px, py, pz, w, h, rx, ry) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat); m.position.set(px, py, pz); m.rotation.set(rx, ry, 0); caseGroup.add(m); return m; }
sideWall(0, HY, 0, 2 * HX, 2 * HZ, Math.PI / 2, 0);    // top
sideWall(-HX, 0, 0, 2 * HZ, 2 * HY, 0, Math.PI / 2);   // left
sideWall(HX, 0, 0, 2 * HZ, 2 * HY, 0, Math.PI / 2);    // right

/* ===== "IN CASE OF EMERGENCY — BREAK GLASS" placard, drawn as a flat decal ON the front pane (tracks the case, always there) ===== */
const placCv = document.createElement("canvas"); placCv.width = 720; placCv.height = 920;
const pg = placCv.getContext("2d");
const placTex = new THREE.CanvasTexture(placCv); placTex.colorSpace = THREE.SRGBColorSpace; placTex.anisotropy = 8;
function drawPlacard() {
  const W2 = 720, H2 = 920; pg.clearRect(0, 0, W2, H2);
  pg.fillStyle = "rgba(12,6,26,0.16)"; pg.fillRect(0, 0, W2, H2);                          // faint ink wash so the print reads on the frost
  pg.strokeStyle = "#ff453a"; pg.lineWidth = 7; pg.strokeRect(10, 10, W2 - 20, H2 - 20);   // red safety border
  // hazard ribbon (diagonal red stripes on dark)
  const ry = 24, rh = 58;
  pg.save(); pg.beginPath(); pg.rect(14, ry, W2 - 28, rh); pg.clip();
  pg.fillStyle = "#160510"; pg.fillRect(14, ry, W2 - 28, rh);
  pg.fillStyle = "#ff453a";
  for (let x = -rh; x < W2 + rh; x += 40) { pg.beginPath(); pg.moveTo(x, ry); pg.lineTo(x + 20, ry); pg.lineTo(x + 20 - rh, ry + rh); pg.lineTo(x - rh, ry + rh); pg.closePath(); pg.fill(); }
  pg.restore();
  // red label box over the stripes
  pg.font = "800 22px 'JetBrains Mono', monospace"; pg.textAlign = "center"; pg.textBaseline = "middle";
  const lbl = "⚠ IN CASE OF EMERGENCY ⚠", lw = pg.measureText(lbl).width + 42;
  pg.fillStyle = "#ff453a"; pg.fillRect((W2 - lw) / 2, ry + 10, lw, rh - 20);
  pg.fillStyle = "#15030b"; pg.fillText(lbl, W2 / 2, ry + rh / 2 + 1);
  // BREAK THE GLASS
  pg.textBaseline = "alphabetic"; pg.fillStyle = "#fff"; pg.shadowColor = "rgba(185,150,255,0.6)"; pg.shadowBlur = 28;
  pg.font = "900 90px Archivo, system-ui, sans-serif"; pg.fillText("BREAK", W2 / 2, 218); pg.fillText("THE GLASS", W2 / 2, 304); pg.shadowBlur = 0;
  // sub-line
  pg.fillStyle = "#d9b6ff"; pg.font = "700 18px 'JetBrains Mono', monospace"; pg.fillText("SCAN · THROW TO SMASH · SET THE X FREE", W2 / 2, 352);
  // QR + strike-zone corner brackets
  const qs = 300, qx = (W2 - qs) / 2, qy = 404;
  pg.fillStyle = "#efe7d3"; pg.fillRect(qx, qy, qs, qs);
  if (qrImg && qrImg.complete && qrImg.naturalWidth) pg.drawImage(qrImg, qx + 20, qy + 20, qs - 40, qs - 40);
  pg.strokeStyle = "#ff453a"; pg.lineWidth = 8; const bl = 36, o = 16;
  pg.beginPath(); pg.moveTo(qx - o, qy - o + bl); pg.lineTo(qx - o, qy - o); pg.lineTo(qx - o + bl, qy - o); pg.stroke();
  pg.beginPath(); pg.moveTo(qx + qs + o, qy + qs + o - bl); pg.lineTo(qx + qs + o, qy + qs + o); pg.lineTo(qx + qs + o - bl, qy + qs + o); pg.stroke();
  // room code
  pg.fillStyle = "#ff8a5a"; pg.font = "800 30px 'JetBrains Mono', monospace"; pg.fillText(code.split("").join("  "), W2 / 2, qy + qs + 74);
  placTex.needsUpdate = true;
}
const PLAC_W = 1.5, PLAC_H = PLAC_W * (920 / 720);
const placard = new THREE.Mesh(new THREE.PlaneGeometry(PLAC_W, PLAC_H), new THREE.MeshBasicMaterial({ map: placTex, transparent: true, depthWrite: false, toneMapped: false }));
placard.position.set(0, 0, HZ + 0.025); placard.renderOrder = 7; caseGroup.add(placard);   // on the OUTER face of the frosted pane → crisp printed ink
drawPlacard();
if (document.fonts) document.fonts.ready.then(drawPlacard);   // redraw once the brand fonts are in

// scale the whole case so the frosted front pane FILLS the viewport (reaches the corners) on any aspect;
// counter-scale the placard so it keeps its true size, and widen the balloon's drift bounds to match.
function fitCase() {
  const dist = 3.9 - HZ;                                          // caged camera (z=3.9) → front pane
  const halfH = dist * Math.tan((45 * Math.PI / 180) / 2);
  const halfW = halfH * (W / H || 1);
  const ov = 1.06;                                                // slight overfill so it reaches the corners
  caseFx = Math.max(1, (halfW * ov) / HX); caseFy = Math.max(1, (halfH * ov) / HY);
  caseGroup.scale.set(caseFx, caseFy, 1);
  placard.scale.set(1 / caseFx, 1 / caseFy, 1);                  // keep the printed placard its true size + undistorted
  BX = HX * caseFx - R; BY = HY * caseFy - R;                    // balloon drifts within the widened case
}
addEventListener("resize", fitCase);   // first actual call comes from startIntro/enterCaged (after BX/BY/caseFx are initialized)

/* ---------------- the balloon (bounces inside) ---------------- */
const rig = new THREE.Group(); scene.add(rig);
let bal = null;
const R = 0.6, BZ = HZ - R; let BX = HX - R, BY = HY - R, caseFx = 1, caseFy = 1;   // travel bounds (box minus balloon radius); caseFx/Fy = fill-the-viewport scale
const sq = new THREE.Vector3(0, 0, 0);                  // squash scale offsets
let phase = 0, glassPress = 0, pressX = 0.5, pressY = 0.46, driftRamp = 0;
const WORLD_SIZE = 1.1;
loadBalloon("/models/x.obj", WORLD_SIZE).then((b) => {
  bal = b; b.mesh.material.emissive = new THREE.Color(0x5a2fd6); b.mesh.material.emissiveIntensity = 0.28;
  b.mesh.material.transparent = true;                 // crossfade in as it emerges from the screen icon
  rig.add(b.group);
  // the same X (shared geo) rendered FLAT into the phone screen, in the top-left tile
  rtBalloon = new THREE.Mesh(b.geo, b.mesh.material.clone());
  rtBalloon.material.transparent = true;
  rtBalloon.scale.setScalar((ICON_FRAC * RT_W * 0.78) / (2 * b.R0));
  rtBalloon.position.set(ICON_U * RT_W, ICON_V * RT_H, 0); rtScene.add(rtBalloon);
  // balloon scale = WORLD_SIZE * rig.scale, so derive icon/out rig-scales from the desired world diameters
  UNI0 = (ICON_FRAC * P_SCREEN_W * 0.78) / WORLD_SIZE;   // icon-sized
  OUT_UNI = (0.72 * P_SCREEN_W) / WORLD_SIZE;            // floated-out size
  startIntro();
}).catch(() => { statusLine.textContent = "BALLOON LOAD ERROR"; });

// IDLE — smooth 3D Lissajous drift: summed incommensurate low-freq sines → analytically smooth
// velocity (never jerky), real depth (Z) travel, periods ~5–27s (heavy floaty balloon). A slow sin³
// envelope occasionally eases it UP to press the front glass (the trapped vibe), then peels off.
function physics(dt) {
  const f = dt / FRAME;
  phase += dt;
  driftRamp = Math.min(1, driftRamp + dt / 1.8); const dr = smooth(driftRamp);   // ease the drift IN from origin (no jump out of the climb's resting spot)
  const px = BX * (0.55 * Math.sin(0.37 * phase) + 0.30 * Math.sin(0.83 * phase + 1.7) + 0.15 * Math.sin(1.27 * phase + 4.1));
  const py = BY * (0.50 * Math.sin(0.29 * phase + 2.3) + 0.32 * Math.sin(0.61 * phase + 5.0) + 0.18 * Math.sin(1.07 * phase + 0.6));
  let pz = BZ * (0.45 * Math.sin(0.23 * phase + 1.1) + 0.30 * Math.sin(0.53 * phase + 3.4));
  const pressEnv = Math.max(0, Math.sin(0.18 * phase - 0.5)), pe = pressEnv * pressEnv * pressEnv;
  pz = lerp(pz, BZ * 0.99, pe * 0.9);                   // eases up to kiss the pane, then smoothly peels off
  rig.position.set(px * dr, py * dr, pz * dr);
  glassPress = Math.max(0, Math.min(1, (rig.position.z - BZ * 0.5) / (BZ * 0.49)));
  if (glassPress > 0.04) { const v = rig.position.clone().project(camera); pressX = (v.x * 0.5 + 0.5) * W; pressY = (-v.y * 0.5 + 0.5) * H; }
  sq.lerp(new THREE.Vector3(0.1 * glassPress, 0.1 * glassPress, -0.2 * glassPress), 1 - Math.pow(1 - 0.18, f)); // flattens its face on the pane (frame-rate-independent smoothing)
  rig.scale.set(1 + sq.x, 1 + sq.y, 1 + sq.z);
  rig.rotation.x += 0.0028 * f; rig.rotation.y += 0.0045 * f; rig.rotation.z += 0.0015 * f;
}

/* ===================== ONE VERTICAL JOURNEY: phone (bottom) → rise past the titles → up into the
   open-bottomed glass case (top). The squishy emerge feel is kept verbatim, but the whole thing is
   re-laid into Beam's clean frame: camera looks -Z, +Y up; the phone is reoriented to face the camera
   and placed below; the case stays at the ORIGIN (so the proven caged/Act-3 code is untouched). */
const P_CENTER = new THREE.Vector3(0.587, 0.122, 0.407);               // squishy's measured screen frame (GLB native space) — used ONLY to reorient the GLB
const P_NORMAL = new THREE.Vector3(-0.622, 0.068, 0.78).normalize();
const P_UP0    = new THREE.Vector3(0.233, 0.967, 0.102).normalize();
const P_RIGHT  = new THREE.Vector3().crossVectors(P_UP0, P_NORMAL).normalize();
const P_UP     = new THREE.Vector3().crossVectors(P_NORMAL, P_RIGHT).normalize();
const P_SCREEN_W = 0.89, P_SCREEN_H = 1.88;
const P_QUAT   = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(P_RIGHT, P_UP, P_NORMAL));
const Q_FIX    = P_QUAT.clone().invert();          // rotation that turns the GLB so its screen faces +Z and up = +Y
const CAM_Z = 3.9;                                  // camera distance (frames a ~2.1-tall subject at FOV45)
const PHONE_Y = -9.5;                               // phone sits this far below the case (= the rise height; long, dreamy climb with room for the titles)
const Z_AXIS = new THREE.Vector3(0, 0, 1), IDENT_Q = new THREE.Quaternion();
const SCREEN_C = new THREE.Vector3(0, PHONE_Y, 0);                      // phone screen centre, clean frame
const ICON_U = -0.275, ICON_V = 0.345, ICON_FRAC = 0.21;               // home-screen tile (top-left)
const ICON_POS = new THREE.Vector3(ICON_U * P_SCREEN_W, PHONE_Y + ICON_V * P_SCREEN_H, 0.012);   // the X icon, in front of the screen
const ICON_CX = (ICON_U + 0.5) * 512, ICON_CY = (0.5 - ICON_V) * 1024, ICON_TILE = ICON_FRAC * 512;
const PA = P_CENTER.clone(), PB = new THREE.Vector3(-0.388, -0.172, 0.055);   // split the two-phone model, hide the back one (native space)
const P_SPLIT_M = PA.clone().add(PB).multiplyScalar(0.5), P_SPLIT_AX = PA.clone().sub(PB);
const E_IN  = ICON_POS.clone();                                        // balloon resting in the icon tile
const E_OUT = new THREE.Vector3(0, PHONE_Y - 0.05, 0.6);               // blown out, floating in front of the phone
const CASE_C = new THREE.Vector3(0, 0, 0);                             // its final home — inside the case at the top

let phoneGroup = null, phoneBaseP = new THREE.Vector3(), screenImg = null, screenImgBase = null, rtBalloon = null;

function roundRectC(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function makeScreenTexture() {     // dark home screen: wallpaper + status bar + glowing XLAB app tile
  const c = document.createElement("canvas"); c.width = 512; c.height = 1024; const g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 1024); bg.addColorStop(0, "#171132"); bg.addColorStop(0.5, "#0c0a1d"); bg.addColorStop(1, "#070512");
  g.fillStyle = bg; g.fillRect(0, 0, 512, 1024);
  g.fillStyle = "rgba(255,255,255,0.92)"; g.textBaseline = "middle"; g.textAlign = "left"; g.font = "600 27px -apple-system, system-ui, sans-serif"; g.fillText("9:41", 44, 50);
  g.strokeStyle = "rgba(255,255,255,0.8)"; g.lineWidth = 2.5; roundRectC(g, 432, 40, 30, 16, 4); g.stroke();
  g.fillStyle = "rgba(255,255,255,0.85)"; g.fillRect(464, 45, 3, 6); g.fillRect(435, 43, 21, 10);
  const rg = g.createRadialGradient(ICON_CX, ICON_CY, 6, ICON_CX, ICON_CY, ICON_TILE * 0.95);
  rg.addColorStop(0, "rgba(140,95,255,0.55)"); rg.addColorStop(0.6, "rgba(90,60,180,0.14)"); rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg; g.fillRect(ICON_CX - ICON_TILE, ICON_CY - ICON_TILE, ICON_TILE * 2, ICON_TILE * 2);
  const tx = ICON_CX - ICON_TILE / 2, ty = ICON_CY - ICON_TILE / 2; roundRectC(g, tx, ty, ICON_TILE, ICON_TILE, ICON_TILE * 0.26);
  const tg = g.createLinearGradient(tx, ty, tx, ty + ICON_TILE); tg.addColorStop(0, "rgba(58,42,108,0.6)"); tg.addColorStop(1, "rgba(22,16,44,0.6)");
  g.fillStyle = tg; g.fill(); g.strokeStyle = "rgba(255,255,255,0.14)"; g.lineWidth = 2; g.stroke();
  g.fillStyle = "rgba(255,255,255,0.95)"; g.textAlign = "center"; g.font = "600 26px -apple-system, system-ui, sans-serif"; g.fillText("XLAB", ICON_CX, ICON_CY + ICON_TILE / 2 + 30);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
// render-to-texture: the flat deflated X as live on-screen content; the 3D balloon crossfades in as it emerges
const RT = new THREE.WebGLRenderTarget(560, 1180, { samples: 4 }); RT.texture.colorSpace = THREE.SRGBColorSpace;
const rtScene = new THREE.Scene(); rtScene.environment = scene.environment; rtScene.add(new THREE.AmbientLight(0x404060, 0.7));
{ const k = new THREE.DirectionalLight(0xffffff, 2.4); k.position.set(1.2, 1.8, 2.5); rtScene.add(k); }
const RT_W = 1.0, RT_H = RT_W * (P_SCREEN_H / P_SCREEN_W);
const rtBg = new THREE.Mesh(new THREE.PlaneGeometry(RT_W, RT_H), new THREE.MeshBasicMaterial({ map: makeScreenTexture() }));
rtBg.material.map.colorSpace = THREE.SRGBColorSpace; rtBg.position.z = -1; rtScene.add(rtBg);
const rtCam = new THREE.OrthographicCamera(-RT_W / 2, RT_W / 2, RT_H / 2, -RT_H / 2, 0.01, 10); rtCam.position.set(0, 0, 3); rtCam.lookAt(0, 0, 0);

function loadPhone() {
  const draco = new DRACOLoader().setDecoderPath("/vendor/draco/");   // decode the draco-compressed (1MB) phone model
  new GLTFLoader().setDRACOLoader(draco).load("/models/iphone-opt.glb", (gltf) => {
    phoneGroup = gltf.scene; phoneGroup.updateWorldMatrix(true, true);
    const toRemove = []; let wallpaper = null;
    phoneGroup.traverse((o) => {
      if (!o.isMesh) return;
      const wc = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
      if (wc.clone().sub(P_SPLIT_M).dot(P_SPLIT_AX) <= 0) { toRemove.push(o); return; }   // drop the back-display phone
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      if (mat && /WALLPAPER/i.test(mat.name)) wallpaper = o;
    });
    toRemove.forEach((o) => o.parent && o.parent.remove(o));
    // reorient the GLB into the clean frame (screen → +Z, up → +Y) and drop it below the case
    phoneGroup.quaternion.copy(Q_FIX);
    phoneGroup.position.copy(SCREEN_C).sub(P_CENTER.clone().applyQuaternion(Q_FIX));
    phoneGroup.updateWorldMatrix(true, true); phoneBaseP.copy(phoneGroup.position);
    scene.add(phoneGroup);
    if (wallpaper) {                          // live screen image sits just in front of the glass, exact display shape
      wallpaper.material = new THREE.MeshBasicMaterial({ color: 0x05050b });
      const og = wallpaper.geometry.clone(); og.computeBoundingBox();
      const bb = og.boundingBox, p = og.attributes.position, w = bb.max.x - bb.min.x, h = bb.max.y - bb.min.y, uv = [];
      for (let i = 0; i < p.count; i++) uv.push((p.getX(i) - bb.min.x) / w, (p.getY(i) - bb.min.y) / h);
      og.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3(); wallpaper.matrixWorld.decompose(wp, wq, ws);
      screenImg = new THREE.Mesh(og, new THREE.MeshBasicMaterial({ map: RT.texture, toneMapped: false, side: THREE.DoubleSide, transparent: true }));
      screenImg.position.copy(wp); screenImg.quaternion.copy(wq); screenImg.scale.copy(ws);
      screenImg.position.addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(wq), 0.004);
      screenImg.renderOrder = 5; scene.add(screenImg); screenImgBase = screenImg.position.clone();
    }
    setPhoneVisible(state === "act1");        // if the intro already started (balloon loaded first), show now
  }, undefined, () => { /* phone load failed — the emerge still runs without the prop */ });
}
loadPhone();

function setPhoneVisible(v) { if (phoneGroup) phoneGroup.visible = v; if (screenImg) screenImg.visible = v; }
function fadePhone(a) {        // graceful power-down as the balloon rises (so it never reads as "falling")
  a = Math.max(0, Math.min(1, a));
  if (phoneGroup) phoneGroup.traverse((o) => { if (o.isMesh && o.material) { o.material.transparent = true; o.material.opacity = a; } });
  if (screenImg) screenImg.material.opacity = a;
  setPhoneVisible(a > 0.01);
}

/* ===================== ACT 1 (phone-emerge + fly-up "site") → ACT 2 (into the glass case) ===================== */
// The titles live UP in the world as real 3D text planes (not a DOM overlay). Each is pinned to a world
// height between the phone and the case, so as the camera pans up the balloon genuinely rises to each one
// and passes IN FRONT of it. World-anchored = it reads as "things that were up there," exactly as asked.
// AR-services demo copy — the story of what XLAB does, told as the X rises (3D → life → your world → brand)
const TITLE_TXT = ["we design in 3D", "we bring it to life", "we place it in your world", "this is XLAB reality"];
const TITLE_YS = [-7.0, -5.1, -3.3, -1.6];          // low→high: line 1 sits a clear climb ABOVE the phone, … line 4 just below the case
let titleFade = 1;
const titleMeshes = TITLE_TXT.map((txt, i) => {
  const c = document.createElement("canvas"); c.width = 1024; c.height = 256;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 1.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  m.position.set(0, TITLE_YS[i], -0.4); m.renderOrder = 2; scene.add(m);   // z behind the balloon's path → balloon passes in front
  m.userData.draw = () => {
    const g = c.getContext("2d"); g.clearRect(0, 0, 1024, 256);
    let fs = 96; const setF = () => g.font = `italic 800 ${fs}px Archivo, system-ui, sans-serif`;
    setF(); while (g.measureText(txt).width > 952 && fs > 38) { fs -= 4; setF(); }   // auto-fit any copy length (no clipping)
    g.textAlign = "center"; g.textBaseline = "middle"; g.shadowColor = "rgba(150,110,255,0.95)"; g.shadowBlur = 38;
    g.fillStyle = "#efe9ff"; g.fillText(txt, 512, 134); g.fillText(txt, 512, 134);   // 2× pass = stronger violet glow
    tex.needsUpdate = true;
  };
  m.userData.draw();
  return m;
});
if (document.fonts) document.fonts.ready.then(() => titleMeshes.forEach((m) => m.userData.draw()));   // redraw once the brand font loads
function layoutTitles(reveal) {
  for (let i = 0; i < titleMeshes.length; i++) {
    if (!reveal) { titleMeshes[i].material.opacity = 0; continue; }
    const d = Math.abs(TITLE_YS[i] - camera.position.y) / 1.6;   // brightest as the camera (and balloon) reach this height
    titleMeshes[i].material.opacity = smooth(1 - d) * titleFade;  // smooth ease in/out (fades up from 0 as the balloon rises to it — never just "appears")
  }
}
const CAM_HOME = new THREE.Vector3(0, 0, CAM_Z), camTgt = new THREE.Vector3();
// emerge spring + fly-up state
let s = 0, sVel = 0, sTarget = 0, outState = false, prevS = 0, wobbleAmp1 = 0;
let flying = false, riseP1 = 0, rise1 = 0, floatT1 = 0, yaw = 0;
let UNI0 = 0.13, OUT_UNI = 0.58;
const EM_K = 220;                                   // emerge spring stiffness (underdamped → squishy overshoot)
const FLOAT_DELAY = 1.1;                            // hover beat after release before it floats up
const FLY_DUR = 26.0;                               // seconds to drift all the way up into the case — very slow, strolling, takes its sweet time
const eInOut = (a) => a < 0.5 ? 4 * a * a * a : 1 - Math.pow(-2 * a + 2, 3) / 2;
const eOut = (a) => 1 - Math.pow(1 - a, 3);
const smooth = (a) => (a <= 0 ? 0 : a >= 1 ? 1 : a * a * (3 - 2 * a));
const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
// constant-velocity "stroll": eases in/out at the ends but holds a steady pace in the middle (no S-curve rush)
const stroll = (p) => { if (p <= 0) return 0; if (p >= 1) return 1; const a = 0.18, v = 1 / (1 - a); return p < a ? v * p * p / (2 * a) : p > 1 - a ? 1 - v * (1 - p) * (1 - p) / (2 * a) : v * (p - a / 2); };

function startIntro() {                              // the experience opens here (after the balloon loads)
  state = "act1";
  s = 0; sVel = 0; sTarget = 0; outState = false; prevS = 0; wobbleAmp1 = 0;
  flying = false; riseP1 = 0; rise1 = 0; floatT1 = 0; yaw = 0; driftRamp = 0;
  scene.background = bgTex; caseGroup.visible = true; fitCase(); setPhoneVisible(true); fadePhone(1);   // dark bg the WHOLE time (3D titles/particles render over it) → no mid-climb scene-change cut
  document.body.classList.add("intro"); titleFade = 1; layoutTitles(false);
  rig.visible = true; rig.quaternion.copy(IDENT_Q); rig.position.copy(E_IN); rig.scale.setScalar(UNI0);
  if (bal) { bal.mesh.material.transparent = true; bal.mesh.material.opacity = 0; bal.mesh.material.needsUpdate = true; bal.deform(0.06, t, true, 0); }   // born as the flat screen icon (crossfades in)
  if (rtBalloon) rtBalloon.material.opacity = 1;
  camera.up.set(0, 1, 0); camera.fov = 45; camera.position.set(0, PHONE_Y, CAM_Z); camera.lookAt(0, PHONE_Y, 0); camera.updateProjectionMatrix();
  statusLine.textContent = "TAP THE X TO RELEASE IT";
}

function act1Tick(dt) {
  // emerge is triggered by TAPPING the icon (see the pointer handler) — no auto-emerge
  const Cd = outState ? 9.5 : 17;                    // bouncy out, settling in
  sVel += ((sTarget - s) * EM_K - sVel * Cd) * dt; s += sVel * dt;
  if (prevS < 0.08 && s >= 0.08 && outState) wobbleAmp1 = 0.06;   // breach → jelly kick
  prevS = s;
  const k = clamp01(s), inflate = Math.max(0, lerp(0.06, 0.9, s));
  const idleBreath = outState ? (Math.sin(t * 0.9) * 0.5 + 0.5) * 0.04 : (Math.sin(t * 1.4) * 0.5 + 0.5) * 0.03;
  const animating = Math.abs(sVel) > 0.02 || (s > 0.001 && s < 0.999) || wobbleAmp1 > 0.001;
  if (bal) bal.deform(inflate + idleBreath, t, animating, wobbleAmp1);
  wobbleAmp1 *= Math.pow(0.06, dt);
  const xf = smooth((s - 0.05) / 0.13);             // crossfade flat icon → 3D balloon
  if (bal) { bal.mesh.visible = xf > 0.001; bal.mesh.material.opacity = xf; }
  if (rtBalloon) { rtBalloon.visible = xf < 0.999; rtBalloon.material.opacity = 1 - xf; }
  if (outState && !flying && s > 0.9 && Math.abs(sVel) < 0.6) {   // settled out → hover beat → lift off
    floatT1 += dt;
    if (floatT1 >= FLOAT_DELAY) { flying = true; s = 1; sVel = 0; prevS = 1;   // snap the spring calm so the climb starts smooth (no residual wobble)
      if (bal) { bal.mesh.material.transparent = false; bal.mesh.material.opacity = 1; bal.mesh.material.needsUpdate = true; } }  // opaque → shows through the frosted glass
  }
  if (flying) { riseP1 = Math.min(1, riseP1 + dt / FLY_DUR); rise1 = stroll(riseP1); }   // steady strolling pace
  // ---- balloon transform ----
  if (bal) {
    if (!flying) {                                   // blowing out of the phone screen
      const bf = 1 - clamp01(floatT1 / FLOAT_DELAY);  // fade the idle float out during the hover → seamless into the climb
      const buoyX = outState ? Math.sin(t * 0.5 + 1.3) * 0.04 * bf : 0, buoyY = outState ? Math.sin(t * 0.7) * 0.02 * bf : 0;
      rig.position.copy(E_IN).lerp(E_OUT, s); rig.position.x += buoyX; rig.position.y += buoyY;
      const sN = THREE.MathUtils.clamp(1 + sVel * 0.10, 0.7, 1.4), flat = lerp(0.16, 1.0, smooth(s / 0.45)), lat = 1 / Math.sqrt(sN), uni = lerp(UNI0, OUT_UNI, k);
      rig.scale.set(uni * lat, uni * lat, uni * sN * flat);
    } else {                                         // strolling all the way up INTO the case — takes its time, ambles
      rig.position.copy(E_OUT).lerp(CASE_C, rise1);
      const wander = smooth(riseP1 / 0.16) * smooth((1 - riseP1) / 0.22);   // ramps in from 0 (smooth seam, no pop) then settles dead-centre at the top
      rig.position.x += (Math.sin(t * 0.42) * 0.34 + Math.sin(t * 0.93 + 1.7) * 0.11) * wander;   // lazy left-right stroll
      rig.position.z += Math.sin(t * 0.5 + 0.6) * 0.16 * wander;                                    // gentle depth meander
      rig.position.y += Math.sin(t * 0.8) * 0.07 * wander;                                          // soft bob (toddler waddle)
      rig.scale.setScalar(lerp(OUT_UNI, 1.0, rise1));                                               // grows to the caged size as it enters
    }
    yaw += dt * 0.2; rig.rotation.set(0, yaw, 0);                 // slow dreamy spin around up
  }
  // ---- as it climbs, the phone dissolves; near the top, restore the dark backdrop for the frosted glass ----
  if (flying) {
    titleFade = clamp01(1 - (riseP1 - 0.74) / 0.08);                                        // titles fully gone by ~0.82
    fadePhone(1 - smooth((riseP1 - 0.06) / 0.4));                                           // phone dissolves as the X climbs away (never "falls")
  }
  // ---- camera: frames the phone, then pans straight UP to settle on the case (balloon leads it slightly) ----
  const camY = flying ? lerp(PHONE_Y, 0, stroll(riseP1)) : PHONE_Y;   // camera strolls up in lockstep — one smooth move
  camera.position.set(0, camY, CAM_Z); camTgt.set(0, camY, 0);
  camera.up.set(0, 1, 0); camera.lookAt(camTgt);
  camera.fov = 45 + (flying ? 0 : THREE.MathUtils.clamp(sVel * 1.6, 0, 2.2)); camera.updateProjectionMatrix();   // fov whoosh ONLY on the emerge burst (no zoom-wobble while climbing)
  pUniforms.uCamY.value = camY;                      // motes reveal relative to how high we've climbed
  layoutTitles(flying);                              // titles pinned to world heights — fade as the balloon reaches them
  if (flying && riseP1 >= 1) enterCaged();           // arrived inside the case → trapped, scan to break it out
}

// the canonical "caged in the case, face-on, scan to break" state — Act 2 ends here, and the phone path resets here
function enterCaged() {
  state = "idle";
  camera.up.set(0, 1, 0); camera.fov = 45; camera.updateProjectionMatrix();
  camera.position.set(0, 0, 3.9); camera.lookAt(0, 0, 0);   // HARD snap → Act 3 hit-detection assumes exactly this
  scene.background = bgTex;
  caseGroup.visible = true; fitCase();
  setPhoneVisible(false);                                   // the phone-emerge prop is done
  document.body.classList.remove("intro"); layoutTitles(false);
  rig.visible = true; rig.position.set(0, 0, 0); rig.scale.setScalar(1); sq.set(0, 0, 0); driftRamp = 0;   // keep the spin continuous (no rotation snap); drift eases in from origin
  if (bal) { bal.mesh.visible = true; bal.mesh.material.transparent = false; bal.mesh.material.opacity = 1; bal.mesh.material.needsUpdate = true; bal.mesh.material.emissiveIntensity = 0.28; }
  reformGlass();
  statusLine.textContent = "SCAN THE QR TO BREAK IT OUT";
}

/* ---------------- glass cracks + shatter (2D, on the front pane) ---------------- */
const THRESHOLD = 4;
let hitCount = 0, glassState = "caged";          // caged (cracks/sheen) | open (broken)
const cracks = [];
let shards = [];

function makeCrack(cx, cy) {
  const segs = [], arms = 7 + (Math.random() * 4 | 0);
  for (let a = 0; a < arms; a++) {
    let ang = (a / arms) * Math.PI * 2 + (Math.random() - 0.5) * 0.5, px = cx, py = cy;
    const steps = 3 + (Math.random() * 3 | 0), sl = (70 + Math.random() * 180) / steps;
    for (let s = 0; s < steps; s++) {
      ang += (Math.random() - 0.5) * 0.6;
      const nx = px + Math.cos(ang) * sl, ny = py + Math.sin(ang) * sl;
      segs.push([px, py, nx, ny]);
      if (Math.random() < 0.45) { const ba = ang + (Math.random() - 0.5) * 1.3, bl = 22 + Math.random() * 60; segs.push([px, py, px + Math.cos(ba) * bl, py + Math.sin(ba) * bl]); }
      px = nx; py = ny;
    }
  }
  for (let r = 0; r < 2; r++) { const rad = 30 + r * 42 + Math.random() * 28, n = 8; for (let i = 0; i < n; i++) { const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2; segs.push([cx + Math.cos(a0) * rad, cy + Math.sin(a0) * rad, cx + Math.cos(a1) * rad, cy + Math.sin(a1) * rad]); } }
  return { cx, cy, segs, born: t };
}
function onThrow() {
  if (state !== "idle" || glassState !== "caged") return;   // only once it's caged + scannable
  hitCount++;
  const v = rig.position.clone().project(camera);            // crack the glass right in front of the balloon (where you aim)
  const cx = (v.x * 0.5 + 0.5) * W, cy = (-v.y * 0.5 + 0.5) * H;
  cracks.push(makeCrack(cx, cy));
  send({ type: "crack", n: hitCount, total: THRESHOLD });
  statusLine.textContent = hitCount >= THRESHOLD ? "SMASH!" : `GLASS CRACKING — ${hitCount}/${THRESHOLD}`;
  if (hitCount >= THRESHOLD) startShatter();
}
function startShatter() {
  glassState = "open"; glassPane.visible = false; placard.visible = false; // glass + the printed placard break away together
  // the cracked pane breaks into a grid of frosted shards that FALL (gravity) like real glass
  shards = [];
  const cols = 7, rows = 9, x0 = W * 0.13, y0 = H * 0.05, gw = (W * 0.74) / cols, gh = (H * 0.8) / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    shards.push({ cx: x0 + c * gw + gw / 2, cy: y0 + r * gh + gh / 2, hw: gw * 0.5, hh: gh * 0.5,
      vx: (Math.random() - 0.5) * 2.5, vy: 0.4 + Math.random() * 1.6, rot: 0, vr: (Math.random() - 0.5) * 0.18, life: 1 });
  }
  // the glass breaks → the balloon whisks away off the screen (quick suck-away) + hands to the phone
  state = "vanishing"; vanishClock = 0;
  send({ type: "spawn", t: 0 });
  statusLine.textContent = "IT'S IN YOUR ROOM — HUNT IT ON YOUR PHONE";
}
function reformGlass() { glassState = "caged"; hitCount = 0; cracks.length = 0; shards = []; glassPane.visible = true; placard.visible = true; }

function drawGlass() {
  gx.clearRect(0, 0, W, H);
  if (glassState === "caged" && state === "idle") {   // sheen/cracks only when the case is actually on screen
    for (const sx of [0.32, 0.64]) { const g = gx.createLinearGradient(W * sx - 150, 0, W * sx + 150, H); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,0.07)"); g.addColorStop(1, "rgba(255,255,255,0)"); gx.fillStyle = g; gx.fillRect(0, 0, W, H); }
    if (glassPress > 0.02) { const r = 50 + glassPress * 90, rg = gx.createRadialGradient(pressX, pressY, 0, pressX, pressY, r); rg.addColorStop(0, `rgba(255,255,255,${glassPress * 0.16})`); rg.addColorStop(1, "rgba(255,255,255,0)"); gx.fillStyle = rg; gx.beginPath(); gx.arc(pressX, pressY, r, 0, Math.PI * 2); gx.fill(); }
    for (const c of cracks) {
      const fresh = Math.max(0, 1 - (t - c.born) * 3); gx.lineCap = "round";
      gx.strokeStyle = "rgba(0,0,0,0.5)"; gx.lineWidth = 3; gx.beginPath(); for (const s of c.segs) { gx.moveTo(s[0] + 1, s[1] + 1); gx.lineTo(s[2] + 1, s[3] + 1); } gx.stroke();
      gx.strokeStyle = "rgba(235,245,255,0.9)"; gx.lineWidth = 1.4; gx.shadowColor = "rgba(200,225,255,0.9)"; gx.shadowBlur = 6 + fresh * 18; gx.beginPath(); for (const s of c.segs) { gx.moveTo(s[0], s[1]); gx.lineTo(s[2], s[3]); } gx.stroke(); gx.shadowBlur = 0;
      const rg = gx.createRadialGradient(c.cx, c.cy, 0, c.cx, c.cy, 14); rg.addColorStop(0, `rgba(255,255,255,${0.7 + fresh * 0.3})`); rg.addColorStop(1, "rgba(255,255,255,0)"); gx.fillStyle = rg; gx.beginPath(); gx.arc(c.cx, c.cy, 14, 0, Math.PI * 2); gx.fill();
    }
  }
  // falling glass shards — frosted pieces dropping under gravity (during + after the break). No white flash.
  for (const sh of shards) {
    if (sh.life <= 0) continue;
    gx.save(); gx.translate(sh.cx, sh.cy); gx.rotate(sh.rot);
    gx.fillStyle = `rgba(220,230,248,${0.18 * sh.life})`; gx.fillRect(-sh.hw, -sh.hh, sh.hw * 2, sh.hh * 2);
    gx.strokeStyle = `rgba(255,255,255,${0.5 * sh.life})`; gx.lineWidth = 1; gx.strokeRect(-sh.hw, -sh.hh, sh.hw * 2, sh.hh * 2);
    gx.restore();
  }
}

/* ---------------- balloon state ---------------- */
let state = "loading", t = 0, vanishClock = 0;  // loading → act1 (tap→emerge→fly up into the case) → idle (caged) → vanishing → gone
const lerp = (a, b, x) => a + (b - a) * x;
function resetAll() { enterCaged(); }   // back to the caged "scan to break" state (skips the intro)
function destroyed() { flash.classList.remove("go"); void flash.offsetWidth; flash.classList.add("go"); statusLine.textContent = "✦ POPPED ✦"; setTimeout(() => { resetAll(); statusLine.textContent = "BACK IN THE CASE — SMASH IT AGAIN FROM YOUR PHONE"; }, 1500); }

function renderRT() { if (rtBalloon) { renderer.setRenderTarget(RT); renderer.render(rtScene, rtCam); renderer.setRenderTarget(null); } }  // flat screen-icon → phone display
let paused = false;   // dev: hold a frame for screenshots (rAF still renders, just stops advancing)
const FRAME = 1 / 60;        // the cadence the motion was tuned at; per-frame constants are scaled by f = dt / FRAME
let lastNow = 0;             // wall-clock of the previous frame → real elapsed time
function tick(now) {
  requestAnimationFrame(tick);
  if (!W || !H) resize();                 // self-heal if the page hadn't been sized when the module first ran
  // REAL delta time (seconds), so the experience runs at the SAME speed on a 60Hz laptop, a 120Hz
  // iPhone, or a stuttering device — not tied to frame count. Clamped so a 120Hz screen can't run it
  // 2× fast and a tab-switch stall can't teleport everything. Computed before the pause-return so
  // resuming never causes a jump. Below: per-second motion uses dt; per-frame-tuned constants use f.
  if (!lastNow) lastNow = now || 0;
  let dt = ((now || 0) - lastNow) / 1000; lastNow = now || 0;
  if (!(dt > 0)) dt = FRAME;               // first frame / missing timestamp
  dt = Math.min(dt, 0.05);                 // floor ~20fps: graceful slow-mo beats an exploding sim
  if (paused) { renderRT(); renderer.render(scene, camera); drawGlass(); return; }
  const f = dt / FRAME;
  t += dt;
  updateParticles(dt);
  // falling glass shards keep dropping (per-frame velocities → × f)
  for (const sh of shards) { if (sh.life > 0) { sh.cx += sh.vx * f; sh.cy += sh.vy * f; sh.vy += 0.5 * f; sh.rot += sh.vr * f; sh.life -= 0.012 * f; } }

  if (bal) {
    if (state === "act1") act1Tick(dt);                                                            // ACT 1: tap → emerge → fly all the way up into the case
    else if (state === "idle") { physics(dt); bal.deform(0.55 + (Math.sin(t * 1.3) * 0.5 + 0.5) * 0.05, t, true, 0); }  // caged (trapped, drifting)
    else if (state === "vanishing") {     // ACT 3 break-out: quick suck-away off the screen as the glass falls
      vanishClock += dt;
      const a = Math.min(1, vanishClock / 0.35), e = a * a;
      rig.scale.setScalar(Math.max(0.001, 1 - e));
      rig.position.y += 0.02 * f;
      rig.rotation.y += (0.06 + a * 0.2) * f;
      bal.deform(0.55 + a * 0.25, t, true, 0.04);
      if (a >= 1) { rig.visible = false; state = "gone"; }
    }
  }

  renderRT();
  renderer.render(scene, camera);
  drawGlass();
}
requestAnimationFrame(tick);

/* ---------------- websocket ---------------- */
let ws;
function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => { ws.send(JSON.stringify({ type: "join", room: code, role: "screen" })); if (state !== "act1") statusLine.textContent = "CONNECTED — SCAN THE CODE TO BREAK THE GLASS"; };
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.type === "phone-join") { document.body.classList.add("live"); resetAll(); statusLine.textContent = "LINKED — THROW BALLS TO SMASH THE GLASS"; }
    else if (m.type === "phone-leave") { document.body.classList.remove("live"); resetAll(); statusLine.textContent = "PHONE DISCONNECTED"; }
    else if (m.type === "throw") onThrow();
    else if (m.type === "hit") destroyed();
  };
  ws.onclose = () => { if (state !== "act1") statusLine.textContent = "SERVER LOST — RECONNECTING…"; setTimeout(connect, 1000); };
}
connect();
const send = (o) => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));

/* ---------------- TAP THE X (app icon) TO RELEASE THE BALLOON ---------------- */
const iconHit = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
iconHit.position.copy(E_IN); scene.add(iconHit);
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();
$("balloon").addEventListener("pointerdown", (e) => {
  if (state !== "act1" || outState) return;                         // releases once, only before it emerges
  _ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  _ray.setFromCamera(_ndc, camera);
  if (_ray.intersectObject(iconHit).length) { outState = true; sTarget = 1; floatT1 = 0; statusLine.textContent = ""; }   // tapped the X → release
});

// dev hook — drive the rAF-throttled preview on demand
window.__beam = { renderer, scene, camera, rig, caseGroup, glassPane, render: () => { renderRT(); renderer.render(scene, camera); drawGlass(); },
  phys: (n) => { for (let i = 0; i < (n || 1); i++) { t += FRAME; physics(FRAME); if (bal) bal.deform(0.55, t, true, 0); } },
  tickN: (n) => { for (let i = 0; i < (n || 1); i++) tick(); }, throw: () => onThrow(),
  startIntro: () => startIntro(), enterCaged: () => enterCaged(), act: (s) => { state = s; },
  drive: (st, n) => { paused = true; if (st) state = st; for (let i = 0; i < (n || 1); i++) { t += FRAME; if (state === "act1") act1Tick(FRAME); } renderRT(); renderer.render(scene, camera); drawGlass(); },
  release: () => { outState = true; sTarget = 1; floatT1 = 0; statusLine.textContent = ""; },   // dev: trigger the tap
  unfreeze: () => { paused = false; },
  get phone() { return phoneGroup; }, get flying() { return flying; }, get riseP1() { return riseP1; }, get titleFade() { return titleFade; },
  layout: () => layoutTitles(true),
  get state() { return state + "/" + glassState + " hits=" + hitCount + " pos=" + rig.position.toArray().map(n => n.toFixed(2)); }, get bal() { return bal; } };
