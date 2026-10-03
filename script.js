(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const body = document.body;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(pointer: fine)").matches;

  root.classList.add("js");
  body.classList.add("locked");

  /* ---------- audio ---------- */
  const song = $("#song");
  const musicBtn = $("#music");
  let fadeTimer = 0;
  function fadeTo(target, ms) {
    clearInterval(fadeTimer);
    const start = song.volume;
    const t0 = performance.now();
    fadeTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      song.volume = Math.max(0, Math.min(1, start + (target - start) * k));
      if (k >= 1) clearInterval(fadeTimer);
    }, 50);
  }
  // Sound sources, tried in order. If the file can't be loaded in some
  // environment, fall back to the copy embedded in song-data.js.
  const fileSrc = song.getAttribute("src");
  const queue = [() => fileSrc, () => {
    try {
      if (!window.__SONG_B64) return null;
      const bin = atob(window.__SONG_B64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([u], { type: "audio/mpeg" }));
    } catch (e) { return null; }
  }, () => (window.__SONG_B64 ? "data:audio/mpeg;base64," + window.__SONG_B64 : null)];
  let qi = 0;
  function nextSource() {
    while (++qi < queue.length) {
      const src = queue[qi]();
      if (src) { song.src = src; song.load(); return true; }
    }
    return false;
  }
  function startSong() {
    if (song.error) nextSource();
    const p = song.play();
    if (p && p.catch) p.catch((err) => {
      if (err && err.name === "NotSupportedError" && nextSource()) song.play().catch(() => {});
    });
  }
  song.addEventListener("error", () => { if (nextSource()) { /* retry on next tap if needed */ } });
  function syncMusicUi() { musicBtn.classList.toggle("on", !song.paused); }
  song.addEventListener("play", syncMusicUi);
  song.addEventListener("pause", syncMusicUi);
  musicBtn.addEventListener("click", () => {
    if (song.paused) startSong(); else song.pause();
  });

  /* ---------- particles (one canvas) ---------- */
  const cv = $("#fx");
  const ctx = cv.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  function resize() {
    const w = innerWidth, h = innerHeight;
    if (w === W && Math.abs(h - H) < 140) return; // ignore mobile URL-bar jitter
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = w; H = h;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  addEventListener("resize", resize);

  function makeSprite(color, glow) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    g.translate(32, 33);
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const t = (i / 40) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      i ? g.lineTo(x * 1.6, y * 1.6) : g.moveTo(x * 1.6, y * 1.6);
    }
    g.closePath();
    g.shadowColor = glow; g.shadowBlur = 8;
    g.fillStyle = color;
    g.fill();
    return c;
  }
  const sprites = [
    makeSprite("#ff5b7f", "#ff2d5c"),
    makeSprite("#ffb3c4", "#ff8fab"),
    makeSprite("#d1304f", "#ff3d68"),
    makeSprite("#ffe3b0", "#f6cf9a")
  ];

  const stars = Array.from({ length: matchMedia("(max-width: 700px)").matches ? 36 : 70 }, () => ({
    x: Math.random(), y: Math.random(), r: Math.random() * 1.3 + 0.3,
    ph: Math.random() * 6.28, sp: Math.random() * 0.02 + 0.006
  }));
  const hearts = [];
  const MAX = 160;
  function addHeart(o) { if (hearts.length < MAX) hearts.push(o); }

  let rainRate = 0; // hearts per second rising from the bottom
  let ambientRate = 0.7;
  let rainAcc = 0;

  function spawnRise(strong) {
    const s = (strong ? 9 : 6) + Math.random() * (strong ? 14 : 9);
    addHeart({
      x: Math.random() * W, y: H + 20, vx: (Math.random() - 0.5) * 0.4, vy: -(0.6 + Math.random() * 1.1),
      s, a: strong ? 0.85 : 0.4, life: 0, max: 600 + Math.random() * 300, spr: sprites[(Math.random() * 4) | 0],
      sway: Math.random() * 6.28, rot: (Math.random() - 0.5) * 0.5, g: 0, fade: true
    });
  }
  function burst(x, y, n) {
    if (reduce) n = Math.min(n, 12);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 6;
      addHeart({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, s: 6 + Math.random() * 12, a: 1,
        life: 0, max: 80 + Math.random() * 70, spr: sprites[(Math.random() * 4) | 0], sway: 0,
        rot: (Math.random() - 0.5) * 0.8, g: 0.08, fade: true, drag: 0.985
      });
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 16.67, 3);
    last = now;
    ctx.clearRect(0, 0, W, H);

    // stars
    for (const s of stars) {
      s.ph += s.sp * dt;
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(s.ph));
      ctx.globalAlpha = a * (body.classList.contains("locked") ? 0.5 : 0.7);
      ctx.fillStyle = "#fff4e6";
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, 6.283);
      ctx.fill();
    }

    // spawn
    const rate = rainRate || (body.classList.contains("locked") ? 0 : ambientRate);
    rainAcc += (rate * dt) / 60;
    while (rainAcc >= 1) { rainAcc -= 1; spawnRise(rainRate > 0); }

    // hearts
    for (let i = hearts.length - 1; i >= 0; i--) {
      const h = hearts[i];
      h.life += dt;
      if (h.drag) { h.vx *= h.drag; h.vy *= h.drag; }
      h.vy += h.g * dt;
      h.x += (h.vx + Math.sin(h.life * 0.03 + h.sway) * (h.sway ? 0.35 : 0)) * dt;
      h.y += h.vy * dt;
      const k = h.life / h.max;
      if (k >= 1 || h.y < -40) { hearts.splice(i, 1); continue; }
      const alpha = h.a * (k < 0.1 ? k / 0.1 : 1 - Math.max(0, (k - 0.6) / 0.4));
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(h.rot);
      const size = h.s * 2;
      ctx.drawImage(h.spr, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // desktop cursor trail
  if (finePointer && !reduce) {
    let lastT = 0;
    addEventListener("pointermove", (e) => {
      const now = performance.now();
      if (now - lastT < 70 || body.classList.contains("locked")) return;
      lastT = now;
      addHeart({
        x: e.clientX, y: e.clientY, vx: (Math.random() - 0.5) * 0.8, vy: -0.6 - Math.random() * 0.6, s: 3 + Math.random() * 4,
        a: 0.7, life: 0, max: 50, spr: sprites[(Math.random() * 4) | 0], sway: 0, rot: 0, g: 0, fade: true
      });
    }, { passive: true });
  }

  /* ---------- typewriter ---------- */
  function typewrite(el, text, speed, done) {
    el.textContent = "";
    if (reduce) { el.textContent = text; el.classList.remove("caret"); done && done(); return; }
    let i = 0;
    (function step() {
      el.textContent = text.slice(0, ++i);
      if (i < text.length) setTimeout(step, speed + Math.random() * speed * 0.8);
      else { setTimeout(() => el.classList.remove("caret"), 2500); done && done(); }
    })();
  }

  /* ---------- opening ---------- */
  const intro = $("#intro");
  $("#open").addEventListener("click", (e) => {
    song.volume = 0;
    startSong();
    fadeTo(0.55, 3500);
    const r = e.currentTarget.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, 70);
    setTimeout(() => burst(W / 2, H * 0.35, 50), 350);
    intro.classList.add("gone");
    body.classList.remove("locked");
    scrollTo(0, 0);
    setTimeout(() => {
      typewrite($("#type"), "This isn't just a website. It's a little piece of my heart that I made for you. ❤️", 55);
    }, 1400);
    setTimeout(() => { intro.hidden = true; }, 1600);
  });

  /* ---------- scroll reveal ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    });
  }, { threshold: 0.2, rootMargin: "0px 0px -8% 0px" });
  $$(".rv, .slowtext").forEach((el) => io.observe(el));

  /* ---------- floating DOM hearts (cards + photo frames) ---------- */
  const EMO = ["❤", "💗", "💕", "🩷"];
  function floatHeart(host) {
    const s = document.createElement("span");
    s.className = "fh";
    s.textContent = EMO[(Math.random() * EMO.length) | 0];
    s.style.left = 8 + Math.random() * 84 + "%";
    s.style.fontSize = 12 + Math.random() * 14 + "px";
    s.style.setProperty("--dx", (Math.random() - 0.5) * 60 + "px");
    host.appendChild(s);
    setTimeout(() => s.remove(), 3800);
  }
  const hostTimers = new Map();
  const heartIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      const host = en.target;
      if (en.isIntersecting && !hostTimers.has(host)) {
        hostTimers.set(host, setInterval(() => floatHeart(host), reduce ? 2400 : 700));
      } else if (!en.isIntersecting && hostTimers.has(host)) {
        clearInterval(hostTimers.get(host)); hostTimers.delete(host);
      }
    });
  }, { threshold: 0.3 });
  $$("[data-hearts], #babyHearts, #youHearts").forEach((el) => {
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    heartIO.observe(el);
  });

  /* ---------- lightbox ---------- */
  const lb = $("#lb"), lbImg = $("#lbImg"), lbCap = $("#lbCap");
  const pols = $$(".pol");
  let cur = 0;
  function showPol(i) {
    cur = (i + pols.length) % pols.length;
    const img = $("img", pols[cur]);
    lbImg.src = img.currentSrc || img.src;
    lbImg.alt = img.alt;
    lbCap.textContent = $("span", pols[cur]).textContent;
  }
  function openLb(i) {
    showPol(i);
    lb.hidden = false;
    requestAnimationFrame(() => lb.classList.add("open"));
    $("#lbClose").focus();
  }
  function closeLb() {
    lb.classList.remove("open");
    setTimeout(() => { lb.hidden = true; }, 350);
  }
  pols.forEach((p, i) => p.addEventListener("click", () => openLb(i)));
  $("#lbClose").addEventListener("click", closeLb);
  $("#lbPrev").addEventListener("click", () => showPol(cur - 1));
  $("#lbNext").addEventListener("click", () => showPol(cur + 1));
  lb.addEventListener("click", (e) => { if (e.target === lb) closeLb(); });
  let tx = 0;
  lb.addEventListener("touchstart", (e) => { tx = e.changedTouches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 50) showPol(cur + (dx < 0 ? 1 : -1));
  }, { passive: true });

  /* ---------- surprise ---------- */
  const modal = $("#modal");
  function closeModal() {
    modal.classList.remove("open");
    rainRate = 4; // keep a gentle rain
    setTimeout(() => { modal.hidden = true; }, 800);
  }
  $("#surprise").addEventListener("click", (e) => {
    body.classList.add("surprise");
    rainRate = 14;
    fadeTo(0.8, 4000);
    const r = e.currentTarget.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, 90);
    modal.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add("open")));
    setTimeout(() => $("#mclose").focus({ preventScroll: true }), 900);
  });
  $("#mclose").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!lb.hidden) closeLb();
      else if (!modal.hidden) closeModal();
    } else if (!lb.hidden && e.key === "ArrowLeft") showPol(cur - 1);
    else if (!lb.hidden && e.key === "ArrowRight") showPol(cur + 1);
  });

  // tap anywhere on the page background for a small heart burst
  addEventListener("click", (e) => {
    if (body.classList.contains("locked")) return;
    if (e.target.closest("button, a, .pol, .modal, .lightbox")) return;
    burst(e.clientX, e.clientY, 10);
  });
})();
