// main.js — glue: portal user + central theme + game + HUD + missions + board.
// Implements spec T1/T2/T4/T5/T7/T8 (see IMPROVEMENTS_FOR_AGENTS.md + README).
import { StarRunner } from './game.js';
import { ThemeManager } from './theme.js';
import { getStartNGUser, onUserChange, onSessionLoss, saveDemoUser, logoutToStartNG, setTheme, getTheme, watchCentralStyling, submitScore, getLocalBest, startRunMeta, STARTNG_CONFIG, DEV } from './startng-bridge.js';
import { sfx, startMusic, stopMusic } from './audio.js';
import { settings, floater } from './fx.js';

const $ = (s) => document.querySelector(s);
const themeManager = new ThemeManager();
watchCentralStyling();
setTheme(getTheme(), 'boot');

let runner, user = null, best = { score: 0 };
const THEMES = [
  { primary: '#7b61ff', accent: '#00e5ff', name: 'StartNG' },
  { primary: '#ff0044', accent: '#ffcc00', name: 'Lagos' },
  { primary: '#00c853', accent: '#ffff00', name: 'Naija' },
  { primary: '#ff6d00', accent: '#00e5ff', name: 'Sunset' },
  { primary: '#00b8d4', accent: '#ff4081', name: 'Lagoon' },
];
let themeIdx = 0;
let missions = [];
let shownCombo = 0;

function loadMissions() {
  try { missions = JSON.parse(localStorage.getItem('star-runner:missions') || 'null') || defaultMissions(); }
  catch { missions = defaultMissions(); }
}
function defaultMissions() {
  return [
    { id: 'stars30', label: 'Collect 30★ in one run', target: 30, key: 'stars', progress: 0, done: false },
    { id: 'dist2k', label: 'Ride 2000m in one run', target: 2000, key: 'distance', progress: 0, done: false },
    { id: 'near5', label: '5 near-misses in one run', target: 5, key: 'near', progress: 0, done: false },
    { id: 'score5k', label: 'Score 5000 in one run', target: 5000, key: 'score', progress: 0, done: false },
  ];
}
function saveMissions() { try { localStorage.setItem('star-runner:missions', JSON.stringify(missions)); } catch {} }
function renderMissions() {
  const box = $('#missions'); if (!box) return;
  box.innerHTML = '<b>🎯 MISSIONS</b>' + missions.map((m) =>
    `<div class="mission ${m.done ? 'done' : ''}">${m.done ? '✅' : '○'} ${m.label} <i>${Math.min(m.progress, m.target)}/${m.target}</i></div>`).join('');
}

