// ThemeManager: central portal styling -> Three.js character materials.
// T4: token->target map, animated lerp (~300ms), contrast guard, background+shape,
// theme-sync indicator, disposal on rebuild. No hardcoded avatar colours here.
import * as THREE from 'three';
import { getTheme, onThemeChange } from './startng-bridge.js';

function luminance(hex) {
  const c = new THREE.Color(hex);
  const f = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
function contrastRatio(a, b) {
  const l1 = luminance(a), l2 = luminance(b);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
function nudgeForContrast(fg, bg, min = 3) {
  if (contrastRatio(fg, bg) >= min) return fg;
  const c = new THREE.Color(fg);
  for (let i = 0; i < 10; i++) {
    const hsl = {}; c.getHSL(hsl);
    c.setHSL(hsl.h, hsl.s, Math.min(0.92, hsl.l + 0.08));
    if (contrastRatio('#' + c.getHexString(), bg) >= min) break;
  }
  return '#' + c.getHexString();
}

export class ThemeManager {
  constructor() {
    this.mats = new Set();
    this.theme = getTheme();
    this.tPrimary = new THREE.Color(this.theme.primary);
    this.tAccent = new THREE.Color(this.theme.accent);
    this.shape = this.theme.shape || 'round';
    this.shapeListeners = new Set();
    onThemeChange((t, src) => this.apply(t, src));
  }
  registerSuit(m) { m.userData.role = 'suit'; this.mats.add(m); return m; }
  registerGlow(m) { m.userData.role = 'glow'; this.mats.add(m); return m; }
  registerVisor(m) { m.userData.role = 'visor'; this.mats.add(m); return m; }
  onShape(fn) { this.shapeListeners.add(fn); return () => this.shapeListeners.delete(fn); }
  apply(theme, src = 'local') {
    const safePrimary = nudgeForContrast(theme.primary, '#141b33', 3);
    this.theme = { ...theme, primary: safePrimary };
    this.tPrimary.set(safePrimary);
    this.tAccent.set(theme.accent);
    if (theme.shape && theme.shape !== this.shape) {
      this.shape = theme.shape;
      this.shapeListeners.forEach((fn) => { try { fn(theme.shape); } catch {} });
    }
    document.documentElement.style.setProperty('--game-primary', safePrimary);
    document.documentElement.style.setProperty('--game-accent', theme.accent);
    if (src === 'portal-push') this.flashSyncBadge();
  }
  tick(dt) {
    const k = 1 - Math.exp(-dt * 8); // ~300ms ease
    this.mats.forEach((m) => {
      if (m.userData.role === 'suit') {
        m.color.lerp(this.tPrimary, k);
        m.emissive.copy(m.color).multiplyScalar(0.35);
      }
      if (m.userData.role === 'glow') {
        m.color.lerp(this.tAccent, k);
        m.emissive.copy(m.color).multiplyScalar(0.9);
      }
      if (m.userData.role === 'visor') m.color.lerp(this.tAccent, k);
    });
  }
  flashSyncBadge() {
    let b = document.querySelector('#theme-sync');
    if (!b) {
      b = document.createElement('div');
      b.id = 'theme-sync'; b.textContent = 'Theme synced from start.ng';
      document.querySelector('#app')?.appendChild(b);
    }
    b.classList.add('show');
    clearTimeout(this._syncT);
    this._syncT = setTimeout(() => b.classList.remove('show'), 1800);
  }
  current() { return this.theme; }
}
export function disposeObject(root) {
  root?.traverse?.((o) => {
    if (o.geometry) try { o.geometry.dispose(); } catch {}
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    mats.forEach((m) => {
      for (const k in m) { const v = m[k]; if (v && v.isTexture) try { v.dispose(); } catch {} }
      try { m.dispose(); } catch {}
    });
  });
}
