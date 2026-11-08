import * as THREE from "three";
import * as CANNON from "cannon-es";

export const GROUP = { RAG: 1, ENV: 2, PROP: 4, WALL: 8 };

export type BodyKey =
  | "pelvis"
  | "chest"
  | "head"
  | "uArmA"
  | "uArmB"
  | "fArmA"
  | "fArmB"
  | "thighA"
  | "thighB"
  | "shinA"
  | "shinB";

export const BODY_KEYS: BodyKey[] = [
  "pelvis",
  "chest",
  "head",
  "uArmA",
  "uArmB",
  "fArmA",
  "fArmB",
  "thighA",
  "thighB",
  "shinA",
  "shinB",
];

/** Rest-pose joint positions in world space. */
export interface RigJoints {
  H: number;
  hipMid: THREE.Vector3;
  waist: THREE.Vector3;
  neck: THREE.Vector3;
  headTop: THREE.Vector3;
  shoulderA: THREE.Vector3;
  shoulderB: THREE.Vector3;
  elbowA: THREE.Vector3;
  elbowB: THREE.Vector3;
  wristA: THREE.Vector3;
  wristB: THREE.Vector3;
  hipA: THREE.Vector3;
  hipB: THREE.Vector3;
  kneeA: THREE.Vector3;
  kneeB: THREE.Vector3;
  ankleA: THREE.Vector3;
  ankleB: THREE.Vector3;
}

export function defaultJoints(): RigJoints {
  const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
  return {
    H: 1.8,
    hipMid: v(0, 0.95),
    waist: v(0, 1.17),
    neck: v(0, 1.5),
    headTop: v(0, 1.8),
    shoulderA: v(0.2, 1.41),
    shoulderB: v(-0.2, 1.41),
    elbowA: v(0.27, 1.12),
    elbowB: v(-0.27, 1.12),
    wristA: v(0.33, 0.86),
    wristB: v(-0.33, 0.86),
    hipA: v(0.1, 0.95),
    hipB: v(-0.1, 0.95),
    kneeA: v(0.1, 0.52),
    kneeB: v(-0.1, 0.52),
    ankleA: v(0.1, 0.07),
    ankleB: v(-0.1, 0.07),
  };
}

export interface RagBody {
  key: BodyKey;
  body: CANNON.Body;
  restPos: THREE.Vector3;
  restQuat: THREE.Quaternion;
  invRestQuat: THREE.Quaternion;
  length: number;
  radius: number;
  mass: number;
  /** limb direction in body-local space (rest pose) */
  axis: THREE.Vector3;
  group: THREE.Group;
}

export interface BoneBinding {
  bone: THREE.Bone;
  rb: RagBody;
  restWorldQ: THREE.Quaternion;
  localOffset: THREE.Vector3;
  depth: number;
  isRoot: boolean;
}

const SUPPORT_FF = 0.7;
const SUPPORT_K = 20;
const SUPPORT_D = 5;
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _s = new THREE.Vector3();

export class Ragdoll {
  rb = {} as Record<BodyKey, RagBody>;
  list: RagBody[] = [];
  root = new THREE.Group();
  constraints: CANNON.Constraint[] = [];
  bindings: BoneBinding[] = [];
  /** 0 = limp, 1 = fully standing */
  stand = 1;
  standEnabled = true;
  totalMass = 0;
  joints: RigJoints;
  world: CANNON.World;
  bodySet = new Set<CANNON.Body>();