async function boot() {
  loadMissions();
  loadSettings();
  runner = new StarRunner($('#game'), { themeManager, onEvent: onGameEvent, username: '...' });
  runner.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches; // T8
  runner.init(); runner.run(); // render loop runs; gameplay gated below (T1)
  try { themeManager.onShape((s) => runner.rebuildAvatarForShape(s)); } catch {}
  buildSwatches(); renderMissions(); renderOnboarding();
  wireUI(); applySettingsToUI();
  setState('loading');
  user = await getStartNGUser();
  if (user) { applyUser(user); }
  onUserChange((u) => { if (u) applyUser(u); });
  onSessionLoss(() => { // T5: session lost mid-run -> pause + login gate
    try { if (runner.playing && !runner.over) runner.togglePause(); } catch {}
    user = null;
    setState('login');
    showGate(null);
    toast('Session expired — log in again');
  });
  best = getLocalBest(user?.id || user?.username);
  $('#best-line').textContent = `BEST ${best.score} · ★ ${best.stars || 0}`;
  if (!user && !DEV) setState('login'); // T1: production gate, no bypass
  else setState('ready');
  showGate(user);
  hideThemeCyclerIfProd(); // T4
  // T8: audio only after first gesture; mute persisted.
  const unlockOnce = () => { try { sfx.unlock(); startMusic(() => (runner?.playing ? Math.min(1, runner.dist / 3000) : 0)); } catch {} removeEventListener('pointerdown', unlockOnce); };
  addEventListener('pointerdown', unlockOnce);
  // T8: auto-pause on hidden tab / orientation change, 3-2-1 resume.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && runner.playing && !runner.paused && !runner.over) runner.togglePause();
  });
  addEventListener('orientationchange', () => {
    if (runner.playing && !runner.paused && !runner.over) runner.togglePause();
  });
  // T7: retry queued scores when back online.
  addEventListener('online', () => { try { submitScore({ score: 0, stars: 0, distance: 0, runId: 'flush' }); } catch {} });
}
function setState(s) {
  // T8: explicit states — loading, ready, login, login-failed, offline, playing.
  document.body.dataset.state = s;
  const sub = $('#gate-sub');
  if (!sub) return;
  if (s === 'loading') sub.textContent = 'Connecting to start.ng…';
  if (s === 'login') sub.textContent = 'Log in with StartNG to play. Guest play is disabled on this build.';
  if (s === 'offline' && !navigator.onLine) sub.textContent = 'You are offline — scores will queue and retry.';
}function hideThemeCyclerIfProd() {
  // T4: theme cycler is a DEV simulator; portal owns the theme in production.
  if (!DEV) { const b = $('#theme-btn'); if (b) b.style.display = 'none'; const s = $('#swatches'); if (s) s.style.display = 'none'; }
}
function loadSettings() {
  // T8: mute persisted.
  try {
    const s = JSON.parse(localStorage.getItem('star-runner:settings') || '{}');
    if (typeof s.muted === 'boolean') settings.muted = s.muted;
    if (typeof s.shake === 'boolean') settings.shake = s.shake;
    if (typeof s.quality === 'string') settings.quality = s.quality;
  } catch {}
}
function persistSettings() {
  try { localStorage.setItem('star-runner:settings', JSON.stringify({ muted: settings.muted, shake: settings.shake, quality: settings.quality })); } catch {}
}
function renderOnboarding() {
  // T8: first-run overlay, 3 steps, skippable, once.
  try { if (localStorage.getItem('star-runner:onboarded')) return; } catch {}
  const box = $('#how'); if (!box) return;
  box.classList.remove('hidden');
  box.innerHTML = '1: Steer with LEFT/RIGHT or swipe.<br/>2: Jump with SPACE or tap. Tall trucks cannot be jumped.<br/>3: Grab stars, boost with SHIFT at 10 stars.<br/><button id="onboard-ok" class="primary">Got it</button>';
  const ok = $('#onboard-ok');
  if (ok) ok.onclick = () => { try { localStorage.setItem('star-runner:onboarded', '1'); } catch {} box.classList.add('hidden'); };
}
function buildSwatches() {
  const box = $('#swatches'); if (!box) return;
  box.innerHTML = '';
  THEMES.forEach((t, i) => {
    const b = document.createElement('button');
    b.className = 'swatch' + (i === themeIdx ? ' active' : '');
    b.title = t.name;
    b.innerHTML = `<span style="background:${t.primary}"></span><span style="background:${t.accent}"></span>`;
    b.onclick = () => { themeIdx = i; setTheme({ ...t }, 'swatch'); sfx.click(); syncSwatches(); toast('Theme: ' + t.name); };
    box.appendChild(b);
  });
}
function syncSwatches() {
  document.querySelectorAll('#swatches .swatch').forEach((el, i) => el.classList.toggle('active', i === themeIdx));
}
function rankFor(score) {
  if (score >= 15000) return 'S - LEGEND';
  if (score >= 9000) return 'A - PRO';
  if (score >= 5000) return 'B - RIDER';
  if (score >= 2000) return 'C - ROOKIE';
  return 'D - LEARNER';
}
function boardEntries() {
  try { return (JSON.parse(localStorage.getItem('star-runner:board') || '[]') || []).sort((a, b) => b.score - a.score).slice(0, 8); }
  catch { return []; }
}
function pushBoard(name, score, stars) {
  const arr = boardEntries();
  arr.push({ name, score, stars, at: Date.now() });
  arr.sort((a, b) => b.score - a.score);
  try { localStorage.setItem('star-runner:board', JSON.stringify(arr.slice(0, 8))); } catch {}
}
function renderBoard(note) {
  const list = $('#board-list'); if (!list) return;
  const arr = boardEntries();
  list.innerHTML = arr.length ? arr.map((e, i) =>
    `<div class="brow ${e.name === user?.displayName ? 'me' : ''}"><span>#${i + 1} ${e.name}</span><span>${e.stars}* ${e.score}</span></div>`).join('')
    : '<p class="hint">No runs yet.</p>';
  const n = $('#board-save-note'); if (n) n.textContent = note || '';
}
function applySettingsToUI() {
  if ($('#set-shake')) $('#set-shake').checked = settings.shake;
  if ($('#set-flash')) $('#set-flash').checked = settings.flash;
  if ($('#set-haptics')) $('#set-haptics').checked = settings.haptics;
  if ($('#set-quality')) $('#set-quality').value = settings.quality;
  if ($('#mute-btn')) $('#mute-btn').textContent = settings.muted ? 'muted' : 'sound';
}
function applyUser(u) {
  user = u;
  runner?.setUsername(u.displayName);
  const chip = $('#user-chip');
  const safe = String(u.displayName || 'Player').replace(/[<>&"']/g, '').slice(0, 20);
  chip.querySelector('.uname').textContent = (u.guest ? 'GUEST ' : '● ') + safe;
  const img = chip.querySelector('img');
  if (u.avatar) {
    img.crossOrigin = 'anonymous'; // T5
    img.onerror = () => { img.style.display = 'none'; };
    img.src = u.avatar; img.style.display = 'block';
  } else img.style.display = 'none';
  chip.classList.toggle('guest', !!u.guest);
  $('#gate-title').textContent = u.guest ? 'Welcome, rider' : `Welcome back, ${safe}`;
  if (!DEV && u.guest) { setState('login'); return; } // T1: no guest play in prod
  $('#gate-sub').textContent = u.guest
    ? 'Playing as guest — scores save on this device.'
    : `Signed in via StartNG as ${safe}. Suit = central theme.`;
  $('#login-row').style.display = u.guest ? 'flex' : 'none';
  // No-dev preview: guest/demo controls are DEV-only — hide them entirely.
  const lr = $('#login-row'); if (lr) lr.style.display = (!DEV && !u) ? 'none' : (u.guest ? 'flex' : 'none');
  const dr = $('#demo-row'); if (dr && !DEV) dr.classList.add('hidden');
  const gb = $('#guest-btn'); if (gb) gb.style.display = DEV ? '' : 'none';
  best = getLocalBest(u.id || u.username);
  $('#best-line').textContent = `BEST ${best.score} · ★ ${best.stars || 0}`;
}
function showGate(u) {
  $('#gate').classList.add('show');
  $('#hud').classList.add('hidden');
  // T1: production gate copy + non-playable preview (idle rider + board).
  if (!DEV && !u) {
    $('#gate-title').textContent = 'Log in with StartNG';
    setState('login');
    const sub = $('#gate-sub');
    if (sub) sub.innerHTML = 'This game uses your <b>start.ng account</b>. Log in to play and save your score.';
    // Hide ALL dev-only rows; show a single portal login button instead.
    const lr = $('#login-row'); if (lr) lr.style.display = 'none';
    const pb = $('#play-btn'); if (pb) pb.style.display = 'none';
    const gb = $('#guest-btn'); if (gb) gb.style.display = 'none';
    const hb = $('#how-btn'); if (hb) hb.style.display = 'none';
    const dt = $('#demo-toggle'); if (dt) dt.style.display = 'none';
    const dr = $('#demo-row'); if (dr) dr.classList.add('hidden');
    let pl = $('#portal-login-btn');
    if (!pl) {
      pl = document.createElement('button');
      pl.id = 'portal-login-btn'; pl.className = 'primary big';
      pl.textContent = 'Log in with start.ng';
      pl.onclick = () => goAuth(STARTNG_CONFIG.loginUrl);
      const row = document.createElement('div');
      row.className = 'row'; row.appendChild(pl);
      const su = document.createElement('button');
      su.id = 'portal-signup-btn'; su.textContent = 'Sign up';
      su.onclick = () => goAuth(STARTNG_CONFIG.signupUrl);
      row.appendChild(su);
      $('#gate .gate-card').appendChild(row);
    }
    try { renderBoardPreview(); } catch {}
  }
}
function renderBoardPreview() {
  // T1: behind-gate preview — idle character is already rendering; show board.
  const box = $('#missions');
  if (box && !boardEntries().length) box.innerHTML = '<b>TOP RIDERS</b><div class="hint">Log in to race the bridge.</div>';
}function hideGate() {
  // T1: production can only leave the gate with a verified user.
  if (!DEV && !user) { setState('login'); return; }
  $('#gate').classList.remove('show'); $('#hud').classList.remove('hidden');
}

function wireUI() {
  const start = (fn) => () => { try { sfx.unlock(); sfx.click(); } catch {} fn(); };
  const needLogin = () => {
    // T1: production cannot start without a verified user.
    if (!DEV && !user) { setState('login'); showGate(null); toast('Log in with StartNG to play'); return true; }
    return false;
  };
  const go = () => {
    if (needLogin()) return;
    hideGate(); setState('playing'); countdown(() => runner.start(startRunMeta()));
  };
  const goGuestDev = () => {
    // T1: guest/demo only in DEV. Production falls back to the login gate.
    if (!DEV) { needLogin(); return; }
    hideGate(); setState('playing'); countdown(() => runner.start(startRunMeta()));
  };
  $('#play-btn').onclick = start(go);
  $('#guest-btn').onclick = start(goGuestDev);  $('#how-btn').onclick = start(() => $('#how').classList.toggle('hidden'));
  const dt = $('#demo-toggle'); if (dt) dt.onclick = start(() => $('#demo-row').classList.toggle('hidden'));
  $('#startng-login-btn').onclick = start(() => goAuth(STARTNG_CONFIG.loginUrl));
  const sub = $('#startng-signup-btn'); if (sub) sub.onclick = start(() => goAuth(STARTNG_CONFIG.signupUrl));
  const ol = $('#over-login-btn'); if (ol) ol.onclick = start(() => goAuth(STARTNG_CONFIG.loginUrl));
  const os = $('#over-signup-btn'); if (os) os.onclick = start(() => goAuth(STARTNG_CONFIG.signupUrl));
  $('#demo-play-btn').onclick = start(() => {
    if (!DEV) { needLogin(); return; } // T1: demo names are DEV-only
    const name = $('#demo-name').value.trim();
    if (!name) { $('#demo-name').focus(); return; }
    const created = saveDemoUser(name, 'https://api.dicebear.com/7.x/thumbs/svg?seed=' + encodeURIComponent(name));
    if (!created) { needLogin(); return; }
    applyUser(created);
    hideGate(); setState('playing'); countdown(() => runner.start(startRunMeta()));
  });
  $('#again-btn').onclick = start(() => { $('#over').classList.add('hidden'); if (needLogin()) return; countdown(() => runner.start(startRunMeta())); });
  $('#menu-btn').onclick = start(() => { $('#over').classList.add('hidden'); showGate(user); });
  const sh = $('#share-btn'); if (sh) sh.onclick = start(async () => {
    const txt = 'I scored ' + $('#final-score').textContent + ' on Star Runner!';
    try {
      if (navigator.share) await navigator.share({ title: 'Star Runner', text: txt, url: location.href });
      else { await navigator.clipboard.writeText(txt + ' ' + location.href); toast('Link copied'); }
    } catch {}
  });
  $('#pause-btn').onclick = start(() => runner.togglePause());
  const rs = $('#resume-btn'); if (rs) rs.onclick = start(() => { $('#pause-menu').classList.add('hidden'); setState('playing'); if (runner.paused) runner.togglePause(); else countdown(() => runner.start(startRunMeta())); }); // T8: 3-2-1 resume
  const rr = $('#restart-btn'); if (rr) rr.onclick = start(() => { $('#pause-menu').classList.add('hidden'); countdown(() => runner.start()); });
  const qb = $('#quit-btn'); if (qb) qb.onclick = start(() => { $('#pause-menu').classList.add('hidden'); runner.playing = false; showGate(user); });
  const pm = $('#pause-mute'); if (pm) pm.onclick = (e) => { settings.muted = !settings.muted; e.target.textContent = settings.muted ? 'muted' : 'sound'; };
  const bb = $('#board-btn'); if (bb) bb.onclick = start(() => { renderBoard(''); $('#board-drawer').classList.remove('hidden'); });
  const bc = $('#board-close'); if (bc) bc.onclick = start(() => $('#board-drawer').classList.add('hidden'));
  const sb = $('#settings-btn'); if (sb) sb.onclick = start(() => $('#settings-drawer').classList.remove('hidden'));
  const sc = $('#settings-close'); if (sc) sc.onclick = start(() => $('#settings-drawer').classList.add('hidden'));
  const mb = $('#mute-btn'); if (mb) mb.onclick = start(() => { settings.muted = !settings.muted; mb.textContent = settings.muted ? 'muted' : 'sound'; persistSettings(); });
  $('#theme-btn').onclick = start(() => {
    themeIdx = (themeIdx + 1) % THEMES.length;
    setTheme({ ...THEMES[themeIdx] }, 'hud-cycle'); syncSwatches();
    toast('Theme: ' + THEMES[themeIdx].name);
  });
  $('#logout-btn').onclick = start(() => logoutToStartNG());
  $('#left-btn').onpointerdown = () => runner.move(-1);
  $('#right-btn').onpointerdown = () => runner.move(1);
  $('#jump-btn').onpointerdown = () => runner.jump();
  const bz = $('#boost-btn'); if (bz) bz.onpointerdown = () => runner.tryBoost(); // T8 touch boost
  // T8: fast restart — R key or Enter from gate (login still enforced).
  addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r' && (runner.over || !runner.playing)) {
      if (!DEV && !user) { needLogin(); return; }
      hideGate(); setState('playing'); countdown(() => runner.start(startRunMeta()));
    }
    if (e.key === 'Enter' && $('#gate').classList.contains('show')) go();
  });}
