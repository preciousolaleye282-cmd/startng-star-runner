// StartNG portal bridge: auth (logged-in user) + theme + scores.
// ALL start.ng-specific names live in STARTNG_CONFIG (single source of truth).
// Verified: nothing (start.ng publishes no game SDK docs).
// Assumed (confirm with start.ng — see README "Questions"): message names,
// globals, endpoints, CSS variables, origins, startng.json fields.
export const STARTNG_CONFIG = {
  loginUrl: 'https://start.ng/login',
  signupUrl: 'https://start.ng/signup',
  apiBase: '', // e.g. 'https://start.ng/api'
  gameSlug: 'star-runner',
  themeDefaults: { primary: '#7b61ff', accent: '#00e5ff', background: '#0b1020' },
  allowedOrigins: ['https://start.ng', 'https://www.start.ng'], // T2: confirm with start.ng
  msgGetUser: 'STARTNG:GET_USER',
  msgGetTheme: 'STARTNG:GET_THEME',
  msgUser: 'STARTNG:USER',
  msgUserUpdate: 'STARTNG:USER_UPDATE',
  msgTheme: 'STARTNG:THEME',
  msgThemeUpdate: 'STARTNG:THEME_UPDATE',
  msgScore: 'STARTNG:SCORE',
  globalUserKeys: ['__STARTNG_USER__', '__STARTNG__'],
  apiPaths: ['/api/me', '/api/auth/me', '/api/user'],
  scorePaths: ['/scores', '/api/scores'],
};
// T1: DEV = local testing only. Production (real hostname, no ?dev) requires a
// verified portal user — no guest bypass, no demo names, no QS/LS identity.
// ?prod=1 (or ?nodev / ?production) forces production mode even on localhost,
// so you can preview the no-dev gate without deploying.
const __qs = new URLSearchParams(location.search);
const __forceProd = __qs.has('prod') || __qs.has('nodev') || __qs.has('production');
export const DEV = (__forceProd ? false :
  (['localhost', '127.0.0.1', ''].includes(location.hostname) || __qs.has('dev')));
export function isDev() { return DEV; }
const listeners = { user: new Set(), theme: new Set(), session: new Set() };
let cachedUser = null, cachedTheme = null, userTrusted = false;

export function onSessionLoss(fn) { listeners.session.add(fn); return () => listeners.session.delete(fn); }
function fireSessionLoss() { listeners.session.forEach((fn) => { try { fn(); } catch {} }); }