  constructor(world: CANNON.World, joints: RigJoints) {
    this.world = world;
    this.joints = joints;
    const H = joints.H;
    const k = H / 1.8;
    const j = joints;

    const mk = (
      key: BodyKey,
      a: THREE.Vector3,
      b: THREE.Vector3,
      radius: number,
      mass: number,
      opts: { single?: boolean; endRadius?: number } = {}
    ) => {
      const dir = b.clone().sub(a);
      const len = dir.length();
      dir.normalize();
      // All bodies share an identity rest orientation (required for cannon's twist constraint
      // reference axes to line up); limb direction is encoded in the sphere offsets instead.
      const quat = new THREE.Quaternion();
      const pos = a.clone().add(b).multiplyScalar(0.5);
      const body = new CANNON.Body({
        mass,
        linearDamping: 0.06,
        angularDamping: 0.35,
        collisionFilterGroup: GROUP.RAG,
        collisionFilterMask: GROUP.ENV | GROUP.PROP | GROUP.WALL,
        allowSleep: false,
      });
      if (opts.single) {
        body.addShape(new CANNON.Sphere(radius));
      } else {
        const n = Math.max(2, Math.ceil(len / (radius * 1.1)) + 1);
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0 : i / (n - 1);
          const y = (t - 0.5) * len;
          const r = i === 0 && opts.endRadius ? opts.endRadius : radius;
          body.addShape(new CANNON.Sphere(r), new CANNON.Vec3(dir.x * y, dir.y * y, dir.z * y));
        }
      }
      body.position.set(pos.x, pos.y, pos.z);
      body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
      world.addBody(body);
      const group = new THREE.Group();
      this.root.add(group);
      const rb: RagBody = {
        key,
        body,
        restPos: pos.clone(),
        restQuat: quat.clone(),
        invRestQuat: quat.clone().invert(),
        length: len,
        radius,
        mass,
        axis: dir.clone(),
        group,
      };
      this.rb[key] = rb;
      this.list.push(rb);
      this.bodySet.add(body);
      this.totalMass += mass;
      return rb;
    };

    // The ends of the shin (ankle) get a bigger sphere so feet touch the ground.
    const footR = (ankleY: number) => THREE.MathUtils.clamp(ankleY, 0.034 * H, 0.09 * k);

    mk("pelvis", j.hipMid, j.waist, 0.075 * H, 8);
    mk("chest", j.waist, j.neck, 0.08 * H, 10);
    // head: single sphere in the middle
    const headLen = j.headTop.distanceTo(j.neck);
    mk("head", j.neck, j.headTop, Math.max(headLen * 0.5, 0.06 * H), 4, { single: true });
    mk("uArmA", j.shoulderA, j.elbowA, 0.026 * H, 2);
    mk("uArmB", j.shoulderB, j.elbowB, 0.026 * H, 2);
    mk("fArmA", j.elbowA, j.wristA, 0.022 * H, 1.6);
    mk("fArmB", j.elbowB, j.wristB, 0.022 * H, 1.6);
    mk("thighA", j.hipA, j.kneeA, 0.04 * H, 5);
    mk("thighB", j.hipB, j.kneeB, 0.04 * H, 5);
    // shin shapes: first sphere (index 0) is at the "a" (knee) end, last at ankle.
    // we use endRadius on the *ankle* end by building from ankle to knee order below
    const shinA = mk("shinA", j.kneeA, j.ankleA, 0.033 * H, 3.5);
    const shinB = mk("shinB", j.kneeB, j.ankleB, 0.033 * H, 3.5);
    // replace last sphere with a foot-sized one
    for (const [rbShin, ankle] of [
      [shinA, j.ankleA],
      [shinB, j.ankleB],
    ] as const) {
      const shapes = rbShin.body.shapes;
      const offs = rbShin.body.shapeOffsets;
      const last = shapes.length - 1;
      const fr = footR(ankle.y);
      shapes[last] = new CANNON.Sphere(fr);
      offs[last].set(
        rbShin.axis.x * rbShin.length * 0.5,
        rbShin.axis.y * rbShin.length * 0.5,
        rbShin.axis.z * rbShin.length * 0.5
      );
      rbShin.body.updateBoundingRadius();
    }

    const link = (
      a: BodyKey,
      b: BodyKey,
      pivot: THREE.Vector3,
      to: THREE.Vector3,
      angle: number,
      twist: number
    ) => {
      const A = this.rb[a];
      const B = this.rb[b];
      const dir = to.clone().sub(pivot).normalize();
      const pa = pivot.clone().sub(A.restPos).applyQuaternion(A.invRestQuat);
      const pb = pivot.clone().sub(B.restPos).applyQuaternion(B.invRestQuat);
      const ax = dir.clone().applyQuaternion(A.invRestQuat);
      const bx = dir.clone().applyQuaternion(B.invRestQuat);
      const c = new CANNON.ConeTwistConstraint(A.body, B.body, {
        pivotA: new CANNON.Vec3(pa.x, pa.y, pa.z),
        pivotB: new CANNON.Vec3(pb.x, pb.y, pb.z),
        axisA: new CANNON.Vec3(ax.x, ax.y, ax.z),
        axisB: new CANNON.Vec3(bx.x, bx.y, bx.z),
        angle,
        twistAngle: twist,
        maxForce: 1e5,
      });
      c.collideConnected = false;
      world.addConstraint(c);
      this.constraints.push(c);
    };

