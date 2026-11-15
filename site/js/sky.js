// Night sky behind the whole page: faint twinkling stars plus occasional shooting stars.
// One fixed 2D canvas, capped pixel ratio, paused when the tab is hidden.
// Reduced motion keeps the static stars and skips the shooting stars.
const canvas = document.getElementById('sky');
const ctx = canvas?.getContext('2d');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (ctx) {
  let w = 0, h = 0, dpr = 1;
  let stars = [];
  const meteors = [];
  let nextAt = performance.now() + 900;

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(160, (w * h) / 9000));
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: Math.random() * 0.9 + 0.25,
      a: Math.random() * 0.5 + 0.15,
      tw: Math.random() * Math.PI * 2, sp: 0.6 + Math.random() * 1.6,
    }));
  }

  function spawn(now) {
    // mostly from the top/right, travelling down-left at a slight random angle
    const angle = (200 + Math.random() * 22) * (Math.PI / 180);
    const speed = 650 + Math.random() * 650; // px per second
    meteors.push({
      x: w * (0.35 + Math.random() * 0.75),
      y: -40 + Math.random() * h * 0.45,
      vx: Math.cos(angle) * speed, vy: -Math.sin(angle) * speed,
      len: 90 + Math.random() * 140,
      life: 0, max: 0.7 + Math.random() * 0.7,
      violet: Math.random() < 0.3,
    });
    // a meteor every few seconds, occasionally a quick pair
    nextAt = now + (Math.random() < 0.18 ? 250 : 2200 + Math.random() * 3600);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, w, h);

    const t = now / 1000;
    ctx.fillStyle = '#fff';
    for (const s of stars) {
      ctx.globalAlpha = reduced ? s.a : s.a * (0.55 + 0.45 * Math.sin(t * s.sp + s.tw));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (!reduced) {
      if (now > nextAt) spawn(now);
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.life += dt;
        m.x += m.vx * dt; m.y += m.vy * dt;
        const k = m.life / m.max;
        if (k >= 1 || m.x < -300 || m.y > h + 300) { meteors.splice(i, 1); continue; }
        const fade = Math.min(1, k * 5) * (1 - k); // quick fade in, long fade out
        const sp = Math.hypot(m.vx, m.vy);
        const tx = m.x - (m.vx / sp) * m.len, ty = m.y - (m.vy / sp) * m.len;
        const c = m.violet ? '185,166,255' : '255,255,255';
        const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
        g.addColorStop(0, `rgba(${c},${0.95 * fade})`);
        g.addColorStop(0.25, `rgba(${c},${0.35 * fade})`);
        g.addColorStop(1, `rgba(${c},0)`);
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        // glowing head
        ctx.globalAlpha = fade;
        ctx.fillStyle = `rgb(${c})`;
        ctx.shadowColor = `rgba(${c},0.9)`;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
      }
    }
    if (!document.hidden && !reduced) requestAnimationFrame(frame);
  }

  addEventListener('resize', () => { resize(); if (reduced) frame(performance.now()); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !reduced) { last = performance.now(); requestAnimationFrame(frame); }
  });
  resize();
  requestAnimationFrame(frame);
  window.__openbotSky = { spawn: () => spawn(performance.now()), get meteors() { return meteors.length; } };
}
