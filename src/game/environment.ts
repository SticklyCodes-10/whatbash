import * as THREE from "three";
import * as CANNON from "cannon-es";
import { GROUP } from "./ragdoll";

export type DecorKind = "trees" | "cacti" | "craters" | "pines" | "neon" | "junk" | "palms" | "candy";

export interface EnvDef {
  id: string;
  name: string;
  emoji: string;
  skyTop: number;
  skyBottom: number;
  ground: number;
  ground2: number;
  groundKind: "checker" | "grid" | "speckle" | "stripes";
  gravity: number;
  friction: number;
  sun: number;
  sunI: number;
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
  decor: DecorKind;
  palette: number[];
  stars?: boolean;
  snow?: boolean;
  sea?: boolean;
  neon?: boolean;
}

export const ENVS: EnvDef[] = [
  {
    id: "park",
    name: "Sunny Park",
    emoji: "🌳",
    skyTop: 0x3a97ff,
    skyBottom: 0xd6f0ff,
    ground: 0x6cc24a,
    ground2: 0x5fb340,
    groundKind: "checker",
    gravity: -9.81,
    friction: 0.5,
    sun: 0xfff2d0,
    sunI: 2.4,
    hemiSky: 0xbfe2ff,
    hemiGround: 0x5a7a3a,
    hemiI: 0.9,
    decor: "trees",
    palette: [0xff6b6b, 0xffd93d, 0x4d96ff, 0x6bcb77],
  },
  {
    id: "desert",
    name: "Dusty Desert",
    emoji: "🌵",
    skyTop: 0xf08a4b,
    skyBottom: 0xffe6b8,
    ground: 0xe6bf7a,
    ground2: 0xdfae60,
    groundKind: "speckle",
    gravity: -9.81,
    friction: 0.7,
    sun: 0xffd9a0,
    sunI: 2.8,
    hemiSky: 0xffe0b0,
    hemiGround: 0x9a6a3a,
    hemiI: 0.8,
    decor: "cacti",
    palette: [0xc2410c, 0x92400e, 0xfbbf24, 0x7c3f1d],
  },
  {
    id: "moon",
    name: "Moon Base (Low Gravity!)",
    emoji: "🌙",
    skyTop: 0x01010a,
    skyBottom: 0x14142e,
    ground: 0xa3a3b0,
    ground2: 0x8f8f9c,
    groundKind: "speckle",
    gravity: -2.2,
    friction: 0.6,
    sun: 0xffffff,
    sunI: 3.0,
    hemiSky: 0x6670aa,
    hemiGround: 0x333344,
    hemiI: 0.7,
    decor: "craters",
    palette: [0xe5e7eb, 0x9ca3af, 0xf87171, 0x60a5fa],
    stars: true,
  },
  {
    id: "snow",
    name: "Slippery Snowfield",
    emoji: "❄️",
    skyTop: 0x8fc3e8,
    skyBottom: 0xf3f8ff,
    ground: 0xf6fafd,
    ground2: 0xe4edf5,
    groundKind: "speckle",
    gravity: -9.81,
    friction: 0.1,
    sun: 0xe8f2ff,
    sunI: 2.0,
    hemiSky: 0xd8ecff,
    hemiGround: 0x8aa0b8,
    hemiI: 1.0,
    decor: "pines",
    palette: [0xe11d48, 0x2563eb, 0xf59e0b, 0x10b981],
    snow: true,
  },
  {
    id: "neon",
    name: "Neon Arena",
    emoji: "🪩",
    skyTop: 0x080418,
    skyBottom: 0x2d0b4e,
    ground: 0x150b2b,
    ground2: 0xff2bd6,
    groundKind: "grid",
    gravity: -9.81,
    friction: 0.4,
    sun: 0xb18cff,
    sunI: 1.4,
    hemiSky: 0x5a3aff,
    hemiGround: 0x220a3a,
    hemiI: 0.8,
    decor: "neon",
    palette: [0xff2bd6, 0x22d3ee, 0xa3e635, 0xfacc15],
    neon: true,
  },
  {
    id: "junk",
    name: "Rusty Junkyard",
    emoji: "🛞",
    skyTop: 0x7b8fa3,
    skyBottom: 0xdfe5ea,
    ground: 0x6b6f76,
    ground2: 0x5d6168,
    groundKind: "speckle",
    gravity: -9.81,
    friction: 0.6,
    sun: 0xfff1dd,
    sunI: 2.0,
    hemiSky: 0xc8d4e0,
    hemiGround: 0x4a4a4a,
    hemiI: 0.8,
    decor: "junk",
    palette: [0xb45309, 0x65a30d, 0x2563eb, 0xdc2626],
  },
  {
    id: "beach",
    name: "Sunny Beach",
    emoji: "🏖️",
    skyTop: 0x20b8f0,
    skyBottom: 0xdcf8ff,
    ground: 0xf3deA2,
    ground2: 0xeed496,
    groundKind: "speckle",
    gravity: -9.81,
    friction: 0.65,
    sun: 0xfff4d6,
    sunI: 2.6,
    hemiSky: 0xcff3ff,
    hemiGround: 0xb99a5a,
    hemiI: 0.9,
    decor: "palms",
    palette: [0xff7f50, 0xffd166, 0x06d6a0, 0x118ab2],
    sea: true,
  },
  {
    id: "candy",
    name: "Candy Land",
    emoji: "🍭",
    skyTop: 0xff9be0,
    skyBottom: 0xfff4fc,
    ground: 0xffc6ea,
    ground2: 0xffa9dc,
    groundKind: "stripes",
    gravity: -9.81,
    friction: 0.35,
    sun: 0xfff0f8,
    sunI: 2.2,
    hemiSky: 0xffd9f4,
    hemiGround: 0xc87aa8,
    hemiI: 1.0,
    decor: "candy",
    palette: [0xff6fb5, 0x7ae7ff, 0xfff176, 0xb388ff],
  },
];