function normaliseUser(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') raw = { username: raw };
  const username = raw.username || raw.displayName || raw.name || raw.handle || null;
  if (!username) return null;
  // T5: never use email as identity, never log email (strip it here).
  return { id: String(raw.id ?? raw._id ?? raw.userId ?? raw.sub ?? username),
    username: String(username),
    displayName: String(raw.displayName || raw.name || username),
    avatar: raw.avatar || raw.avatarUrl || raw.photo || raw.image || null,
    guest: !!raw.guest, raw: undefined };
}
// DEV-only identity sources (query string / localStorage). Disabled in production (T1/T2).
function qsUser() {
  if (!DEV) return null;
  try {
    const q = new URLSearchParams(location.search);
    const username = q.get('username') || q.get('user') || q.get('name');
    if (!username) return null;
    return normaliseUser({ id: q.get('userId') || username, username,
      displayName: q.get('displayName') || username, avatar: q.get('avatar') });
  } catch { return null; }
}
function lsUser() {
  if (!DEV) return null;  for (const k of ['startng:user','startng_user','startngUser','user']) {
    try {
      const v = localStorage.getItem(k); if (!v) continue;
      try { const u = normaliseUser(JSON.parse(v)); if (u) return u; }
      catch { const u = normaliseUser(v); if (u) return u; }
    } catch {}
  } return null;
}
function globalUser() {
  try {
    for (const k of STARTNG_CONFIG.globalUserKeys) {
      if (k === '__STARTNG__' && window.__STARTNG__?.user) return { u: normaliseUser(window.__STARTNG__.user), trusted: false };
      if (window[k]) return { u: normaliseUser(window[k]), trusted: false };
    }
    if (window.StartNG?.getUser) {
      const u = window.StartNG.getUser();
      if (u?.then) { u.then(v => { const n = normaliseUser(v); if (n) setUser(n, 'sdk-async', false); }); return null; }
      const n = normaliseUser(u); if (n) return { u: n, trusted: false };
    }
  } catch {} return null;
}
async function apiUser() {
  const bases = [STARTNG_CONFIG.apiBase, ''].filter((v, i, a) => a.indexOf(v) === i);
  const paths = STARTNG_CONFIG.apiPaths;
  for (const b of bases) for (const p of paths) {
    if (!b && p === '/me') continue;
    try {
      const r = await fetch(b + p, { credentials: 'include', headers: { Accept: 'application/json' } });
      if (!r.ok) continue;
      const j = await r.json();
      const n = normaliseUser(j.user || j.data || j);
      if (n && !n.guest) return { u: n, trusted: true }; // cookie session = verified (T1)
    } catch {}
  } return null;
}
export function setUser(user, source, trusted = false) {
  const prev = JSON.stringify(cachedUser); cachedUser = user; userTrusted = !!trusted;
  if (JSON.stringify(user) !== prev) {
    console.info('[startng] user <-', source, user.username); // T5: no email logged (stripped)
    listeners.user.forEach(fn => { try { fn(user, source); } catch (e) {} });
    renderUserChip();
  } return user;
}
export function isUserTrusted() { return userTrusted; }
function guestUser() {
  const g = 'Guest-' + Math.floor(1000 + Math.random() * 9000);
  return { id: g, username: g, displayName: g, avatar: null, guest: true };
}
// T2: origin-checked handshake. Production posts to the portal origin, never '*'.
function portalPost(msg) {
  if (window.self === window.top) return;
  const target = DEV ? '*' : STARTNG_CONFIG.allowedOrigins[0];
  try { window.parent.postMessage(msg, target); } catch {}
}
function isAllowedSource(e) {
  if (e.source !== window.parent) return false;
  if (DEV) return true; // mock-portal.html runs cross-origin on localhost (T3)
  return STARTNG_CONFIG.allowedOrigins.includes(e.origin);
}
function requestUserFromParent(timeout = 2000) {
  return new Promise((resolve) => {
    if (window.self === window.top) return resolve(null);
    let done = false;
    const onMsg = (e) => {
      if (!isAllowedSource(e)) return; // T2: forged origins ignored
      const d = e.data; if (!d || typeof d !== 'object') return;
      if ((d.type === STARTNG_CONFIG.msgUser || d.type === STARTNG_CONFIG.msgUserUpdate) && d.user) {
        const n = normaliseUser(d.user);
        if (n) { cleanup(); resolve({ u: n, trusted: true }); } // portal frame = verified
      }
      if ((d.type === STARTNG_CONFIG.msgTheme || d.type === STARTNG_CONFIG.msgThemeUpdate) && (d.theme || d.primary)) {
        setTheme(normaliseTheme(d.theme || d), 'portal-push');
      }
    };
    const cleanup = () => { if (!done) { done = true; window.removeEventListener('message', onMsg); } };
    window.addEventListener('message', onMsg);
    const ask = () => portalPost({ type: STARTNG_CONFIG.msgGetUser, game: STARTNG_CONFIG.gameSlug });
    ask(); const t1 = setTimeout(ask, 600);
    setTimeout(() => { cleanup(); clearTimeout(t1); resolve(null); }, timeout);
  });
}
// T1: production requires a verified portal user. DEV keeps guest/demo for testing.
export async function getStartNGUser({ allowGuest = true } = {}) {
  if (cachedUser) return cachedUser;
  // 1) portal iframe handshake FIRST (primary path, T2)
  let r = await requestUserFromParent(2000);
  if (r?.u) return setUser(r.u, 'postMessage', r.trusted);
  // 2) same-origin cookie session API (verified)
  r = await apiUser();
  if (r?.u) return setUser(r.u, 'api', r.trusted);
  // 3) injected globals (unverified — DEV or display-only)
  r = globalUser();
  if (r?.u) {
    if (!DEV) { setUser(r.u, 'sync-unverified', false); return null; } // prod: do not play
    return setUser(r.u, 'sync', false);
  }
  // 4) DEV-only: query params / localStorage / demo
  if (DEV) {
    const q = qsUser() || lsUser();
    if (q) return setUser(q, 'dev-sync', false);
    if (allowGuest) return setUser(guestUser(), 'guest', false);
  }
  return null;
}export function getCachedUser(){return cachedUser;}
export function onUserChange(fn){listeners.user.add(fn);return()=>listeners.user.delete(fn);}
// T1: demo login is DEV-only. Production returns null (login gate stays).
export function saveDemoUser(username, avatar){
  if (!DEV) return null;
  const u=normaliseUser({username,avatar}); if(!u) return null;
  try{localStorage.setItem('startng:user',JSON.stringify(u));}catch{}
  portalPost({type:'STARTNG:LOGIN',user:{username:u.username,id:u.id}});
  return setUser(u,'demo-login',false);
}
export function logoutToStartNG(){
  const had = !!cachedUser;
  cachedUser=null; userTrusted=false;
  try{['startng:user','startng_user','startngUser'].forEach(k=>localStorage.removeItem(k));}catch{}
  portalPost({type:'STARTNG:LOGOUT'});
  if (had) fireSessionLoss(); // T5: mid-run session loss -> pause + gate
  location.href=STARTNG_CONFIG.loginUrl;
}
export function normaliseTheme(raw={}) {
  const d=STARTNG_CONFIG.themeDefaults;
  const pick=(...ks)=>{for(const k of ks) if(raw[k]) return raw[k]; return null;};
  return { primary: pick('primary','primaryColor','brand','brandColor')||d.primary,
    accent: pick('accent','accentColor','secondary')||d.accent,
    background: pick('background','bg')||d.background, mode: pick('mode','theme')||'dark',
    shape: pick('shape','radius','avatarShape')||'round' }; // T4: round vs box avatar
}
export function readCentralTheme() {
  const q=new URLSearchParams(location.search); const fromQS={};
  if (!DEV) { /* QS theme is DEV-only (T2) */ }
  else {
    if(q.get('primary')) fromQS.primary=q.get('primary');
    if(q.get('accent')) fromQS.accent=q.get('accent');
    if(q.get('bg')) fromQS.background=q.get('bg');
    if(q.get('shape')) fromQS.shape=q.get('shape');
  }  let fromCSS={};
  try {
    const cs=getComputedStyle(document.documentElement);
    const gv=(ns)=>{for(const n of ns){const v=cs.getPropertyValue(n).trim(); if(v) return v;} return null;};
    fromCSS={ primary: gv(['--startng-primary','--primary-color','--brand-color','--primary']),
      accent: gv(['--startng-accent','--accent-color','--accent']), background: gv(['--startng-bg','--background']) };
    Object.keys(fromCSS).forEach(k=>{if(!fromCSS[k]) delete fromCSS[k];});
  } catch {}
  const fromBody={};
  if(document.body?.dataset?.primary) fromBody.primary=document.body.dataset.primary;
  if(document.body?.dataset?.accent) fromBody.accent=document.body.dataset.accent;
  let fromLS={};
  if (DEV) { // stored theme is DEV-only (T2)
    for(const k of ['startng:theme','startng_theme','theme']){
      try{const v=localStorage.getItem(k); if(!v) continue; const j=JSON.parse(v); fromLS=j.theme||j; break;}catch{}
    }
  }  return normaliseTheme({...STARTNG_CONFIG.themeDefaults,...fromLS,...fromCSS,...fromBody,...fromQS,...(cachedTheme||{})});
}
export function setTheme(theme,source='local'){
  cachedTheme=normaliseTheme(theme);
  document.documentElement.style.setProperty('--startng-primary',cachedTheme.primary);
  document.documentElement.style.setProperty('--startng-accent',cachedTheme.accent);
  document.documentElement.style.setProperty('--startng-bg',cachedTheme.background);
  listeners.theme.forEach(fn=>{try{fn(cachedTheme,source);}catch(e){}});
  return cachedTheme;
}
export function onThemeChange(fn){listeners.theme.add(fn);return()=>listeners.theme.delete(fn);}
export function getTheme(){return cachedTheme||readCentralTheme();}
export function watchCentralStyling(){
  const emit=()=>setTheme(readCentralTheme(),'css-observer');
  const mo=new MutationObserver(emit);
  mo.observe(document.documentElement,{attributes:true,attributeFilter:['style','class']});
  window.addEventListener('storage',(e)=>{if(e.key&&/theme|startng/i.test(e.key)) emit();});
  // T2: announce + ask for user/theme via origin-checked posts
  portalPost({type:'STARTNG:READY',game:STARTNG_CONFIG.gameSlug});
  portalPost({type:STARTNG_CONFIG.msgGetUser,game:STARTNG_CONFIG.gameSlug});
  portalPost({type:STARTNG_CONFIG.msgGetTheme,game:STARTNG_CONFIG.gameSlug});
  window.addEventListener('message',(e)=>{
    if(!isAllowedSource(e)) return; // forged origins ignored
    const d=e.data; if(!d||typeof d!=='object') return;
    if((d.type===STARTNG_CONFIG.msgTheme||d.type===STARTNG_CONFIG.msgThemeUpdate)&&(d.theme||d.primary)) setTheme(normaliseTheme(d.theme||d),'portal-push');
    if((d.type===STARTNG_CONFIG.msgUser||d.type===STARTNG_CONFIG.msgUserUpdate)&&d.user){const n=normaliseUser(d.user); if(n) setUser(n,'portal-push',true);}
    if(d.type==='STARTNG:SESSION_LOST') { cachedUser=null; userTrusted=false; fireSessionLoss(); } // T5
  });
  return ()=>mo.disconnect();
}
// T7: score integrity — runId + duration + seed; offline queue; server verifies.
function newRunId() {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch {}
  return 'run-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36);
}
export function startRunMeta() {
  return { runId: newRunId(), t0: Date.now(), seed: Math.floor(Math.random() * 2 ** 31) };
}
function queueScore(payload) {
  try {
    const q = JSON.parse(localStorage.getItem('star-runner:score-queue') || '[]');
    q.push(payload);
    localStorage.setItem('star-runner:score-queue', JSON.stringify(q.slice(-20)));
  } catch {}
}
async function flushScoreQueue() {
  let q = [];
  try { q = JSON.parse(localStorage.getItem('star-runner:score-queue') || '[]'); } catch {}
  if (!q.length || !STARTNG_CONFIG.apiBase) return;
  const rest = [];
  for (const p of q) {
    let ok = false;
    for (const sp of STARTNG_CONFIG.scorePaths) {
      try {
        const r = await fetch(STARTNG_CONFIG.apiBase + sp, { method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (r.ok) { ok = true; break; }
      } catch {}
    }
    if (!ok) rest.push(p);
  }
  try { localStorage.setItem('star-runner:score-queue', JSON.stringify(rest.slice(-20))); } catch {}
}
export async function submitScore({ score, stars, distance, durationMs, seed, runId }) {
  const user = cachedUser || await getStartNGUser();
  const payload = { type: STARTNG_CONFIG.msgScore, game: STARTNG_CONFIG.gameSlug,
    runId: runId || newRunId(), userId: user && !user.guest ? user.id : undefined,
    username: user && !user.guest ? user.username : undefined,
    score, stars, distance, durationMs: durationMs || 0, seed: seed || 0,
    at: new Date().toISOString() };
  let sent = false;
  try { if (window.StartNG?.submitScore) { await window.StartNG.submitScore(payload); sent = true; } } catch {}
  try { if (window.self !== window.top) { portalPost(payload); sent = true; } } catch {}
  if (STARTNG_CONFIG.apiBase) {
    for (const sp of STARTNG_CONFIG.scorePaths) {
      try {
        const r = await fetch(STARTNG_CONFIG.apiBase + sp, { method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (r.ok) { sent = true; break; }
      } catch {}
    }
  }
  if (!sent) queueScore(payload); // T7: quiet retry later, no UI crash
  else flushScoreQueue().catch(() => {});
  try {
    if (user && !user.guest) {
      const k = 'star-runner:best:' + user.id;
      const prev = JSON.parse(localStorage.getItem(k) || '{"score":0}');
      if (score > prev.score) localStorage.setItem(k, JSON.stringify({ score, stars, distance, at: Date.now() }));
    }
  } catch {}
  return payload;
}export function getLocalBest(username){
  // T7: keyed by user id when available; falls back to legacy username keys.
  const keys = username ? ['star-runner:best:' + username] : [];
  keys.push('star-runner:best:guest');
  for (const k of keys) {
    try {
      const v = JSON.parse(localStorage.getItem(k) || 'null');
      if (v && typeof v.score === 'number') return { score: 0, stars: 0, distance: 0, ...v };
    } catch {}
  }
  return { score: 0, stars: 0, distance: 0 };
}
function sanitizeName(n) {
  // T5: escape + truncate for the HUD chip (canvas label handled in game.js).
  return String(n || 'Player').replace(/[<>&"']/g, '').slice(0, 20) || 'Player';
}
function renderUserChip(){
  const chip=document.querySelector('#user-chip'); if(!chip||!cachedUser) return;
  const name=chip.querySelector('.uname'); const av=chip.querySelector('img');
  if(name) name.textContent=(cachedUser.guest?'GUEST ':'● ')+sanitizeName(cachedUser.displayName);
  if(av){
    if(cachedUser.avatar){
      av.crossOrigin='anonymous'; // T5
      av.onerror=()=>{ av.style.display='none'; chip.dataset.initial=(sanitizeName(cachedUser.displayName)[0]||'P').toUpperCase(); chip.classList.add('initial'); };
      av.onload=()=>chip.classList.remove('initial');
      av.src=cachedUser.avatar; av.style.display='block';
    } else {
      av.style.display='none';
      chip.dataset.initial=(sanitizeName(cachedUser.displayName)[0]||'P').toUpperCase();
      chip.classList.add('initial');
    }
  }
  chip.classList.toggle('guest',!!cachedUser.guest);
}
