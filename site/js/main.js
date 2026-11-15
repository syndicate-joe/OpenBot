// Page choreography: scroll progress, reveals, word-by-word thesis, marquee,
// stacked screenshot deck, interactive crew, OS detection and live release info.
import { botSVG, randomLook, LOOK_OPTIONS, PALETTE } from './bot.js';

const REPO = 'satiricalguru/OpenBot';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

document.documentElement.classList.add('ready');

// ---------------- OS detection ----------------
const ua = navigator.userAgent;
const os = /Windows/i.test(ua) ? 'win' : /Mac/i.test(ua) && !/iPhone|iPad/i.test(ua) ? 'mac' : /Linux|X11/i.test(ua) && !/Android/i.test(ua) ? 'linux' : null;
if (os) {
  $(`.os-card[data-os="${os}"]`)?.classList.add('is-you');
  // put the visitor's platform first in each button row
  $$('.dl-row').forEach((row) => {
    const mine = row.querySelector(`[data-dl="${os}"]`);
    if (mine && mine !== row.firstElementChild) {
      row.prepend(mine);
      row.querySelectorAll('[data-dl]').forEach((b) => { b.classList.toggle('btn-primary', b === mine); b.classList.toggle('btn-ghost', b !== mine); });
    }
  });
  const cards = $('.os-cards');
  const mineCard = $(`.os-card[data-os="${os}"]`);
  if (cards && mineCard) cards.prepend(mineCard);
}

// ---------------- live release info (version, date, sizes) ----------------
(async () => {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) return;
    const rel = await r.json();
    const v = String(rel.tag_name || '').replace(/^v/, '');
    if (v) $$('[data-version]').forEach((el) => (el.textContent = v));
    if (rel.published_at) $$('[data-date]').forEach((el) => (el.textContent = ` · ${new Date(rel.published_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`));
    const sizes = new Map((rel.assets || []).map((a) => [a.name, a.size]));
    $$('[data-size]').forEach((el) => {
      const s = sizes.get(el.dataset.size);
      if (s) el.textContent = `${Math.round(s / 1e6)} MB`;
    });
  } catch { /* offline or rate-limited: static links still work */ }
})();

// ---------------- nav + progress hairline ----------------
const nav = $('#nav');
const bar = $('.progress');
function onScrollUI() {
  const max = document.documentElement.scrollHeight - innerHeight;
  bar.style.setProperty('--p', clamp(scrollY / Math.max(1, max)));
  nav.classList.toggle('scrolled', scrollY > 40);
}

// ---------------- reveals ----------------
const io = new IntersectionObserver((entries) => {
  for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); countUp(en.target); }
}, { rootMargin: '0px 0px -12% 0px' });
$$('.reveal').forEach((el) => io.observe(el));

function countUp(el) {
  const b = el.querySelector('[data-count]');
  if (!b || reduced) return;
  const to = Number(b.dataset.count);
  const t0 = performance.now();
  const step = (now) => {
    const k = clamp((now - t0) / 1200);
    b.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------------- thesis: words light up as you read ----------------
const quote = $('[data-words]');
if (quote) {
  const words = quote.textContent.trim().split(/\s+/);
  quote.innerHTML = words.map((w) => `<span class="w">${w}</span>`).join(' ');
}
const qWords = $$('.big-quote .w');

// ---------------- marquee ----------------
const marquee = $('[data-marquee]');

// ---------------- deck of screenshots ----------------
const deckTrack = $('.deck-track');
const cards = $$('#deck .card');
const deckCaption = $('#deckCaption');
let lastCap = -1;

function scrollScenes() {
  onScrollUI();
  if (reduced) return;
  // thesis words
  if (quote) {
    const r = quote.getBoundingClientRect();
    const k = clamp((innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.45));
    const n = Math.round(k * qWords.length);
    qWords.forEach((w, i) => w.classList.toggle('on', i < n));
  }
  // marquee follows scroll
  if (marquee) {
    const r = marquee.getBoundingClientRect();
    const k = (innerHeight - r.top) / (innerHeight + r.height);
    marquee.style.transform = `translate3d(${-k * 35}%, 0, 0)`;
  }
  // deck: each card rises and the previous one recedes
  if (deckTrack && cards.length) {
    const r = deckTrack.getBoundingClientRect();
    const total = deckTrack.offsetHeight - innerHeight;
    const p = clamp(-r.top / Math.max(1, total)) * (cards.length - 1);
    cards.forEach((c, i) => {
      const d = p - i; // <0 waiting below, 0 front, >0 pushed back
      if (d < -1) { c.style.transform = 'translate3d(0, 110%, 0) rotateX(-18deg)'; c.style.opacity = '0'; return; }
      if (d < 0) {
        const k = 1 + d; // 0..1 arriving
        const e = 1 - Math.pow(1 - k, 3);
        c.style.transform = `translate3d(0, ${(1 - e) * 110}%, 0) rotateX(${-(1 - e) * 18}deg)`;
        c.style.opacity = String(clamp(k * 2));
        return;
      }
      const back = Math.min(d, 3);
      c.style.transform = `translate3d(0, ${-back * 6}%, ${-back * 120}px) scale(${1 - back * 0.06})`;
      c.style.opacity = String(clamp(1 - (d - 2)));
      c.style.filter = `brightness(${1 - Math.min(back, 1) * 0.45})`;
    });
    const cap = Math.round(p);
    if (cap !== lastCap) { lastCap = cap; deckCaption.style.opacity = 0; setTimeout(() => { deckCaption.textContent = cards[cap].dataset.cap; deckCaption.style.opacity = 1; }, 150); }
  }
}
let ticking = false;
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; scrollScenes(); }); } }, { passive: true });
addEventListener('resize', scrollScenes);
scrollScenes();