ENVS.push(
  { ...ENVS.find((e) => e.id === "neon")!, id: "nightcity", name: "Night City", emoji: "🌃", skyTop: 0x050514, skyBottom: 0x261044, ground: 0x100b20, ground2: 0x00e5ff, groundKind: "grid", decor: "neon", neon: true, stars: true, palette: [0xff2bd6, 0x22d3ee, 0x9d4edd, 0xf72585] },
  { ...ENVS.find((e) => e.id === "desert")!, id: "volcano", name: "Volcanic Rift", emoji: "🌋", skyTop: 0x260909, skyBottom: 0xc2410c, ground: 0x292524, ground2: 0x7f1d1d, groundKind: "speckle", decor: "craters", sun: 0xff5a1f, sunI: 3.2, palette: [0xff3d00, 0xff9100, 0xffd000, 0x991b1b] },
  { ...ENVS.find((e) => e.id === "moon")!, id: "orbital", name: "Orbital Station", emoji: "🛰️", skyTop: 0x020617, skyBottom: 0x172554, ground: 0x334155, ground2: 0x0e7490, groundKind: "grid", gravity: -4.2, decor: "neon", stars: true, palette: [0x38bdf8, 0xa78bfa, 0xe2e8f0, 0x22d3ee] },
  { ...ENVS.find((e) => e.id === "beach")!, id: "toxic", name: "Toxic Swamp", emoji: "☣️", skyTop: 0x132a13, skyBottom: 0x4f772d, ground: 0x31572c, ground2: 0x90a955, groundKind: "speckle", decor: "junk", friction: 0.25, palette: [0x9ef01a, 0x70e000, 0x38b000, 0x007f5f] },
  { ...ENVS.find((e) => e.id === "snow")!, id: "crystal", name: "Crystal Cavern", emoji: "💎", skyTop: 0x082f49, skyBottom: 0x164e63, ground: 0x164e63, ground2: 0x67e8f9, groundKind: "stripes", decor: "pines", palette: [0x67e8f9, 0xc4b5fd, 0xf0abfc, 0xffffff] }
);

export const MAP_ATLAS_COUNT = 100;
const atlasNames = ["Aurora","Ashen","Verdant","Crimson","Obsidian","Glacier","Solar","Eclipse","Tempest","Mirage","Violet","Emerald","Sapphire","Golden","Phantom","Titan","Frost","Ember","Storm","Celestial","Ancient","Radiant","Dusk","Dawn","Wild","Silent","Shattered","Electric","Frozen","Forgotten"];
const baseMaps = [...ENVS];
for (let i = 0; ENVS.length < MAP_ATLAS_COUNT; i++) {
  const source = baseMaps[i % baseMaps.length];
  const variant = Math.floor(i / baseMaps.length) + 1;
  const hueShift = ((i * 0.071) % 0.34) - 0.17;
  const tint = (hex: number, shift: number) => new THREE.Color(hex).offsetHSL(shift, 0.08 + (i % 4) * 0.025, ((i % 5) - 2) * 0.025).getHex();
  ENVS.push({
    ...source,
    id: `atlas-${String(ENVS.length + 1).padStart(3, "0")}`,
    name: `${atlasNames[i % atlasNames.length]} ${source.name} ${String(variant).padStart(2, "0")}` ,
    skyTop: tint(source.skyTop, hueShift), skyBottom: tint(source.skyBottom, hueShift * 0.8),
    ground: tint(source.ground, hueShift * 0.55), ground2: tint(source.ground2, hueShift),
    sun: tint(source.sun, hueShift), hemiSky: tint(source.hemiSky, hueShift), hemiGround: tint(source.hemiGround, hueShift),
    palette: source.palette.map((color) => tint(color, hueShift)),
    groundKind: (["checker", "grid", "speckle", "stripes"] as const)[i % 4],
    friction: Math.max(0.08, Math.min(0.9, source.friction + ((i % 7) - 3) * 0.035)),
  });
}

