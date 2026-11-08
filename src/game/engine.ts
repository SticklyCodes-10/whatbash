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

export interface BuddyBodySave {
  key: BodyKey;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  velocity: [number, number, number];
  angularVelocity: [number, number, number];
}

export interface RemotePlayerPose { id: string; name: string; color: string; bodies: BuddyBodySave[] }

export interface GameCallbacks {
  onStats: (s: Stats) => void;
  onPlace: (name: string, emoji: string) => void;
  onModel: (status: string, custom: boolean) => void;
  onReady: () => void;
  onRadiator: () => void;
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
  private buddySpeech: HTMLDivElement | null = null;
  private endRunElapsed = -1;
  private endRunCallback: (() => void) | null = null;
  private endRunBlastDone = false;
  private radiatorElapsed = -1;
  private animeFightElapsed = -1;
  private animeFightDone: (() => void) | null = null;
  private animeOpponent: Ragdoll | null = null;
  private animeFightObjects: THREE.Object3D[] = [];
  private animeNextHit = 0;
  private animeHitCount = 0;
  private animeFinalDone = false;
  private animeStatsTimer = 0;
  private radiatorDone: (() => void) | null = null;
  private radiatorObjects: THREE.Object3D[] = [];
  private radiatorEarth: THREE.Mesh | null = null;
  private radiatorShip: THREE.Group | null = null;
  private radiatorBeam: THREE.Mesh | null = null;
  private radiatorCore: THREE.Mesh | null = null;
  private radiatorStars: THREE.Points | null = null;
  private radiatorBodyTypes: Array<{ body: CANNON.Body; type: number }> = [];
  private radiatorFire = 0;
  private buddyWeirdElapsed = -1;
  private fighters: Array<{ rag: Ragdoll; age: number; attackAt: number }> = [];
  private ransomFailureElapsed = -1;
  private ransomFailureDone: (() => void) | null = null;
  private ransomOriginalColors: Array<{ material: THREE.Material & { color?: THREE.Color }; color: THREE.Color }> = [];
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
  private toolIdentity: ToolId = "boot";
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
  private remoteAvatars = new Map<string, { group: THREE.Group; parts: Map<string, THREE.Mesh> }>();