// ---------------- crew ----------------
const CREW = [
  { name: 'Nova', role: 'Chief of staff. Plans, delegates, follows up.', color: '#ffffff', look: { shape: 'circle', eyes: 'capsule', mouth: 'none', acc: 'none', gaze: 'up-right', eye: '#141414' } },
  { name: 'Scout', role: 'Researcher. Reads sources, writes cited briefs.', color: '#6cc4a6', look: { shape: 'triangle', eyes: 'dots', mouth: 'none', acc: 'none', gaze: 'right', eye: '#141414' } },
  { name: 'Reel', role: 'Video producer. Finds the moment in any video.', color: '#f2a65a', look: { shape: 'squircle', eyes: 'happy', mouth: 'smile', acc: 'headphones', gaze: 'center', eye: '#141414', cheeks: true } },
  { name: 'Forge', role: 'Builder. Writes and runs code on its computer.', color: '#8b6cff', look: { shape: 'diamond', eyes: 'line', mouth: 'none', acc: 'none', gaze: 'up-left', eye: '#141414' } },
  { name: 'Pixel', role: 'Browser pilot. Clicks through sites for you.', color: '#4f8ff7', look: { shape: 'pill', eyes: 'big', mouth: 'o', acc: 'antenna', gaze: 'left', eye: '#141414' } },
  { name: 'Echo', role: 'Lives in Telegram. Answers when you text.', color: '#e86aa6', look: { shape: 'cloud', eyes: 'wink', mouth: 'grin', acc: 'none', gaze: 'down', eye: '#141414' } },
];
const NAMES = ['Juno', 'Atlas', 'Mochi', 'Byte', 'Kit', 'Orbit', 'Sprout', 'Nimbus', 'Ziggy', 'Pico', 'Ember', 'Quill'];
const ROLES = ['Writer. Drafts posts and emails in your voice.', 'Analyst. Turns spreadsheets into answers.', 'Inbox triage. Sorts, summarizes, flags.', 'Social. Writes threads from your videos.', 'QA. Clicks through your app and files bugs.', 'Scheduler. Runs your morning briefing at 9.'];
const grid = $('#crewGrid');
let crewState = 'idle';
let seed = 1;

