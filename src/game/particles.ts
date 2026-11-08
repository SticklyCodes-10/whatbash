import * as THREE from "three";

/** Lightweight point-sprite particle system with per-particle colour/alpha/size. */
export class Particles {
  points: THREE.Points;
  private max: number;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private baseSize: Float32Array;
  private baseCol: Float32Array;
  private drag: Float32Array;
  private grav: Float32Array;
  private grow: Float32Array;
  private next = 0;
  private mat: THREE.ShaderMaterial;
  private geo: THREE.BufferGeometry;

  constructor(max: number, blending: THREE.Blending) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.baseSize = new Float32Array(max);
    this.baseCol = new Float32Array(max * 3);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute("color", new THREE.BufferAttribute(this.col, 4));
    this.geo.setAttribute("size", new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: `
        attribute float size;
        attribute vec4 color;
        varying vec4 vColor;
        uniform float uScale;
        void main(){
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec4 vColor;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          if(d > 0.5) discard;
          float a = smoothstep(0.5, 0.15, d);
          gl_FragColor = vec4(vColor.rgb, vColor.a * a);
        }`,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  setScale(s: number) {
    this.mat.uniforms.uScale.value = s;
  }

  emit(
    p: THREE.Vector3,
    v: THREE.Vector3,
    color: THREE.Color,
    size: number,
    life: number,
    opts: { drag?: number; gravity?: number; grow?: number } = {}
  ) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x;
    this.vel[i * 3 + 1] = v.y;
    this.vel[i * 3 + 2] = v.z;
    this.baseCol[i * 3] = color.r;
    this.baseCol[i * 3 + 1] = color.g;
    this.baseCol[i * 3 + 2] = color.b;
    this.baseSize[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.drag[i] = opts.drag ?? 1.5;
    this.grav[i] = opts.gravity ?? 0;
    this.grow[i] = opts.grow ?? 0;
  }

  burst(
    p: THREE.Vector3,
    count: number,
    speed: number,
    colors: number[],
    size: number,
    life: number,
    opts: { drag?: number; gravity?: number; grow?: number; up?: number } = {}
  ) {
    const c = new THREE.Color();
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.set(Math.random() * 2 - 1, Math.random() * 2 - 1 + (opts.up ?? 0), Math.random() * 2 - 1);
      if (v.lengthSq() < 0.0001) v.set(0, 1, 0);
      v.normalize().multiplyScalar(speed * (0.3 + Math.random() * 0.7));
      c.setHex(colors[Math.floor(Math.random() * colors.length)]);
      this.emit(p, v, c, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), opts);
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.col[i * 4 + 3] = 0;
        this.size[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = Math.max(this.life[i], 0) / this.maxLife[i];
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= dr;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.col[i * 4] = this.baseCol[i * 3];
      this.col[i * 4 + 1] = this.baseCol[i * 3 + 1];
      this.col[i * 4 + 2] = this.baseCol[i * 3 + 2];
      this.col[i * 4 + 3] = Math.min(1, t * 1.6);
      this.size[i] = this.baseSize[i] * (1 + this.grow[i] * (1 - t)) * (0.4 + 0.6 * t);
    }
    (this.geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("size") as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}