let counting = false;
function goAuth(url) {
  try { window.parent?.postMessage({ type: 'STARTNG:LOGIN_REQUEST', url }, '*'); } catch {}
  if (window.self === window.top) { location.href = url; return; }
  const dr = $('#demo-row');
  if (dr) { dr.classList.remove('hidden'); toast('Portal login — or enter a demo name'); dr.querySelector('input')?.focus(); }
}
function countdown(go) {
  if (counting) { go(); return; }
  counting = true; toast('3...');
  setTimeout(() => toast('2...'), 400);
  setTimeout(() => { toast('GO!'); counting = false; go(); }, 800);
}
function onGameEvent(kind, data) {
  if (kind === 'tick') {
    $('#score').textContent = data.score;
    $('#stars').textContent = '★ ' + data.stars;
    $('#dist').textContent = Math.floor(data.dist) + 'm';
    $('#boost-tag').classList.toggle('hidden', !data.boost);
    const bf = $('#boost-fill');
    if (bf) bf.style.width = Math.min(100, (data.stars >= 10 ? 100 : data.stars * 10)) + '%';
    const left = (data.left || 0) / 1000;
    const pf = $('#progress-fill'), pt = $('#progress-txt');
    if (pf) pf.style.width = (100 - (left / 11) * 100) + '%';
    if (pt) pt.textContent = left > 0 ? left.toFixed(1) + 'km left' : 'FINISH!';
  }
  if (kind === 'star') { $('#stars').textContent = '★ ' + data; pulse($('#stars')); }
  if (kind === 'boost') toast('BOOST!');
  if (kind === 'pause') {
    const pm = $('#pause-menu'); if (pm) pm.classList.toggle('hidden', !data);
  }
  if (kind === 'perf' && data.downgraded) toast('Quality lowered for smooth play (' + data.fps + 'fps)');
  if (kind === 'milestone') { toast(data + 'm milestone!'); try { sfx.fanfare(); } catch {} }
  if (kind === 'gameover' || kind === 'win') finishRun(data, kind === 'win');
}
async function finishRun(data, won) {
  try { stopMusic(); } catch {}
  // T9: +N vs best. T7: submit with runId/duration/seed; failure queues quietly.
  const prevBest = best.score || 0;
  const delta = data.score - prevBest;
  let saveNote = '';
  try { await submitScore(data); saveNote = 'Saved to StartNG'; }
  catch { saveNote = 'Offline — score queued, will retry'; setState('offline'); }
  try { pushBoard(user?.displayName || 'Guest', data.score, data.stars); } catch {}
  missions.forEach((m) => {
    const v = data[m.key] !== undefined ? Math.floor(data[m.key]) : 0;
    m.progress = Math.max(m.progress, v);
    if (!m.done && m.progress >= m.target) m.done = true;
  });
  saveMissions(); renderMissions();
  $('#final-score').textContent = data.score;
  // T9: share-score card text.
  const shareTxt = `I scored ${data.score} as ${user?.displayName || 'Guest'} on StartNG Star Runner (${data.distance}m, ${data.stars} stars). Rank ${rankFor(data.score)}.`;
  const sh = $('#share-btn');
  if (sh) sh.onclick = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Star Runner', text: shareTxt, url: location.href });
      else { await navigator.clipboard.writeText(shareTxt + ' ' + location.href); toast('Link copied'); }
    } catch {}
  };
  $('#final-stars').textContent = (won ? 'BRIDGE COMPLETE ' : '') + '* ' + data.stars + ' - ' + data.distance + 'm'
    + (delta > 0 ? ` (+${delta} vs best)` : delta < 0 ? ` (${delta} vs best)` : ' (tied best)');
  const rk = $('#rank'); if (rk) rk.textContent = 'RANK ' + rankFor(data.score);
  $('#newbest').classList.toggle('hidden', !(data.score > prevBest));
  const sg = $('#stats-grid');
  if (sg) sg.innerHTML = `<div>score<b>${data.score}</b></div><div>stars<b>${data.stars}</b></div><div>dist<b>${data.distance}m</b></div><div>near<b>${data.near || 0}</b></div>`;
  const isGuest = !user || user.guest;
  const gc = $('#guest-cta'); if (gc) gc.classList.toggle('hidden', !isGuest);
  const oa = $('#over-auth'); if (oa) oa.classList.toggle('hidden', !isGuest);
  best = getLocalBest(user?.id || user?.username);
  $('#over').classList.remove('hidden');
  try { renderBoard(saveNote); } catch {}
  try { startMusic(() => 0); } catch {}
}let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1600);
}
function pulse(el) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
boot();
