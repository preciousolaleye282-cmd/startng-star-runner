// Star Runner — Three.js endless runner. Avatar suit = central StartNG theme.
import * as THREE from 'three';
import { Particles, addShake, applyShake, floater, flashVignette, buzz, setSpeedlines } from './fx.js';
import { sfx } from './audio.js';

export class StarRunner {
  constructor(container, opts = {}) {
    this.container = container;
    this.theme = opts.themeManager;
    this.onEvent = opts.onEvent || (() => {});
    this.username = opts.username || 'Guest';
    this.lanes = [-2.2, 0, 2.2];
    this.finishM = 11000; // 11km bridge
    this.reset();
  }
  reset() {
    this.lane = 1; this.x = 0; this.y = 0; this.vy = 0;
    this.speed = 14; this.score = 0; this.stars = 0; this.dist = 0;
    this.playing = false; this.paused = false; this.over = false; this.boost = 0;
    this.obstacles = []; this.pickups = []; this.scenery = [];
    this.spawnT = 0; this.starT = 0; this.combo = 0; this.comboT = 0;
    this.near = 0; this.topSpeed = 0; this.slowmo = 0;
    if (this.avatar) { this.avatar.rotation.x = 0; this.avatar.position.set(0, 0, 0); }
  }
  init() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#0b1020', 18, 70);
    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 200);
    this.camera.position.set(0, 4.2, 8.5);
    this.camera.lookAt(0, 1.2, -6);
    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a1430, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(4, 10, 6); this.scene.add(sun);
    const back = new THREE.PointLight(0x7b61ff, 2, 40); back.position.set(0, 6, -20); this.scene.add(back);
    this.buildSky();
    // ground (bridge)
    const gtex = this.makeRoadTexture();
    gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping; gtex.repeat.set(1, 12);
    this.roadTex = gtex;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(9, 140),
      new THREE.MeshStandardMaterial({ map: gtex, roughness: 0.9 }));
    road.rotation.x = -Math.PI / 2; road.position.z = -55; this.scene.add(road);
    // side rails glow
    const railMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
    this.railMat = railMat;
    [-4.8, 4.8].forEach((x) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 140), railMat);
      rail.position.set(x, 1.0, -55); this.scene.add(rail);
    });
    // lamps
    for (let i = 0; i < 10; i++) {
      const z = -i * 14;
      [-5.4, 5.4].forEach((x) => {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.4),
          new THREE.MeshStandardMaterial({ color: 0x2a3350 }));
        pole.position.set(x, 2.2, z); this.scene.add(pole);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0xffe08a }));
        lamp.position.set(x, 4.5, z); this.scene.add(lamp);
        this.scenery.push({ mesh: pole, lamp, z });
      });
    }
    this.buildCity();
    this.fx = new Particles(this.scene);
    this.buildAvatar();
    this.bindInput();
    window.addEventListener('resize', () => this.resize());
  }
  buildSky() {
    // gradient dome
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#02030a'); gr.addColorStop(0.55, '#141a4d');
    gr.addColorStop(0.78, '#7b2f8e'); gr.addColorStop(0.92, '#ff7a3c'); gr.addColorStop(1, '#0b1020');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(150, 24, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }));
    this.scene.add(dome);
    // stars
    const n = 400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI * 0.45 + 0.08;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * 140;
      pos[i * 3 + 1] = Math.sin(e) * 140;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 140 - 40;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starField = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, fog: false, transparent: true, opacity: 0.9 }));
    this.scene.add(this.starField);
    // moon
    const moon = new THREE.Mesh(new THREE.SphereGeometry(5, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false }));
    moon.position.set(30, 45, -120); this.scene.add(moon);
  }
  buildCity() {
    // distant skyline silhouettes both sides
    this.city = new THREE.Group();
    const winC = document.createElement('canvas'); winC.width = 32; winC.height = 64;
    const wg = winC.getContext('2d');
    wg.fillStyle = '#0a0e22'; wg.fillRect(0, 0, 32, 64);
    wg.fillStyle = '#ffd54a';
    for (let y = 4; y < 64; y += 8) for (let x = 3; x < 32; x += 7) if (Math.random() < 0.5) wg.fillRect(x, y, 3, 4);
    const wtex = new THREE.CanvasTexture(winC);
    for (let i = 0; i < 26; i++) {
      const hgt = 6 + Math.random() * 14;
      const b = new THREE.Mesh(new THREE.BoxGeometry(3 + Math.random() * 3, hgt, 3),
        new THREE.MeshBasicMaterial({ map: wtex }));
      const side = i % 2 ? 1 : -1;
      b.position.set(side * (14 + Math.random() * 22), hgt / 2 - 2, -i * 6 + 5);
      this.city.add(b);
    }
    this.scene.add(this.city);
  }
  makeRoadTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#141b33'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#1d2547'; for (let i = 0; i < 3; i++) g.fillRect(28 + i * 70, 0, 34, 256);
    g.fillStyle = '#f5c542'; g.fillRect(122, 20, 12, 60); g.fillRect(122, 176, 12, 60);
    g.fillStyle = '#ffffff'; g.fillRect(8, 0, 6, 256); g.fillRect(242, 0, 6, 256);
    const t = new THREE.CanvasTexture(c); return t;
  }
  buildAvatar() {
    const g = new THREE.Group();
    const t = this.theme;
    this.suitMat = t.registerSuit(new THREE.MeshStandardMaterial({ color: 0x7b61ff, roughness: 0.35, metalness: 0.25, emissive: 0x7b61ff, emissiveIntensity: 0.35 }));
    this.glowMat = t.registerGlow(new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.9 }));
    this.visorMat = t.registerVisor(new THREE.MeshStandardMaterial({ color: 0x00e5ff, roughness: 0.1, metalness: 0.8 }));
    const skin = new THREE.MeshStandardMaterial({ color: 0xf2c89b, roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x141a30, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.7, 6, 14), this.suitMat);
    body.position.y = 1.25; body.castShadow = true; g.add(body);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.07, 10, 24), this.glowMat);
    belt.rotation.x = Math.PI / 2; belt.position.y = 1.05; g.add(belt);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 20), skin);
    head.position.y = 2.25; g.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 20, 0, Math.PI * 2, 0, Math.PI / 2.2), this.suitMat);
    helmet.position.y = 2.32; g.add(helmet);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 20, -Math.PI / 3, Math.PI / 1.5, Math.PI / 4.5, Math.PI / 4), this.visorMat);
    visor.position.set(0, 2.25, 0.12); g.add(visor);
    [-0.55, 0.55].forEach((x) => {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.55, 4, 10), this.suitMat);
      arm.position.set(x, 1.35, 0); arm.rotation.z = x > 0 ? -0.25 : 0.25; g.add(arm);
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), this.glowMat);
      glove.position.set(x * 1.15, 0.95, 0); g.add(glove);
    });
    [-0.22, 0.22].forEach((x) => {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.6, 4, 10), dark);
      leg.position.set(x, 0.5, 0); g.add(leg);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.42), this.glowMat);
      boot.position.set(x, 0.12, 0.06); g.add(boot);
      (x < 0 ? this.legL = leg : this.legR = leg);
    });
    // hover board
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 1.6), dark);
    board.position.y = -0.02; g.add(board);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.04, 0.2), this.glowMat);
    strip.position.y = 0.03; g.add(strip); this.boardStrip = strip;
    // name sprite (logged-in username floats above head)
    this.nameCanvas = document.createElement('canvas'); this.nameCanvas.width = 512; this.nameCanvas.height = 128;
    this.nameTex = new THREE.CanvasTexture(this.nameCanvas);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.nameTex, transparent: true, depthWrite: false }));
    tag.scale.set(3.2, 0.8, 1); tag.position.y = 3.15; g.add(tag);
    this.setUsername(this.username);
    const glow = new THREE.PointLight(0x00e5ff, 1.5, 8); glow.position.y = 1.5; g.add(glow);
    this.avatarGlow = glow;
    this.avatar = g; this.scene.add(g);
    t.apply(t.current());
  }
  setUsername(name) {
    // T5: hostile names render safely — canvas text only, sanitised + truncated.
    this.username = String(name || 'Guest').replace(/[<>&"']/g, '').slice(0, 20) || 'Guest';
    if (!this.nameCanvas) return;
    const g = this.nameCanvas.getContext('2d');
    g.clearRect(0, 0, 512, 128);
    g.font = 'bold 52px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#00e5ff'; g.shadowBlur = 18;
    g.fillStyle = '#ffffff';
    const label = this.username.length > 14 ? this.username.slice(0, 13) + '…' : this.username;
    g.fillText(label, 256, 64); // canvas fillText: no HTML parsing, XSS-safe
    this.nameTex.needsUpdate = true;
  }
  bindInput() {
    this.keys = {};
    addEventListener('keydown', (e) => {
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') this.move(-1);
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') this.move(1);
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') this.jump();
      if (e.key.toLowerCase() === 'p') this.togglePause();
      if (e.key === 'Shift') this.tryBoost();
    });
    let sx = 0;
    this.renderer.domElement.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    this.renderer.domElement.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 30) this.move(dx > 0 ? 1 : -1); else this.jump();
    });
  }
  move(d) { if (!this.playing || this.paused || this.over) return; this.lane = Math.max(0, Math.min(2, this.lane + d)); sfx.click(); }
  jump() { if (!this.playing || this.paused || this.over) return; this.jumpBuf = 0.12; }
  tryBoost() { if (this.stars >= 10 && this.boost <= 0) { this.boost = 3; sfx.boost(); this.onEvent('boost'); } }
  togglePause() { if (!this.playing || this.over) return; this.paused = !this.paused; this.onEvent('pause', this.paused); }
  start(runMeta) {
    this.reset(); this.clearEntities();
    this.runMeta = runMeta || null;
    this.playing = true; this.paused = false; this.over = false;
    this.clock = performance.now(); this.onEvent('start');
  }
  clearEntities() {
    if (!this.scene) return;
    [...this.obstacles, ...this.pickups].forEach((o) => { this.freeMesh(o); });
    this.obstacles = []; this.pickups = [];
  }
  getMesh(kind) {
    // T10: pooled meshes — no per-spawn allocation in the hot loop.
    this.pool = this.pool || { cone: [], box: [], tall: [], star: [] };
    const m = this.pool[kind].pop();
    if (m) { m.visible = true; return m; }
    if (kind === 'cone') return new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 14),
      new THREE.MeshStandardMaterial({ color: 0xff5a3c, roughness: 0.5 }));
    if (kind === 'box') return new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xffc93c, roughness: 0.5 }));
    if (kind === 'tall') {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.7, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x3c6eff, roughness: 0.5 }));
      body.position.y = 0.85; g.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.5, 1.22),
        new THREE.MeshStandardMaterial({ color: 0xffc93c, roughness: 0.5 }));
      roof.position.y = 1.95; g.add(roof);
      g.userData.tall = true;
      return g;
    }
    return new THREE.Mesh(new THREE.OctahedronGeometry(0.35),
      new THREE.MeshStandardMaterial({ color: 0xffe45e, emissive: 0xffe45e, emissiveIntensity: 1 }));
  }
  freeMesh(o) {
    this.pool = this.pool || { cone: [], box: [], tall: [], star: [] };
    if (o.mesh) { o.mesh.visible = false; this.scene.remove(o.mesh); if (this.pool[o.kind]) this.pool[o.kind].push(o.mesh); }
  }
  spawnObstacle() {
    // T9: always keep >=1 passable lane within reaction distance.
    const nearLanes = new Set(this.obstacles.filter((o) => o.mesh.position.z < -28 && o.mesh.position.z > -50).map((o) => o.lane));
    let lane = Math.floor(Math.random() * 3);
    if (nearLanes.size >= 2) lane = [0, 1, 2].find((l) => !nearLanes.has(l)) ?? 1;
    const r = Math.random();
    const kind = r < 0.4 ? 'cone' : r < 0.75 ? 'box' : 'tall';
    const mesh = this.getMesh(kind);
    mesh.position.set(this.lanes[lane], 0, -60);
    if (kind === 'cone') mesh.position.y = 0.55;
    if (kind === 'box') mesh.position.y = 0.5;
    mesh.rotation.set(0, 0, 0);
    this.scene.add(mesh);
    this.obstacles.push({ mesh, lane, kind, tall: kind === 'tall' });
    this.sinceBreather = (this.sinceBreather || 0) + 1;
    if (this.sinceBreather > 40) { this.sinceBreather = 0; this.spawnT = Math.max(this.spawnT, 1.6); }
  }
  spawnStar() {
    // T9: milestone row of 3 stars every 500m.
    const before = Math.floor((this.dist - 0.01) / 500), after = Math.floor(this.dist / 500);
    if (after > before) {
      this.lanes.forEach((x, i) => {
        const mesh = this.getMesh('star');
        mesh.position.set(x, 1.4, -60);
        this.scene.add(mesh);
        this.pickups.push({ mesh, lane: i, kind: 'star' });
      });
      this.onEvent('milestone', after * 500);
      return;
    }
    const lane = Math.floor(Math.random() * 3);
    const mesh = this.getMesh('star');
    mesh.position.set(this.lanes[lane], 1.2 + Math.random() * 0.8, -60);
    this.scene.add(mesh);
    this.pickups.push({ mesh, lane, kind: 'star' });
  }
  rebuildAvatarForShape(shape) {
    if (!this.avatar) return;
    const old = this.avatar;
    this.scene.remove(old);
    import('./theme.js').then(({ disposeObject }) => { try { disposeObject(old); } catch {} }).catch(() => {});
    this.boxy = shape === 'box';
    this.matsStripped = true; // old materials disposed; buildAvatar re-registers
    this.buildAvatar();
    this.avatar.position.set(this.x, this.y, 0);
  }
  update(now) {
    if (!this.renderer) return;
    let dt = Math.min(0.05, (now - (this.clock || now)) / 1000 || 0.016);
    this.clock = now;
    // slow-mo on crash
    if (this.slowmo > 0) { this.slowmo -= dt; dt *= 0.25; }
    if (this.playing && !this.paused && !this.over) {
      if (this.boost > 0) this.boost -= dt;
      if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) { this.combo = 0; this.onEvent('combo', 0); } }
      const v = this.speed * (this.boost > 0 ? 1.8 : 1) * (1 + this.dist / 3000);
      this.topSpeed = Math.max(this.topSpeed, v);
      this.dist += v * dt; this.score += v * dt * (this.boost > 0 ? 2 : 1);
      this.roadTex.offset.y -= v * dt * 0.08;
      const tx = this.lanes[this.lane];
      this.x += (tx - this.x) * Math.min(1, dt * 12);
      // T9: coyote time + jump buffer.
      this.coyote = this.y <= 0.01 ? 0.1 : Math.max(0, (this.coyote || 0) - dt);
      this.jumpBuf = Math.max(0, (this.jumpBuf || 0) - dt);
      if (this.jumpBuf > 0 && (this.y <= 0.01 || this.coyote > 0)) {
        this.vy = 8.5; this.jumpBuf = 0; this.coyote = 0; sfx.jump();
      }
      this.vy -= 26 * dt; this.y += this.vy * dt;
      // T8: reduced motion — kill lean/shake/squash.
      const RM = this.reducedMotion;
      if (this.y <= 0) { this.y = 0; this.vy = 0; }
      const run = now * 0.012;
      if (this.legL) { this.legL.rotation.x = Math.sin(run) * 0.7; this.legR.rotation.x = -Math.sin(run) * 0.7; }
      // lean + squash on land
      this.avatar.position.set(this.x, this.y, 0);
      this.avatar.rotation.z = RM ? 0 : (tx - this.x) * -0.18;
      this.avatar.rotation.y = RM ? 0 : (tx - this.x) * -0.1;
      const squash = RM || this.y <= 0.01 ? 1 : 1 + Math.min(0.12, Math.abs(this.vy) * 0.008);
      this.avatar.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      this.fx.pushTrail(this.x, 0.15 + this.y, 0.8);
      // camera: base + boost FOV
      const wantFov = this.boost > 0 ? 74 : 60;
      if (Math.abs(this.camera.fov - wantFov) > 0.5) { this.camera.fov += (wantFov - this.camera.fov) * dt * 4; this.camera.updateProjectionMatrix(); }
      this.camera.position.x = this.x * 0.45;
      this.camera.lookAt(this.x * 0.6, 1.4, -6);
      setSpeedlines(this.boost > 0);
      this.spawnT -= dt; this.starT -= dt;
      if (this.spawnT <= 0) { this.spawnObstacle(); this.spawnT = Math.max(0.35, 1.1 - this.dist / 2500); }
      if (this.starT <= 0) { this.spawnStar(); this.starT = 0.9 + Math.random(); }
      for (let i = this.obstacles.length - 1; i >= 0; i--) {
        const o = this.obstacles[i]; o.mesh.position.z += v * dt;
        if (o.mesh.position.z > 6) { this.freeMesh(o); this.obstacles.splice(i, 1); continue; }
        if (Math.abs(o.mesh.position.z) < 0.9 && Math.abs(this.x - this.lanes[o.lane]) < 0.8) {
          const clear = o.tall ? this.y > 1.6 : this.y > 0.75;
          if (!clear) { this.slowmo = 0.35; sfx.crash(); addShake(0.5); flashVignette('red'); buzz(60); this.fx.burst(this.x, 1.2, 0, 0xff5533, 40, 7); return this.gameOver(); }
        }
        // near-miss bonus
        if (!o.counted && o.mesh.position.z > 0.9 && o.mesh.position.z < 2.2 && Math.abs(this.x - this.lanes[o.lane]) < 1.3) {
          o.counted = true; this.near++; this.score += 25;
          floater('NEAR MISS +25', '#00e5ff'); sfx.near(); this.onEvent('near', this.near);
        }
      }
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const s = this.pickups[i]; s.mesh.position.z += v * dt; s.mesh.rotation.y += dt * 3;
        if (s.mesh.position.z > 6) { this.freeMesh(s); this.pickups.splice(i, 1); continue; }
        const dx = Math.abs(this.x - s.mesh.position.x), dy = Math.abs((this.y + 1.3) - s.mesh.position.y);
        if (Math.abs(s.mesh.position.z) < 1 && dx < 0.9 && dy < 1) {
          const p = s.mesh.position.clone();
          this.freeMesh(s); this.pickups.splice(i, 1);
          this.stars++; this.combo++; this.comboT = 4;
          const gain = 50 * Math.min(this.combo, 5);
          this.score += gain;
          this.fx.burst(p.x, p.y, p.z, 0xffe45e, 26, 5);
          floater('+' + gain + (this.combo > 1 ? '  x' + Math.min(this.combo, 5) : ''), '#ffe45e');
          flashVignette('gold'); buzz(15);
          sfx.star(this.combo);
          this.onEvent('star', this.stars); this.onEvent('combo', this.combo);
        }
      }
      this.scenery.forEach((s) => { s.z += v * dt; if (s.z > 8) s.z -= 140; s.mesh.position.z = s.z; s.lamp.position.z = s.z; });
      // finish the bridge = legend win
      if (this.dist >= this.finishM) return this.winRun();
      this.fx.update(dt);
      // T10: FPS watch — auto-downgrade if slow; T4: theme lerp tick.
      this.theme?.tick?.(dt);
      this.fpsAcc = (this.fpsAcc || 0) + dt; this.fpsN = (this.fpsN || 0) + 1;
      if (this.fpsAcc >= 2) {
        const fps = this.fpsN / this.fpsAcc;
        this.fpsAcc = 0; this.fpsN = 0;
        if (fps < 40 && this.renderer.getPixelRatio() > 1) {
          this.renderer.setPixelRatio(1);
          this.onEvent('perf', { fps: Math.round(fps), downgraded: true });
        }
      }
      this.onEvent('tick', { score: Math.floor(this.score), stars: this.stars, dist: this.dist, boost: this.boost > 0, combo: this.combo, left: Math.max(0, this.finishM - this.dist) });
    } else if (this.over) {
      this.avatar.rotation.x = Math.min(Math.PI / 2, this.avatar.rotation.x + dt * 3);
      this.fx.update(dt);
    }
    if (this.avatarGlow) this.avatarGlow.intensity = 1.3 + Math.sin(now * 0.005) * 0.4;
    applyShake(this.camera, dt);
    this.renderer.render(this.scene, this.camera);
  }
  winRun() {
    this.over = true; this.playing = false;
    sfx.fanfare(); flashVignette('gold'); this.fx.burst(0, 2, -2, 0xffe45e, 60, 8);
    const meta = this.runMeta || {};
    this.onEvent('win', { score: Math.floor(this.score) + 5000, stars: this.stars, distance: Math.floor(this.dist), near: this.near, topSpeed: Math.floor(this.topSpeed * 3.6),
      durationMs: Date.now() - (meta.t0 || Date.now()), seed: meta.seed || 0, runId: meta.runId });
  }
  gameOver() {
    this.over = true; this.playing = false;
    setSpeedlines(false);
    const meta = this.runMeta || {};
    this.onEvent('gameover', { score: Math.floor(this.score), stars: this.stars, distance: Math.floor(this.dist), near: this.near, topSpeed: Math.floor(this.topSpeed * 3.6),
      durationMs: Date.now() - (meta.t0 || Date.now()), seed: meta.seed || 0, runId: meta.runId });
  }
  resize() {
    if (!this.renderer) return;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  loop = (now) => { this.update(now); requestAnimationFrame(this.loop); };
  run() { requestAnimationFrame(this.loop); }
}