function botCard(b, extra = '') {
  const card = document.createElement('article');
  card.className = `bot-card ${extra}`;
  const art = document.createElement('div');
  art.className = 'art';
  art.appendChild(botSVG({ ...b.look, color: b.color }, { state: crewState, seed: seed++ * 137 }));
  card.append(art);
  card.insertAdjacentHTML('beforeend', `<div><h3>${b.name}</h3><p>${b.role}</p></div>`);
  return card;
}
if (grid) {
  CREW.forEach((b) => grid.appendChild(botCard(b)));
  $('#shuffle').addEventListener('click', () => {
    const look = randomLook(Math.random() * 1e9);
    look.cheeks = Math.random() < 0.3;
    const b = { name: NAMES[Math.floor(Math.random() * NAMES.length)], role: ROLES[Math.floor(Math.random() * ROLES.length)], color: PALETTE[Math.floor(Math.random() * (PALETTE.length - 1))], look };
    const cards = grid.children;
    const victim = cards[Math.floor(Math.random() * cards.length)];
    victim.replaceWith(botCard(b, 'new-hire'));
  });
  $$('.seg button').forEach((btn) => btn.addEventListener('click', () => {
    crewState = btn.dataset.state;
    $$('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === btn)));
    $$('#crewGrid svg.bot').forEach((s) => s.setAttribute('class', `bot ${crewState}`));
  }));
}

// ---------------- final section: bots that drift and watch the cursor ----------------
const fb = $('#finalBots');
if (fb) {
  const spots = [[8, 18], [86, 14], [14, 72], [80, 70], [48, 8], [30, 88], [66, 86]];
  const crew = [...CREW, CREW[0]];
  const items = spots.map(([x, y], i) => {
    const el = document.createElement('div');
    el.className = 'fb';
    el.style.left = `${x}%`; el.style.top = `${y}%`;
    const b = crew[i];
    el.appendChild(botSVG({ ...b.look, color: b.color }, { state: i === 3 ? 'waiting' : 'idle', seed: i * 991 }));
    fb.appendChild(el);
    return { el, x, y, ph: Math.random() * 6 };
  });
  if (!reduced) {
    let mx = 0.5, my = 0.5, on = false;
    new IntersectionObserver(([en]) => { on = en.isIntersecting; if (on) requestAnimationFrame(drift); }).observe(fb);
    addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth; my = e.clientY / innerHeight; }, { passive: true });
    function drift(now) {
      const t = now / 1000;
      for (const it of items) {
        const dx = (mx - it.x / 100) * 18, dy = (my - it.y / 100) * 14;
        it.el.style.transform = `translate(${dx + Math.sin(t * 0.7 + it.ph) * 8}px, ${dy + Math.cos(t * 0.9 + it.ph) * 10}px) rotate(${Math.sin(t * 0.5 + it.ph) * 6}deg)`;
      }
      if (on) requestAnimationFrame(drift);
    }
  }
}

// ---------------- footer: wordmark draws itself, Nova peeks over it ----------------
const wordmark = $('#wordmark');
const peek = $('#peek');
if (wordmark && peek) {
  const nova = CREW[0];
  const svg = botSVG({ ...nova.look, color: nova.color }, { state: 'idle', seed: 4242 });
  peek.appendChild(svg);
  let px = innerWidth * 0.5, tx = px, inView = false;
  new IntersectionObserver(([en]) => {
    if (en.isIntersecting) wordmark.classList.add('in');
    inView = en.isIntersecting;
    if (inView && !reduced) requestAnimationFrame(follow);
  }, { threshold: 0.35 }).observe(wordmark);
  addEventListener('pointermove', (e) => { tx = e.clientX; }, { passive: true });
  function follow() {
    const wPeek = peek.offsetWidth;
    const target = Math.min(innerWidth - wPeek - 16, Math.max(16, tx - wPeek / 2));
    const dx = target - px;
    px += dx * 0.06;
    peek.style.setProperty('--px', `${px}px`);
    peek.style.setProperty('--pr', `${Math.max(-12, Math.min(12, dx * 0.04))}deg`);
    // eyes look toward the cursor
    const g = Math.max(-5, Math.min(5, dx * 0.05));
    svg.style.setProperty('--gx', `${g}px`);
    svg.style.setProperty('--gy', '-3px');
    if (inView) requestAnimationFrame(follow);
  }
  peek.style.setProperty('--px', `${px - 50}px`);
}

// ---------------- magnetic buttons ----------------
if (!reduced && matchMedia('(pointer: fine)').matches) {
  $$('.magnetic').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${(e.clientX - r.left - r.width / 2) * 0.18}px`);
      el.style.setProperty('--my', `${(e.clientY - r.top - r.height / 2) * 0.28}px`);
    });
    el.addEventListener('pointerleave', () => { el.style.setProperty('--mx', '0px'); el.style.setProperty('--my', '0px'); });
  });
}

// ---------------- copy + video ----------------
$$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($(`#${b.dataset.copy}`).textContent); b.textContent = 'Copied'; }
  catch { b.textContent = 'Select & copy'; }
  setTimeout(() => (b.textContent = 'Copy'), 1600);
}));
const dlg = $('#videoDialog');
const vid = $('#demoVideo');
$('#playDemo')?.addEventListener('click', () => { dlg.showModal(); vid.play().catch(() => {}); });
dlg?.querySelector('.close').addEventListener('click', () => dlg.close());
dlg?.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
dlg?.addEventListener('close', () => vid.pause());
