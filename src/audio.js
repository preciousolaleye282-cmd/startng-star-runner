// audio.js — WebAudio SFX (no assets) + adaptive music loop.
import { settings } from './fx.js';

let ctx = null, musicNodes = null, musicTimer = null, step = 0;
function ac() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ctx?.state === 'suspended') ctx.resume();
  return ctx;
}
function tone(freq, dur = 0.15, type = 'sine', vol = 0.25, slide = 0) {
  if (settings.muted) return;
  const c = ac(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + dur);
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g).connect(c.destination);
  o.start(); o.stop(c.currentTime + dur);
}
export const sfx = {
  unlock() { ac(); },
  click() { tone(600, 0.06, 'square', 0.12); },
  jump() { tone(300, 0.18, 'sine', 0.25, 400); },
  star(combo = 1) { tone(700 + Math.min(combo, 8) * 90, 0.22, 'triangle', 0.3, 300); },
  near() { tone(1200, 0.12, 'sawtooth', 0.15, -400); },
  boost() { tone(150, 0.5, 'sawtooth', 0.3, 700); },
  crash() { tone(120, 0.4, 'sawtooth', 0.4, -80); tone(60, 0.5, 'sine', 0.4); },
  count(final) { tone(final ? 880 : 440, final ? 0.3 : 0.12, 'square', 0.2); },
  fanfare() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.3), i * 120)); },
};
// tiny adaptive bassline: tempo rises with speed factor 0..1
export function startMusic(getEnergy) {
  stopMusic();
  const c = ac(); if (!c) return;
  const bass = [55, 55, 65.4, 49];
  musicTimer = setInterval(() => {
    if (settings.muted) return;
    const e = Math.min(1, getEnergy ? getEnergy() : 0);
    const f = bass[step % 4] * (1 + e * 0.5);
    tone(f, 0.22, 'triangle', 0.10);
    if (step % 2 === 0) tone(220 + e * 220, 0.05, 'square', 0.03);
    step++;
  }, 260);
}
export function stopMusic() { if (musicTimer) clearInterval(musicTimer); musicTimer = null; }
