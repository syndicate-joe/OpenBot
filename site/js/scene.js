// Hero + "anatomy of a teammate": Nova (the OpenBot mascot) as a glossy 3D head that
// follows your cursor, then, as you scroll, comes apart into a white line-art
// exploded view whose parts map to OpenBot features.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const canvas = document.getElementById('gl');
const track = document.querySelector('.stage-track');
const stage = document.querySelector('.stage');
const hero = document.getElementById('hero');
const anat = document.getElementById('anat');
const anatItems = [...document.querySelectorAll('#anatList li')];
const anatIdx = document.getElementById('anatIdx');
const markersBox = document.getElementById('markers');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch {
  document.documentElement.classList.add('no-webgl');
}
if (renderer) init();

function init() {
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 6.4);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(3, 4, 5);
  scene.add(key, new THREE.AmbientLight(0xffffff, 0.25));
  const rim = new THREE.PointLight(0x8b6cff, 6, 12);
  rim.position.set(-3, 1.5, -2.5);
  scene.add(rim);

  // ---------- materials ----------
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf4f4f2, roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.15, transparent: true });
  const ink = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.35, transparent: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.5, metalness: 0.3, transparent: true });
  const violet = new THREE.MeshStandardMaterial({ color: 0x8b6cff, emissive: 0x8b6cff, emissiveIntensity: 1.6, roughness: 0.3 });
  const solids = [white, dark];
  const lines = [];
  const lineMat = () => new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
  const track_ = (l) => (lines.push(l), l);

  // lat/long wireframe for a hemisphere whose dome points +y
  function hemiLines(r, rings = 7, meridians = 16) {
    const pts = [];
    const seg = 64;
    for (let i = 1; i <= rings; i++) {
      const th = (i / rings) * (Math.PI / 2);
      const y = Math.cos(th) * r, rr = Math.sin(th) * r;
      for (let s = 0; s < seg; s++) {
        const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
        pts.push(Math.cos(a0) * rr, y, Math.sin(a0) * rr, Math.cos(a1) * rr, y, Math.sin(a1) * rr);
      }
    }
    for (let m = 0; m < meridians; m++) {
      const a = (m / meridians) * Math.PI * 2;
      for (let s = 0; s < 24; s++) {
        const t0 = (s / 24) * (Math.PI / 2), t1 = ((s + 1) / 24) * (Math.PI / 2);
        pts.push(Math.cos(a) * Math.sin(t0) * r, Math.cos(t0) * r, Math.sin(a) * Math.sin(t0) * r, Math.cos(a) * Math.sin(t1) * r, Math.cos(t1) * r, Math.sin(a) * Math.sin(t1) * r);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return track_(new THREE.LineSegments(g, lineMat()));
  }
  const edges = (geo, angle = 25) => track_(new THREE.LineSegments(new THREE.EdgesGeometry(geo, angle), lineMat()));

  const head = new THREE.Group();
  scene.add(head);
  const R = 1;
  const hemiGeo = new THREE.SphereGeometry(R, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2);

  // 01 face shell (front hemisphere) + eyes
  const front = new THREE.Group();
  const frontInner = new THREE.Group();
  frontInner.add(new THREE.Mesh(hemiGeo, white), hemiLines(R * 1.002));
  frontInner.rotation.x = Math.PI / 2; // dome faces +z
  front.add(frontInner);
  const eyes = new THREE.Group();
  const capGeo = new THREE.CapsuleGeometry(0.075, 0.2, 8, 20);
  const mkEye = (x, rz) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(capGeo, ink);
    g.add(m, edges(capGeo));
    g.position.set(x, 0.06, 0);
    g.rotation.z = rz;
    return { g, m };
  };
  const eL = mkEye(-0.22, 0.3), eR = mkEye(0.22, -0.42);
  eyes.add(eL.g, eR.g);
  eyes.position.z = 0.955;
  front.add(eyes);
  head.add(front);

  // 06 back shell with a "rules" plate
  const back = new THREE.Group();
  const backInner = new THREE.Group();
  backInner.add(new THREE.Mesh(hemiGeo, white), hemiLines(R * 1.002));
  backInner.rotation.x = -Math.PI / 2;
  back.add(backInner);
  const plateGeo = new RoundedBoxGeometry(0.42, 0.3, 0.06, 4, 0.04);
  const plate = new THREE.Group();
  plate.add(new THREE.Mesh(plateGeo, dark), edges(plateGeo));
  plate.position.set(0, 0, -1.0);
  back.add(plate);
  head.add(back);

  // 02 computer core with the real app on its screen
  const core = new THREE.Group();
  const coreGeo = new RoundedBoxGeometry(0.98, 0.64, 0.3, 4, 0.05);
  core.add(new THREE.Mesh(coreGeo, dark), edges(coreGeo));
  let needsRender = true;
  const screenTex = new THREE.TextureLoader().load('media/chat-computer-dark.jpg', () => { needsRender = true; kick(); });
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.55), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.z = 0.152;
  core.add(screen);
  const pins = [];
  for (let i = -4; i <= 4; i++) pins.push(i * 0.1, -0.32, 0, i * 0.1, -0.42, 0, i * 0.1, 0.32, 0, i * 0.1, 0.42, 0);
  const pinG = new THREE.BufferGeometry();
  pinG.setAttribute('position', new THREE.Float32BufferAttribute(pins, 3));
  core.add(track_(new THREE.LineSegments(pinG, lineMat())));
  head.add(core);

  // 03 memory rings + orbiting memories
  const ring = new THREE.Group();
  const t1 = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.012, 8, 160), violet);
  const t2 = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.006, 6, 160), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
  t1.rotation.x = Math.PI / 2; t2.rotation.x = Math.PI / 2 + 0.25; t2.rotation.y = 0.2;
  ring.add(t1, t2);
  const orbit = new THREE.Group();
  const dotGeo = new THREE.SphereGeometry(0.028, 12, 8);
  const dotWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let i = 0; i < 9; i++) {
    const d = new THREE.Mesh(dotGeo, i % 3 ? dotWhite : violet);
    const a = (i / 9) * Math.PI * 2;
    d.position.set(Math.cos(a) * 0.82, 0, Math.sin(a) * 0.82);
    orbit.add(d);
  }
  ring.add(orbit);
  head.add(ring);

  // 04 antenna
  const antenna = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 12), ink); stem.position.y = 1.15;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 16), violet.clone()); bulb.position.y = 1.4;
  const baseGeo = new THREE.CylinderGeometry(0.11, 0.14, 0.06, 32);
  const base = new THREE.Group(); base.add(new THREE.Mesh(baseGeo, white), edges(baseGeo)); base.position.y = 0.985;
  antenna.add(stem, bulb, base);
  head.add(antenna);

  // 05 ears = bridges
  const ears = [];
  const earGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 48);
  const capInner = new THREE.CylinderGeometry(0.12, 0.12, 0.125, 32);
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(earGeo, white), new THREE.Mesh(capInner, ink), edges(earGeo));
    g.rotation.z = Math.PI / 2;
    g.userData.side = s;
    ears.push(g);
    head.add(g);
  }

  // turntable rings + star dust
  const floor = new THREE.Group();
  for (const [r, o] of [[1.3, 0.16], [1.75, 0.1], [2.4, 0.06]]) {
    const c = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.004, 128), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: o, side: THREE.DoubleSide }));
    c.rotation.x = -Math.PI / 2;
    floor.add(c);
  }
  scene.add(floor);
  const dustG = new THREE.BufferGeometry();
  const dp = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) {
    const r = 5 + Math.random() * 12, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    dp.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th) - 4], i * 3);
  }
  dustG.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dustG, new THREE.PointsMaterial({ color: 0xffffff, size: 0.025, transparent: true, opacity: 0.55 }));
  scene.add(dust);

  // ---------- projected markers ----------
  const NAMES = ['Face', 'Core', 'Memory', 'Antenna', 'Ears', 'Shell'];
  const anchorDefs = [[front, 0.45, 0.62, 0.98], [core, 0.5, 0.3, 0.15], [ring, -0.82, 0, 0.1], [antenna, 0, 1.42, 0], [ears[1], 0, 0, 0], [back, -0.35, 0.6, -0.9]];
  const anchors = anchorDefs.map(([parent, x, y, z]) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; });
  const markers = NAMES.map((n, i) => {
    const el = document.createElement('div');
    el.className = 'marker';
    el.innerHTML = `<b>0${i + 1}</b><i></i><span>${n}</span>`;
    markersBox.appendChild(el);
    return el;
  });

  // which line-art belongs to which numbered part (for the violet highlight)
  const partLines = [[front], [core], [ring], [antenna], ears, [back]].map((groups) => {
    const out = [];
    groups.forEach((g) => g.traverse((o) => o.isLineSegments && out.push(o)));
    return out;
  });
  const WHITE = new THREE.Color(0xffffff), VIOLET = new THREE.Color(0xa58cff);

  // ---------- state ----------
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const cur = { e: 0, x: 0, y: 0, rotY: 0, s: 1 };
  let progress = 0, active = -2, visible = true, w = 1, h = 1, navBottom = 72, textBoxes = [];
  // Boxes of the hero text lines in CSS px (ignores the intro slide-up transform on the title spans).
  function measureTitle() {
    textBoxes = [];
    for (const l of document.querySelectorAll('.hero-title .line')) {
      const r = l.getBoundingClientRect(), sp = l.firstElementChild;
      textBoxes.push({ left: r.left + sp.offsetLeft, right: r.left + sp.offsetLeft + sp.offsetWidth, top: r.top, bottom: r.bottom });
    }
    const eb = document.querySelector('.hero .eyebrow');
    if (eb) {
      const r = eb.getBoundingClientRect();
      const last = [...eb.children].filter((c) => c.offsetParent).pop();
      textBoxes.push({ left: r.left, right: last ? last.getBoundingClientRect().right : r.right, top: r.top, bottom: r.bottom });
    }
  }
  let blinkAt = performance.now() + 2500;
  const v3 = new THREE.Vector3();

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

  function resize() {
    w = stage.clientWidth || innerWidth; h = stage.clientHeight || innerHeight;
    navBottom = document.getElementById('nav')?.getBoundingClientRect().bottom || 72;
    measureTitle();
    renderer.setPixelRatio(Math.min(devicePixelRatio, w < 700 ? 1.5 : 1.75));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w / h < 0.8 ? 8.8 : 6.4;
    camera.updateProjectionMatrix();
  }

  function readScroll() {
    const total = track.offsetHeight - innerHeight;
    progress = reduced ? 0.6 : clamp(-track.getBoundingClientRect().top / Math.max(1, total));
  }

  const ANG = [0.8, 1.0, 0.95, 0.85, 1.2, 1.45]; // best viewing angle per part
  function target() {
    const mobile = w / h < 0.8;
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const halfW = halfH * camera.aspect;
    const p = progress;
    const toAnat = smooth(0.1, 0.26, p);
    const steps = clamp((p - 0.26) / 0.68);
    const idx = p < 0.24 ? -1 : Math.min(5, Math.floor(steps * 6));
    // Keep the whole robot (antenna included) below the fixed header and inside the side margin.
    const wpp = (2 * halfH) / h; // world units per CSS pixel at the head's depth
    const ceiling = halfH - (navBottom + 36) * wpp;
    const sAn = mobile ? 0.44 : 0.6;
    const HERO_TOP = 1.62, HERO_BOTTOM = 1.08, HALF_W = 1.18; // head extents in head units (antenna, chin, ears)
    const EXPLODED_TOP = 2.45;
    // Pick the biggest head that fits under the header, inside the right margin, without covering any text line.
    const maxS = mobile ? 0.74 : 0.86;
    let sHero = 0.42, heroX = 0, heroY = 0;
    for (let sc = maxS; sc >= 0.42; sc -= 0.02) {
      const x = mobile ? 0 : Math.min(halfW * 0.52, halfW - HALF_W * sc - 40 * wpp);
      const y = Math.min(mobile ? halfH * 0.56 : halfH * 0.3, ceiling - HERO_TOP * sc);
      const px = { left: ((x - HALF_W * sc + halfW) / (2 * halfW)) * w, right: ((x + HALF_W * sc + halfW) / (2 * halfW)) * w, top: (halfH - (y + HERO_TOP * sc)) / wpp, bottom: (halfH - (y - HERO_BOTTOM * sc)) / wpp };
      sHero = sc; heroX = x; heroY = y;
      const hits = textBoxes.some((t) => t.right > px.left + 8 && t.left < px.right - 8 && t.bottom > px.top + 6 && t.top < px.bottom - 6);
      if (!hits) break;
    }
    const anX = mobile ? 0 : -halfW * 0.24;
    const anY = Math.min(mobile ? halfH * 0.26 : 0.05, ceiling - EXPLODED_TOP * sAn);
    return {
      e: smooth(0.18, 0.5, p),
      x: lerp(heroX, anX, toAnat), y: lerp(heroY, anY, toAnat),
      rotY: idx < 0 ? lerp(-0.25, 0.55, toAnat) : ANG[idx],
      s: lerp(sHero, sAn, toAnat),
      idx, toAnat,
    };
  }

  function setActive(idx) {
    if (idx === active) return;
    active = idx;
    anatItems.forEach((li, i) => li.classList.toggle('active', i === idx));
    markers.forEach((m, i) => m.classList.toggle('active', i === idx));
    if (idx >= 0) anatIdx.textContent = `0${idx + 1}`;
  }

  // ---------- tap reactions: poke Nova and it reacts ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const REACTIONS = [
    { type: 'hop', say: 'Hi! 👋', dur: 1.0 },
    { type: 'spin', say: 'Wheee!', dur: 1.15 },
    { type: 'surprised', say: 'Whoa!', dur: 1.0 },
    { type: 'wink', say: 'Ready to work 😉', dur: 1.2 },
    { type: 'dizzy', say: "Okay, okay, I'm on it!", dur: 1.6 },
  ];
  let reaction = null, reactionIdx = 0, poked = false;
  const bubble = document.createElement('div');
  bubble.className = 'say';
  bubble.setAttribute('role', 'status');
  stage.appendChild(bubble);
  const pokeBtn = document.createElement('button');
  pokeBtn.type = 'button';
  pokeBtn.className = 'poke-btn';
  pokeBtn.textContent = 'Poke Nova';
  pokeBtn.addEventListener('click', () => react());
  stage.appendChild(pokeBtn);

  // sparkle burst from the antenna (head-local space, so it travels with the head)
  const SPARK = 40;
  const sparkPos = new Float32Array(SPARK * 3), sparkVel = new Float32Array(SPARK * 3);
  const sparkG = new THREE.BufferGeometry();
  sparkG.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkG, new THREE.PointsMaterial({ color: 0xcdbdff, size: 0.07, transparent: true, opacity: 0, depthWrite: false }));
  sparks.frustumCulled = false;
  head.add(sparks);
  let sparkT = -1;
  function burst(now) {
    for (let i = 0; i < SPARK; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.75, sp = 1.2 + Math.random() * 1.6;
      sparkPos.set([0, 1.42, 0], i * 3);
      sparkVel.set([Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(th) * sp], i * 3);
    }
    sparkT = now;
  }

  function hitHead(clientX, clientY) {
    if (progress > 0.12) return false; // only in the hero, not the exploded view
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObject(head, true).some((i) => i.object.isMesh && i.object !== sparks);
  }

  function react() {
    const now = performance.now();
    poked = true;
    reaction = { ...REACTIONS[reactionIdx++ % REACTIONS.length], t0: now };
    bubble.textContent = reaction.say;
    bubble.classList.remove('on');
    void bubble.offsetWidth; // restart the pop animation
    bubble.classList.add('on');
    if (!reduced) burst(now);
    navigator.vibrate?.(12);
    kick();
  }

  const bump = (k) => Math.sin(Math.PI * Math.min(1, Math.max(0, k)));
  const inOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  function applyReaction(type, k, t, s) {
    const b = bump(k);
    if (type === 'hop') {
      const air = bump((k - 0.12) / 0.7);
      head.position.y += air * 0.6 * s;
      const squash = k < 0.12 ? bump(k / 0.12) : k > 0.82 ? bump((k - 0.82) / 0.18) : 0;
      head.scale.set(s * (1 + 0.14 * squash), s * (1 - 0.16 * squash + 0.06 * air), s * (1 + 0.14 * squash));
      head.rotation.z = Math.sin(k * Math.PI * 2) * 0.12;
      eL.g.scale.y = eR.g.scale.y = 1 - 0.7 * air; // happy squint
    } else if (type === 'spin') {
      head.rotation.y += Math.PI * 2 * inOut(k);
      head.position.y += b * 0.3 * s;
      eL.g.scale.y = eR.g.scale.y = 1 - 0.6 * b;
    } else if (type === 'surprised') {
      head.position.z -= b * 0.6;
      head.rotation.x -= b * 0.3;
      const pop = 1 + 0.65 * bump(k / 0.6);
      eL.g.scale.set(pop, pop, 1); eR.g.scale.set(pop, pop, 1);
      ears.forEach((g) => (g.position.x = g.userData.side * (0.985 + 0.22 * b)));
      bulb.material.emissiveIntensity = 1.5 + 7 * b;
    } else if (type === 'wink') {
      head.rotation.z = 0.3 * b;
      head.position.y += 0.12 * b * s;
      eR.g.scale.y = k > 0.18 && k < 0.7 ? 0.1 : 1;
      eyes.position.x += 0.04 * b;
    } else if (type === 'dizzy') {
      eyes.rotation.z = t * 14 * (1 - k);
      head.rotation.z = Math.sin(k * Math.PI * 7) * 0.22 * (1 - k);
      head.rotation.y += Math.sin(k * Math.PI * 5) * 0.35 * (1 - k);
    }
  }

  function frame(now) {
    const T = target();
    const k = reduced ? 1 : 0.09;
    cur.e = lerp(cur.e, T.e, k);
    cur.x = lerp(cur.x, T.x, k);
    cur.y = lerp(cur.y, T.y, k);
    cur.s = lerp(cur.s, T.s, k);
    cur.rotY = lerp(cur.rotY, T.rotY, reduced ? 1 : 0.06);
    pointer.x = lerp(pointer.x, pointer.tx, 0.08);
    pointer.y = lerp(pointer.y, pointer.ty, 0.08);

    const e = cur.e, t = now / 1000, look = 1 - T.toAnat;
    head.position.set(cur.x, cur.y + (reduced ? 0 : Math.sin(t * 1.1) * 0.05 * look), 0);
    head.scale.setScalar(cur.s);
    head.rotation.y = cur.rotY + pointer.x * 0.45 * look + (reduced ? 0 : Math.sin(t * 0.4) * 0.04);
    head.rotation.x = -pointer.y * 0.25 * look + 0.22 * e;
    eyes.position.x = pointer.x * 0.09 * look;
    eyes.position.y = pointer.y * 0.07 * look;

    if (!reduced && now > blinkAt + 150) blinkAt = now + 2200 + Math.random() * 3800;
    const blink = !reduced && now > blinkAt && now < blinkAt + 150;
    eL.g.scale.set(1, blink ? 0.12 : 1, 1);
    eR.g.scale.set(1, blink ? 0.12 : 1, 1);
    eyes.rotation.z = 0;
    head.rotation.z = 0;

    // explode
    front.position.set(0, 0.1 * e, 2.0 * e);
    back.position.set(0, -0.05 * e, -2.1 * e);
    antenna.position.y = 0.85 * e;
    ears.forEach((g) => g.position.set(g.userData.side * (0.985 + 0.95 * e), 0, 0));
    core.scale.setScalar(0.85 + 0.7 * e);
    core.rotation.y = -0.15 * e;
    ring.scale.setScalar(Math.max(0.001, e) * 1.35);
    ring.visible = e > 0.01;
    ring.rotation.z = 0.25 * e;
    orbit.rotation.y = t * 0.6;
    bulb.material.emissiveIntensity = 1.2 + Math.sin(t * 3) * 0.6;

    if (reaction) {
      const rk = (now - reaction.t0) / 1000 / reaction.dur;
      if (rk >= 1 || progress > 0.12) { reaction = null; bubble.classList.remove('on'); }
      else if (!reduced) applyReaction(reaction.type, rk, t, cur.s);
    }
    if (sparkT >= 0) {
      const dt = (now - sparkT) / 1000;
      if (dt > 1) { sparkT = -1; sparks.material.opacity = 0; }
      else {
        const pa = sparkG.attributes.position;
        for (let i = 0; i < SPARK; i++) {
          pa.array[i * 3] = sparkVel[i * 3] * dt;
          pa.array[i * 3 + 1] = 1.42 + sparkVel[i * 3 + 1] * dt - 2.2 * dt * dt;
          pa.array[i * 3 + 2] = sparkVel[i * 3 + 2] * dt;
        }
        pa.needsUpdate = true;
        sparks.material.opacity = 1 - dt;
      }
    }

    // solid → technical line-art crossfade
    const solidO = Math.max(0, 1 - e * 1.15);
    solids.forEach((m) => { m.opacity = solidO; m.depthWrite = solidO > 0.6; });
    white.visible = dark.visible = solidO > 0.04;
    for (const l of lines) { l.material.opacity = 0.06 + 0.84 * e; l.material.color.copy(WHITE); }
    if (active >= 0 && e > 0.5) for (const l of partLines[active]) { l.material.color.copy(VIOLET); l.material.opacity = 1; }

    floor.rotation.y = t * 0.05;
    floor.position.set(cur.x, cur.y - 1.5 * cur.s, 0);
    floor.scale.setScalar(cur.s);
    dust.rotation.y = t * 0.012;

    // DOM overlays
    if (!reduced) {
      hero.style.opacity = String(1 - smooth(0.05, 0.14, progress));
      hero.style.transform = `translateY(${-smooth(0.05, 0.16, progress) * 60}px)`;
      hero.style.visibility = progress > 0.16 ? 'hidden' : 'visible';
      anat.classList.toggle('on', progress > 0.22 && progress < 0.985);
      stage.style.setProperty('--hint', progress > 0.03 ? 0 : 1);
      stage.style.setProperty('--fadeout', smooth(0.9, 1, progress));
      setActive(T.idx);
    }

    const showMarkers = e > 0.55 && progress < 0.985;
    head.updateMatrixWorld(true);
    markers.forEach((m, i) => {
      anchors[i].getWorldPosition(v3).project(camera);
      const x = (v3.x * 0.5 + 0.5) * w, y = (-v3.y * 0.5 + 0.5) * h;
      m.style.transform = `translate(${x - 11}px, ${y - 11}px)`;
      m.style.opacity = showMarkers ? (i === active || reduced ? 1 : 0.5) : 0;
    });

    if (bubble.classList.contains('on')) {
      // beside the head at eye level: left by default, right if the left side is too tight
      const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
      v3.set(-1.12, 0.62, 0); head.localToWorld(v3).project(camera);
      let bx = (v3.x * 0.5 + 0.5) * w - bw, by = (-v3.y * 0.5 + 0.5) * h - bh;
      let right = false;
      if (bx < 12) {
        v3.set(1.12, 0.62, 0); head.localToWorld(v3).project(camera);
        bx = (v3.x * 0.5 + 0.5) * w; by = (-v3.y * 0.5 + 0.5) * h - bh; right = true;
      }
      bubble.classList.toggle('right', right);
      bubble.style.transform = `translate(${Math.max(8, Math.min(w - bw - 8, bx))}px, ${Math.max(navBottom + 8, by)}px)`;
    }
    pokeBtn.hidden = progress > 0.12;

    renderer.render(scene, camera);
    needsRender = false;
  }

  let raf = 0;
  function loop(now) {
    raf = 0;
    frame(now);
    if (!reduced && visible && !document.hidden) raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf && (visible || needsRender)) raf = requestAnimationFrame(loop); }

  addEventListener('resize', () => { resize(); readScroll(); needsRender = true; kick(); });
  addEventListener('scroll', () => { readScroll(); kick(); }, { passive: true });
  if (!reduced && matchMedia('(pointer: fine)').matches) {
    addEventListener('pointermove', (ev) => {
      pointer.tx = (ev.clientX / innerWidth) * 2 - 1;
      pointer.ty = -((ev.clientY / innerHeight) * 2 - 1);
    }, { passive: true });
  }
  let hoverHit = false;
  addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    const hit = !ev.target.closest('a, button, input, summary') && hitHead(ev.clientX, ev.clientY);
    if (hit !== hoverHit) { hoverHit = hit; stage.classList.toggle('can-poke', hit); }
  }, { passive: true });
  addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('a, button, input, summary, dialog')) return;
    if (hitHead(ev.clientX, ev.clientY)) react();
  });
  // a gentle nudge if nobody has poked Nova yet
  setTimeout(() => {
    if (poked || progress > 0.05) return;
    bubble.textContent = 'psst… tap me';
    bubble.classList.add('on', 'hint');
    kick();
    setTimeout(() => { if (!reaction) bubble.classList.remove('on'); bubble.classList.remove('hint'); }, 3200);
  }, 4500);
  document.addEventListener('visibilitychange', kick);
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; kick(); }).observe(stage);
  canvas.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); document.documentElement.classList.add('no-webgl'); });

  resize();
  readScroll();
  document.fonts?.ready.then(() => { measureTitle(); kick(); });
  Object.assign(cur, target()); // first frame starts settled
  if (reduced) setActive(-1);
  kick();
  window.__openbotScene = { get progress() { return progress; }, get e() { return cur.e; }, settle(n = 120) { readScroll(); for (let i = 0; i < n; i++) frame(performance.now()); }, headPx() { head.getWorldPosition(v3).project(camera); return { x: (v3.x * 0.5 + 0.5) * w, y: (-v3.y * 0.5 + 0.5) * h }; } };
}
