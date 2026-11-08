import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { BodyKey, RigJoints } from "./ragdoll";

export interface CustomBuddy {
  holder: THREE.Group;
  /** null => no usable skeleton found; model will be attached rigidly */
  joints: RigJoints | null;
  bones: Partial<Record<BodyKey, THREE.Bone>>;
  mapped: number;
  report: string;
}

const TARGET_H = 1.8;

/** Fetch What.glb (checking the file really is a GLB, because dev servers return index.html for missing files). */
export async function loadCustomBuddy(): Promise<CustomBuddy | null> {
  const candidates = ["What.glb", "what.glb", "Buddy.glb", "buddy.glb"];
  let buf: ArrayBuffer | null = null;
  for (const name of candidates) {
    try {
      const res = await fetch(name, { cache: "no-store" });
      if (!res.ok) continue;
      const b = await res.arrayBuffer();
      const magic = new Uint8Array(b.slice(0, 4));
      if (magic[0] === 0x67 && magic[1] === 0x6c && magic[2] === 0x54 && magic[3] === 0x46) {
        buf = b;
        break;
      }
    } catch {
      /* ignore */
    }
  }
  if (!buf) return null;

  const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
    new GLTFLoader().parse(buf!, "", (g) => resolve(g as { scene: THREE.Group }), reject);
  });

  return prepareModel(gltf.scene);
}

/** Normalises a loaded model (size/position) and maps its skeleton onto the ragdoll. */
export function prepareModel(model: THREE.Object3D): CustomBuddy {
  const holder = new THREE.Group();
  holder.add(model);
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if ((m as THREE.Mesh).isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
    }
  });

  // normalise size & position (feet on the floor, centred)
  holder.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(model, true);
  const size = box.getSize(new THREE.Vector3());
  if (size.y > 0.0001) {
    holder.scale.setScalar(TARGET_H / size.y);
    holder.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(model, true);
    const c = box.getCenter(new THREE.Vector3());
    holder.position.set(-c.x, -box.min.y, -c.z);
    holder.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(model, true);
  }

  // collect bones
  const bonesSet = new Set<THREE.Bone>();
  model.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && sm.skeleton) sm.skeleton.bones.forEach((b) => bonesSet.add(b));
    if ((o as THREE.Bone).isBone) bonesSet.add(o as THREE.Bone);
  });
  const bones = [...bonesSet];

  const result = mapBones(bones, box);
  return { holder, ...result };
}

const IGNORE = new Set([
  "index",
  "middle",
  "ring",
  "pinky",
  "thumb",
  "finger",
  "fingers",
  "nail",
  "toe",
  "toes",
  "eye",
  "eyes",
  "ear",
  "hair",
  "jaw",
  "brow",
  "nose",
  "lip",
  "mouth",
  "tongue",
  "button",
  "twist",
  "roll",
  "end",
  "top",
  "tip",
  "ik",
  "pole",
  "ctrl",
  "target",
  "bracelet",
  "catchlight",
  "pupil",
  "iris",
  "nostril",
]);
const FILLER = new Set(["left", "right", "l", "r", "mixamorig", "bone", "jnt", "joint", "skin", "def", "bip01", "bip", "j"]);

function classify(name: string): string | null {
  const toks = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((t) => t.replace(/\d+$/g, ""))
    .filter(Boolean);
  if (toks.some((t) => IGNORE.has(t) || t.startsWith("finger"))) return null;
  const rest = toks.filter((t) => !FILLER.has(t));
  const j = rest.join("");
  if (!j) return null;
  if (/(^|trouser)(hips?|pelvis)$/.test(j)) return "hips";
  if (/thigh|upleg|upperleg|upleg|uprleg/.test(j)) return "thigh";
  if (/shin|calf|lowerleg|lowleg|^leg$|lowerthigh/.test(j)) return "shin";
  if (/foot|ankle/.test(j)) return "foot";
  if (/forearm|lowerarm|lowarm|lwrarm/.test(j)) return "forearm";
  if (/upperarm|uparm|^arm$|bicep|uprarm/.test(j)) return "upperarm";
  if (/hand|palm|wrist/.test(j)) return "hand";
  if (/head$/.test(j) && !/hair/.test(j)) return "head";
  if (/neck/.test(j)) return "neck";
  if (/spine|chest|torso|abdomen|waist|belly/.test(j)) return "spine";
  return null;
}

function depthOf(o: THREE.Object3D) {
  let d = 0;
  let p = o.parent;
  while (p) {
    d++;
    p = p.parent;
  }
  return d;
}

