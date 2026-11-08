import * as THREE from "three";
import type { BodyKey, Ragdoll, RigJoints } from "./ragdoll";

const mat = (color: number, rough = 0.65, metal = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

const UP = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

/** Builds the default cartoon buddy (aqua shirt, curly hair) and attaches it to ragdoll bodies. */
export function buildProceduralBuddy(rag: Ragdoll, j: RigJoints) {
  const skin = mat(0xf0b48c, 0.6);
  const skinDark = mat(0xdc9a72, 0.6);
  const shirt = mat(0x2fd3cb, 0.7);
  const shirtDark = mat(0x16a6a0, 0.7);
  const trousers = mat(0x3a4764, 0.8);
  const shoeUpper = mat(0xf3f3f3, 0.5);
  const shoeSole = mat(0xff5b6b, 0.6);
  const hairM = mat(0x2a1a12, 0.9);
  const white = mat(0xffffff, 0.3);
  const dark = mat(0x151515, 0.3);
  const iris = mat(0x4b2e1c, 0.3);
  const silver = mat(0xd0d6de, 0.25, 0.9);
  const lip = mat(0xb4503f, 0.5);
  const button = mat(0xffffff, 0.4);

  const add = (key: BodyKey, mesh: THREE.Mesh, pos: THREE.Vector3, quat?: THREE.Quaternion) => {
    mesh.position.copy(pos);
    if (quat) mesh.quaternion.copy(quat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    rag.attach(key, mesh);
    return mesh;
  };

  const capsule = (
    key: BodyKey,
    a: THREE.Vector3,
    b: THREE.Vector3,
    r: number,
    m: THREE.Material,
    scale?: [number, number, number]
  ) => {
    const dir = b.clone().sub(a);
    const len = Math.max(dir.length() - 2 * r, 0.001);
    dir.normalize();
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 8, 16), m);
    if (scale) mesh.scale.set(...scale);
    return add(
      key,
      mesh,
      a.clone().add(b).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(UP, dir)
    );
  };

  const sphere = (
    key: BodyKey,
    p: THREE.Vector3,
    r: number,
    m: THREE.Material,
    scale: [number, number, number] = [1, 1, 1]
  ) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), m);
    mesh.scale.set(...scale);
    return add(key, mesh, p);
  };

  const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
  const lerp = (a: THREE.Vector3, b: THREE.Vector3, t: number) => a.clone().lerp(b, t);

  // ---- Torso & pelvis ----
  capsule("chest", j.waist.clone().add(v(0, -0.04)), j.neck.clone().add(v(0, -0.03)), 0.15, shirt, [1.28, 1, 0.78]);
  capsule("pelvis", j.hipMid.clone().add(v(0, -0.02)), j.waist.clone().add(v(0, 0.02)), 0.15, trousers, [1.3, 1, 0.85]);
  // shirt hem over trousers
  const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.175, 0.07, 24), shirt);
  hem.scale.set(1.28, 1, 0.8);
  add("chest", hem, j.waist.clone().add(v(0, 0.03)));
  // buttons
  for (let i = 0; i < 4; i++) {
    const y = j.neck.y - 0.1 - i * 0.07;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), button);
    add("chest", b, v(0, y, 0.118 + (i > 2 ? 0 : 0.0)));
  }
  // placket
  const placket = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.3, 0.012), shirtDark);
  add("chest", placket, v(0, j.neck.y - 0.2, 0.119));
  // collar
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.03, 10, 24), shirtDark);
  collar.rotation.x = Math.PI / 2;
  add("chest", collar, j.neck.clone().add(v(0, -0.01)), collar.quaternion.clone());
  for (const s of [1, -1]) {
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.012), shirtDark);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0, s * 0.6));
    add("chest", flap, j.neck.clone().add(v(s * 0.045, -0.04, 0.085)), q);
  }

  // ---- Neck & head ----
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.12, 14), skin);
  add("head", neckMesh, j.neck.clone().add(v(0, 0.02)));
  const hc = lerp(j.neck, j.headTop, 0.5);
  const hr = j.headTop.distanceTo(j.neck) * 0.5;
  const head = sphere("head", hc, hr, skin, [0.92, 1.04, 0.98]);
  head.receiveShadow = true;
  // ears
  for (const s of [1, -1]) {
    sphere("head", hc.clone().add(v(s * hr * 0.92, -0.005, 0)), hr * 0.24, skin, [0.45, 1, 0.8]);
    sphere("head", hc.clone().add(v(s * hr * 0.9, -0.005, 0.01)), hr * 0.12, skinDark, [0.4, 1, 0.7]);
  }
  // eyes
  for (const s of [1, -1]) {
    const ex = s * hr * 0.37;
    const ey = hc.y + hr * 0.1;
    const ez = hc.z + hr * 0.84;
    sphere("head", v(ex, ey, ez), hr * 0.22, white, [1, 1.1, 0.55]);
    sphere("head", v(ex + s * -0.003, ey - 0.002, ez + hr * 0.1), hr * 0.12, iris, [1, 1, 0.5]);
    sphere("head", v(ex + s * -0.003, ey - 0.002, ez + hr * 0.15), hr * 0.065, dark, [1, 1, 0.5]);
    sphere("head", v(ex + s * 0.012, ey + 0.015, ez + hr * 0.19), hr * 0.035, white, [1, 1, 0.5]);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(hr * 0.42, hr * 0.07, hr * 0.07), hairM);
    add("head", brow, v(ex, ey + hr * 0.3, ez + hr * 0.02), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, s * -0.12)));
  }
  // nose
  sphere("head", v(0, hc.y - hr * 0.1, hc.z + hr * 0.98), hr * 0.17, skinDark, [1, 0.9, 0.9]);
  // mouth smile
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(hr * 0.3, hr * 0.045, 8, 20, Math.PI), lip);
  mouth.rotation.z = Math.PI;
  add("head", mouth, v(0, hc.y - hr * 0.38, hc.z + hr * 0.86), mouth.quaternion.clone());
  // curly hair
  const rnd = (() => {
    let s = 7;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  })();
  for (let i = 0; i < 70; i++) {
    const u = rnd();
    const w = rnd();
    const theta = 2 * Math.PI * u;
    const y = 0.15 + 0.85 * w; // upper part of the sphere
    const rr = Math.sqrt(1 - y * y);
    const dx = Math.cos(theta) * rr;
    const dz = Math.sin(theta) * rr;
    // keep forehead clear
    if (dz > 0.25 && y < 0.7) continue;
    const p = v(dx * hr * 0.95, y * hr * 1.0, dz * hr * 0.95).add(hc);
    sphere("head", p, hr * (0.2 + rnd() * 0.08), hairM);
  }
  sphere("head", hc.clone().add(v(0, hr * 0.5, -hr * 0.1)), hr * 0.9, hairM, [0.98, 0.7, 0.98]);
  // sideburns
  for (const s of [1, -1]) {
    sphere("head", hc.clone().add(v(s * hr * 0.82, hr * 0.0, hr * 0.25)), hr * 0.16, hairM, [0.5, 1.4, 0.8]);
  }

  // ---- Arms ----
  for (const side of ["A", "B"] as const) {
    const sh = side === "A" ? j.shoulderA : j.shoulderB;
    const el = side === "A" ? j.elbowA : j.elbowB;
    const wr = side === "A" ? j.wristA : j.wristB;
    const uKey = ("uArm" + side) as BodyKey;
    const fKey = ("fArm" + side) as BodyKey;
    capsule(uKey, sh, el, 0.046, skin);
    capsule(uKey, sh.clone().add(v(0, 0.04)), lerp(sh, el, 0.55), 0.064, shirt);
    capsule(fKey, el, wr, 0.04, skin);
    const dir = wr.clone().sub(el).normalize();
    const tq = new THREE.Quaternion().setFromUnitVectors(Z, dir);
    if (side === "A") {
      const brace = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.011, 8, 20), silver);
      add(fKey, brace, wr.clone().sub(dir.clone().multiplyScalar(0.04)), tq);
    }
    const handC = wr.clone().add(dir.clone().multiplyScalar(0.05));
    sphere(fKey, handC, 0.058, skin, [0.8, 1.1, 0.7]);
    const sx = side === "A" ? -1 : 1;
    sphere(fKey, handC.clone().add(v(sx * 0.04, 0.02, 0.03)), 0.024, skin);
  }

  // ---- Legs ----
  for (const side of ["A", "B"] as const) {
    const hp = side === "A" ? j.hipA : j.hipB;
    const kn = side === "A" ? j.kneeA : j.kneeB;
    const an = side === "A" ? j.ankleA : j.ankleB;
    const tKey = ("thigh" + side) as BodyKey;
    const sKey = ("shin" + side) as BodyKey;
    capsule(tKey, hp.clone().add(v(0, 0.03)), kn, 0.078, trousers);
    capsule(sKey, kn, an.clone().add(v(0, 0.02)), 0.062, trousers);
    // shoe
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.085, 0.27), shoeUpper);
    add(sKey, upper, v(an.x, 0.075, an.z + 0.065));
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.0625, 14, 10), shoeUpper);
    toe.scale.set(1, 0.9, 1);
    add(sKey, toe, v(an.x, 0.07, an.z + 0.2));
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.03, 0.32), shoeSole);
    add(sKey, sole, v(an.x, 0.016, an.z + 0.08));
  }
}