    link("pelvis", "chest", j.waist, j.neck, 0.5, 0.4);
    link("chest", "head", j.neck, j.headTop, 0.8, 0.7);
    link("chest", "uArmA", j.shoulderA, j.elbowA, 2.2, 1.0);
    link("chest", "uArmB", j.shoulderB, j.elbowB, 2.2, 1.0);
    link("uArmA", "fArmA", j.elbowA, j.wristA, 1.6, 0.4);
    link("uArmB", "fArmB", j.elbowB, j.wristB, 1.6, 0.4);
    link("pelvis", "thighA", j.hipA, j.kneeA, 1.4, 0.5);
    link("pelvis", "thighB", j.hipB, j.kneeB, 1.4, 0.5);
    link("thighA", "shinA", j.kneeA, j.ankleA, 1.5, 0.25);
    link("thighB", "shinB", j.kneeB, j.ankleB, 1.5, 0.25);

    // Per-substep helpers (standing assist)
    world.addEventListener("preStep", this.preStep);
  }

  dispose() {
    this.world.removeEventListener("preStep", this.preStep);
    for (const c of this.constraints) this.world.removeConstraint(c);
    for (const r of this.list) this.world.removeBody(r.body);
  }

  /** Attach a mesh whose current position/quaternion is its *rest world* transform. */
  attach(key: BodyKey, obj: THREE.Object3D) {
    const rb = this.rb[key];
    const lp = obj.position.clone().sub(rb.restPos).applyQuaternion(rb.invRestQuat);
    const lq = rb.invRestQuat.clone().multiply(obj.quaternion);
    obj.position.copy(lp);
    obj.quaternion.copy(lq);
    rb.group.add(obj);
  }

  bindBone(key: BodyKey, bone: THREE.Bone, isRoot = false) {
    const rb = this.rb[key];
    bone.updateWorldMatrix(true, false);
    const wp = new THREE.Vector3();
    const wq = new THREE.Quaternion();
    const ws = new THREE.Vector3();
    bone.matrixWorld.decompose(wp, wq, ws);
    let depth = 0;
    let p: THREE.Object3D | null = bone.parent;
    while (p) {
      depth++;
      p = p.parent;
    }
    this.bindings.push({
      bone,
      rb,
      restWorldQ: wq,
      localOffset: wp.sub(rb.restPos).applyQuaternion(rb.invRestQuat),
      depth,
      isRoot,
    });
    this.bindings.sort((a, b) => a.depth - b.depth);
  }

  updateBones() {
    for (const b of this.bindings) {
      const parent = b.bone.parent;
      if (parent) parent.updateWorldMatrix(true, false);
      const body = b.rb.body;
      _q.set(body.interpolatedQuaternion.x, body.interpolatedQuaternion.y, body.interpolatedQuaternion.z, body.interpolatedQuaternion.w);
      // desired world rotation
      _q2.copy(_q).multiply(b.rb.invRestQuat).multiply(b.restWorldQ);
      if (parent) {
        parent.matrixWorld.decompose(_v, _q, _s);
        _q.invert();
        b.bone.quaternion.copy(_q.multiply(_q2));
        if (b.isRoot) {
          _v2.copy(b.localOffset).applyQuaternion(
            _q2.set(body.interpolatedQuaternion.x, body.interpolatedQuaternion.y, body.interpolatedQuaternion.z, body.interpolatedQuaternion.w)
          );
          _v2.add(_v3.set(body.interpolatedPosition.x, body.interpolatedPosition.y, body.interpolatedPosition.z));
          b.bone.position.copy(parent.worldToLocal(_v2));
        }
      } else {
        b.bone.quaternion.copy(_q2);
        if (b.isRoot) {
          _v2.copy(b.localOffset).applyQuaternion(
            _q.set(body.interpolatedQuaternion.x, body.interpolatedQuaternion.y, body.interpolatedQuaternion.z, body.interpolatedQuaternion.w)
          );
          b.bone.position.set(
            body.interpolatedPosition.x + _v2.x,
            body.interpolatedPosition.y + _v2.y,
            body.interpolatedPosition.z + _v2.z
          );
        }
      }
      b.bone.updateMatrixWorld(true);
    }
  }

  syncVisuals() {
    for (const r of this.list) {
      const b = r.body;
      r.group.position.set(b.position.x, b.position.y, b.position.z);
      r.group.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    }
    if (this.bindings.length) this.updateBones();
  }

  reset(offset: THREE.Vector3) {
    for (const r of this.list) {
      const b = r.body;
      b.position.set(r.restPos.x + offset.x, r.restPos.y + offset.y, r.restPos.z + offset.z);
      b.quaternion.set(r.restQuat.x, r.restQuat.y, r.restQuat.z, r.restQuat.w);
      b.previousPosition.copy(b.position);
      b.interpolatedPosition.copy(b.position);
      b.previousQuaternion.copy(b.quaternion);
      b.interpolatedQuaternion.copy(b.quaternion);
      b.initPosition.copy(b.position);
      b.velocity.setZero();
      b.angularVelocity.setZero();
      b.force.setZero();
      b.torque.setZero();
      b.aabbNeedsUpdate = true;
    }
    this.stand = 1;
  }

  center(out: THREE.Vector3) {
    const p = this.rb.pelvis.body.position;
    const c = this.rb.chest.body.position;
    return out.set((p.x + c.x) / 2, (p.y + c.y) / 2, (p.z + c.z) / 2);
  }

  private preStep = () => {
    if (!this.standEnabled) return;
    const e = THREE.MathUtils.clamp((this.stand - 0.3) / 0.7, 0, 1);
    if (e <= 0) return;
    const align = (key: BodyKey, target: THREE.Vector3, kp: number, kd: number) => {
      const rb = this.rb[key];
      const b = rb.body;
      _q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      _v.copy(rb.axis).applyQuaternion(_q);
      _v2.copy(_v).cross(target);
      const w = b.angularVelocity;
      // desired angular acceleration (world) -> local -> times inertia -> world torque
      _v3.set(
        e * kp * _v2.x - kd * w.x * Math.max(e, 0.3),
        e * kp * _v2.y - kd * w.y * Math.max(e, 0.3),
        e * kp * _v2.z - kd * w.z * Math.max(e, 0.3)
      );
      _q2.copy(_q).invert();
      _v3.applyQuaternion(_q2);
      _v3.set(_v3.x * b.inertia.x, _v3.y * b.inertia.y, _v3.z * b.inertia.z);
      _v3.applyQuaternion(_q);
      b.torque.x += _v3.x;
      b.torque.y += _v3.y;
      b.torque.z += _v3.z;
    };
    align("pelvis", UP, 120, 16);
    align("chest", UP, 100, 14);
    align("head", UP, 70, 10);
    align("thighA", DOWN, 200, 26);
    align("thighB", DOWN, 200, 26);
    align("shinA", DOWN, 200, 26);
    align("shinB", DOWN, 200, 26);
    // lift the pelvis to standing height (gentle) and damp sliding
    const pel = this.rb.pelvis;
    const g = -this.world.gravity.y;
    const ty = pel.restPos.y;
    const y = pel.body.position.y;
    const vy = pel.body.velocity.y;
    const f = this.totalMass * (g * SUPPORT_FF + SUPPORT_K * (ty - y) - SUPPORT_D * vy);
    if (f > 0) pel.body.force.y += Math.min(f, this.totalMass * g * 1.4) * e;
    pel.body.force.x -= pel.body.velocity.x * this.totalMass * 1.2 * e;
    pel.body.force.z -= pel.body.velocity.z * this.totalMass * 1.2 * e;
  };
}
