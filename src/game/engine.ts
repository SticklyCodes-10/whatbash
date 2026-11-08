import * as THREE from "three";
import * as CANNON from "cannon-es";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { Ragdoll, GROUP, defaultJoints, BODY_KEYS } from "./ragdoll";
import type { BodyKey } from "./ragdoll";
import { buildProceduralBuddy } from "./buddyProcedural";
import { loadCustomBuddy } from "./buddyGLB";
import { Environment, ENVS } from "./environment";
import type { EnvDef, DynObj } from "./environment";
import { Particles } from "./particles";
import { Sfx } from "./audio";
import { TOOLS } from "./tools";
import type { ToolId } from "./tools";

export interface Stats {
  money: number;
  pain: number;
  combo: number;
  kos: number;
}

export interface GameCallbacks {
  onStats: (s: Stats) => void;
  onPlace: (name: string, emoji: string) => void;
  onModel: (status: string, custom: boolean) => void;
  onReady: () => void;
}

interface Proj extends DynObj {
  kind: "bomb" | "rocket" | "cannon" | "anvil";
  fuse?: number;
  age: number;
  hit?: boolean;
  spark?: THREE.Mesh;
  tickT?: number;
  matA?: THREE.Material;
  matB?: THREE.Material;
}

interface ToolAnim {
  group: THREE.Group;
  t: number;
  dur: number;
  kind: "thrust" | "swing";
  hit: THREE.Vector3;
  dir: THREE.Vector3;
  right: THREE.Vector3;
  P?: THREE.Vector3;
  baseQ?: THREE.Quaternion;
}

interface FxMesh {
  mesh: THREE.Mesh;
  t: number;
  dur: number;
  max: number;
}

interface RayInfo {
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  hit: { body: CANNON.Body; point: THREE.Vector3 } | null;
}

const WORDS = ["POW!", "BAM!", "WHAM!", "BONK!", "SMACK!", "OOF!", "THWACK!", "KAPOW!"];
const OUCH = ["Ouch!", "Oof!", "Ow!", "Yikes!", "Splat!", "Thud!"];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const PincushionShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0.008 }, aspect: { value: 1 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: "uniform sampler2D tDiffuse; uniform float strength; uniform float aspect; varying vec2 vUv; void main(){ vec2 p=(vUv-0.5)*2.0; p.x*=aspect; float r2=dot(p,p); vec2 warped=p*(1.0+strength*r2); warped.x/=aspect; vec2 uv=warped*0.5+0.5; vec4 color=texture2D(tDiffuse,uv); float edge=(1.0-smoothstep(0.72,1.42,r2)); color.rgb*=mix(0.76,1.0,edge); gl_FragColor=vec4(color.rgb,color.a); }"
};