function mapBones(
  bones: THREE.Bone[],
  box: THREE.Box3
): { joints: RigJoints | null; bones: Partial<Record<BodyKey, THREE.Bone>>; mapped: number; report: string } {
  const pos = new Map<THREE.Bone, THREE.Vector3>();
  for (const b of bones) pos.set(b, b.getWorldPosition(new THREE.Vector3()));

  const byRole: Record<string, THREE.Bone[]> = {};
  const names: string[] = [];
  for (const b of bones) {
    names.push(b.name);
    const r = classify(b.name);
    if (!r) continue;
    (byRole[r] ||= []).push(b);
  }
  console.info("[Buddy] bones in What.glb:", names);

  const cmp = (a: THREE.Bone, b: THREE.Bone) => depthOf(a) - depthOf(b) || a.name.length - b.name.length;
  const pick1 = (role: string) => {
    const l = (byRole[role] || []).slice().sort(cmp);
    return l[0] as THREE.Bone | undefined;
  };
  const pick2 = (role: string): [THREE.Bone, THREE.Bone] | null => {
    const l = (byRole[role] || []).slice().sort(cmp);
    if (l.length < 2) return null;
    // choose the first two with clearly different x (left / right)
    const first = l[0];
    const other = l.find((b) => Math.abs(pos.get(b)!.x - pos.get(first)!.x) > 0.02 * TARGET_H);
    if (!other) return null;
    return pos.get(first)!.x >= pos.get(other)!.x ? [first, other] : [other, first];
  };

  const upper = pick2("upperarm");
  const fore = pick2("forearm");
  const thigh = pick2("thigh");
  const shin = pick2("shin");
  const head = pick1("head");
  let hips = pick1("hips");
  const spine = pick1("spine");
  const neck = pick1("neck");
  const hand = pick2("hand");
  const foot = pick2("foot");

  if (!hips && thigh) hips = (thigh[0].parent as THREE.Bone) || undefined;

  const missing: string[] = [];
  if (!upper) missing.push("upper arms");
  if (!fore) missing.push("forearms");
  if (!thigh) missing.push("thighs");
  if (!shin) missing.push("shins");
  if (!head) missing.push("head");
  if (!hips) missing.push("hips");

  if (missing.length || !upper || !fore || !thigh || !shin || !head || !hips) {
    return {
      joints: null,
      bones: {},
      mapped: 0,
      report: `Custom model loaded (rigid mode – couldn't find: ${missing.join(", ")})`,
    };
  }

  const P = (b: THREE.Bone) => pos.get(b)!.clone();
  const H = box.max.y - box.min.y;
  const near = (a: THREE.Vector3, b: THREE.Vector3) => a.distanceTo(b) < 0.02 * H;

  const shoulderA = P(upper[0]);
  const shoulderB = P(upper[1]);
  const elbowA = P(fore[0]);
  const elbowB = P(fore[1]);
  let wristA = hand ? P(hand[0]) : elbowA.clone().add(elbowA.clone().sub(shoulderA).multiplyScalar(0.9));
  let wristB = hand ? P(hand[1]) : elbowB.clone().add(elbowB.clone().sub(shoulderB).multiplyScalar(0.9));
  if (near(wristA, elbowA)) wristA = elbowA.clone().add(elbowA.clone().sub(shoulderA).multiplyScalar(0.9));
  if (near(wristB, elbowB)) wristB = elbowB.clone().add(elbowB.clone().sub(shoulderB).multiplyScalar(0.9));
  const hipA = P(thigh[0]);
  const hipB = P(thigh[1]);
  const kneeA = P(shin[0]);
  const kneeB = P(shin[1]);
  const mkAnkle = (f: THREE.Bone | undefined, knee: THREE.Vector3, hp: THREE.Vector3) => {
    const a = f ? P(f) : new THREE.Vector3(knee.x, box.min.y + 0.04 * H, knee.z);
    if (a.distanceTo(knee) < 0.05 * H) a.copy(knee).add(knee.clone().sub(hp).multiplyScalar(0.95));
    return a;
  };
  const ankleA = mkAnkle(foot?.[0], kneeA, hipA);
  const ankleB = mkAnkle(foot?.[1], kneeB, hipB);

  const hipsP = P(hips);
  const hipMid = hipA.clone().add(hipB).multiplyScalar(0.5);
  if (Math.abs(hipsP.y - hipMid.y) < 0.12 * H) hipMid.y = Math.max(hipMid.y, hipsP.y);
  hipMid.x = (hipA.x + hipB.x) / 2;
  const headP = P(head);
  const neckP = neck ? P(neck) : headP.clone();
  const neckJoint = headP.clone();
  if (neck && neckP.y < headP.y) neckJoint.copy(neckP).lerp(headP, 0.5);
  const headTop = new THREE.Vector3(headP.x, box.max.y, headP.z);
  if (headTop.y - neckJoint.y < 0.08 * H) headTop.y = neckJoint.y + 0.15 * H;
  const shMid = shoulderA.clone().add(shoulderB).multiplyScalar(0.5);
  if (neckJoint.y - shMid.y < 0.02 * H) neckJoint.y = shMid.y + 0.04 * H;
  const waist = hipMid.clone().lerp(neckJoint, 0.38);

  const joints: RigJoints = {
    H,
    hipMid,
    waist,
    neck: neckJoint,
    headTop,
    shoulderA,
    shoulderB,
    elbowA,
    elbowB,
    wristA,
    wristB,
    hipA,
    hipB,
    kneeA,
    kneeB,
    ankleA,
    ankleB,
  };

  const map: Partial<Record<BodyKey, THREE.Bone>> = {
    pelvis: hips,
    head,
    uArmA: upper[0],
    uArmB: upper[1],
    fArmA: fore[0],
    fArmB: fore[1],
    thighA: thigh[0],
    thighB: thigh[1],
    shinA: shin[0],
    shinB: shin[1],
  };
  // chest: lowest spine bone that is a descendant of the hips
  let chestBone = spine;
  if (chestBone) {
    let ok = false;
    let p: THREE.Object3D | null = chestBone.parent;
    while (p) {
      if (p === hips) ok = true;
      p = p.parent;
    }
    if (!ok) chestBone = undefined;
  }
  if (chestBone) map.chest = chestBone;
  const mapped = Object.keys(map).length;
  return {
    joints,
    bones: map,
    mapped,
    report: `Custom model What.glb loaded – ${mapped}/11 body parts mapped to the ragdoll skeleton`,
  };
}
