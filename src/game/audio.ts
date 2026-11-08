/** Tiny synthesized sound effects (no asset files needed). */
export class Sfx {
  private ctx: AudioContext | null = null;
  enabled = true;

  private ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  unlock() {
    this.ensure();
  }

  private noise(ctx: AudioContext, dur: number) {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  thud(intensity = 1, pitch = 1) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const vol = Math.min(1, 0.25 + intensity * 0.5);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(170 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.25);
    const n = this.noise(ctx, 0.08);
    const ng = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1800;
    ng.gain.setValueAtTime(vol * 0.6, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    n.connect(f).connect(ng).connect(ctx.destination);
    n.start(t);
  }

  boing() {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(700, t + 0.15);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.3);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.35);
  }

  explosion() {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = this.noise(ctx, 1.1);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(2200, t);
    f.frequency.exponentialRampToValueAtTime(90, t + 1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    n.connect(f).connect(g).connect(ctx.destination);
    n.start(t);
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.5);
    og.gain.setValueAtTime(0.9, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(og).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.65);
  }

  zap() {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = this.noise(ctx, 0.6);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(3000, t);
    f.Q.value = 3;
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 45;
    lg.gain.value = 0.35;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    lfo.connect(lg).connect(g.gain);
    n.connect(f).connect(g).connect(ctx.destination);
    n.start(t);
    lfo.start(t);
    lfo.stop(t + 0.6);
  }

  whoosh() {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = this.noise(ctx, 0.3);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2200, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.01, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    n.connect(f).connect(g).connect(ctx.destination);
    n.start(t);
  }

  tick() {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = 900;
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.06);
  }

  coin() {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(880, t);
    o.frequency.setValueAtTime(1320, t + 0.07);
    g.gain.setValueAtTime(0.07, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.26);
  }
}
