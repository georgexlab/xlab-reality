/* XLAB BEAM — the squishy inflated X balloon, shared by BOTH the desktop screen and
   the phone so it is literally the same element that jumps from one to the other.
   George's rig: parse the OBJ ourselves (faces keep their shared vertex ids → the mesh
   is watertight and never tears), then every frame morph each vertex's radius toward a
   sphere (round) + grow + breath ripple + jelly wobble. Inflation is procedural, not baked. */
import * as THREE from "three";

export const ROUND_AMT = 0.55, GROW = 46, WOBBLE = 0.05; // GROW is in raw OBJ units (mesh keeps source scale; group normalizes)

export function balloonMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0x7a3ff0, roughness: 0.34, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.1,
    sheen: 0.35, sheenColor: new THREE.Color(0xc9b8ff), sheenRoughness: 0.5, envMapIntensity: 1.1, side: THREE.DoubleSide,
  });
}

// Parse + build the balloon. Returns { group, mesh, geo, deform, R0, sphereR }.
// group is scaled so the balloon is ~worldSize units; add it to your scene/target.
// deform(v, t, recompute, wobbleAmp) mutates the geometry — caller owns the spring/wobble state.
export async function loadBalloon(url = "/models/x.obj", worldSize = 1.7) {
  const text = await (await fetch(url)).text();
  const verts = [], indices = [], lines = text.split("\n");
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (line.charCodeAt(0) === 118 && line[1] === " ") { const p = line.split(/\s+/); verts.push(+p[1], +p[2], +p[3]); }
    else if (line.charCodeAt(0) === 102 && line[1] === " ") {
      const p = line.trim().split(/\s+/), c = [];
      for (let k = 1; k < p.length; k++) c.push(parseInt(p[k], 10) - 1);
      for (let k = 2; k < c.length; k++) indices.push(c[0], c[k - 1], c[k]); // fan-triangulate, keep OBJ vertex ids
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices); geo.computeVertexNormals(); geo.center(); geo.computeBoundingSphere();
  const R0 = geo.boundingSphere.radius;
  const base = geo.attributes.position.array, n = base.length / 3;
  const baseLen = new Float32Array(n), baseDir = new Float32Array(n * 3);
  let sphereR = 1;
  for (let i = 0; i < n; i++) {
    const j = i * 3, len = Math.hypot(base[j], base[j + 1], base[j + 2]) || 1e-6;
    baseLen[i] = len; baseDir[j] = base[j] / len; baseDir[j + 1] = base[j + 1] / len; baseDir[j + 2] = base[j + 2] / len;
    if (len > sphereR) sphereR = len;
  }
  const mesh = new THREE.Mesh(geo, balloonMaterial());
  const group = new THREE.Group(); group.scale.setScalar(worldSize / (2 * R0)); group.add(mesh);
  const pos = geo.attributes.position.array;

  function deform(v, t, recompute, wobbleAmp = 0) {
    const round = v * ROUND_AMT, grow = v * GROW, breatheW = grow * WOBBLE;
    for (let i = 0, vi = 0; i < pos.length; i += 3, vi++) {
      const len = baseLen[vi];
      let radius = len * (1 - round) + sphereR * round + grow;
      radius += Math.sin(t * 3.0 + len * 0.02) * breatheW;                       // soft breath ripple
      if (wobbleAmp > 0.001) radius += Math.sin(len * 0.06 + t * 14) * wobbleAmp * sphereR; // jelly
      pos[i] = baseDir[i] * radius; pos[i + 1] = baseDir[i + 1] * radius; pos[i + 2] = baseDir[i + 2] * radius;
    }
    geo.attributes.position.needsUpdate = true;
    if (recompute) geo.computeVertexNormals();
  }
  deform(0.06, 0, true); // start deflated
  return { group, mesh, geo, deform, R0, sphereR };
}
