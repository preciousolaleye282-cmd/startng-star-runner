// fx.js — particles, floating text, screen shake, vignette, haptics.
import * as THREE from 'three';

export const settings = { shake: true, flash: true, haptics: true, quality: 'high', muted: false };

export class Particles {
  constructor(scene) {
    this.scene = scene; this.bursts = [];
    const n = 300;
    const pos = new Float32Array(n * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.PointsMaterial({ color: 0xffe45e, size: 0.22, transparent: true, opacity: 0.95 });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.particles = [];
    for (let i = 0; i < n; i++) this.particles.push({ life: 0, vx: 0, vy: 0, vz: 0 });
    this.scene.add(this.points);
    this.cursor = 0;
    // dust trail
    this.trail = [];
    const tn = 60;
    const tpos = new Float32Array(tn * 3);
    this.trailGeo = new THREE.BufferGeometry();
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
    this.trailPts = new THREE.Points(this.trailGeo,
      new THREE.PointsMaterial({ color: 0x00e5ff, size: 0.16, transparent: true, opacity: 0.6 }));
    this.trailPts.frustumCulled = false;
    this.scene.add(this.trailPts);
    this.trailN = tn; this.trailIdx = 0;
    // speed lines (CSS overlay handles it, here just flag)
  }
  burst(x, y, z, color = 0xffe45e, count = 24, power = 5) {
    if (settings.quality === 'low') count = Math.floor(count / 2);
    this.mat.color.set(color);
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.cursor];
      this.cursor = (this.cursor + 1) % this.particles.length;
      p.life = 0.6 + Math.random() * 0.5;
      p.max = p.life;
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2;
      p.vx = Math.cos(a) * Math.cos(b) * power; p.vy = Math.abs(Math.sin(b)) * power + 2; p.vz = Math.sin(a) * power;
      const arr = this.geo.attributes.position.array;
      arr[this.cursor * 3] = x; arr[this.cursor * 3 + 1] = y; arr[this.cursor * 3 + 2] = z;
    }
  }
  pushTrail(x, y, z) {
    const arr = this.trailGeo.attributes.position.array;
    arr[this.trailIdx * 3] = x + (Math.random() - 0.5) * 0.3;
    arr[this.trailIdx * 3 + 1] = y + Math.random() * 0.2;
    arr[this.trailIdx * 3 + 2] = z + (Math.random() - 0.5) * 0.3;
    this.trailIdx = (this.trailIdx + 1) % this.trailN;
    this.trailGeo.attributes.position.needsUpdate = true;
  }
  update(dt) {
    const arr = this.geo.attributes.position.array;
    let any = false;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.life <= 0) { arr[i * 3 + 1] = -999; continue; }
      any = true;
      p.life -= dt;
      p.vy -= 12 * dt;
      arr[i * 3] += p.vx * dt; arr[i * 3 + 1] += p.vy * dt; arr[i * 3 + 2] += p.vz * dt;
    }
    if (any) this.geo.attributes.position.needsUpdate = true;
  }
}

let shakeAmt = 0;
export function addShake(a) { if (settings.shake) shakeAmt = Math.min(0.6, shakeAmt + a); }
export function applyShake(camera, dt) {
  if (shakeAmt > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shakeAmt;
    camera.position.y += (Math.random() - 0.5) * shakeAmt;
    shakeAmt *= Math.pow(0.02, dt);
  }
}

export function floater(text, color = '#ffe45e') {
  const box = document.querySelector('#floaters');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'floater'; el.textContent = text;
  el.style.color = color;
  el.style.left = (35 + Math.random() * 30) + '%';
  box.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

export function flashVignette(kind = 'red') {
  if (!settings.flash) return;
  const v = document.querySelector('#vignette');
  if (!v) return;
  v.className = 'hit-' + kind;
  setTimeout(() => { v.className = ''; }, kind === 'gold' ? 350 : 450);
}

export function buzz(ms = 20) {
  if (!settings.haptics) return;
  try { navigator.vibrate && navigator.vibrate(ms); } catch {}
}

export function setSpeedlines(on) {
  document.querySelector('#speedlines')?.classList.toggle('on', !!on);
}