export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  private composer: EffectComposer;
  private lensPass: ShaderPass;
  private menuMode = true;
  private cameraTransition = 1;
  world: CANNON.World;
  raycaster = new THREE.Raycaster();
  rag!: Ragdoll;
  env!: Environment;
  fx = new Particles(2500, THREE.AdditiveBlending);
  smoke = new Particles(1200, THREE.NormalBlending);
  sfx = new Sfx();

  private matGround = new CANNON.Material("ground");
  private matPad = new CANNON.Material("pad");
  private matBall = new CANNON.Material("ball");
  private groundContact: CANNON.ContactMaterial;

  private tool: ToolId = "boot";
  private projs: Proj[] = [];
  private anims: ToolAnim[] = [];
  private fxMeshes: FxMesh[] = [];
  private flash = new THREE.PointLight(0xffaa44, 0, 16, 1.6);
  private zapLight = new THREE.PointLight(0x9fe8ff, 0, 9, 1.5);
  private zapLines: THREE.LineSegments;
  private zapTimer = 0;
  private zapTick = 0;
  private grab: {
    body: CANNON.Body;
    local: CANNON.Vec3;
    plane: THREE.Plane;
    target: THREE.Vector3;
  } | null = null;

  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;
  private timeScale = 1;
  private shake = 0;
  private statsDirty = true;
  private lastImpactT = 0;
  private envIndex = -1;
  private ro: ResizeObserver;
  private following = true;

  // stats
  private money = 0;
  private pain = 0;
  private combo = 0;
  private kos = 0;
  private lastHit = -10;
  private customActive = false;

  constructor(
    private container: HTMLElement,
    private overlay: HTMLElement,
    private cb: GameCallbacks
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    this.camera.position.set(1.75, 1.65, 3.45);

    // physics
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) });
    (this.world.solver as CANNON.GSSolver).iterations = 24;
    this.world.defaultContactMaterial.friction = 0.5;
    this.world.defaultContactMaterial.restitution = 0.2;
    this.world.allowSleep = false;
    const dm = this.world.defaultMaterial;
    this.groundContact = new CANNON.ContactMaterial(this.matGround, dm, { friction: 0.5, restitution: 0.25 });
    this.world.addContactMaterial(this.groundContact);
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.matBall, this.matGround, { friction: 0.4, restitution: 0.78 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.matBall, dm, { friction: 0.4, restitution: 0.6 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.matBall, this.matBall, { friction: 0.3, restitution: 0.8 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.matPad, dm, { friction: 0.2, restitution: 1.15 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.matPad, this.matBall, { friction: 0.2, restitution: 1.1 }));
    this.world.addEventListener("preStep", this.preStep);

    // controls
    this.renderer.domElement.addEventListener("pointerdown", this.onPointerDown, true);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = 15;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03;
    this.controls.target.set(0, 1, 0);
    this.camera.lookAt(this.controls.target);
    this.controls.enablePan = false;
    this.controls.enabled = false;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.lensPass = new ShaderPass(PincushionShader);
    this.composer.addPass(this.lensPass);

    // fx
    this.scene.add(this.fx.points, this.smoke.points, this.flash, this.zapLight);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(40 * 2 * 3), 3));
    this.zapLines = new THREE.LineSegments(
      lg,
      new THREE.LineBasicMaterial({ color: 0xc9f6ff, transparent: true, opacity: 0.95 })
    );
    this.zapLines.frustumCulled = false;
    this.zapLines.visible = false;
    this.scene.add(this.zapLines);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
  }

  // ------------------------------------------------------------------ setup
  async init() {
    this.newPlace(true);
    const custom = await loadCustomBuddy().catch((e) => {
      console.warn("[Buddy] failed to load What.glb", e);
      return null;
    });
    if (this.disposed) return;

    if (custom) {
      this.customActive = true;
      if (custom.joints) {
        this.rag = new Ragdoll(this.world, custom.joints);
        for (const key of BODY_KEYS) {
          const bone = custom.bones[key];
          if (bone) this.rag.bindBone(key, bone, key === "pelvis");
        }
        this.scene.add(custom.holder);
      } else {
        this.rag = new Ragdoll(this.world, defaultJoints());
        this.rag.attach("chest", custom.holder);
      }
      this.cb.onModel(custom.report, true);
    } else {
      this.rag = new Ragdoll(this.world, defaultJoints());
      buildProceduralBuddy(this.rag, this.rag.joints);
      this.cb.onModel("Default buddy – put your model at public/What.glb to use it", false);
    }
    this.scene.add(this.rag.root);
    for (const r of this.rag.list) r.body.addEventListener("collide", this.onRagCollide);
    this.rag.reset(new THREE.Vector3(0, 0.03, 0));
    this.rag.syncVisuals();
    this.camera.position.set(1.75, 1.65, 3.45);
    this.controls.target.set(0, 1.05, 0);
    this.camera.lookAt(this.controls.target);
    this.controls.enabled = false;
    this.cb.onReady();
    this.cb.onPlace(this.env.def.name, this.env.def.emoji);
    this.pushStats();
    this.clock.start();
    this.loop();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown, true);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    this.controls.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.lensPass.uniforms.aspect.value = w / h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const scale = (h * this.renderer.getPixelRatio()) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.fx.setScale(scale);
    this.smoke.setScale(scale);
  }

  // ------------------------------------------------------------ public API
  startGame() {
    this.menuMode = false;
    this.cameraTransition = 0;
    this.controls.enabled = false;
    this.following = true;
    this.sfx.whoosh();
  }
  getBuddySnapshot(): BuddyBodySave[] {
    if (!this.rag) return [];
    return this.rag.list.map(({ key, body }) => ({
      key,
      position: [body.position.x, body.position.y, body.position.z] as [number, number, number],
      quaternion: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w] as [number, number, number, number],
      velocity: [body.velocity.x, body.velocity.y, body.velocity.z] as [number, number, number],
      angularVelocity: [body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z] as [number, number, number],
    }));
  }
  restoreBuddySnapshot(snapshot: BuddyBodySave[]) {
    if (!this.rag || !Array.isArray(snapshot)) return;
    for (const saved of snapshot) {
      const body = this.rag.rb[saved.key]?.body;
      if (!body || !saved.position || !saved.quaternion || !saved.velocity || !saved.angularVelocity) continue;
      body.position.set(...saved.position);
      body.quaternion.set(...saved.quaternion);
      body.velocity.set(...saved.velocity);
      body.angularVelocity.set(...saved.angularVelocity);
      body.aabbNeedsUpdate = true;
    }
    this.rag.syncVisuals();
  }
  restoreStats(stats: Stats) {
    this.money = Math.max(0, stats.money || 0);
    this.pain = Math.max(0, Math.min(100, stats.pain || 0));
    this.combo = Math.max(0, stats.combo || 0);
    this.kos = Math.max(0, stats.kos || 0);
    this.pushStats();
  }
  setTool(t: ToolId) {
    this.tool = TOOLS.find((item) => item.id === t)?.action ?? t;
    this.sfx.tick();
  }
  selectEnvironment(id: string) {
    const def = ENVS.find((item) => item.id === id);
    if (!def) return;
    this.envIndex = ENVS.indexOf(def);
    this.buildEnv(def);
    this.rag.reset(new THREE.Vector3(0, 0.03, 0));
    this.rag.syncVisuals();
    this.sfx.whoosh();
  }
  setBuddyColors(shirt: string, hair: string) {
    if (!this.rag) return;
    this.rag.root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of mats) {
        const standard = material as THREE.MeshStandardMaterial;
        if (!standard.color) continue;
        if (standard.userData.baseHex === undefined) standard.userData.baseHex = standard.color.getHex();
        const baseHex = standard.userData.baseHex as number;
        if (baseHex === 0x2fd3cb || baseHex === 0x16a6a0) standard.color.set(shirt);
        if (baseHex === 0x2a1a12) standard.color.set(hair);
      }
    });
  }
  setStand(on: boolean) {
    if (this.rag) this.rag.standEnabled = on;
  }
  setSlowmo(on: boolean) {
    this.timeScale = on ? 0.25 : 1;
  }
  setSound(on: boolean) {
    this.sfx.enabled = on;
  }
  setFollow(on: boolean) {
    this.following = on;
  }

  newPlace(first = false) {
    let idx = this.envIndex;
    while (idx === this.envIndex) idx = Math.floor(Math.random() * ENVS.length);
    this.buildEnv(ENVS[idx]);
    this.envIndex = idx;
    if (!first && this.rag) {
      this.rag.reset(new THREE.Vector3(0, 3.2, 0));
      this.rag.stand = 0;
      this.rag.syncVisuals();
      this.cb.onPlace(this.env.def.name, this.env.def.emoji);
    }
    if (!first) this.sfx.whoosh();
  }

  resetBuddy() {
    this.buildEnv(this.env.def);
    this.rag.reset(new THREE.Vector3(0, 0.03, 0));
    this.rag.syncVisuals();
    this.sfx.whoosh();
  }

  private buildEnv(def: EnvDef) {
    if (this.env) this.env.dispose();
    this.clearProjs();
    this.env = new Environment(this.scene, this.world, def, {
      ground: this.matGround,
      pad: this.matPad,
      ball: this.matBall,
    });
    this.world.gravity.set(0, def.gravity, 0);
    this.groundContact.friction = def.friction;
    this.groundContact.restitution = def.id === "moon" ? 0.2 : 0.25;
    // tint the zap/flash lights to be safe with fog
    this.cb.onPlace(def.name, def.emoji);
  }

  // ------------------------------------------------------------- stats/UI
  private pushStats() {
    this.statsDirty = false;
    this.cb.onStats({
      money: this.money,
      pain: Math.min(100, this.pain),
      combo: this.combo,
      kos: this.kos,
    });
  }

  private popup(text: string, p: THREE.Vector3, cls = "") {
    const v = p.clone().project(this.camera);
    if (v.z > 1) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const el = document.createElement("div");
    el.className = "popup " + cls;
    el.textContent = text;
    el.style.left = `${(v.x * 0.5 + 0.5) * w + rnd(-18, 18)}px`;
    el.style.top = `${(-v.y * 0.5 + 0.5) * h + rnd(-10, 10)}px`;
    this.overlay.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  private registerHit(base: number, pos: THREE.Vector3) {
    const now = performance.now() / 1000;
    this.combo = now - this.lastHit < 2.2 ? this.combo + 1 : 1;
    this.lastHit = now;
    const mult = Math.min(this.combo, 10);
    const gain = Math.round(base * mult);
    this.money += gain;
    this.popup(`+$${gain}`, pos.clone().add(new THREE.Vector3(0, 0.35, 0)), "money");
    if (this.combo >= 3) {
      this.popup(`${this.combo}x COMBO!`, pos.clone().add(new THREE.Vector3(0, 0.75, 0)), "combo");
    }
    this.sfx.coin();
    this.statsDirty = true;
  }

  private addPain(amount: number) {
    this.pain += amount;
    this.statsDirty = true;
    if (this.pain >= 100) {
      this.pain = 0;
      this.kos++;
      this.money += 250;
      const c = this.rag.center(new THREE.Vector3());
      this.popup("K.O.!  +$250", c.clone().add(new THREE.Vector3(0, 0.8, 0)), "ko");
      this.fx.burst(c, 140, 9, [0xff5577, 0xffd93d, 0x4dd2ff, 0x7cff6b, 0xc084fc], 0.16, 1.6, { gravity: 6, drag: 0.8, up: 0.8 });
      this.rag.stand = 0;
      this.sfx.coin();
    }
  }

  // -------------------------------------------------------------- picking
  private castRay(clientX: number, clientY: number): RayInfo {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const o = this.raycaster.ray.origin.clone();
    const d = this.raycaster.ray.direction.clone();
    const to = o.clone().add(d.clone().multiplyScalar(150));
    const res = new CANNON.RaycastResult();
    this.world.raycastClosest(
      new CANNON.Vec3(o.x, o.y, o.z),
      new CANNON.Vec3(to.x, to.y, to.z),
      { collisionFilterMask: GROUP.RAG | GROUP.ENV | GROUP.PROP, skipBackfaces: true },
      res
    );
    const hit =
      res.hasHit && res.body
        ? {
            body: res.body,
            point: new THREE.Vector3(res.hitPointWorld.x, res.hitPointWorld.y, res.hitPointWorld.z),
          }
        : null;
    return { origin: o, dir: d, hit };
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.menuMode || !this.rag) return;
    this.sfx.unlock();
    if (e.pointerType === "mouse" && e.button !== 0) {
      this.controls.enabled = true;
      return;
    }
    if (!e.isPrimary) {
      this.controls.enabled = true;
      return;
    }
    const r = this.castRay(e.clientX, e.clientY);
    if (!r.hit) {
      this.controls.enabled = true;
      return;
    }
    this.controls.enabled = false;
    this.useTool(r);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.grab) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.grab.plane, p)) {
      p.y = Math.max(p.y, 0.15);
      p.x = THREE.MathUtils.clamp(p.x, -15, 15);
      p.z = THREE.MathUtils.clamp(p.z, -15, 15);
      this.grab.target.copy(p);
    }
  };

  private onPointerUp = () => {
    this.grab = null;
    this.controls.enabled = true;
  };

  // ---------------------------------------------------------------- tools
  private useTool(r: RayInfo) {
    const hit = r.hit!;
    switch (this.tool) {
      case "boot":
        this.melee(r, "boot", 11, true);
        break;
      case "fist":
        this.melee(r, "fist", 7.5, true);
        break;
      case "bat":
        this.melee(r, "bat", 16, true);
        break;
      case "hammer":
        this.melee(r, "hammer", 13, false);
        break;
      case "bomb":
        this.spawnBomb(hit.point);
        break;
      case "rocket":
        this.spawnRocket(r);
        break;
      case "cannon":
        this.spawnCannon(r);
        break;
      case "anvil":
        this.spawnAnvil(hit.point);
        break;
      case "zap":
        if (this.rag.bodySet.has(hit.body)) this.zap(hit.point);
        else {
          this.fx.burst(hit.point, 20, 5, [0xfff59d, 0x9ff3ff], 0.1, 0.4, { gravity: 6 });
          this.sfx.zap();
        }
        break;
      case "grab":
        if (this.rag.bodySet.has(hit.body) || hit.body.mass > 0) {
          const plane = new THREE.Plane();
          const n = this.camera.getWorldDirection(new THREE.Vector3());
          plane.setFromNormalAndCoplanarPoint(n, hit.point);
          const local = hit.body.pointToLocalFrame(new CANNON.Vec3(hit.point.x, hit.point.y, hit.point.z));
          this.grab = { body: hit.body, local, plane, target: hit.point.clone() };
          this.sfx.tick();
        } else {
          this.controls.enabled = true;
        }
        break;
    }
  }

  private melee(r: RayInfo, tool: "boot" | "fist" | "bat" | "hammer", power: number, upBias: boolean) {
    const hit = r.hit!;
    const dir = r.dir.clone();
    if (upBias) dir.y += 0.32;
    else dir.y = Math.min(dir.y, -0.05);
    dir.normalize();

    this.spawnToolVisual(tool, hit.point, dir);
    const isRag = this.rag.bodySet.has(hit.body);
    const p = hit.point;
    const pw = power * (this.world.gravity.y > -5 ? 0.7 : 1);

    if (isRag) {
      for (const rb of this.rag.list) {
        const b = rb.body;
        let dv: number;
        if (b === hit.body) dv = pw;
        else {
          const d = Math.hypot(b.position.x - p.x, b.position.y - p.y, b.position.z - p.z);
          dv = pw * Math.max(0.18, 0.55 * (1 - d / 2.4));
        }
        b.applyImpulse(new CANNON.Vec3(dir.x * dv * b.mass, dir.y * dv * b.mass, dir.z * dv * b.mass));
        if (b === hit.body) {
          b.angularVelocity.x += rnd(-5, 5);
          b.angularVelocity.y += rnd(-5, 5);
          b.angularVelocity.z += rnd(-5, 5);
        }
      }
      this.rag.stand = 0;
      this.registerHit(Math.round(8 + power * 1.6), p);
      this.addPain(power * 0.9);
      const w = tool === "hammer" ? "BONK!" : tool === "bat" ? "HOME RUN!" : WORDS[Math.floor(Math.random() * WORDS.length)];
      this.popup(w, p.clone().add(new THREE.Vector3(0, 0.1, 0)), "word");
    } else if (hit.body.mass > 0) {
      const b = hit.body;
      b.applyImpulse(
        new CANNON.Vec3(dir.x * pw * b.mass * 1.4, dir.y * pw * b.mass * 1.4, dir.z * pw * b.mass * 1.4),
        new CANNON.Vec3(p.x - b.position.x, p.y - b.position.y, p.z - b.position.z)
      );
    }
    this.fx.burst(p, 52, 8, [0xfff59d, 0xffffff, 0xffb84d, 0x22d3ee, 0xff4fd8], 0.18, 0.62, { gravity: 5, drag: 1.8 });
    this.fx.burst(p, 14, 2.4, [0xffffff, 0x67e8f9], 0.42, 0.22, { drag: 5, grow: 3 });
    this.fx.burst(p, 6, 1, [0xffffff], 0.5, 0.25, { drag: 4, grow: 2 });
    this.shake = Math.min(1.35, this.shake + power * 0.028);
    this.flash.position.copy(p);
    this.flash.color.setHex(tool === "hammer" ? 0xffb347 : tool === "bat" ? 0xff4fd8 : 0x67e8f9);
    this.flash.intensity = Math.min(900, 260 + power * 28);
    this.fx.burst(p, 18, 3.5, [0x67e8f9, 0xf0abfc, 0xffffff], 0.24, 0.8, { gravity: 1.5, drag: 1.2, grow: 1.5 });
    this.sfx.thud(power / 16, tool === "hammer" ? 0.7 : tool === "bat" ? 1.2 : 1);
  }

  private spawnToolVisual(tool: "boot" | "fist" | "bat" | "hammer", hit: THREE.Vector3, dir: THREE.Vector3) {
    const g = new THREE.Group();
    const m = (c: number, rough = 0.6) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };
    const camFwd = this.camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(camFwd, new THREE.Vector3(0, 1, 0)).normalize();
    const anim: ToolAnim = { group: g, t: 0, dur: 0.75, kind: "thrust", hit: hit.clone(), dir: dir.clone(), right };

    if (tool === "boot") {
      add(new THREE.BoxGeometry(0.38, 0.3, 0.75), m(0x7c4a21), 0, 0, -0.38);
      add(new THREE.BoxGeometry(0.42, 0.09, 0.8), m(0x241a14), 0, -0.19, -0.37);
      add(new THREE.CylinderGeometry(0.19, 0.22, 0.7, 14), m(0x8d5a2b), 0, 0.45, -0.62);
      add(new THREE.CylinderGeometry(0.23, 0.23, 0.12, 14), m(0xe5e7eb), 0, 0.82, -0.62);
      for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.24, 0.025, 0.05), m(0xf5f5f5), 0, 0.17, -0.25 - i * 0.14);
    } else if (tool === "fist") {
      add(new THREE.SphereGeometry(0.24, 18, 14), m(0xe11d48, 0.4), 0, 0, -0.22);
      add(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 14), m(0xf8fafc), 0, 0, -0.65).rotation.x = Math.PI / 2;
      add(new THREE.SphereGeometry(0.1, 12, 10), m(0xe11d48, 0.4), 0.2, 0.1, -0.3);
    } else {
      anim.kind = "swing";
      const L = tool === "bat" ? 1.7 : 1.4;
      if (tool === "bat") {
        const geo = new THREE.CylinderGeometry(0.13, 0.05, L, 14);
        add(geo, m(0xc58b4a, 0.5), 0, L / 2, 0);
        add(new THREE.CylinderGeometry(0.052, 0.052, 0.3, 10), m(0x222222), 0, 0.15, 0);
        add(new THREE.SphereGeometry(0.07, 10, 8), m(0xc58b4a), 0, 0.0, 0);
      } else {
        add(new THREE.CylinderGeometry(0.05, 0.05, L, 10), m(0x9a6a3a), 0, L / 2, 0);
        add(new THREE.BoxGeometry(0.34, 0.3, 0.7), m(0x64748b, 0.35), 0, L - 0.05, 0);
        add(new THREE.BoxGeometry(0.36, 0.08, 0.72), m(0xef4444, 0.5), 0, L - 0.05, 0);
      }
      const handle = new THREE.Vector3()
        .addScaledVector(camFwd, -0.45)
        .add(new THREE.Vector3(0, 0.95, 0))
        .addScaledVector(right, 0.35)
        .normalize();
      const P = hit.clone().addScaledVector(handle, L);
      const v0 = handle.clone().multiplyScalar(-1);
      anim.P = P;
      anim.baseQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v0);
      if (tool === "hammer") {
        // keep head broad side facing travel direction
        anim.baseQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
      }
    }
    this.scene.add(g);
    this.anims.push(anim);
    this.sfx.whoosh();
  }

  private updateAnims(dt: number) {
    const Z = new THREE.Vector3(0, 0, 1);
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      const u = a.t;
      const appr = THREE.MathUtils.clamp(u / 0.14, 0, 1);
      const ret = THREE.MathUtils.clamp((u - 0.28) / 0.35, 0, 1);
      if (a.kind === "thrust") {
        const back = 2.1 * (1 - ease(appr)) + 1.2 * ret;
        a.group.position.copy(a.hit).addScaledVector(a.dir, -back);
        a.group.quaternion.setFromUnitVectors(Z, a.dir);
      } else {
        const th = 1.6 * (1 - ease(appr)) - 0.2 * Math.sin(Math.min(1, (u - 0.14) / 0.2) * Math.PI) + 0.9 * ret;
        a.group.position.copy(a.P!);
        a.group.quaternion.setFromAxisAngle(a.right, th).multiply(a.baseQ!);
      }
      const s = 1 - Math.max(0, (ret - 0.5) * 2);
      a.group.scale.setScalar(Math.max(0.001, s));
      if (a.t > a.dur) {
        this.scene.remove(a.group);
        a.group.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.geometry.dispose();
            (m.material as THREE.Material).dispose();
          }
        });
        this.anims.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------- projectiles
  private addProj(p: Proj) {
    this.projs.push(p);
    this.scene.add(p.mesh);
    if (this.projs.length > 28) {
      const old = this.projs.find((q) => q.kind !== "bomb");
      if (old) this.removeProj(old);
    }
  }

  private removeProj(p: Proj) {
    this.world.removeBody(p.body);
    this.scene.remove(p.mesh);
    p.mesh.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
    const i = this.projs.indexOf(p);
    if (i >= 0) this.projs.splice(i, 1);
  }

  private clearProjs() {
    for (const p of [...this.projs]) this.removeProj(p);
  }

  private mkBody(mass: number, shape: CANNON.Shape, pos: THREE.Vector3) {
    const b = new CANNON.Body({
      mass,
      shape,
      linearDamping: 0.02,
      angularDamping: 0.1,
      collisionFilterGroup: GROUP.PROP,
      collisionFilterMask: -1,
    });
    b.position.set(pos.x, pos.y, pos.z);
    b.previousPosition.copy(b.position);
    b.interpolatedPosition.copy(b.position);
    this.world.addBody(b);
    return b;
  }

  private spawnBomb(point: THREE.Vector3) {
    const pos = point.clone().add(new THREE.Vector3(0, 0.7, 0));
    const body = this.mkBody(2, new CANNON.Sphere(0.25), pos);
    body.material = this.matBall;
    const g = new THREE.Group();
    const matA = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.35, metalness: 0.4 });
    const matB = new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0xff2200, emissiveIntensity: 0.8 });
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.25, 20, 14), matA);
    s.castShadow = true;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.1, 10), new THREE.MeshStandardMaterial({ color: 0x9ca3af }));
    cap.position.y = 0.26;
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff9a2e }));
    spark.position.y = 0.42;
    g.add(s, cap, spark);
    g.position.copy(pos);
    this.addProj({ mesh: g, body, kind: "bomb", fuse: 1.5, age: 0, spark, tickT: 0, matA, matB });
    this.sfx.tick();
  }

  private launchOrigin(r: RayInfo) {
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const o = this.camera.position.clone().addScaledVector(fwd, 1.4).addScaledVector(right, 0.45).add(new THREE.Vector3(0, -0.4, 0));
    const target = r.hit ? r.hit.point : r.origin.clone().addScaledVector(r.dir, 40);
    const dir = target.clone().sub(o).normalize();
    return { o, dir };
  }

  private spawnRocket(r: RayInfo) {
    const { o, dir } = this.launchOrigin(r);
    const body = this.mkBody(1, new CANNON.Sphere(0.14), o);
    body.velocity.set(dir.x * 42, dir.y * 42, dir.z * 42);
    body.linearDamping = 0;
    const g = new THREE.Group();
    const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 12), mat(0xf8fafc));
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.25, 12), mat(0xef4444));
    nose.position.y = 0.42;
    g.add(tube, nose);
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.16), mat(0xef4444));
      fin.position.set(0, -0.25, 0);
      const a = (i / 3) * Math.PI * 2;
      const holder = new THREE.Group();
      holder.rotation.y = a;
      fin.position.set(0, -0.25, 0.12);
      holder.add(fin);
      g.add(holder);
    }
    const p: Proj = { mesh: g, body, kind: "rocket", age: 0 };
    body.addEventListener("collide", () => {
      p.hit = true;
    });
    this.addProj(p);
    this.sfx.whoosh();
    this.shake = Math.min(1, this.shake + 0.1);
  }

  private spawnCannon(r: RayInfo) {
    const { o, dir } = this.launchOrigin(r);
    const body = this.mkBody(14, new CANNON.Sphere(0.3), o);
    body.velocity.set(dir.x * 30, dir.y * 30, dir.z * 30);
    const g = new THREE.Group();
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0x2b303a, roughness: 0.3, metalness: 0.8 })
    );
    s.castShadow = true;
    g.add(s);
    this.addProj({ mesh: g, body, kind: "cannon", age: 0 });
    this.fx.burst(o, 18, 5, [0xffd27a, 0xffffff], 0.2, 0.3, { drag: 3 });
    this.smoke.burst(o, 8, 2, [0x888888], 0.6, 0.9, { grow: 2, drag: 2 });
    this.sfx.explosion();
    this.shake = Math.min(1, this.shake + 0.25);
  }

  private spawnAnvil(point: THREE.Vector3) {
    const pos = new THREE.Vector3(point.x, 11, point.z);
    const body = this.mkBody(
      30,
      new CANNON.Box(new CANNON.Vec3(0.4, 0.3, 0.28)),
      pos
    );
    body.quaternion.setFromEuler(0, rnd(0, 6.28), 0);
    body.angularVelocity.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1));
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.35, metalness: 0.85 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.5), steel);
    top.position.y = 0.19;
    const waist = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.34), steel);
    waist.position.y = 0;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.16, 0.48), steel);
    base.position.y = -0.22;
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 12), steel);
    horn.rotation.z = Math.PI / 2;
    horn.position.set(-0.6, 0.19, 0);
    const label = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.51), new THREE.MeshStandardMaterial({ color: 0xfacc15 }));
    label.position.set(0.1, 0.19, 0);
    for (const m of [top, waist, base, horn, label]) {
      m.castShadow = true;
      g.add(m);
    }
    g.position.copy(pos);
    this.addProj({ mesh: g, body, kind: "anvil", age: 0 });
    // warning marker on the ground
    const c = new THREE.Vector3(point.x, point.y + 0.05, point.z);
    this.fx.burst(c, 12, 1.5, [0xff4d4d], 0.5, 0.8, { drag: 3 });
    this.sfx.whoosh();
  }

  // --------------------------------------------------------------- effects
  private explode(pt: THREE.Vector3, R: number, power: number, exclude?: Proj) {
    let bestF = 0;
    const v = new THREE.Vector3();
    const push = (body: CANNON.Body, k: number) => {
      v.set(body.position.x - pt.x, body.position.y - pt.y + 0.15, body.position.z - pt.z);
      const d = v.length();
      if (d > R) return 0;
      const f = 1 - d / R;
      v.normalize();
      v.y += 0.4;
      v.normalize();
      const dv = power * (0.3 + 0.7 * f) * k * (this.world.gravity.y > -5 ? 0.8 : 1);
      body.applyImpulse(new CANNON.Vec3(v.x * dv * body.mass, v.y * dv * body.mass, v.z * dv * body.mass));
      body.angularVelocity.x += rnd(-8, 8) * f;
      body.angularVelocity.y += rnd(-8, 8) * f;
      body.angularVelocity.z += rnd(-8, 8) * f;
      return f;
    };
    for (const rb of this.rag.list) bestF = Math.max(bestF, push(rb.body, 1));
    for (const d of this.env.dyn) push(d.body, 0.8);
    for (const p of this.projs) if (p !== exclude) push(p.body, 0.8);

    if (bestF > 0) {
      this.rag.stand = 0;
      const c = this.rag.center(new THREE.Vector3());
      this.registerHit(Math.round(30 + power * 2 * bestF), c);
      this.addPain(power * 1.6 * bestF);
      this.popup("BOOM!", c.clone().add(new THREE.Vector3(0, 0.2, 0)), "word");
    }

    this.fx.burst(pt, 90, 9 * (R / 5), [0xffe08a, 0xff9a2e, 0xff5a1f], 0.55, 0.7, { drag: 2.4, grow: 1.6 });
    this.fx.burst(pt, 50, 15, [0xfff3b0], 0.13, 1.0, { gravity: 9, drag: 0.5 });
    this.smoke.burst(pt, 36, 3.5, [0x4b4b4b, 0x6b6b6b, 0x2d2d2d], 1.1, 1.8, { drag: 1.2, grow: 2.2, up: 0.8, gravity: -1 });
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({
        color: 0xffa733,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    ball.position.copy(pt);
    this.scene.add(ball);
    this.fxMeshes.push({ mesh: ball, t: 0, dur: 0.45, max: R * 0.55 });
    this.flash.position.copy(pt).add(new THREE.Vector3(0, 1, 0));
    this.flash.intensity = 160;
    this.shake = Math.min(1.4, this.shake + 0.5 * (R / 5));
    this.sfx.explosion();
  }

  private zap(point: THREE.Vector3) {
    this.zapTimer = 1.4;
    this.rag.stand = 0;
    this.zapLines.visible = true;
    this.registerHit(25, point);
    this.addPain(14);
    this.popup("ZZZAP!", point.clone().add(new THREE.Vector3(0, 0.1, 0)), "word zap");
    this.sfx.zap();
  }

  private updateZap(dt: number) {
    if (this.zapTimer <= 0) {
      if (this.zapLines.visible) {
        this.zapLines.visible = false;
        this.zapLight.intensity = 0;
      }
      return;
    }
    this.zapTimer -= dt;
    this.zapTick -= dt;
    const links: [BodyKey, BodyKey][] = [
      ["pelvis", "chest"],
      ["chest", "head"],
      ["chest", "uArmA"],
      ["chest", "uArmB"],
      ["uArmA", "fArmA"],
      ["uArmB", "fArmB"],
      ["pelvis", "thighA"],
      ["pelvis", "thighB"],
      ["thighA", "shinA"],
      ["thighB", "shinB"],
    ];
    const attr = this.zapLines.geometry.getAttribute("position") as THREE.BufferAttribute;
    let k = 0;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const m = new THREE.Vector3();
    const jit = (s: number) => rnd(-s, s);
    for (const [ka, kb] of links) {
      const pa = this.rag.rb[ka].body.position;
      const pb = this.rag.rb[kb].body.position;
      a.set(pa.x, pa.y, pa.z);
      b.set(pb.x, pb.y, pb.z);
      let prev = a.clone();
      for (let s = 1; s <= 3; s++) {
        const t = s / 3;
        m.copy(a).lerp(b, t);
        if (s < 3) m.add(new THREE.Vector3(jit(0.14), jit(0.14), jit(0.14)));
        attr.setXYZ(k++, prev.x, prev.y, prev.z);
        attr.setXYZ(k++, m.x, m.y, m.z);
        prev = m.clone();
      }
    }
    while (k < attr.count) attr.setXYZ(k++, 0, -100, 0);
    attr.needsUpdate = true;
    const c = this.rag.center(new THREE.Vector3());
    this.zapLight.position.copy(c);
    this.zapLight.intensity = Math.random() < 0.6 ? rnd(20, 60) : 0;
    if (this.zapTick <= 0) {
      this.zapTick = 0.16;
      this.money += 4;
      this.statsDirty = true;
      this.addPain(2.2);
    }
    const rb = this.rag.list[Math.floor(Math.random() * this.rag.list.length)];
    const p = rb.body.position;
    this.fx.burst(new THREE.Vector3(p.x, p.y, p.z), 3, 4, [0xfff59d, 0x9ff3ff, 0xffffff], 0.1, 0.35, { gravity: 5 });
  }

  private onRagCollide = (e: { contact: CANNON.ContactEquation; body: CANNON.Body }) => {
    const impact = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (impact < 4.5) return;
    const now = performance.now();
    if (now - this.lastImpactT < 110) return;
    this.lastImpactT = now;
    const pos = new THREE.Vector3();
    const c = e.contact;
    const bi = c.bi;
    pos.set(bi.position.x + c.ri.x, bi.position.y + c.ri.y, bi.position.z + c.ri.z);
    if (e.body.material === this.matPad) {
      this.sfx.boing();
      this.fx.burst(pos, 14, 4, [0x22ff88, 0xffffff], 0.12, 0.4, { gravity: 3 });
      this.rag.stand = 0;
      return;
    }
    this.sfx.thud(Math.min(1, impact / 18), 0.9);
    this.fx.burst(pos, Math.min(30, 4 + impact), Math.min(7, impact * 0.5), [0xffffff, 0xfff1a8], 0.1, 0.35, { gravity: 6, drag: 2 });
    if (impact > 7) this.rag.stand = 0;
    if (impact > 6.5) {
      const heavy = e.body.mass > 8;
      this.money += Math.round(impact * (heavy ? 2.2 : 0.9));
      this.addPain(impact * (heavy ? 0.9 : 0.5));
      if (impact > 10) this.popup(heavy ? "BONK!" : OUCH[Math.floor(Math.random() * OUCH.length)], pos, "word small");
      this.shake = Math.min(1, this.shake + impact * 0.008);
      this.statsDirty = true;
    }
  };

  private preStep = () => {
    // rocket anti-gravity
    for (const p of this.projs) {
      if (p.kind === "rocket") p.body.force.y -= this.world.gravity.y * p.body.mass;
    }
    // grabbing
    if (this.grab) {
      const g = this.grab;
      const b = g.body;
      const wp = b.pointToWorldFrame(g.local);
      const err = new THREE.Vector3(g.target.x - wp.x, g.target.y - wp.y, g.target.z - wp.z);
      if (err.length() > 4) err.setLength(4);
      const isRag = this.rag.bodySet.has(b);
      const meff = isRag ? Math.max(b.mass * 2.5, this.rag.totalMass * 0.3) : b.mass * 1.5;
      const k = 90;
      const c = 15;
      const fx = meff * (k * err.x - c * b.velocity.x);
      const fy = meff * (k * err.y - c * b.velocity.y) + (isRag ? 0 : b.mass * -this.world.gravity.y);
      const fz = meff * (k * err.z - c * b.velocity.z);
      const maxF = meff * 600;
      const f = new CANNON.Vec3(fx, fy, fz);
      if (f.length() > maxF) f.scale(maxF / f.length(), f);
      b.applyForce(f, new CANNON.Vec3(wp.x - b.position.x, wp.y - b.position.y, wp.z - b.position.z));
      if (isRag) this.rag.stand = 0;
    }
    // zap jitter
    if (this.zapTimer > 0) {
      for (const rb of this.rag.list) {
        const b = rb.body;
        b.force.x += rnd(-1, 1) * rb.mass * 55;
        b.force.y += rnd(-0.3, 1) * rb.mass * 55;
        b.force.z += rnd(-1, 1) * rb.mass * 55;
        b.torque.x += rnd(-1, 1) * rb.mass * 4;
        b.torque.y += rnd(-1, 1) * rb.mass * 4;
        b.torque.z += rnd(-1, 1) * rb.mass * 4;
      }
    }
  };

  // ------------------------------------------------------------------ loop
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const rawDt = Math.min(this.clock.getDelta(), 0.05);
    const dt = rawDt * this.timeScale;

    this.world.step(1 / 60, dt, 5);

    this.env?.update(rawDt);

    // standing recovery
    if (!this.grab && this.zapTimer <= 0) this.rag.stand = Math.min(1, this.rag.stand + dt / 4);

    // projectiles
    for (const p of [...this.projs]) {
      p.age += dt;
      p.mesh.position.set(p.body.interpolatedPosition.x, p.body.interpolatedPosition.y, p.body.interpolatedPosition.z);
      p.mesh.quaternion.set(
        p.body.interpolatedQuaternion.x,
        p.body.interpolatedQuaternion.y,
        p.body.interpolatedQuaternion.z,
        p.body.interpolatedQuaternion.w
      );
      if (p.kind === "bomb") {
        p.fuse! -= dt;
        p.tickT! -= dt;
        const urgency = 1 - p.fuse! / 1.5;
        if (p.tickT! <= 0) {
          p.tickT = 0.5 - urgency * 0.35;
          this.sfx.tick();
        }
        const flashOn = Math.sin(p.age * (10 + urgency * 30)) > 0;
        (p.mesh.children[0] as THREE.Mesh).material = flashOn ? p.matB! : p.matA!;
        const top = new THREE.Vector3(0, 0.42, 0).applyQuaternion(p.mesh.quaternion).add(p.mesh.position);
        this.fx.burst(top, 1, 2, [0xffd27a, 0xff8a2e], 0.12, 0.3, { gravity: 3 });
        if (p.fuse! <= 0) {
          this.explode(p.mesh.position.clone(), 6.5, 24, p);
          this.removeProj(p);
        }
      } else if (p.kind === "rocket") {
        const v = p.body.velocity;
        const dirv = new THREE.Vector3(v.x, v.y, v.z);
        if (dirv.lengthSq() > 1) p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirv.normalize());
        const tail = new THREE.Vector3(0, -0.4, 0).applyQuaternion(p.mesh.quaternion).add(p.mesh.position);
        this.fx.burst(tail, 2, 2.5, [0xffe08a, 0xff8a2e], 0.28, 0.25, { drag: 4 });
        this.smoke.burst(tail, 1, 0.6, [0x999999, 0xbbbbbb], 0.35, 0.8, { grow: 2.5, drag: 2 });
        if ((p.hit && p.age > 0.03) || p.age > 5) {
          this.explode(p.mesh.position.clone(), 5.5, 26, p);
          this.removeProj(p);
        }
      } else if (p.age > 25) {
        this.removeProj(p);
      }
    }

    // environment dyn props
    for (const d of this.env.dyn) {
      d.mesh.position.set(d.body.interpolatedPosition.x, d.body.interpolatedPosition.y, d.body.interpolatedPosition.z);
      d.mesh.quaternion.set(
        d.body.interpolatedQuaternion.x,
        d.body.interpolatedQuaternion.y,
        d.body.interpolatedQuaternion.z,
        d.body.interpolatedQuaternion.w
      );
    }
    this.env.update(rawDt);

    this.rag.syncVisuals();
    this.updateAnims(rawDt);
    this.updateZap(dt);

    // fx meshes
    for (let i = this.fxMeshes.length - 1; i >= 0; i--) {
      const f = this.fxMeshes[i];
      f.t += rawDt;
      const u = Math.min(1, f.t / f.dur);
      f.mesh.scale.setScalar(0.2 + f.max * ease(u));
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - u);
      if (u >= 1) {
        this.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        (f.mesh.material as THREE.Material).dispose();
        this.fxMeshes.splice(i, 1);
      }
    }
    this.flash.intensity = Math.max(0, this.flash.intensity - rawDt * 420);
    this.fx.update(dt);
    this.smoke.update(dt);

    // pain decay & combo timeout
    if (this.pain > 0) {
      this.pain = Math.max(0, this.pain - rawDt * 1.8);
      this.statsDirty = true;
    }
    if (this.combo > 0 && performance.now() / 1000 - this.lastHit > 2.4) {
      this.combo = 0;
      this.statsDirty = true;
    }
    if (this.statsDirty) this.pushStats();

    // Cinematic main-menu close-up eases into the gameplay camera.
    if (this.menuMode) {
      this.camera.position.lerp(new THREE.Vector3(1.75, 1.65, 3.45), 1 - Math.exp(-2.2 * rawDt));
      this.controls.target.lerp(new THREE.Vector3(0, 1.05, 0), 1 - Math.exp(-2.2 * rawDt));
    } else if (this.cameraTransition < 1) {
      this.cameraTransition = Math.min(1, this.cameraTransition + rawDt / 1.25);
      const t = ease(this.cameraTransition);
      this.camera.position.lerpVectors(new THREE.Vector3(1.75, 1.65, 3.45), new THREE.Vector3(3.6, 2.4, 6.4), t);
      this.controls.target.lerpVectors(new THREE.Vector3(0, 1.05, 0), new THREE.Vector3(0, 1, 0), t);
      if (this.cameraTransition >= 1) this.controls.enabled = true;
    } else if (this.following) {
      const c = this.rag.center(new THREE.Vector3());
      // Follow Buddy's actual position without an artificial arena-sized clamp.
      // Keep only a small vertical safety range so the camera doesn't chase extreme
      // ragdoll launches into the sky or below the floor.
      const goal = new THREE.Vector3(
        c.x * 0.9,
        THREE.MathUtils.clamp(c.y, 0.8, 8),
        c.z * 0.9
      );
      const k = 1 - Math.exp(-2.5 * rawDt);
      const delta = goal.sub(this.controls.target).multiplyScalar(k);
      this.controls.target.add(delta);
      this.camera.position.add(delta);
    }
    this.controls.update();

    // shake + render
    const sh = this.shake;
    const off = new THREE.Vector3();
    if (sh > 0.001) {
      off.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(sh * 0.12);
      this.camera.position.add(off);
      this.shake = Math.max(0, sh - rawDt * 2.6);
    }
    this.composer.render();
    if (sh > 0.001) this.camera.position.sub(off);
  };

  get isCustom() {
    return this.customActive;
  }
}