  constructor(
    private container: HTMLElement,
    private overlay: HTMLElement,
    private cb: GameCallbacks
  ) {
    const compactDevice = window.matchMedia("(max-width: 700px), (pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: !compactDevice, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, compactDevice ? 1.35 : 2));
    this.renderer.shadowMap.enabled = !compactDevice;
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
    this.buddySpeech?.remove();
    this.container.parentElement?.classList.remove("buddy-molishing");
    this.container.parentElement?.style.setProperty("--buddy-weird", "0");
    this.buddySpeech = null;
    this.clearRadiatorObjects();
    for (const fighter of this.fighters) { this.scene.remove(fighter.rag.root); for (const part of fighter.rag.list) this.world.removeBody(part.body); }
    this.fighters = [];
    this.setRemotePlayers([]);
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
  startAnimeFight(onComplete: () => void) {
    if (this.animeFightElapsed >= 0 || !this.rag) return;
    this.animeFightElapsed = 0;
    this.animeFightDone = onComplete;
    this.animeNextHit = 2.7;
    this.animeHitCount = 0;
    this.animeFinalDone = false;
    this.animeStatsTimer = 0;
    this.following = false;
    this.controls.enabled = false;
    this.buddySpeech && (this.buddySpeech.style.display = "none");
    const center = this.rag.center(new THREE.Vector3());
    const compactView = this.container.clientWidth < 700;
    const spacing = compactView ? 0.95 : 1.35;
    this.rag.reset(center.clone().add(new THREE.Vector3(-spacing, 0.03, 0)));
    this.rag.stand = 1;
    const rival = new Ragdoll(this.world, defaultJoints());
    buildProceduralBuddy(rival, rival.joints);
    rival.reset(center.clone().add(new THREE.Vector3(spacing, 0.03, 0)));
    rival.root.visible = true;
    rival.root.scale.setScalar(compactView ? 1.08 : 1.16);
    rival.stand = 1;
    rival.root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        const colored = material as THREE.MeshStandardMaterial;
        if (colored.color) {
          colored.color.set(0xf52250);
          colored.emissive?.set(0x8f082b);
          colored.emissiveIntensity = 0.42;
        }
      }
    });
    this.scene.add(rival.root);
    this.animeOpponent = rival;
    const framingDistance = compactView ? 13.8 : 10.2;
    this.camera.position.copy(center).add(new THREE.Vector3(0, compactView ? 4.0 : 3.0, framingDistance));
    this.controls.target.copy(center).add(new THREE.Vector3(0, 1.0, 0));
    this.camera.lookAt(this.controls.target);
    this.camera.fov = compactView ? 58 : 52;
    this.camera.updateProjectionMatrix();
    this.animeFightObjects = [];
    this.animeFightObjects.push(new THREE.AmbientLight(0x91baff, 0.65));
    const rim = new THREE.SpotLight(0x7dd3fc, 95, 24, Math.PI / 3, 0.55, 1.2);
    rim.position.copy(center).add(new THREE.Vector3(-4, 9, 4));
    rim.target.position.copy(center);
    this.scene.add(rim, rim.target);
    this.animeFightObjects.push(rim);
    this.sfx.whoosh();
    this.popup("ANIME FIGHT // BEGIN", center.clone().add(new THREE.Vector3(0, 2.5, 0)), "combo");
  }

  private clearAnimeFight() {
    if (this.animeOpponent) {
      this.scene.remove(this.animeOpponent.root);
      for (const part of this.animeOpponent.list) this.world.removeBody(part.body);
      this.animeOpponent.root.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((material) => material.dispose());
        }
      });
      this.animeOpponent = null;
    }
    for (const object of this.animeFightObjects) {
      this.scene.remove(object);
      if (object instanceof THREE.SpotLight) this.scene.remove(object.target);
      object.traverse?.((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.isMesh || (node as THREE.Points).isPoints) {
          mesh.geometry?.dispose?.();
          const material = (node as THREE.Mesh).material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material?.dispose?.();
        }
      });
    }
    this.animeFightObjects = [];
  }

  private updateAnimeFight(dt: number) {
    if (this.animeFightElapsed < 0 || !this.animeOpponent) return;
    const t = this.animeFightElapsed;
    this.animeFightElapsed += dt;
    const rival = this.animeOpponent;
    const buddy = this.rag.center(new THREE.Vector3());
    const foe = rival.center(new THREE.Vector3());
    const midpoint = buddy.clone().add(foe).multiplyScalar(0.5);
    const smooth = (v: number) => { const x = THREE.MathUtils.clamp(v, 0, 1); return x * x * (3 - 2 * x); };
    const approach = (from: THREE.Vector3, to: THREE.Vector3, a: number, b: number) =>
      this.camera.position.lerpVectors(from, to, smooth((t - a) / (b - a)));

    if (t < 2.7) {
      const compactView = this.container.clientWidth < 700;
      this.camera.position.lerp(midpoint.clone().add(new THREE.Vector3(0, compactView ? 3.7 : 2.3, compactView ? 13.8 : 8.5)), 1 - Math.exp(-2.5 * dt));
      this.controls.target.lerp(midpoint.clone().add(new THREE.Vector3(0, 0.7, 0)), 1 - Math.exp(-3 * dt));
      this.rag.stand = Math.min(1, this.rag.stand + dt * 2);
      rival.stand = Math.min(1, rival.stand + dt * 2);
      if (t > 1.3 && Math.random() < 0.16) this.fx.burst(midpoint.clone().add(new THREE.Vector3(rnd(-1,1), 1.3, rnd(-1,1))), 2, 0.7, [0x9deaff,0xffffff], 0.3, 0.5);
    } else if (t < 5.2) {
      const direction = foe.clone().sub(buddy).setY(0).normalize();
      const pelvis = this.rag.rb.pelvis.body;
      pelvis.applyForce(new CANNON.Vec3(direction.x * 105, 18, direction.z * 105));
      this.rag.rb.fArmA.body.applyImpulse(new CANNON.Vec3(direction.x * 3, 1.4, direction.z * 3));
      const compactView = this.container.clientWidth < 700;
      this.camera.position.lerp(midpoint.clone().add(new THREE.Vector3(-2.2, compactView ? 3.8 : 2.5, compactView ? 12.5 : 8.5)), 1 - Math.exp(-4 * dt));
      this.controls.target.lerp(midpoint, 1 - Math.exp(-4 * dt));
      this.shake = Math.max(this.shake, 0.18);
    } else if (t < 22.5) {
      const direction = foe.clone().sub(buddy).setY(0).normalize();
      this.animeNextHit -= dt;
      if (this.animeNextHit <= 0) {
        this.animeHitCount++;
        const finisher = this.animeHitCount % 5 === 0;
        this.animeNextHit = finisher ? 1.05 : rnd(0.28, 0.48);
        const keys = ["head","chest","chest","pelvis","head","chest","chest","chest","pelvis","head"];
        const target = rival.rb[keys[(this.animeHitCount - 1) % keys.length] as keyof typeof rival.rb].body;
        const power = finisher ? 46 : 18 + Math.min(18, this.animeHitCount * 0.8);
        const lift = finisher ? 17 : rnd(3, 9);
        target.applyImpulse(new CANNON.Vec3(direction.x * power * target.mass, lift * target.mass, direction.z * power * target.mass));
        target.angularVelocity.x += rnd(-8, 8);
        target.angularVelocity.y += rnd(-9, 9);
        target.angularVelocity.z += rnd(-8, 8);
        const strikingArm = this.rag.rb[(this.animeHitCount % 2) ? "fArmA" : "fArmB"].body;
        strikingArm.applyImpulse(new CANNON.Vec3(direction.x * 8, rnd(1,4), direction.z * 8));
        this.fx.burst(new THREE.Vector3(target.position.x,target.position.y,target.position.z), finisher ? 95 : 32, finisher ? 9 : 5.2,
          finisher ? [0xffffff,0xfde047,0x38bdf8,0xf43f5e] : [0xffffff,0xfbbf24,0x7dd3fc], 0.12, finisher ? 1.15 : 0.55,
          { gravity: 3.5, drag: 1.1, grow: 1.6 });
        this.smoke.burst(new THREE.Vector3(target.position.x,target.position.y,target.position.z), finisher ? 18 : 5, finisher ? 2.8 : 1.2,
          [0x263449,0x64748b,0xe2e8f0], 0.35, 0.8, { gravity: 1.1, drag: 1.2, grow: 1.8 });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(finisher ? 0.8 : 0.38, finisher ? 0.11 : 0.055, 8, 36),
          new THREE.MeshBasicMaterial({ color: finisher ? 0xfde047 : 0x7dd3fc, transparent: true, opacity: 0.95 }));
        ring.userData.life = 0;
        ring.position.copy(target.position);
        ring.lookAt(this.camera.position);
        this.scene.add(ring);
        this.animeFightObjects.push(ring);
        this.registerHit(finisher ? 1800 : 420, new THREE.Vector3(target.position.x,target.position.y,target.position.z));
        if (finisher) {
          this.kos += 1;
          this.money += 5000;
          this.popup("FINISHER K.O.  +$5,000", new THREE.Vector3(target.position.x,target.position.y+1.1,target.position.z), "ko");
          this.sfx.explosion();
          this.shake = Math.max(this.shake, 1.65);
        } else {
          this.sfx.zap();
          this.shake = Math.max(this.shake, 0.55 + Math.random() * 0.35);
        }
        this.flash.position.set(target.position.x,target.position.y,target.position.z);
        this.flash.intensity = finisher ? 180 : 55;
        this.statsDirty = true;
      }
      const orbit = t < 13 ? 1 : -1;
      const compactView = this.container.clientWidth < 700;
      const desired = midpoint.clone().add(new THREE.Vector3(Math.sin(t * 0.7) * (compactView ? 2.8 : 4.8) * orbit, (compactView ? 3.8 : 2.6) + Math.sin(t*1.8)*0.25, compactView ? 12.5 : 8.5));
      this.camera.position.lerp(desired, 1 - Math.exp(-3.8 * dt));
      this.controls.target.lerp(midpoint.clone().add(new THREE.Vector3(0,0.6,0)), 1 - Math.exp(-4 * dt));
      rival.stand = Math.max(0.08, rival.stand - dt * 0.24);
      this.rag.stand = Math.max(0.75, this.rag.stand);
      this.animeStatsTimer += dt;
      if (this.animeStatsTimer > 0.22) { this.animeStatsTimer = 0; if (this.statsDirty) this.pushStats(); }
      for (const object of [...this.animeFightObjects]) {
        if (object.userData.life === undefined) continue;
        object.userData.life += dt;
        const life = object.userData.life as number;
        object.scale.setScalar(1 + life * 9);
        const mat = (object as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 0.95 - life * 2.4);
        if (life > 0.42) {
          this.scene.remove(object);
          (object as THREE.Mesh).geometry.dispose();
          mat.dispose();
          this.animeFightObjects = this.animeFightObjects.filter((entry) => entry !== object);
        }
      }
    } else if (t < 26) {
      const finalTarget = rival.rb.chest.body;
      if (t < 23.4 && !this.animeFinalDone) {
        this.animeFinalDone = true;
        const direction = foe.clone().sub(buddy).setY(0).normalize();
        finalTarget.applyImpulse(new CANNON.Vec3(direction.x * 85 * finalTarget.mass, 36 * finalTarget.mass, direction.z * 85 * finalTarget.mass));
        this.fx.burst(foe, 180, 13, [0xffffff,0xfde047,0xf43f5e,0x38bdf8], 0.12, 1.4, { gravity: 4, drag: 0.8, grow: 2 });
        this.flash.intensity = 250;
        this.shake = Math.max(this.shake, 2.6);
        this.sfx.explosion();
        this.kos += 1;
        this.money += 12000;
        this.popup("ULTIMATE FINISH // +$12,000", foe.clone().add(new THREE.Vector3(0,1.5,0)), "ko");
        this.statsDirty = true;
      }
      const compactView = this.container.clientWidth < 700;
      this.camera.position.lerp(foe.clone().add(new THREE.Vector3(compactView ? 2.8 : 5, compactView ? 4.2 : 3.8, compactView ? 13 : 8)), 1 - Math.exp(-3 * dt));
      this.controls.target.lerp(foe, 1 - Math.exp(-3 * dt));
      if (this.statsDirty) this.pushStats();
    } else if (t < 30) {
      const compactView = this.container.clientWidth < 700;
      this.camera.position.lerp(this.rag.center(new THREE.Vector3()).add(new THREE.Vector3(compactView ? 2.8 : 4.8, compactView ? 3.5 : 2.8, compactView ? 12 : 7)), 1 - Math.exp(-2.5 * dt));
      this.controls.target.lerp(this.rag.center(new THREE.Vector3()), 1 - Math.exp(-2.5 * dt));
      if (this.statsDirty) this.pushStats();
    } else {
      this.clearAnimeFight();
      this.animeFightElapsed = -1;
      this.camera.position.copy(this.rag.center(new THREE.Vector3()).add(new THREE.Vector3(3.6,2.4,6.4)));
      this.controls.target.copy(this.rag.center(new THREE.Vector3()));
      this.controls.enabled = true;
      this.following = true;
      this.flash.intensity = 0;
      this.lensPass.uniforms.strength.value = 0.008;
      this.rag.stand = 0;
      this.sfx.whoosh();
      const done = this.animeFightDone;
      this.animeFightDone = null;
      done?.();
    }
  }

  startRansomFailure(onComplete: () => void) {
    this.ransomFailureElapsed = 0;
    this.ransomFailureDone = onComplete;
    this.following = false;
    this.controls.enabled = false;
    this.ransomOriginalColors = [];
    this.rag.root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        const colored = material as THREE.Material & { color?: THREE.Color };
        if (colored.color) { this.ransomOriginalColors.push({ material: colored, color: colored.color.clone() }); colored.color.set(0xff1717); }
      }
    });
    this.sfx.explosion();
  }

  private updateRansomFailure(dt: number) {
    if (this.ransomFailureElapsed < 0) return;
    this.ransomFailureElapsed += dt;
    const t = this.ransomFailureElapsed;
    const center = this.rag.center(new THREE.Vector3());
    this.camera.position.lerp(center.clone().add(new THREE.Vector3(1.2, 1.1, 2.3)), 1 - Math.exp(-3.5 * dt));
    this.controls.target.lerp(center, 1 - Math.exp(-4 * dt));
    if (t < 4.2) {
      for (const part of this.rag.list) {
        if (Math.random() < .55) part.body.applyImpulse(new CANNON.Vec3(rnd(-1,1)*part.body.mass*2.8, rnd(-1,1)*part.body.mass*2.8, rnd(-1,1)*part.body.mass*2.8));
      }
      this.shake = Math.max(this.shake, 1.1 + Math.random() * .8);
      if (Math.random() < .18) this.sfx.zap();
    } else {
      for (const entry of this.ransomOriginalColors) entry.material.color?.copy(entry.color);
      this.ransomOriginalColors = [];
      this.ransomFailureElapsed = -1;
      this.controls.enabled = true;
      this.following = true;
      const done = this.ransomFailureDone;
      this.ransomFailureDone = null;
      done?.();
    }
  }

  startGame() {
    this.endRunElapsed = -1;
    this.endRunCallback = null;
    this.endRunBlastDone = false;
    this.menuMode = false;
    this.cameraTransition = 0;
    this.controls.enabled = false;
    this.following = true;
    this.showBuddySpeech();
    this.sfx.whoosh();
  }
  endRun(onComplete: () => void) {
    if (this.endRunElapsed >= 0) return;
    this.endRunElapsed = 0;
    this.endRunCallback = onComplete;
    this.endRunBlastDone = false;
    this.following = false;
    this.controls.enabled = false;
    this.sfx.whoosh();
  }

  setRemotePlayers(players: RemotePlayerPose[]) {
    const active = new Set(players.map((player) => player.id));
    for (const [id, avatar] of this.remoteAvatars) {
      if (!active.has(id)) {
        this.scene.remove(avatar.group);
        avatar.group.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (mesh.isMesh) { mesh.geometry.dispose(); const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; materials.forEach((material) => material.dispose()); }
        });
        this.remoteAvatars.delete(id);
      }
    }
    for (const player of players) {
      let avatar = this.remoteAvatars.get(player.id);
      if (!avatar) {
        const group = new THREE.Group();
        const parts = new Map<string, THREE.Mesh>();
        for (const body of player.bodies) {
          const material = new THREE.MeshStandardMaterial({ color: player.color, roughness: 0.52, metalness: 0.12, emissive: player.color, emissiveIntensity: 0.06 });
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), material);
          const scale = body.key === "head" ? [0.17, 0.17, 0.17] : body.key === "chest" ? [0.23, 0.31, 0.14] : body.key === "pelvis" ? [0.19, 0.15, 0.13] : body.key.toLowerCase().includes("arm") ? [0.085, 0.21, 0.085] : [0.095, 0.23, 0.095];
          mesh.scale.set(scale[0], scale[1], scale[2]);
          mesh.castShadow = true;
          group.add(mesh);
          parts.set(body.key, mesh);
        }
        this.scene.add(group);
        avatar = { group, parts };
        this.remoteAvatars.set(player.id, avatar);
      }
      for (const body of player.bodies) {
        const mesh = avatar.parts.get(body.key);
        if (!mesh) continue;
        const targetPosition = new THREE.Vector3(body.position[0], body.position[1], body.position[2]);
        const targetQuaternion = new THREE.Quaternion(body.quaternion[0], body.quaternion[1], body.quaternion[2], body.quaternion[3]);
        if (!mesh.userData.netInitialized) {
          mesh.position.copy(targetPosition);
          mesh.quaternion.copy(targetQuaternion);
          mesh.userData.netInitialized = true;
        }
        mesh.userData.netTargetPosition = targetPosition;
        mesh.userData.netTargetQuaternion = targetQuaternion;
      }
    }
  }

  private updateRemoteAvatars(dt: number) {
    const alpha = 1 - Math.exp(-18 * Math.min(dt, 0.05));
    for (const avatar of this.remoteAvatars.values()) {
      for (const mesh of avatar.parts.values()) {
        const targetPosition = mesh.userData.netTargetPosition as THREE.Vector3 | undefined;
        const targetQuaternion = mesh.userData.netTargetQuaternion as THREE.Quaternion | undefined;
        if (!targetPosition || !targetQuaternion) continue;
        mesh.position.lerp(targetPosition, alpha);
        mesh.quaternion.slerp(targetQuaternion, alpha);
      }
    }
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
    this.toolIdentity = t;
    this.tool = TOOLS.find((item) => item.id === t)?.action ?? t;
    this.sfx.tick();
  }

  private clearRadiatorObjects() {
    for (const object of this.radiatorObjects) {
      this.scene.remove(object);
      object.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.isMesh || (node as THREE.Points).isPoints) {
          mesh.geometry?.dispose?.();
          const material = (node as THREE.Mesh).material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material?.dispose?.();
        }
      });
    }
    this.radiatorObjects = [];
    this.radiatorEarth = null; this.radiatorShip = null; this.radiatorBeam = null;
    this.radiatorCore = null; this.radiatorStars = null;
  }

  startRadiatorCutscene(onComplete: () => void) {
    if (this.radiatorElapsed >= 0 || !this.rag) return;
    this.radiatorElapsed = 0;
    this.radiatorDone = onComplete;
    this.following = false;
    this.controls.enabled = false;
    this.menuMode = false;
    this.radiatorFire = 1;
    this.radiatorBodyTypes = this.rag.list.map(({ body }) => {
      const saved = { body, type: body.type };
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
      body.type = CANNON.Body.STATIC;
      body.updateMassProperties();
      return saved;
    });
    this.rag.syncVisuals();
    this.clearRadiatorObjects();

    // A fresh orbital-strike sequence: target lock, planetary fly-by, galactic
    // weapon reveal, charge, beam ride, and impact. All geometry is procedural.
    const starGeo = new THREE.BufferGeometry();
    const coords = new Float32Array(24000);
    for (let i = 0; i < 8000; i++) {
      const radius = rnd(180, 2300);
      const theta = rnd(0, Math.PI * 2);
      const phi = Math.acos(rnd(-1, 1));
      coords[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      coords[i * 3 + 1] = radius * Math.cos(phi);
      coords[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(coords, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xc9e8ff, size: 2.1, sizeAttenuation: true }));
    this.scene.add(stars); this.radiatorObjects.push(stars); this.radiatorStars = stars;

    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(24, 64, 48),
      new THREE.MeshStandardMaterial({ color: 0x1263b5, roughness: 0.85, emissive: 0x06234b, emissiveIntensity: 0.55 })
    );
    earth.position.set(0, 0, -115);
    this.scene.add(earth); this.radiatorObjects.push(earth); this.radiatorEarth = earth;
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(25.2, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0x55bfff, transparent: true, opacity: 0.18, side: THREE.BackSide, blending: THREE.AdditiveBlending })
    );
    atmosphere.position.copy(earth.position);
    this.scene.add(atmosphere); this.radiatorObjects.push(atmosphere);
    const cloudLayer = new THREE.Mesh(
      new THREE.SphereGeometry(24.35, 40, 28),
      new THREE.MeshBasicMaterial({ color: 0xb5eaff, transparent: true, opacity: 0.12, wireframe: true })
    );
    cloudLayer.position.copy(earth.position);
    this.scene.add(cloudLayer); this.radiatorObjects.push(cloudLayer);

    const makePlanet = (radius: number, color: number, position: THREE.Vector3) => {
      const planet = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 32, 24),
        new THREE.MeshStandardMaterial({ color, roughness: 0.9, emissive: color, emissiveIntensity: 0.12 })
      );
      planet.position.copy(position);
      this.scene.add(planet); this.radiatorObjects.push(planet);
      return planet;
    };
    makePlanet(9, 0xd9a66b, new THREE.Vector3(-105, 34, -480));
    const saturn = makePlanet(20, 0xc9b58e, new THREE.Vector3(125, 18, -880));
    const saturnRing = new THREE.Mesh(
      new THREE.RingGeometry(27, 48, 96),
      new THREE.MeshBasicMaterial({ color: 0xd7c49b, side: THREE.DoubleSide, transparent: true, opacity: 0.65 })
    );
    saturnRing.position.copy(saturn.position);
    saturnRing.rotation.x = Math.PI / 2.35;
    this.scene.add(saturnRing); this.radiatorObjects.push(saturnRing);
    makePlanet(13, 0xb8c8d8, new THREE.Vector3(-95, -55, -1110));

    // A luminous galactic disc to give the camera a readable destination.
    const galaxyGroup = new THREE.Group();
    galaxyGroup.position.set(0, 0, -1540);
    for (let arm = 0; arm < 5; arm++) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i < 1100; i++) {
        const radius = 12 + i * 0.19;
        const angle = arm * Math.PI * 2 / 5 + i * 0.018;
        points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle * 1.7) * 5, Math.sin(angle) * radius * 0.48));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: arm % 2 ? 0x8f9dff : 0x9deaff, transparent: true, opacity: 0.5 }));
      galaxyGroup.add(line);
    }
    const galacticCore = new THREE.Mesh(
      new THREE.SphereGeometry(18, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xe4f5ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending })
    );
    galaxyGroup.add(galacticCore);
    this.scene.add(galaxyGroup); this.radiatorObjects.push(galaxyGroup);

    const weapon = new THREE.Group();
    weapon.position.set(0, 0, -1940);
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x18243b, metalness: 0.95, roughness: 0.22 });
    const brightMetal = new THREE.MeshStandardMaterial({ color: 0x9aacc5, metalness: 0.92, roughness: 0.18, emissive: 0x10243f });
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(5, 8, 170, 12), darkMetal);
    spine.rotation.x = Math.PI / 2;
    weapon.add(spine);
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(13 + i * 1.1, 1.8, 8, 48), brightMetal);
      ring.position.z = 58 - i * 23;
      weapon.add(ring);
    }
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 155), brightMetal);
      rail.position.set(side * 17, 0, 0);
      weapon.add(rail);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(2, 36, 90), darkMetal);
      fin.position.set(side * 24, 0, -58);
      weapon.add(fin);
    }
    const muzzle = new THREE.Mesh(
      new THREE.CylinderGeometry(11, 18, 18, 16),
      new THREE.MeshBasicMaterial({ color: 0x4bdcff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending })
    );
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.z = 88;
    weapon.add(muzzle);
    this.scene.add(weapon); this.radiatorObjects.push(weapon); this.radiatorShip = weapon;

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 1, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xc9f7ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    );
    beam.rotation.x = Math.PI / 2;
    this.scene.add(beam); this.radiatorObjects.push(beam); this.radiatorBeam = beam;
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(7, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending })
    );
    this.scene.add(core); this.radiatorObjects.push(core); this.radiatorCore = core;
    this.sfx.whoosh();
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
    if (this.buddyWeirdElapsed >= 2 && this.buddyWeirdElapsed < 16) {
      window.alert("You can’t use any items because your Buddy feels weird...");
      return;
    }
    if (this.tool !== "radiator") this.spawnIdentityWeapon(hit.point, r.dir);
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
      case "fighterSpawner":
        if (this.rag.bodySet.has(hit.body)) this.spawnFighter();
        break;
      case "radiator":
        if (this.rag.bodySet.has(hit.body)) this.cb.onRadiator();
        else this.sfx.tick();
        break;
      case "acid":
        if (this.rag.bodySet.has(hit.body)) {
          this.fx.burst(hit.point, 95, 7.5, [0x84cc16, 0xa3e635, 0xd9f99d, 0x22c55e], 0.3, 0.9, { gravity: 2.2, drag: 1.6, grow: 1.8 });
          this.smoke.burst(hit.point, 22, 1.5, [0x65a30d, 0x365314, 0x9ca3af], 0.45, 1.4, { gravity: 0.5, drag: 1.1, grow: 2.2 });
          for (const rb of this.rag.list) {
            const b = rb.body;
            const d = Math.hypot(b.position.x-hit.point.x,b.position.y-hit.point.y,b.position.z-hit.point.z);
            if (d < 2.2) b.applyImpulse(new CANNON.Vec3(r.dir.x*b.mass*2.2,r.dir.y*b.mass*2.2+0.8,r.dir.z*b.mass*2.2));
          }
          this.addPain(12); this.shake = Math.max(this.shake,0.45); this.sfx.zap();
        }
        break;
      case "knife":
        if (this.rag.bodySet.has(hit.body)) this.melee(r, "fist", 10, true);
        break;
      case "wl201":
        if (this.rag.bodySet.has(hit.body)) {
          this.buddyWeirdElapsed = 0;
          this.sfx.zap();
          this.fx.burst(hit.point, 30, 3.2, [0xc084fc,0xf0abfc,0xffffff], 0.25, 0.7, { gravity: 1.5, drag: 2, grow: 1.6 });
          this.popup("WL-201", hit.point.clone().add(new THREE.Vector3(0,0.35,0)), "zap");
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


  private spawnIdentityWeapon(hit: THREE.Vector3, dir: THREE.Vector3) {
    const index = Math.max(0, TOOLS.findIndex((item) => item.id === this.toolIdentity));
    const def = TOOLS[index] ?? TOOLS[0];
    const seed = index + 1;
    const hue = new THREE.Color(def.color);
    const dark = hue.clone().multiplyScalar(0.24);
    const glow = hue.clone().multiplyScalar(1.8);
    const group = new THREE.Group();
    const mat = (color: THREE.Color, metalness = 0.55, emissive = false) => new THREE.MeshStandardMaterial({
      color, metalness, roughness: 0.28, emissive: emissive ? color : new THREE.Color(0x000000),
      emissiveIntensity: emissive ? 1.15 : 0
    });
    const coreMat = mat(hue, 0.72);
    const accentMat = mat(glow, 0.45, true);
    const gripMat = mat(dark, 0.25);
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, position: THREE.Vector3, rotation = new THREE.Euler()) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(position); mesh.rotation.copy(rotation); mesh.castShadow = true; group.add(mesh);
    };
    if (def.id === "knife") {
      add(new THREE.CylinderGeometry(0.055,0.065,0.38,10), gripMat, new THREE.Vector3(0,0.02,0));
      add(new THREE.BoxGeometry(0.32,0.055,0.075), accentMat, new THREE.Vector3(0,0.22,0));
      add(new THREE.ConeGeometry(0.105,0.78,4), coreMat, new THREE.Vector3(0,0.62,-0.02), new THREE.Euler(Math.PI/2,0,0));
      add(new THREE.BoxGeometry(0.035,0.12,0.08), accentMat, new THREE.Vector3(0,0.34,-0.02));
    } else if (def.id === "wl201") {
      add(new THREE.CylinderGeometry(0.105,0.105,0.58,16), accentMat, new THREE.Vector3(0,0.02,0));
      add(new THREE.CylinderGeometry(0.083,0.083,0.39,16), coreMat, new THREE.Vector3(0,-0.01,-0.01));
      add(new THREE.CylinderGeometry(0.025,0.025,0.38,8), gripMat, new THREE.Vector3(0,0.48,-0.02));
      add(new THREE.ConeGeometry(0.018,0.22,8), accentMat, new THREE.Vector3(0,0.77,-0.02));
      add(new THREE.BoxGeometry(0.28,0.045,0.12), gripMat, new THREE.Vector3(0,0.28,0));
      add(new THREE.BoxGeometry(0.24,0.045,0.12), gripMat, new THREE.Vector3(0,-0.25,0));
      add(new THREE.BoxGeometry(0.045,0.16,0.045), accentMat, new THREE.Vector3(0,0.02,0.09));
    } else if (def.id === "acid") {
      add(new THREE.CylinderGeometry(0.19,0.16,0.52,12), coreMat, new THREE.Vector3(0,0,0));
      add(new THREE.CylinderGeometry(0.13,0.13,0.35,12), accentMat, new THREE.Vector3(0,-0.04,0));
      add(new THREE.CylinderGeometry(0.09,0.11,0.16,10), gripMat, new THREE.Vector3(0,0.34,0));
      add(new THREE.TorusGeometry(0.19,0.035,8,16), accentMat, new THREE.Vector3(0,0.2,0));
      add(new THREE.BoxGeometry(0.12,0.18,0.08), gripMat, new THREE.Vector3(0,-0.31,0));
    } else {
      const profile = seed % 8;
      const length = 0.62 + (seed % 5) * 0.09;
      add(new THREE.CylinderGeometry(0.045, 0.07, length, 7 + (seed % 7)), gripMat, new THREE.Vector3(0, 0, 0));
      if (profile === 0) add(new THREE.BoxGeometry(0.24, 0.2, 0.34 + (seed % 3) * 0.1), coreMat, new THREE.Vector3(0, 0.02, -0.12));
      else if (profile === 1) add(new THREE.ConeGeometry(0.2, 0.5, 5 + (seed % 5)), coreMat, new THREE.Vector3(0, 0.02, -0.18), new THREE.Euler(Math.PI / 2, 0, 0));
      else if (profile === 2) add(new THREE.TorusGeometry(0.2, 0.065, 8, 12), coreMat, new THREE.Vector3(0, 0, -0.2), new THREE.Euler(Math.PI / 2, 0, 0));
      else if (profile === 3) add(new THREE.SphereGeometry(0.22, 8 + seed % 7, 6 + seed % 5), coreMat, new THREE.Vector3(0, 0, -0.18));
      else if (profile === 4) add(new THREE.OctahedronGeometry(0.27 + (seed % 3) * 0.04), coreMat, new THREE.Vector3(0, 0, -0.18));
      else if (profile === 5) add(new THREE.DodecahedronGeometry(0.24 + (seed % 3) * 0.04), coreMat, new THREE.Vector3(0, 0, -0.18));
      else if (profile === 6) add(new THREE.CylinderGeometry(0.23, 0.08, 0.38, 6 + seed % 6), coreMat, new THREE.Vector3(0, 0, -0.18), new THREE.Euler(Math.PI / 2, 0, 0));
      else add(new THREE.TorusKnotGeometry(0.14, 0.045, 48 + seed % 24, 6, 2 + seed % 3, 3 + seed % 4), coreMat, new THREE.Vector3(0, 0, -0.18));
      const details = 2 + seed % 5;
      for (let n = 0; n < details; n++) {
        const angle = (Math.PI * 2 * n) / details;
        const radius = 0.2 + (seed % 4) * 0.025;
        const point = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, -0.2 - (n % 2) * 0.08);
        add(n % 2 === 0 ? new THREE.BoxGeometry(0.055, 0.19, 0.09) : new THREE.ConeGeometry(0.075, 0.2, 5 + seed % 4), accentMat, point, new THREE.Euler(0, 0, angle));
      }
    }
    const anim: ToolAnim = { group, t: 0, dur: 0.62, kind: "thrust", hit: hit.clone(), dir: dir.clone().normalize(), right: new THREE.Vector3(1, 0, 0) };
    this.scene.add(group);
    this.anims.push(anim);
    this.fx.burst(hit, 9 + seed % 15, 1.2 + (seed % 7) * 0.25, [hue.getHex(), glow.getHex(), 0xffffff], 0.18, 0.38, { drag: 2.8, grow: 1.4 });
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
  private showBuddySpeech() {
    this.buddySpeech?.remove();
    const quotes = ["pls hemp me", "i need ai", "meow"];
    const bubble = document.createElement("div");
    bubble.className = "buddy-speech-3d";
    bubble.textContent = quotes[Math.floor(Math.random() * quotes.length)];
    this.overlay.appendChild(bubble);
    this.buddySpeech = bubble;
    bubble.addEventListener("animationend", () => {
      if (this.buddySpeech === bubble) this.buddySpeech = null;
      bubble.remove();
    }, { once: true });
  }

  private updateBuddySpeech() {
    const bubble = this.buddySpeech;
    if (!bubble || !this.rag?.rb?.head) return;
    const head = this.rag.rb.head.body.position;
    const point = new THREE.Vector3(head.x, head.y + 0.62, head.z).project(this.camera);
    const rect = this.container.getBoundingClientRect();
    const x = (point.x * 0.5 + 0.5) * rect.width;
    const y = (-point.y * 0.5 + 0.5) * rect.height;
    const visible = point.z > -1 && point.z < 1 && x >= -80 && x <= rect.width + 80 && y >= -80 && y <= rect.height + 80;
    bubble.style.display = visible ? "block" : "none";
    bubble.style.left = `${x}px`;
    bubble.style.top = `${y}px`;
  }


  private spawnFighter() {
    if (this.fighters.length >= 4) {
      this.popup("MAX FIGHTERS", this.rag.center(new THREE.Vector3()), "zap");
      return;
    }
    const fighter = new Ragdoll(this.world, defaultJoints());
    buildProceduralBuddy(fighter, fighter.joints);
    const center = this.rag.center(new THREE.Vector3());
    const angle = Math.random() * Math.PI * 2;
    fighter.reset(center.clone().add(new THREE.Vector3(Math.cos(angle) * 3.8, 0.03, Math.sin(angle) * 3.8)));
    fighter.syncVisuals();
    this.scene.add(fighter.root);
    this.fighters.push({ rag: fighter, age: 0, attackAt: 0.8 });
    this.sfx.whoosh();
    this.popup("FIGHTER DEPLOYED", center.clone().add(new THREE.Vector3(0, 1.4, 0)), "word");
  }

  private updateFighters(dt: number) {
    for (const fighter of [...this.fighters]) {
      fighter.age += dt;
      fighter.attackAt -= dt;
      const target = this.rag.center(new THREE.Vector3());
      const pelvis = fighter.rag.rb.pelvis.body;
      const dx = target.x - pelvis.position.x;
      const dz = target.z - pelvis.position.z;
      const distance = Math.max(0.001, Math.hypot(dx, dz));
      if (distance > 1.05) {
        const force = Math.min(9, distance * 2.8);
        for (const part of fighter.rag.list) {
          if (part.key === "pelvis" || part.key === "chest") {
            part.body.applyForce(new CANNON.Vec3((dx / distance) * force * part.body.mass, 0, (dz / distance) * force * part.body.mass));
          }
        }
      } else if (fighter.attackAt <= 0) {
        fighter.attackAt = rnd(1.05, 2.1);
        const toolIndex = Math.floor(Math.random() * 10);
        const powers = [11, 7.5, 13, 16, 19, 22, 25, 18, 14, 9];
        const power = powers[toolIndex];
        const hitBody = this.rag.rb[["head","chest","chest","chest","pelvis","chest","chest","head","chest","pelvis"][toolIndex]].body;
        const dir = new THREE.Vector3(dx / distance, rnd(0.08, 0.45), dz / distance).normalize();
        hitBody.applyImpulse(new CANNON.Vec3(dir.x * power * hitBody.mass, dir.y * power * hitBody.mass, dir.z * power * hitBody.mass));
        hitBody.angularVelocity.x += rnd(-3, 3);
        hitBody.angularVelocity.y += rnd(-4, 4);
        hitBody.angularVelocity.z += rnd(-3, 3);
        this.fx.burst(new THREE.Vector3(hitBody.position.x, hitBody.position.y, hitBody.position.z), 14, 2.4, [0xffd166,0xffffff,0x67e8f9], 0.18, 0.35, { gravity: 2, drag: 2 });
        this.shake = Math.max(this.shake, 0.18);
        this.sfx.zap();
        this.popup(["KICK","PUNCH","BAT","HAMMER","BOMB","ROCKET","CANNON","ANVIL","ZAP","GRAB"][toolIndex], new THREE.Vector3(hitBody.position.x, hitBody.position.y + .35, hitBody.position.z), "word");
      }
      fighter.rag.syncVisuals();
      if (fighter.age > 45) {
        this.scene.remove(fighter.rag.root);
        for (const part of fighter.rag.list) this.world.removeBody(part.body);
        fighter.rag.root.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.geometry.dispose();
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((material) => material.dispose());
          }
        });
        this.fighters = this.fighters.filter((entry) => entry !== fighter);
      }
    }
  }

  private updateBuddyWeird(dt: number) {
    if (this.buddyWeirdElapsed < 0) return;
    this.buddyWeirdElapsed += dt;
    const t = this.buddyWeirdElapsed;
    const intensity = t < 2 ? 0 : t < 12 ? (t - 2) / 10 : t < 16 ? 1 - (t - 12) / 4 : 0;
    const root = this.container.parentElement;
    if (root) {
      if (t >= 2 && t < 16) root.classList.add("buddy-molishing");
      else root.classList.remove("buddy-molishing");
      root.style.setProperty("--buddy-weird", String(THREE.MathUtils.clamp(intensity, 0, 1)));
    }
    this.lensPass.uniforms.strength.value = 0.008 + intensity * 0.115;
    if (intensity > 0.12) {
      this.shake = Math.max(this.shake, intensity * 0.16);
      this.camera.rotation.z = Math.sin(t * 8) * intensity * 0.025;
    } else {
      this.camera.rotation.z *= Math.max(0, 1 - dt * 5);
    }
    if (t >= 16) {
      this.buddyWeirdElapsed = -1;
      this.lensPass.uniforms.strength.value = 0.008;
      this.camera.rotation.z = 0;
      if (root) { root.classList.remove("buddy-molishing"); root.style.setProperty("--buddy-weird", "0"); }
    }
  }

  private updateRadiatorCutscene(dt: number) {
    if (this.radiatorElapsed < 0) {
      if (this.radiatorFire > 0 && this.rag && Math.random() < 0.42) {
        const p = this.rag.center(new THREE.Vector3());
        const x = p.x + rnd(-5, 5), z = p.z + rnd(-5, 5);
        this.fx.burst(new THREE.Vector3(x, 0.15, z), 5, 3.2, [0xff3b0a, 0xff7a18, 0xffd166], 0.55, 1.15, { gravity: -1.8, drag: 1.4, grow: 1.8 });
        this.smoke.burst(new THREE.Vector3(x, 0.3, z), 2, 0.8, [0x242424, 0x55504b], 0.9, 1.8, { gravity: -0.4, drag: 1, grow: 2.4 });
      }
      return;
    }
    const t = this.radiatorElapsed;
    this.radiatorElapsed += dt;
    const ship = this.radiatorShip, beam = this.radiatorBeam, core = this.radiatorCore;
    const earth = this.radiatorEarth;
    const target = new THREE.Vector3();
    const camera = new THREE.Vector3();
    const smooth = (v: number) => { const x = THREE.MathUtils.clamp(v, 0, 1); return x * x * (3 - 2 * x); };
    const travel = (from: THREE.Vector3, to: THREE.Vector3, start: number, end: number) =>
      camera.lerpVectors(from, to, smooth((t - start) / (end - start)));

    if (t < 2.5) {
      const buddy = this.rag.center(new THREE.Vector3());
      target.copy(buddy).add(new THREE.Vector3(0, 0.5, 0));
      camera.copy(buddy).add(new THREE.Vector3(0, 5, 13));
      this.camera.position.lerp(camera, 1 - Math.exp(-2.5 * dt));
      this.controls.target.lerp(target, 1 - Math.exp(-2.5 * dt));
      if (earth) earth.rotation.y += dt * 0.08;
    } else if (t < 6.5) {
      travel(new THREE.Vector3(0, 5, 13), new THREE.Vector3(0, 16, -82), 2.5, 6.5);
      target.set(0, 0, -115);
      this.camera.position.copy(camera);
      this.controls.target.lerp(target, 1 - Math.exp(-3 * dt));
      if (earth) earth.rotation.y += dt * 0.1;
    } else if (t < 11.5) {
      travel(new THREE.Vector3(0, 16, -82), new THREE.Vector3(-82, 48, -470), 6.5, 11.5);
      target.set(0, 0, -650);
      this.camera.position.copy(camera);
      this.controls.target.lerp(target, 1 - Math.exp(-2 * dt));
      if (this.radiatorStars) this.radiatorStars.rotation.y += dt * 0.006;
    } else if (t < 15.2) {
      travel(new THREE.Vector3(-82, 48, -470), new THREE.Vector3(0, 18, -1840), 11.5, 15.2);
      target.set(0, 0, -1940);
      this.camera.position.copy(camera);
      this.controls.target.lerp(target, 1 - Math.exp(-3 * dt));
      if (ship) ship.rotation.z = Math.sin(t * 1.3) * 0.025;
      if (this.radiatorStars) this.radiatorStars.rotation.y += dt * 0.01;
    } else if (t < 18) {
      if (ship) ship.scale.setScalar(1 + Math.sin(t * 18) * 0.012);
      if (core) {
        core.position.set(0, 0, -1845);
        core.scale.setScalar(0.7 + (t - 15.2) * 2 + Math.sin(t * 22) * 0.18);
        (core.material as THREE.MeshBasicMaterial).opacity = 1;
      }
      if (beam) {
        beam.position.set(0, 0, -1120);
        beam.scale.set(1, 1650, 1);
        (beam.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (t - 16) / 1.5);
      }
      this.camera.position.lerp(new THREE.Vector3(0, 12, -1810), 1 - Math.exp(-3 * dt));
      this.controls.target.lerp(new THREE.Vector3(0, 0, -1940), 1 - Math.exp(-3 * dt));
      if (Math.random() < 0.28) this.sfx.tick();
    } else if (t < 20.8) {
      if (beam) {
        beam.position.set(0, 0, -1010);
        beam.scale.set(5.5, 1900, 5.5);
        (beam.material as THREE.MeshBasicMaterial).opacity = 1;
      }
      if (core) {
        core.position.set(0, 0, -1850);
        core.scale.setScalar(8 + Math.sin(t * 30) * 1.2);
        (core.material as THREE.MeshBasicMaterial).opacity = 1;
      }
      const u = smooth((t - 18) / 2.8);
      camera.lerpVectors(new THREE.Vector3(0, 12, -1810), new THREE.Vector3(0, 5, -130), u);
      target.set(0, 0, -115);
      this.camera.position.copy(camera);
      this.controls.target.lerp(target, 1 - Math.exp(-4 * dt));
      this.shake = Math.max(this.shake, t > 20.1 ? 1.8 : 0.45);
      if (t > 20.05) {
        this.flash.position.set(0, 0, -115);
        this.flash.intensity = 220;
        if (Math.random() < 0.24) this.sfx.explosion();
      }
    } else if (t < 22.4) {
      if (beam) (beam.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - (t - 20.8) / 1.6);
      if (core) (core.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - (t - 20.8) / 1.6);
      this.flash.intensity = Math.max(0, 220 * (1 - (t - 20.8) / 1.6));
      const buddy = this.rag.center(new THREE.Vector3());
      this.camera.position.lerp(buddy.clone().add(new THREE.Vector3(9, 5, 12)), 1 - Math.exp(-2.8 * dt));
      this.controls.target.lerp(buddy, 1 - Math.exp(-2.8 * dt));
    } else if (t < 27) {
      const buddy = this.rag.center(new THREE.Vector3());
      this.camera.position.lerp(buddy.clone().add(new THREE.Vector3(5.5, 3.5, 8)), 1 - Math.exp(-2.5 * dt));
      this.controls.target.lerp(buddy.clone().add(new THREE.Vector3(0, 0.5, 0)), 1 - Math.exp(-2.5 * dt));
      if (Math.random() < 0.5) {
        const body = this.rag.rb.chest.body.position;
        this.fx.burst(new THREE.Vector3(body.x + rnd(-0.5, 0.5), body.y + rnd(-0.7, 0.7), body.z + rnd(-0.4, 0.4)), 5, 3.5, [0xffef9a, 0xff8a1e, 0xff3b0a], 0.25, 0.55, { gravity: -0.8, drag: 1.4 });
      }
    } else {
      this.clearRadiatorObjects();
      for (const saved of this.radiatorBodyTypes) {
        saved.body.type = saved.type;
        saved.body.updateMassProperties();
        saved.body.velocity.set(0, 0, 0);
        saved.body.angularVelocity.set(0, 0, 0);
      }
      this.radiatorBodyTypes = [];
      this.rag.syncVisuals();
      this.radiatorElapsed = -1;
      const buddy = this.rag.center(new THREE.Vector3());
      this.camera.position.copy(buddy.clone().add(new THREE.Vector3(3.6, 2.4, 6.4)));
      this.controls.target.copy(buddy);
      this.controls.enabled = true;
      this.following = true;
      this.flash.intensity = 0;
      this.sfx.whoosh();
      const done = this.radiatorDone;
      this.radiatorDone = null;
      done?.();
    }
  }
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const rawDt = Math.min(this.clock.getDelta(), 0.05);
    const dt = rawDt * this.timeScale;

    this.world.step(1 / 60, dt, 5);
    this.updateRemoteAvatars(rawDt);
    if (this.animeFightElapsed < 0) this.updateFighters(rawDt);
    this.updateRadiatorCutscene(rawDt);
    this.updateAnimeFight(rawDt);
    this.updateBuddyWeird(rawDt);
    this.updateRansomFailure(rawDt);

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
    this.updateBuddySpeech();
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

    // End-run sequence: linger on Buddy, then trigger a final physics blast.
    if (this.endRunElapsed >= 0) {
      this.endRunElapsed += rawDt;
      const center = this.rag.center(new THREE.Vector3());
      const closePosition = center.clone().add(new THREE.Vector3(0.55, 0.42, 1.45));
      this.camera.position.lerp(closePosition, 1 - Math.exp(-1.35 * rawDt));
      this.controls.target.lerp(center, 1 - Math.exp(-1.8 * rawDt));
      if (!this.endRunBlastDone && this.endRunElapsed >= 3.6) {
        this.endRunBlastDone = true;
        this.explode(center.clone(), 4.8, 48);
        this.shake = 1.5;
        this.flash.position.copy(center);
        this.flash.intensity = 220;
        this.sfx.explosion();
      }
      if (this.endRunElapsed >= 5.25) {
        this.endRunElapsed = -1;
        this.endRunCallback?.();
        this.endRunCallback = null;
      }
    } else if (this.menuMode) {
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