export interface DynObj {
  mesh: THREE.Object3D;
  body: CANNON.Body;
  ttl?: number;
}

export interface EnvMaterials {
  ground: CANNON.Material;
  pad: CANNON.Material;
  ball: CANNON.Material;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

function gradientTexture(top: number, bottom: number, stars: boolean) {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 512;
  const g = c.getContext("2d")!;
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, "#" + new THREE.Color(top).getHexString());
  gr.addColorStop(0.55, "#" + new THREE.Color(bottom).lerp(new THREE.Color(top), 0.35).getHexString());
  gr.addColorStop(1, "#" + new THREE.Color(bottom).getHexString());
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 512);
  void stars;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function groundTexture(def: EnvDef) {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const c1 = "#" + new THREE.Color(def.ground).getHexString();
  const c2 = "#" + new THREE.Color(def.ground2).getHexString();
  g.fillStyle = c1;
  g.fillRect(0, 0, S, S);
  let repeat = 40;
  if (def.groundKind === "checker") {
    g.fillStyle = c2;
    g.fillRect(0, 0, S / 2, S / 2);
    g.fillRect(S / 2, S / 2, S / 2, S / 2);
  } else if (def.groundKind === "grid") {
    g.strokeStyle = c2;
    g.lineWidth = 6;
    g.strokeRect(0, 0, S, S);
    g.strokeStyle = "rgba(34,211,238,0.5)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(S / 2, 0);
    g.lineTo(S / 2, S);
    g.moveTo(0, S / 2);
    g.lineTo(S, S / 2);
    g.stroke();
    repeat = 50;
  } else if (def.groundKind === "speckle") {
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() > 0.5 ? c2 : "rgba(255,255,255,0.12)";
      g.globalAlpha = 0.5;
      g.beginPath();
      g.arc(Math.random() * S, Math.random() * S, 1 + Math.random() * 3, 0, 7);
      g.fill();
    }
    g.globalAlpha = 1;
    repeat = 20;
  } else {
    g.fillStyle = c2;
    for (let i = -2; i < 6; i++) {
      g.beginPath();
      g.moveTo(i * 64, 0);
      g.lineTo(i * 64 + 32, 0);
      g.lineTo(i * 64 + 32 + S, S);
      g.lineTo(i * 64 + S, S);
      g.fill();
    }
    repeat = 40;
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export class Environment {
  group = new THREE.Group();
  bodies: CANNON.Body[] = [];
  dyn: DynObj[] = [];
  sunLight!: THREE.DirectionalLight;
  private snow?: THREE.Points;
  private horizonEvent = new THREE.Group();
  private eventLight = new THREE.PointLight(0xff6b35, 0, 90, 1.8);
  private eventClock = 0;
  private eventPulse = 0;
  private plume?: THREE.Mesh;
  private eventSpin?: THREE.Object3D;
  private disposables: { dispose(): void }[] = [];

  constructor(
    public scene: THREE.Scene,
    public world: CANNON.World,
    public def: EnvDef,
    public mats: EnvMaterials
  ) {
    scene.add(this.group);
    this.build();
  }

  private mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...opts });
    this.disposables.push(m);
    return m;
  }
  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.disposables.push(g);
    return g;
  }
  private mesh(g: THREE.BufferGeometry, m: THREE.Material, shadow = true) {
    const mesh = new THREE.Mesh(this.geo(g), m);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    return mesh;
  }

  private addBody(body: CANNON.Body) {
    this.world.addBody(body);
    this.bodies.push(body);
  }

  private build() {
    const d = this.def;
    const scene = this.scene;

    // sky + fog
    const skyTex = gradientTexture(d.skyTop, d.skyBottom, !!d.stars);
    this.disposables.push(skyTex);
    scene.background = skyTex;
    scene.fog = new THREE.Fog(d.skyBottom, 35, 95);

    // lights
    const hemi = new THREE.HemisphereLight(d.hemiSky, d.hemiGround, d.hemiI);
    this.group.add(hemi);
    const sun = new THREE.DirectionalLight(d.sun, d.sunI * rand(0.8, 1.1));
    const az = rand(0, Math.PI * 2);
    const el = rand(0.8, 1.15);
    sun.position.set(Math.cos(az) * 14, 20 * Math.sin(el) + 6, Math.sin(az) * 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 70;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.group.add(sun);
    this.sunLight = sun;

    if (d.neon) {
      const a = new THREE.PointLight(0xff2bd6, 60, 30);
      a.position.set(-8, 5, -6);
      const b = new THREE.PointLight(0x22d3ee, 60, 30);
      b.position.set(8, 5, 6);
      this.group.add(a, b);
    }

    // ground
    const gTex = groundTexture(d);
    this.disposables.push(gTex);
    const gm = new THREE.MeshStandardMaterial({ map: gTex, roughness: d.id === "snow" ? 0.25 : 0.9 });
    if (d.neon) {
      gm.emissive = new THREE.Color(0xffffff);
      gm.emissiveMap = gTex;
      gm.emissiveIntensity = 0.55;
    }
    this.disposables.push(gm);
    const ground = this.mesh(new THREE.CircleGeometry(90, 64), gm, false);
    ground.rotation.x = -Math.PI / 2;
    this.group.add(ground);

    const gb = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: this.mats.ground,
      collisionFilterGroup: GROUP.ENV,
      collisionFilterMask: GROUP.RAG | GROUP.PROP,
    });
    gb.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.addBody(gb);

    // arena walls (invisible) & ceiling
    const W = 17;
    const wall = (x: number, y: number, z: number, hx: number, hy: number, hz: number) => {
      const b = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)),
        collisionFilterGroup: GROUP.WALL,
        collisionFilterMask: GROUP.RAG | GROUP.PROP,
      });
      b.position.set(x, y, z);
      this.addBody(b);
    };
    wall(W + 1, 20, 0, 1, 25, W + 2);
    wall(-W - 1, 20, 0, 1, 25, W + 2);
    wall(0, 20, W + 1, W + 2, 25, 1);
    wall(0, 20, -W - 1, W + 2, 25, 1);
    wall(0, 45, 0, W + 2, 1, W + 2);

    // decorations & scenery
    this.buildDecor();
    this.buildHorizonEvent();
    if (d.stars) this.buildStars();
    if (d.snow) this.buildSnow();
    if (d.sea) {
      const sea = this.mesh(new THREE.PlaneGeometry(200, 60), this.mat(0x1ab8e8, { roughness: 0.2, metalness: 0.1 }), false);
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(0, 0.03, -62);
      sea.receiveShadow = false;
      this.group.add(sea);
    }

    // physics props
    this.buildProps();
  }


  private buildHorizonEvent() {
    const d = this.def;
    const distant = this.horizonEvent;
    distant.position.set(0, 0, -62);
    this.group.add(distant);
    const rock = new THREE.MeshStandardMaterial({ color: d.decor === "craters" ? 0x34343d : 0x263044, roughness: 1 });
    const glow = new THREE.MeshBasicMaterial({ color: d.palette[0] ?? 0xff6b35 });
    if (d.id.includes("volcano") || (d.decor === "cacti" && d.name.toLowerCase().includes("volcan"))) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(13, 25, 9), rock); cone.position.set(0, 12, 0); distant.add(cone);
      const crater = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.48, 8, 28), glow); crater.rotation.x = Math.PI / 2; crater.position.y = 23.8; distant.add(crater);
      const lava = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.1, 5, 10), glow); lava.position.set(1.8, 20, 0.5); lava.rotation.z = -0.25; distant.add(lava);
      this.plume = new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 10), new THREE.MeshBasicMaterial({ color: 0x4b2522, transparent: true, opacity: 0.68 })); this.plume.position.set(0, 28, 0); distant.add(this.plume);
      this.eventLight.color.setHex(0xff4a12); this.eventLight.position.set(0, 22, 1);
    } else if (d.decor === "neon") {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(5, 24, 4), rock); tower.position.y = 12; distant.add(tower);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(8, 0.32, 8, 48), glow); ring.position.y = 19; distant.add(ring); this.eventSpin = ring;
      this.eventLight.color.setHex(d.palette[0]); this.eventLight.position.set(0, 20, 2);
    } else if (d.decor === "palms") {
      const sun = new THREE.Mesh(new THREE.SphereGeometry(8, 24, 16), glow); sun.position.set(0, 17, -4); distant.add(sun);
      const horizon = new THREE.Mesh(new THREE.BoxGeometry(70, 2, 2), rock); horizon.position.set(0, 1, 0); distant.add(horizon);
      this.eventLight.color.setHex(0xffc078); this.eventLight.position.set(0, 17, 0);
    } else if (d.decor === "pines" || d.decor === "trees") {
      const mountain = new THREE.Mesh(new THREE.ConeGeometry(18, 26, 7), rock); mountain.position.y = 12; mountain.rotation.y = 0.4; distant.add(mountain);
      const cloud = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8), new THREE.MeshBasicMaterial({ color: d.decor === "pines" ? 0xc7e9ff : 0xffffff, transparent: true, opacity: 0.6 })); cloud.position.set(2, 29, 1); distant.add(cloud); this.plume = cloud;
      this.eventLight.color.setHex(d.decor === "pines" ? 0x9bdcff : 0xfff1c1); this.eventLight.position.set(0, 18, 0);
    } else if (d.decor === "craters") {
      const planet = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 16), rock); planet.position.set(4, 20, 0); distant.add(planet);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(13, 0.45, 8, 48), glow); ring.position.set(4, 20, 0); ring.rotation.x = 0.7; distant.add(ring); this.eventSpin = ring;
      this.eventLight.color.setHex(0xb8c8ff); this.eventLight.position.set(4, 20, 0);
    } else if (d.decor === "cacti") {
      const mesa = new THREE.Mesh(new THREE.CylinderGeometry(8, 11, 12, 7), rock); mesa.position.y = 5; distant.add(mesa);
      const dust = new THREE.Mesh(new THREE.TorusGeometry(5, 0.7, 8, 24), glow); dust.position.y = 3; dust.rotation.x = Math.PI / 2; distant.add(dust); this.eventSpin = dust;
      this.eventLight.color.setHex(0xffa34d); this.eventLight.position.set(0, 9, 0);
    } else {
      const peak = new THREE.Mesh(new THREE.ConeGeometry(14, 22, 8), rock); peak.position.y = 10; distant.add(peak);
      const flare = new THREE.Mesh(new THREE.TorusGeometry(5, 0.5, 8, 32), glow); flare.position.y = 18; distant.add(flare); this.eventSpin = flare;
      this.eventLight.color.setHex(d.palette[0] ?? 0xffffff); this.eventLight.position.set(0, 18, 0);
    }
    distant.add(this.eventLight);
    distant.scale.setScalar(1.0);
    this.eventClock = rand(2.5, 8);
  }

  private buildStars() {
    const n = 900;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.random() * 0.95 + 0.05;
      const r = 200;
      const s = Math.sqrt(1 - v * v);
      arr[i * 3] = Math.cos(u) * s * r;
      arr[i * 3 + 1] = v * r;
      arr[i * 3 + 2] = Math.sin(u) * s * r;
    }
    const g = this.geo(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const m = new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, fog: false });
    this.disposables.push(m);
    this.group.add(new THREE.Points(g, m));
    // Earth
    const earth = this.mesh(
      new THREE.SphereGeometry(10, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0x4f9dff, fog: false }),
      false
    );
    this.disposables.push(earth.material as THREE.Material);
    earth.position.set(-60, 70, -120);
    this.group.add(earth);
    const land = this.mesh(
      new THREE.SphereGeometry(10.05, 16, 12, 0.5, 2.2, 0.8, 1.4),
      new THREE.MeshBasicMaterial({ color: 0x4ade80, fog: false }),
      false
    );
    this.disposables.push(land.material as THREE.Material);
    land.position.copy(earth.position);
    this.group.add(land);
  }

  private buildSnow() {
    const n = 700;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = rand(-30, 30);
      arr[i * 3 + 1] = rand(0, 22);
      arr[i * 3 + 2] = rand(-30, 30);
    }
    const g = this.geo(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const m = new THREE.PointsMaterial({ color: 0xffffff, size: 0.14, transparent: true, opacity: 0.9 });
    this.disposables.push(m);
    this.snow = new THREE.Points(g, m);
    this.snow.frustumCulled = false;
    this.group.add(this.snow);
  }

  update(dt: number) {
    this.eventClock -= dt;
    if (this.eventClock <= 0) { this.eventPulse = 1; this.eventClock = rand(9, 18); }
    this.eventPulse = Math.max(0, this.eventPulse - dt * 0.28);
    this.eventLight.intensity = this.eventPulse * (this.def.id.includes("volcano") ? 260 : 85);
    if (this.plume) { this.plume.scale.setScalar(0.85 + Math.sin(performance.now() * 0.0008) * 0.12 + this.eventPulse * 0.9); this.plume.position.y += dt * (this.def.id.includes("volcano") ? 0.12 : 0.025); if (this.plume.position.y > 34) this.plume.position.y = 25; }
    if (this.eventSpin) this.eventSpin.rotation.y += dt * (this.def.decor === "craters" ? 0.025 : 0.18);
    if (this.snow) {
      const a = this.snow.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        let y = a.getY(i) - dt * (1.2 + (i % 5) * 0.25);
        if (y < 0) y = 22;
        a.setY(i, y);
        a.setX(i, a.getX(i) + Math.sin(y * 0.7 + i) * dt * 0.3);
      }
      a.needsUpdate = true;
    }
  }

  // ---------- decor ----------
  private buildDecor() {
    const d = this.def;
    const count = Math.floor(rand(26, 40));
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = rand(25, 55);
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      if (d.sea && z < -22) continue;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = Math.random() * Math.PI * 2;
      const s = rand(0.8, 1.7);
      switch (d.decor) {
        case "trees": {
          const trunk = this.mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.4, 10), this.mat(0x7a4a2b));
          trunk.position.y = 1.2;
          const f = this.mesh(
            new THREE.IcosahedronGeometry(1.7, 1),
            this.mat(pick([0x3f9d3a, 0x4cb84a, 0x2f8a35]), { flatShading: true })
          );
          f.position.y = 3.6;
          const f2 = this.mesh(new THREE.IcosahedronGeometry(1.1, 1), f.material as THREE.Material);
          f2.position.set(0.9, 4.4, 0.3);
          g.add(trunk, f, f2);
          break;
        }
        case "pines": {
          const trunk = this.mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.4, 8), this.mat(0x5a3a22));
          trunk.position.y = 0.7;
          g.add(trunk);
          for (let k = 0; k < 4; k++) {
            const c = this.mesh(
              new THREE.ConeGeometry(2 - k * 0.38, 1.8, 10),
              this.mat(k % 2 ? 0xf2f8ff : 0x2f7a4d, { flatShading: true })
            );
            c.position.y = 1.9 + k * 1.15;
            g.add(c);
          }
          break;
        }
        case "cacti": {
          if (Math.random() < 0.4) {
            const rock = this.mesh(
              new THREE.DodecahedronGeometry(rand(0.8, 1.8), 0),
              this.mat(pick([0xb9835a, 0xa0714a, 0xc99467]), { flatShading: true })
            );
            rock.scale.y = rand(0.6, 1);
            rock.position.y = 0.5;
            g.add(rock);
          } else {
            const m = this.mat(0x4c9a53);
            const body = this.mesh(new THREE.CapsuleGeometry(0.4, 3.2, 6, 12), m);
            body.position.y = 2;
            g.add(body);
            for (const sx of [-1, 1]) {
              if (Math.random() < 0.3) continue;
              const arm = this.mesh(new THREE.CapsuleGeometry(0.25, 1.2, 6, 10), m);
              arm.position.set(sx * 0.85, 2.3 + Math.random() * 0.6, 0);
              const up = this.mesh(new THREE.CapsuleGeometry(0.25, 0.9, 6, 10), m);
              up.position.set(sx * 0.85, 3.2, 0);
              const con = this.mesh(new THREE.CapsuleGeometry(0.22, 0.6, 6, 10), m);
              con.rotation.z = Math.PI / 2;
              con.position.set(sx * 0.55, 2.2, 0);
              g.add(up, con);
              void arm;
            }
          }
          break;
        }
        case "craters": {
          const rr = rand(2, 6);
          const ring = this.mesh(
            new THREE.RingGeometry(rr * 0.72, rr, 28),
            this.mat(0x7a7a88, { roughness: 1 }),
            false
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.y = 0.02;
          const inner = this.mesh(new THREE.CircleGeometry(rr * 0.72, 28), this.mat(0x8a8a98, { roughness: 1 }), false);
          inner.rotation.x = -Math.PI / 2;
          inner.position.y = 0.015;
          g.add(ring, inner);
          if (Math.random() < 0.6) {
            const rock = this.mesh(
              new THREE.DodecahedronGeometry(rand(0.6, 1.8), 0),
              this.mat(0x9c9caa, { flatShading: true })
            );
            rock.position.set(rr * 1.2, 0.5, 0);
            g.add(rock);
          }
          break;
        }
        case "neon": {
          const c = pick(this.def.palette);
          const h = rand(5, 16);
          const p = this.mesh(
            new THREE.BoxGeometry(1.2, h, 1.2),
            new THREE.MeshStandardMaterial({ color: 0x120a24, emissive: c, emissiveIntensity: 1.6, roughness: 0.4 })
          );
          this.disposables.push(p.material as THREE.Material);
          p.position.y = h / 2;
          const ring = this.mesh(new THREE.TorusGeometry(1.3, 0.12, 8, 24), new THREE.MeshBasicMaterial({ color: c }));
          this.disposables.push(ring.material as THREE.Material);
          ring.rotation.x = Math.PI / 2;
          ring.position.y = h * rand(0.4, 0.9);
          g.add(p, ring);
          break;
        }
        case "junk": {
          const t = Math.random();
          if (t < 0.4) {
            const box = this.mesh(
              new THREE.BoxGeometry(6, 2.6, 2.4),
              this.mat(pick(this.def.palette), { roughness: 0.8, metalness: 0.2 })
            );
            box.position.y = 1.3;
            g.add(box);
            if (Math.random() < 0.5) {
              const b2 = this.mesh(new THREE.BoxGeometry(6, 2.6, 2.4), this.mat(pick(this.def.palette), { roughness: 0.8 }));
              b2.position.set(0.5, 3.9, 0);
              b2.rotation.y = 0.1;
              g.add(b2);
            }
          } else {
            const tm = this.mat(0x1c1c1f, { roughness: 0.9 });
            for (let k = 0; k < 4; k++) {
              const tire = this.mesh(new THREE.TorusGeometry(0.9, 0.38, 10, 20), tm);
              tire.rotation.x = Math.PI / 2;
              tire.position.set(Math.random() * 0.2, 0.38 + k * 0.76, Math.random() * 0.2);
              g.add(tire);
            }
          }
          break;
        }
        case "palms": {
          const tm = this.mat(0x9b6a3c);
          let px = 0;
          let py = 0;
          const lean = rand(-0.18, 0.18);
          for (let k = 0; k < 7; k++) {
            const seg = this.mesh(new THREE.CylinderGeometry(0.22 - k * 0.012, 0.26 - k * 0.012, 0.9, 8), tm);
            seg.position.set(px, py + 0.45, 0);
            seg.rotation.z = -lean * (k * 0.5);
            g.add(seg);
            py += 0.88;
            px += Math.sin(lean * k * 0.5) * 0.4;
          }
          const lm = this.mat(0x27ae60, { side: THREE.DoubleSide });
          for (let k = 0; k < 7; k++) {
            const leaf = this.mesh(new THREE.ConeGeometry(0.4, 3.2, 4), lm);
            leaf.scale.z = 0.25;
            const a = (k / 7) * Math.PI * 2;
            leaf.position.set(px + Math.cos(a) * 1.2, py + 0.1, Math.sin(a) * 1.2);
            leaf.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
            g.add(leaf);
          }
          break;
        }
        case "candy": {
          const c = pick(this.def.palette);
          if (Math.random() < 0.55) {
            const stick = this.mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 8), this.mat(0xffffff));
            stick.position.y = 2;
            const head = this.mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.35, 24), this.mat(c));
            head.rotation.x = Math.PI / 2;
            head.position.y = 4.6;
            const sw = this.mesh(new THREE.TorusGeometry(0.8, 0.13, 8, 24), this.mat(0xffffff));
            sw.position.set(0, 4.6, 0.2);
            g.add(stick, head, sw);
          } else {
            const drop = this.mesh(
              new THREE.SphereGeometry(1.4, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
              this.mat(c, { roughness: 0.3 })
            );
            drop.scale.y = 1.2;
            g.add(drop);
          }
          break;
        }
      }
      g.scale.setScalar(d.decor === "junk" || d.decor === "neon" ? 1 : s);
      this.group.add(g);
    }
  }

  // ---------- physics props ----------
  private staticBox(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    dd: number,
    color: number,
    euler: [number, number, number] = [0, 0, 0],
    material?: CANNON.Material,
    emissive?: number
  ) {
    const m = this.mat(color, emissive ? { emissive, emissiveIntensity: 0.9 } : {});
    const mesh = this.mesh(new THREE.BoxGeometry(w, h, dd), m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(euler[0], euler[1], euler[2], "YXZ");
    this.group.add(mesh);
    const b = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, dd / 2)),
      material,
      collisionFilterGroup: GROUP.ENV,
      collisionFilterMask: GROUP.RAG | GROUP.PROP,
    });
    b.position.set(x, y, z);
    b.quaternion.set(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
    this.addBody(b);
  }

  private crate(x: number, z: number, size: number, color: number, y = size / 2) {
    const mesh = this.mesh(new THREE.BoxGeometry(size, size, size), this.mat(color, { roughness: 0.8 }));
    const edges = new THREE.LineSegments(
      this.geo(new THREE.EdgesGeometry(mesh.geometry)),
      new THREE.LineBasicMaterial({ color: 0x00000055 as number, transparent: true, opacity: 0.45 })
    );
    this.disposables.push(edges.material as THREE.Material);
    mesh.add(edges);
    const stripe = this.mesh(
      new THREE.BoxGeometry(size * 1.01, size * 0.16, size * 1.01),
      this.mat(new THREE.Color(color).multiplyScalar(0.7).getHex(), { roughness: 0.8 })
    );
    mesh.add(stripe);
    mesh.position.set(x, y, z);
    this.group.add(mesh);
    const b = new CANNON.Body({
      mass: size * size * size * 55,
      shape: new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2)),
      linearDamping: 0.05,
      angularDamping: 0.1,
      collisionFilterGroup: GROUP.PROP,
      collisionFilterMask: -1,
    });
    b.position.set(x, y, z);
    this.world.addBody(b);
    this.bodies.push(b);
    this.dyn.push({ mesh, body: b });
  }

  private ball(x: number, z: number, r: number, color: number) {
    const mesh = this.mesh(new THREE.SphereGeometry(r, 24, 16), this.mat(color, { roughness: 0.35 }));
    const band = this.mesh(new THREE.TorusGeometry(r * 1.001, r * 0.08, 8, 28), this.mat(0xffffff, { roughness: 0.4 }));
    mesh.add(band);
    const band2 = band.clone();
    band2.rotation.y = Math.PI / 2;
    mesh.add(band2);
    mesh.position.set(x, r + 0.05, z);
    this.group.add(mesh);
    const b = new CANNON.Body({
      mass: r * r * r * 12,
      shape: new CANNON.Sphere(r),
      material: this.mats.ball,
      linearDamping: 0.03,
      angularDamping: 0.1,
      collisionFilterGroup: GROUP.PROP,
      collisionFilterMask: -1,
    });
    b.position.set(x, r + 0.05, z);
    this.world.addBody(b);
    this.bodies.push(b);
    this.dyn.push({ mesh, body: b });
  }

  private buildProps() {
    const pal = this.def.palette;
    const n = Math.floor(rand(8, 14));
    const taken: THREE.Vector2[] = [];
    const spot = (minR = 2.6, maxR = 13, gap = 2): THREE.Vector2 | null => {
      for (let t = 0; t < 30; t++) {
        const a = Math.random() * Math.PI * 2;
        const r = rand(minR, maxR);
        const p = new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
        if (taken.every((q) => q.distanceTo(p) > gap)) {
          taken.push(p);
          return p;
        }
      }
      return null;
    };

    for (let i = 0; i < n; i++) {
      const kind = Math.random();
      const p = spot();
      if (!p) continue;
      const color = pick(pal);
      if (kind < 0.3) {
        this.crate(p.x, p.y, rand(0.55, 1.0), color);
        if (Math.random() < 0.4) this.crate(p.x + 0.05, p.y, rand(0.45, 0.6), pick(pal), 1.2);
      } else if (kind < 0.5) {
        this.ball(p.x, p.y, rand(0.3, 0.55), color);
      } else if (kind < 0.65) {
        // ramp
        this.staticBox(p.x, 0.35, p.y, rand(2.2, 3.2), 0.3, rand(2.5, 4), color, [Math.random() * Math.PI * 2, -0.3, 0]);
      } else if (kind < 0.8) {
        // pillar / wall block
        const h = rand(0.8, 3.2);
        this.staticBox(p.x, h / 2, p.y, rand(0.9, 1.6), h, rand(0.9, 1.6), color, [Math.random() * Math.PI, 0, 0]);
      } else if (kind < 0.92) {
        // bounce pad
        const pad = this.mat(0x22ff88, { emissive: 0x22ff88, emissiveIntensity: 1.0, roughness: 0.3 });
        const mesh = this.mesh(new THREE.CylinderGeometry(0.9, 1, 0.18, 24), pad, false);
        mesh.position.set(p.x, 0.09, p.y);
        this.group.add(mesh);
        const ring = this.mesh(new THREE.TorusGeometry(0.75, 0.05, 6, 24), this.mat(0xffffff, { emissive: 0xffffff }), false);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(p.x, 0.19, p.y);
        this.group.add(ring);
        const b = new CANNON.Body({
          mass: 0,
          shape: new CANNON.Box(new CANNON.Vec3(0.9, 0.09, 0.9)),
          material: this.mats.pad,
          collisionFilterGroup: GROUP.ENV,
          collisionFilterMask: GROUP.RAG | GROUP.PROP,
        });
        b.position.set(p.x, 0.09, p.y);
        this.addBody(b);
      } else {
        this.crate(p.x, p.y, 0.7, color);
        this.crate(p.x, p.y, 0.7, pick(pal), 1.1);
      }
    }
  }

  dispose() {
    for (const b of this.bodies) this.world.removeBody(b);
    this.scene.remove(this.group);
    for (const d of this.disposables) d.dispose();
    this.bodies = [];
    this.dyn = [];
  }
}
