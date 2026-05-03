// =========================================================
// Wispucci MVP — orb companion, auth, Statistica, mini-games
// =========================================================

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

// =========================================================
// API CLIENT (talks to FastAPI backend)
// =========================================================
// Backend resolution. In production (devinapps.com static host) we point
// at the deployed wispucci-backend on fly.io. Override via window.WISPUCCI_API_BASE
// for tunneled / staging backends. URLs may include "user:pass@host" for
// HTTP basic auth tunnels — apiFetch strips the creds and sends them as
// Authorization: Basic instead (Chrome blocks credentials in fetch URLs).
const _API_RESOLVED = (() => {
  const explicit = window.WISPUCCI_API_BASE;
  if (explicit) {
    try {
      const u = new URL(explicit);
      const userinfo = u.username ? `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}` : '';
      const clean = `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
      return { base: clean, basic: userinfo ? btoa(userinfo) : '' };
    } catch (_) {
      return { base: explicit, basic: '' };
    }
  }
  // Local dev: frontend on :8000/python http.server, backend on :8801/uvicorn.
  if (location.port && location.port !== '8801') {
    return { base: `${location.protocol}//${location.hostname}:8801`, basic: '' };
  }
  // Static prod: devinapps.com hosts only static files, so fall back to
  // the fly backend.
  if (location.hostname.endsWith('.devinapps.com')) {
    return { base: 'https://wispucci-backend-ezpeqmlb.fly.dev', basic: '' };
  }
  return { base: location.origin, basic: '' };
})();
const API_BASE = _API_RESOLVED.base;
const _API_BASIC = _API_RESOLVED.basic;

const Auth = {
  TOKEN_KEY: 'wispucci.token',
  USER_KEY: 'wispucci.user',
  get token() { return localStorage.getItem(this.TOKEN_KEY) || ''; },
  set token(v) {
    if (v) localStorage.setItem(this.TOKEN_KEY, v);
    else localStorage.removeItem(this.TOKEN_KEY);
  },
  get user() {
    try { return JSON.parse(localStorage.getItem(this.USER_KEY) || 'null'); }
    catch (_) { return null; }
  },
  set user(v) {
    if (v) localStorage.setItem(this.USER_KEY, JSON.stringify(v));
    else localStorage.removeItem(this.USER_KEY);
  },
  clear() { this.token = null; this.user = null; },
  isLoggedIn() { return !!this.token; },
};

async function apiFetch(path, opts = {}) {
  const headers = Object.assign(
    { 'Content-Type': 'application/json' },
    opts.headers || {},
  );
  // Basic auth (for tunnel URLs) goes as X-Tunnel-Auth so it doesn't
  // collide with the bearer token. The CDN will strip it.
  if (_API_BASIC) headers['X-Tunnel-Auth'] = _API_BASIC;
  if (Auth.token) headers['Authorization'] = `Bearer ${Auth.token}`;
  let resp;
  try {
    resp = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  } catch (err) {
    throw new Error('rețeaua nu răspunde');
  }
  if (resp.status === 401) {
    Auth.clear();
  }
  let data = null;
  try { data = await resp.json(); } catch (_) {}
  if (!resp.ok) {
    let msg = `eroare ${resp.status}`;
    if (data) {
      if (typeof data.detail === 'string') msg = data.detail;
      else if (Array.isArray(data.detail) && data.detail.length) {
        // FastAPI 422 validation: list of {loc, msg, type, ...}
        msg = data.detail.map(d => d.msg || d.message || JSON.stringify(d)).join(' · ');
      } else if (typeof data.message === 'string') msg = data.message;
    }
    const err = new Error(msg);
    err.status = resp.status;
    err.body = data;
    throw err;
  }
  return data;
}

const api = {
  signup: (body) => apiFetch('/api/auth/signup', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => apiFetch('/api/auth/me'),
  buildLesson: (body) => apiFetch('/api/tutor/lesson/build', { method: 'POST', body: JSON.stringify(body) }),
  // Two-pass generation: outline first (fast, ~2-3s), then per-lesson
  // content (~5-8s) prefetched in the background while the user reads
  // lesson 1.
  buildOutline: (body) => apiFetch('/api/tutor/course/outline', { method: 'POST', body: JSON.stringify(body) }),
  generateLesson: (lessonId) => apiFetch(`/api/tutor/lesson/${encodeURIComponent(lessonId)}/generate`, { method: 'POST' }),
  getLesson: (lessonId) => apiFetch(`/api/lessons/${encodeURIComponent(lessonId)}`),
  miniGame: (lessonId, type = 'auto') =>
    apiFetch(`/api/tutor/minigame?lesson_id=${encodeURIComponent(lessonId)}&game_type=${encodeURIComponent(type)}`, { method: 'POST' }),
  miniTest: (moduleId) =>
    apiFetch(`/api/tutor/test/build?module_id=${encodeURIComponent(moduleId)}`, { method: 'POST' }),
  stats: () => apiFetch('/api/me/stats'),
  leaderboard: (period = 'weekly') => apiFetch(`/api/leaderboard/${period}`),
  saveSettings: (settings) =>
    apiFetch('/api/me/settings', { method: 'PUT', body: JSON.stringify(settings) }),
};

// =========================================================
// LOCAL STATE (UI-only, never authoritative for XP/streak)
// =========================================================
const STORE_KEY = 'wispucci.ui.v2';
const defaultStore = {
  lastView: 'welcome',
  lessonProgress: 0,
  settings: {
    forceFocus: false,
    silent: false,
    tone: 'cald',
    pace: 'normal',
    embersIntensity: 60,
  },
};
const Store = (() => {
  let raw;
  try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (_) { raw = null; }
  const data = Object.assign({}, defaultStore, raw || {});
  data.settings = Object.assign({}, defaultStore.settings, (raw && raw.settings) || {});
  return {
    get: () => data,
    save: () => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (_) {}
    },
  };
})();

const state = {
  subject: 'Programare',
  topic: 'Python — bazele',
  level: 2,
  progress: Store.get().lessonProgress,
  view: 'welcome',
  generatedModule: null,   // { module_id, title, lessons:[{id,title,...}] }
  currentLesson: null,     // lesson object from backend
  leaderboardPeriod: 'weekly',
  statsCache: null,
};

// =========================================================
// TOPICS — subject → list of starter topic cards
// =========================================================
const TOPICS = {
  'Programare': [
    { title: 'Python — bazele', sub: 'Variabile · funcții · liste', icon: 'PY', est: '4 lecții · 20 min' },
    { title: 'JavaScript modern', sub: 'ES6+ · async · DOM',         icon: 'JS', est: '4 lecții · 25 min' },
    { title: 'Rust',             sub: 'Ownership · borrow · traits', icon: 'RS', est: '4 lecții · 30 min' },
    { title: 'Go',               sub: 'Concurency · interfaces',     icon: 'GO', est: '4 lecții · 22 min' },
    { title: 'Algoritmi',        sub: 'Sortări · căutări · grafuri', icon: '∑',  est: '4 lecții · 30 min' },
    { title: 'OOP',              sub: 'Clase · moștenire · polim.',  icon: '◇',  est: '4 lecții · 18 min' },
    { title: 'Web — front',      sub: 'HTML · CSS · React',          icon: '⌘',  est: '4 lecții · 28 min' },
    { title: 'API REST',         sub: 'HTTP · JSON · auth',          icon: '⇄',  est: '4 lecții · 22 min' },
  ],
  'Limbă străină': [
    { title: 'Engleză',     sub: 'B1 → B2 conversațional', icon: 'EN', est: 'continuu · 10 min/zi' },
    { title: 'Spaniolă',    sub: 'gramatică + audio',       icon: 'ES', est: 'continuu · 10 min/zi' },
    { title: 'Germană',     sub: 'cazuri + verbe tari',     icon: 'DE', est: 'continuu · 10 min/zi' },
    { title: 'Japoneză',    sub: 'hiragana → kanji',        icon: '日', est: 'continuu · 10 min/zi' },
    { title: 'Română',      sub: 'pentru străini',          icon: 'RO', est: 'continuu · 10 min/zi' },
    { title: 'Conversație', sub: 'oral + corectări live',   icon: '💬', est: 'continuu · 15 min/zi' },
  ],
  'Matematică': [
    { title: 'Algebră',         sub: 'expresii · ecuații · sistem', icon: 'a+b', est: '4 lecții · 28 min' },
    { title: 'Analiză',         sub: 'limite · derivate · integ.',  icon: '∫',   est: '4 lecții · 32 min' },
    { title: 'Statistică',      sub: 'medii · varianță · teste',    icon: 'σ',   est: '4 lecții · 22 min' },
    { title: 'Trigonometrie',   sub: 'sin · cos · identități',      icon: 'θ',   est: '4 lecții · 20 min' },
    { title: 'Logaritmi',       sub: 'log · exp · ecuații',         icon: 'log', est: '4 lecții · 18 min' },
    { title: 'Probabilități',   sub: 'evenimente · Bayes',          icon: 'P',   est: '4 lecții · 22 min' },
  ],
  'Altceva': [
    { title: 'Fizică',     sub: 'mecanică · electricitate', icon: 'φ', est: '4 lecții · 28 min' },
    { title: 'Chimie',     sub: 'organic · reacții',         icon: 'C', est: '4 lecții · 22 min' },
    { title: 'Istorie',    sub: 'epoci · procese',           icon: 'H', est: '4 lecții · 30 min' },
    { title: 'Biologie',   sub: 'celulă · genetică',         icon: 'β', est: '4 lecții · 24 min' },
    { title: 'Filozofie',  sub: 'logică · etică',            icon: 'Φ', est: '4 lecții · 22 min' },
    { title: 'Economie',   sub: 'micro · macro · finanțe',   icon: '€', est: '4 lecții · 24 min' },
  ],
};

// =========================================================
// EMBERS BACKGROUND
// =========================================================
class EmbersBackground {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.density = opts.density || 60;
    this.maxSpeed = opts.maxSpeed || 0.45;
    this.particles = [];
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.spawn();
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }
  resize() {
    const c = this.canvas;
    c.width = window.innerWidth * this.dpr;
    c.height = window.innerHeight * this.dpr;
    c.style.width = window.innerWidth + 'px';
    c.style.height = window.innerHeight + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
  spawn() {
    this.particles = [];
    const n = Math.round(this.density * (window.innerWidth / 1280));
    for (let i = 0; i < n; i++) {
      this.particles.push(this._mkP(true));
    }
  }
  _mkP(initial = false) {
    const W = window.innerWidth, H = window.innerHeight;
    return {
      x: Math.random() * W,
      y: initial ? Math.random() * H : H + Math.random() * 80,
      r: 0.6 + Math.random() * 1.4,
      vy: -(0.15 + Math.random() * this.maxSpeed),
      vx: (Math.random() - 0.5) * 0.18,
      a: 0.2 + Math.random() * 0.7,
      flick: Math.random() * Math.PI * 2,
    };
  }
  tick() {
    if (document.body.classList.contains('embers-paused')) {
      requestAnimationFrame(this.tick);
      return;
    }
    const W = window.innerWidth, H = window.innerHeight;
    this.ctx.clearRect(0, 0, W, H);
    const intensity = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--embers-opacity')) || 0.6;
    this.ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.flick += 0.07;
      const alpha = (Math.sin(p.flick) * 0.3 + 0.7) * p.a * intensity;
      this.ctx.fillStyle = `rgba(239, 221, 141, ${alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      this.ctx.fill();
      if (p.y < -20 || p.x < -20 || p.x > W + 20) {
        this.particles[i] = this._mkP(false);
      }
    }
    this.ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(this.tick);
  }
}
new EmbersBackground($('#embersCanvas'));

// =========================================================
// ORB STATE MACHINE — face / mood
// =========================================================
const orbFlyer = $('#orbFlyer');
const theOrb = $('#theOrb');
const orbFace = theOrb.querySelector('.orb-face');

function setOrbState(s) {
  const states = ['idle', 'listening', 'thinking', 'speaking', 'happy', 'sad', 'confused', 'celebrating'];
  states.forEach(x => theOrb.classList.toggle(`is-${x}`, x === s));
  const label = $('#orbState');
  if (label) label.textContent = ({
    idle: 'gata',
    listening: 'ascultă',
    thinking: 'gândește',
    speaking: 'explică',
    happy: 'bucuros',
    sad: 'trist',
    confused: 'confuz',
    celebrating: 'sărbătorește',
  })[s] || s;
}

// Subtle blink loop
let isBlinking = false;
function scheduleBlink() {
  setTimeout(() => {
    if (!orbFace) return scheduleBlink();
    if (isBlinking) return scheduleBlink();
    isBlinking = true;
    orbFace.classList.add('blink');
    setTimeout(() => {
      orbFace.classList.remove('blink');
      isBlinking = false;
      scheduleBlink();
    }, 110);
  }, 2400 + Math.random() * 3000);
}
scheduleBlink();

// =========================================================
// ORB POSITIONING — anchored to per-view host
// =========================================================
function getHostRect(viewName) {
  return $(`[data-orb-host="${viewName}"]`);
}

function placeOrbInstantlyAt(viewName, _attempt = 0) {
  const host = getHostRect(viewName);
  if (!host) return;
  const r = host.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) {
    // Host hasn't laid out yet (fonts loading, view just toggled
    // visible, etc.) — retry on the next frame, capped at ~10 frames
    // (~160ms) so we never spin forever.
    if (_attempt < 10) {
      requestAnimationFrame(() => placeOrbInstantlyAt(viewName, _attempt + 1));
    }
    return;
  }
  gsap.set(orbFlyer, { x: r.left, y: r.top, width: r.width, height: r.height });
}

function moveOrbToHost(viewName, opts = {}) {
  const host = getHostRect(viewName);
  if (!host) return;
  const r = host.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return;
  gsap.to(orbFlyer, {
    x: r.left, y: r.top, width: r.width, height: r.height,
    duration: opts.duration ?? 0.7,
    ease: opts.ease ?? 'power3.inOut',
  });
}

// Re-anchor orb to its host on scroll/resize WITHOUT animating.
// The orb-flyer is `position: fixed`, so when the page scrolls the
// host moves but the orb stays glued to viewport coords — that's why
// the orb appeared to "drift" over text. We listen on document scroll
// (capture phase) so we catch scrolls inside any `.view { overflow: auto }`
// container, and on window resize. rAF-throttled so it stays cheap.
let __reAnchorRaf = null;
function scheduleOrbReAnchor() {
  if (__reAnchorRaf) return;
  __reAnchorRaf = requestAnimationFrame(() => {
    __reAnchorRaf = null;
    if (!state || !state.view) return;
    const hasOrb = VIEWS_WITH_ORB.has(state.view) || state.view.startsWith('onboarding-');
    if (!hasOrb) return;
    // Snap (no tween) — the user explicitly asked that the orb only
    // animates on view-change, not while scrolling.
    placeOrbInstantlyAt(state.view);
  });
}
document.addEventListener('scroll', scheduleOrbReAnchor, { capture: true, passive: true });
window.addEventListener('resize', scheduleOrbReAnchor);

// First-paint defense: when fonts finish loading the page reflows,
// which used to leave the orb stuck at its pre-font coordinates.
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(scheduleOrbReAnchor).catch(() => {});
}

// Catch any layout shift (aurora layer, embers canvas resize,
// font swap, hydration of late-loading content) and re-anchor
// without animating.
if (typeof ResizeObserver !== 'undefined') {
  try {
    const __orbRO = new ResizeObserver(() => scheduleOrbReAnchor());
    __orbRO.observe(document.documentElement);
    if (document.body) __orbRO.observe(document.body);
  } catch (_e) { /* ignore — fall back to scroll/resize */ }
}

// =========================================================
// VIEW SWITCHING
// =========================================================
const VIEWS_WITH_ORB = new Set([
  'welcome', 'auth-login', 'auth-signup', 'home', 'lesson', 'celebrate',
]);
const PROTECTED_VIEWS = new Set(['home', 'lesson', 'stats', 'settings']);

function showView(name) {
  // Auth gate: protected views require a token
  if (PROTECTED_VIEWS.has(name) && !Auth.isLoggedIn()) {
    showView('auth-login');
    return;
  }

  $$('.view').forEach(v => v.classList.toggle('is-active', v.dataset.view === name));
  state.view = name;

  // Onboarding-2 dynamic content
  if (name === 'onboarding-2') {
    $('#subjectEcho').textContent = state.subject.toLowerCase();
    const grid = $('#topicGrid');
    grid.innerHTML = '';
    (TOPICS[state.subject] || []).forEach(t => {
      const b = document.createElement('button');
      b.className = 'topic-card';
      b.innerHTML = `
        <div class="topic-card-icon">${t.icon}</div>
        <div class="topic-card-title">${t.title}</div>
        <div class="topic-card-sub">${t.sub}</div>
        <div class="topic-card-est">${t.est}</div>
      `;
      b.addEventListener('click', () => {
        state.topic = t.title;
        showView('onboarding-3');
      });
      grid.appendChild(b);
    });
  }

  // Hide orb for views without an orb host (stats, settings, onboarding-* use mini host)
  const hasOrb = VIEWS_WITH_ORB.has(name) || name.startsWith('onboarding-');
  orbFlyer.style.opacity = hasOrb ? '1' : '0';
  orbFlyer.style.pointerEvents = hasOrb ? '' : 'none';

  if (hasOrb) {
    // Wait one frame so the new view's host has the right layout before measuring.
    requestAnimationFrame(() => moveOrbToHost(name));
  }

  // In-lesson focus mode
  const focused = (name === 'lesson') || Store.get().settings.forceFocus;
  document.body.classList.toggle('in-lesson', focused);

  // Topnav active marker
  $$('[data-page-nav] li').forEach(li => {
    const link = li.querySelector('[data-go]');
    li.classList.toggle('is-active', !!(link && link.dataset.go === name));
  });

  // Persist last view (so refresh resumes here)
  if (PROTECTED_VIEWS.has(name)) {
    Store.get().lastView = name;
    Store.save();
  }

  // View-specific init
  if (name === 'stats')    renderStats();
  if (name === 'settings') initSettingsView();
  if (name === 'lesson') {
    initLesson();
    if (state.currentLesson) applyLessonToView(state.currentLesson);
  }
  if (name === 'home')     refreshHome();

  // Drive orb mood
  if (name === 'welcome')           setOrbState('idle');
  else if (name === 'auth-login')   setOrbState('listening');
  else if (name === 'auth-signup')  setOrbState('listening');
  else if (name === 'home')         setOrbState('happy');
  else if (name === 'onboarding-1') setOrbState('listening');
  else if (name === 'onboarding-2') setOrbState('listening');
  else if (name === 'onboarding-3') setOrbState('listening');
  else if (name === 'onboarding-4') { setOrbState('thinking'); runGeneration(); }
  else if (name === 'lesson')       setOrbState('idle');

  const el = $(`.view[data-view="${name}"]`);
  if (el && window.gsap) {
    gsap.from(el.querySelectorAll('.h1, .display, .lead, .card-grid, .topic-grid, .topic-custom, .level-grid, .gen-list, .gen-bar, .gen-pct, .lesson-card, .topnav, .ctxbar, .lesson-progress, .cta-row, .ob-progress, .orb-line, .footnote, .auth-form, .stats-row, .stats-section, .home-stats, .home-tiles, .recent-list'), {
      opacity: 0, y: 8, duration: .45, stagger: .03, ease: 'power2.out', delay: .12,
    });
  }
}

// =========================================================
// NAVIGATION WIRING
// =========================================================
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-go]');
  if (!btn) return;
  if (btn.tagName === 'A') e.preventDefault();
  const target = btn.dataset.go;
  if (btn.dataset.subject) state.subject = btn.dataset.subject;
  showView(target);
});

// Levels
$$('.level').forEach(el => {
  el.addEventListener('click', () => {
    $$('.level').forEach(l => l.classList.remove('is-on'));
    el.classList.add('is-on');
    state.level = +el.dataset.level;
  });
});

// =========================================================
// AUTH FORMS
// =========================================================
$('#loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = $('#loginError');
  err.hidden = true;
  const submit = f.querySelector('.auth-submit');
  submit.disabled = true;
  submit.textContent = 'Intru…';
  try {
    const data = await api.login({
      email: f.email.value.trim(),
      password: f.password.value,
    });
    Auth.token = data.token;
    Auth.user = data.user;
    showToast('bun revenit', '✓');
    showView('home');
  } catch (ex) {
    err.textContent = humanError(ex.message);
    err.hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Intră';
  }
});

$('#signupForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = $('#signupError');
  err.hidden = true;
  const submit = f.querySelector('.auth-submit');
  submit.disabled = true;
  submit.textContent = 'Salvez…';
  try {
    const data = await api.signup({
      email: f.email.value.trim(),
      password: f.password.value,
      name: f.name.value.trim() || 'user',
    });
    Auth.token = data.token;
    Auth.user = data.user;
    showToast('bine ai venit la Wispucci', '✓');
    showView('home');
  } catch (ex) {
    err.textContent = humanError(ex.message);
    err.hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Salvează contul';
  }
});

function humanError(raw) {
  const m = (raw || '').toLowerCase();
  if (m.includes('already')) return 'există deja un cont cu acest email.';
  if (m.includes('reserved name') || m.includes('not a valid email')) return 'email invalid — folosește un domeniu real (gmail, yahoo, …).';
  if (m.includes('credential') || m.includes('incorrect') || m.includes('invalid email or password')) return 'email sau parolă greșită.';
  if (m.includes('rețeaua') || m.includes('failed to fetch')) return 'fără internet — verifică conexiunea.';
  return raw || 'ceva n-a mers, încearcă din nou.';
}

// =========================================================
// GENERATION SCREEN — calls real backend, falls back to demo
// =========================================================
let genTl;

// Distraction copy shown while DeepSeek crunches. Cycles ~every 3.5s
// so the user always has fresh signal that something is happening.
const _GEN_FACTS = {
  Programare: [
    'știai? Python e numit după Monty Python, nu după șarpe.',
    'fapt: prima eroare „bug" a fost o molie reală în 1947.',
    'Stack Overflow are 24M+ de întrebări — toate au început cu „de ce nu merge".',
    'oamenii citesc cod de 10× mai des decât scriu cod.',
    'cei mai buni programatori șterg mai mult cod decât scriu.',
  ],
  'Limbă străină': [
    'creierul învață limbi mai bine prin context decât prin tabele.',
    'cei care vorbesc 2+ limbi iau decizii mai bune (studiu UChicago).',
    'dacă auzi o limbă 30 min/zi — vezi rezultate în 21 de zile.',
  ],
  'Matematică': [
    '„matematica e limba universului" — Galileo. încă valabil.',
    'demonstrațiile încep mereu cu „să presupunem că nu". apoi spargem.',
    'dacă blochezi pe o problemă, plimbarea îți dă răspunsul în 70% din cazuri.',
  ],
  Altceva: [
    'aha-momentul vine când conectezi 2 lucruri știute deja.',
    'creierul consolidează ce ai învățat în primele 4 ore de somn.',
  ],
};

function _genFactsFor(subject) {
  return _GEN_FACTS[subject] || _GEN_FACTS.Altceva;
}

async function runGeneration() {
  const items = $$('#genList li');
  const fill = $('#genBarFill');
  const pct  = $('#genPct');
  const stream = $('#genStream');
  const thread = $('#genThreadFill');

  items.forEach(li => { li.classList.remove('is-active','is-done'); });
  if (fill) gsap.set(fill, { width: '0%' });
  if (thread) gsap.set(thread, { height: '0%' });
  if (pct) pct.textContent = '0%';

  // Reset placeholder titles so a re-run doesn't show a stale module.
  items.forEach((li, i) => {
    const t = li.querySelector('.gen-title');
    const m = li.querySelector('.gen-meta');
    const tags = li.querySelector('.gen-tags');
    const status = li.querySelector('.gen-status-text');
    if (t) t.textContent = `Lecția ${i + 1}`;
    if (m) m.textContent = '— · —';
    if (tags) tags.innerHTML = '<span>…</span>';
    if (status) status.textContent = 'așteaptă';
  });

  const streamCtx = startStreamCanvas(stream);

  // Pass 1 — outline (lightweight, ~2-3s). Anonymous users skip the
  // backend entirely and the timeline plays as a teaser before signup.
  const outlinePromise = Auth.isLoggedIn()
    ? api.buildOutline({
        subject: state.subject,
        topic: state.topic,
        level: state.level,
      }).catch(err => {
        console.warn('outline failed', err);
        return null;
      })
    : Promise.resolve(null);

  // Distraction: rotate fun facts in the gen-head subtitle while we wait.
  const headLead = $('.gen-head .lead');
  const facts = _genFactsFor(state.subject);
  let factIdx = 0;
  let factTimer = null;
  if (headLead) {
    headLead.textContent = facts[0];
    factTimer = setInterval(() => {
      factIdx = (factIdx + 1) % facts.length;
      gsap.fromTo(headLead, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: .35 });
      headLead.textContent = facts[factIdx];
    }, 3500);
  }

  if (genTl) genTl.kill();
  genTl = gsap.timeline();

  const stepDuration = 0.9;
  items.forEach((li, i) => {
    genTl.add(() => {
      items.forEach(x => x.classList.remove('is-active'));
      li.classList.add('is-active');
      streamCtx.burstFrom(li);
      setOrbState('speaking');
    });
    genTl.to(fill, {
      width: `${((i + 1) / items.length) * 100}%`,
      duration: stepDuration,
      ease: 'power1.inOut',
      onUpdate: () => {
        const w = parseFloat(fill.style.width) || 0;
        pct.textContent = `${Math.round(w)}%`;
      },
    }, '<');
    if (thread) {
      genTl.to(thread, {
        height: `${((i + 1) / items.length) * 100}%`,
        duration: stepDuration,
        ease: 'power1.inOut',
      }, '<');
    }
    genTl.add(() => {
      li.classList.remove('is-active');
      li.classList.add('is-done');
      streamCtx.confirmAt(li);
    });
  });

  // As soon as the outline arrives, swap in real lesson titles + tags.
  // This usually beats the animation timeline (timeline ~3.6s, outline ~2-3s).
  outlinePromise.then(outline => {
    if (!outline || !outline.lessons) return;
    state.generatedModule = outline;
    outline.lessons.forEach((les, i) => {
      const li = items[i];
      if (!li) return;
      const t = li.querySelector('.gen-title');
      const m = li.querySelector('.gen-meta');
      const tags = li.querySelector('.gen-tags');
      if (t) {
        t.textContent = les.title || `Lecția ${i + 1}`;
        gsap.fromTo(t, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: .35 });
      }
      if (m && les.minutes) m.textContent = `${les.minutes} min`;
      if (tags && Array.isArray(les.tags) && les.tags.length) {
        tags.innerHTML = les.tags.slice(0, 4).map(s => `<span>${escapeHtml(String(s))}</span>`).join('');
      }
    });
  });

  // Pass 2 — kick off lesson-1 generation EARLY so by the time the
  // timeline animation finishes, lesson 1 is ready (or close to it).
  // Lessons 2..N are prefetched in the background after navigation.
  const lesson1Promise = outlinePromise.then(outline => {
    if (!outline || !outline.lessons || !outline.lessons[0]) return null;
    return api.generateLesson(outline.lessons[0].id).catch(err => {
      console.warn('lesson 1 generation failed', err);
      return null;
    });
  });

  genTl.add(async () => {
    setOrbState('happy');
    streamCtx.stop();
    if (factTimer) { clearInterval(factTimer); factTimer = null; }

    // Wait for outline (~5s usually). Don't wait for lesson 1 — we
    // navigate to the lesson view with a skeleton + apply real content
    // when lesson 1 promise resolves. Perceived load drops from ~17s
    // to ~5s.
    const outline = await outlinePromise;
    if (outline) {
      state.generatedModule = outline;
      // Build a skeleton lesson stub from the outline so the lesson
      // view shows the lesson title + a "Wispucci scrie..." placeholder
      // before the body actually arrives.
      const stub = outline.lessons && outline.lessons[0];
      if (stub) {
        state.currentLesson = {
          id: stub.id,
          index: stub.index || 1,
          title: stub.title,
          body: '',
          practice: { hook: '', exercises: [], _loading: true },
        };
      }
    }
    // Anonymous users still sign up first.
    if (!Auth.isLoggedIn()) {
      showView('auth-signup');
      return;
    }
    showView('lesson');

    // Now stream the lesson 1 body in once it arrives, then start
    // prefetching the rest in the background.
    lesson1Promise.then(lesson1 => {
      if (lesson1 && state.generatedModule) {
        state.currentLesson = lesson1;
        applyLessonToView(lesson1);
      }
      if (state.generatedModule) _prefetchRemainingLessons(state.generatedModule);
    });
  }, '+=0.3');
}

// Sequentially generate lessons 2..N (skip lesson 1 which is already
// loaded). Sequential — DeepSeek's free tier is rate-limited and
// bursting causes 429s. By the time the user is on lesson 2, content
// is ready (no extra wait).
async function _prefetchRemainingLessons(outline) {
  if (!outline || !outline.lessons) return;
  state.lessonCache = state.lessonCache || {};
  for (let i = 1; i < outline.lessons.length; i++) {
    const les = outline.lessons[i];
    if (!les || !les.id) continue;
    if (state.lessonCache[les.id]) continue;
    try {
      const full = await api.generateLesson(les.id);
      if (full) state.lessonCache[les.id] = full;
    } catch (err) {
      console.warn(`prefetch lesson ${i + 1} failed`, err);
      // Continue with the others — one failure shouldn't kill the chain.
    }
  }
}

// Render a backend lesson object into the lesson view's DOM so the
// hardcoded demo content gets replaced by AI-generated content. Called
// whenever state.currentLesson changes.
function applyLessonToView(lesson) {
  if (!lesson) return;
  const card = $('.view-lesson .lesson-card');
  if (!card) return;

  const practice = lesson.practice || {};
  const hook = practice.hook || '';
  const body = lesson.body || '';
  const exercises = Array.isArray(practice.exercises) ? practice.exercises : [];
  const moduleTitle = state.generatedModule?.title || state.topic || '';
  const lessonIdx = lesson.index || 1;

  // ── ctxbar (Modulul / topic / Lecția N)
  const ctxL = $('.view-lesson .ctxbar-l');
  if (ctxL) {
    ctxL.innerHTML = `
      <span class="muted">Modulul</span>
      <span class="dot-sep">·</span>
      <span>${escapeHtml(moduleTitle)}</span>
      <span class="dot-sep">·</span>
      <span>Lecția ${lessonIdx}</span>
    `;
  }

  // ── theory pane (title + hook + body paragraphs)
  const theory = card.querySelector('[data-pane="theory"]');
  if (theory) {
    // First word of title gets <em> for the serif italic touch.
    const title = lesson.title || `Lecția ${lessonIdx}`;
    const [first, ...rest] = title.split(' ');
    const titleHtml = rest.length
      ? `<em>${escapeHtml(first)}</em> ${escapeHtml(rest.join(' '))}`
      : `<em>${escapeHtml(first)}</em>`;

    const paragraphs = body
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(Boolean);

    const parts = [`<h3 class="lesson-title">${titleHtml}</h3>`];
    if (practice._loading) {
      // Skeleton while DeepSeek finishes generating the body.
      parts.push(`
        <p class="lesson-meta"><em>Wispucci scrie lecția pentru tine…</em></p>
        <div class="skeleton-line" style="width:96%"></div>
        <div class="skeleton-line" style="width:88%"></div>
        <div class="skeleton-line" style="width:74%"></div>
        <div class="skeleton-line" style="width:90%"></div>
        <div class="skeleton-line" style="width:62%"></div>
      `);
    } else {
      if (hook) parts.push(`<p class="lesson-meta"><em>${escapeHtml(hook)}</em></p>`);
      paragraphs.forEach(p => {
        const codeMatch = p.match(/^```[\w]*\n?([\s\S]*?)\n?```$/);
        if (codeMatch) {
          parts.push(`<pre class="code"><code>${escapeHtml(codeMatch[1])}</code></pre>`);
        } else {
          parts.push(`<p class="lesson-body">${escapeHtml(p)}</p>`);
        }
      });
    }
    parts.push(`
      <div class="lesson-foot">
        <button class="btn-ghost" id="prevStep" ${practice._loading ? 'disabled' : ''}>← Pasul anterior</button>
        <button class="btn btn-primary" id="nextStep" ${practice._loading ? 'disabled' : ''}>Pas următor →</button>
      </div>
    `);
    theory.innerHTML = parts.join('\n');
  }

  // ── practice pane (first exercise of type fill/code/choice)
  const practicePane = card.querySelector('[data-pane="practice"]');
  if (practicePane) {
    if (practice._loading) {
      practicePane.innerHTML = `
        <h3 class="lesson-title"><em>Exercițiu</em></h3>
        <p class="lesson-meta"><em>Wispucci pregătește un exercițiu…</em></p>
        <div class="skeleton-line" style="width:84%"></div>
        <div class="skeleton-line" style="width:60%"></div>
      `;
    } else {
    const ex = exercises[0];
    if (!ex) {
      practicePane.innerHTML = '<p class="muted">Niciun exercițiu pentru lecția asta.</p>';
    } else if (ex.type === 'fill') {
      practicePane.innerHTML = `
        <h3 class="lesson-title"><em>Completează</em></h3>
        <p class="lesson-body">${escapeHtml(ex.prompt || '')}</p>
        <p>${(ex.blanks || []).map((_, i) =>
          `<input class="blank-input" data-blank="${i}" type="text" autocomplete="off" placeholder="___" />`
        ).join(' ')}</p>
        ${ex.hint ? `<p class="practice-hint"><em>Indiciu:</em> ${escapeHtml(ex.hint)}</p>` : ''}
      `;
    } else if (ex.type === 'code') {
      practicePane.innerHTML = `
        <h3 class="lesson-title"><em>Scrie</em> codul</h3>
        <p class="lesson-body">${escapeHtml(ex.prompt || '')}</p>
        <pre class="code editable"><code><textarea class="code-area" rows="6" spellcheck="false"></textarea></code></pre>
        ${ex.hint ? `<p class="practice-hint"><em>Indiciu:</em> ${escapeHtml(ex.hint)}</p>` : ''}
      `;
    } else if (ex.type === 'choice') {
      practicePane.innerHTML = `
        <h3 class="lesson-title"><em>Alege</em> răspunsul</h3>
        <p class="lesson-body">${escapeHtml(ex.prompt || '')}</p>
        <div class="choice-grid">${(ex.options || []).map((o, i) =>
          `<button class="choice-btn" data-i="${i}">${escapeHtml(o)}</button>`
        ).join('')}</div>
      `;
    } else {
      practicePane.innerHTML = `<p class="muted">Tip exercițiu: ${escapeHtml(ex.type)}</p>`;
    }
    } // closes else of practice._loading
  }

  // Re-bind nextStep / prevStep handlers because we replaced the DOM nodes.
  _bindLessonStepButtons();

  // Trigger mini-game lazy-load on next visit to that tab.
  _miniGameLoaded = false;
}

function _bindLessonStepButtons() {
  const nextBtn = $('#nextStep');
  if (nextBtn) {
    nextBtn.replaceWith(nextBtn.cloneNode(true));
    const fresh = $('#nextStep');
    fresh.addEventListener('click', () => {
      state.progress = Math.min(100, state.progress + 25);
      Store.get().lessonProgress = state.progress;
      Store.save();
      $('#progressFill').style.width = state.progress + '%';
      $('#progressPct').textContent = state.progress + '%';
      gsap.fromTo('.lesson-card', { x: 0 }, { x: -8, duration: .15, yoyo: true, repeat: 1, ease: 'power1.inOut' });
      if (state.progress >= 100) {
        celebrate();
      } else {
        // Advance to next lesson if available (cached, instant).
        _advanceToNextLesson();
        setOrbState('thinking');
        orbBubble('Hai să mai vedem un pas.');
      }
    });
  }
  const prevBtn = $('#prevStep');
  if (prevBtn) {
    prevBtn.replaceWith(prevBtn.cloneNode(true));
    const fresh = $('#prevStep');
    fresh.addEventListener('click', () => {
      state.progress = Math.max(0, state.progress - 25);
      Store.get().lessonProgress = state.progress;
      Store.save();
      $('#progressFill').style.width = state.progress + '%';
      $('#progressPct').textContent = state.progress + '%';
      orbBubble('Bine. Recitim partea aceea.');
    });
  }
}

function _advanceToNextLesson() {
  const mod = state.generatedModule;
  if (!mod || !mod.lessons || !state.currentLesson) return;
  const idx = mod.lessons.findIndex(l => l.id === state.currentLesson.id);
  if (idx < 0 || idx >= mod.lessons.length - 1) return;
  const nextStub = mod.lessons[idx + 1];
  const cached = (state.lessonCache || {})[nextStub.id];
  if (cached) {
    state.currentLesson = cached;
    applyLessonToView(cached);
  } else {
    // Not yet prefetched — fire it off and stay on current lesson;
    // by the time the user clicks again it should be ready.
    api.generateLesson(nextStub.id).then(full => {
      if (full) {
        state.lessonCache = state.lessonCache || {};
        state.lessonCache[nextStub.id] = full;
      }
    });
  }
}

function startStreamCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w, h, particles = [], stopped = false;
  function resize() {
    w = canvas.offsetWidth; h = canvas.offsetHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  function tick() {
    if (stopped) { ctx.clearRect(0,0,w,h); return; }
    ctx.clearRect(0,0,w,h);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.03;
      p.life += 1;
      const alpha = Math.max(0, 1 - p.life / p.maxLife);
      ctx.fillStyle = `rgba(255, 255, 217, ${alpha * 0.8})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      if (p.life > p.maxLife) particles.splice(i, 1);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  return {
    burstFrom(el) {
      const cR = canvas.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const x = r.left - cR.left + 10;
      const y = r.top - cR.top + r.height / 2;
      for (let i = 0; i < 16; i++) {
        particles.push({
          x, y,
          vx: (Math.random() - 0.5) * 2,
          vy: -1 - Math.random() * 1.5,
          r: 1 + Math.random() * 1.5,
          life: 0,
          maxLife: 50 + Math.random() * 30,
        });
      }
    },
    confirmAt(el) { this.burstFrom(el); },
    stop() { stopped = true; }
  };
}

// =========================================================
// LESSON
// =========================================================
function initLesson() {
  // Reset per-lesson state so the Joc tab fetches a fresh game each
  // time the user enters a different lesson.
  _miniGameLoaded = false;
  const mgHost = $('#minigameHost');
  if (mgHost) {
    mgHost.innerHTML = '<div class="minigame-empty muted">Wispucci pregătește un joc scurt pentru această lecție…</div>';
  }

  $$('.lesson-card .tab').forEach(tab => {
    if (tab.dataset.bound) return;
    tab.dataset.bound = '1';
    tab.addEventListener('click', () => {
      const t = tab.dataset.tab;
      $$('.lesson-card .tab').forEach(x => x.classList.toggle('is-active', x === tab));
      $$('.lesson-card .tab-pane').forEach(p => p.classList.toggle('is-active', p.dataset.pane === t));
      gsap.from('.tab-pane.is-active', { opacity: 0, y: 6, duration: .35, ease: 'power2.out' });
      if (t === 'game') ensureMiniGameLoaded();
    });
  });

  $('#progressFill').style.width = state.progress + '%';
  $('#progressPct').textContent = state.progress + '%';

  const nextBtn = $('#nextStep');
  if (nextBtn && !nextBtn.dataset.bound) {
    nextBtn.dataset.bound = '1';
    nextBtn.addEventListener('click', () => {
      state.progress = Math.min(100, state.progress + 8);
      Store.get().lessonProgress = state.progress;
      Store.save();
      $('#progressFill').style.width = state.progress + '%';
      $('#progressPct').textContent = state.progress + '%';
      if (state.progress < 100) {
        setOrbState('thinking');
        orbBubble('Hai să mai vedem un pas.');
      }
      gsap.fromTo('.lesson-card', { x: 0 }, { x: -8, duration: .15, yoyo: true, repeat: 1, ease: 'power1.inOut' });
      if (state.progress >= 100) {
        celebrate();
      }
    });
  }
  const prevBtn = $('#prevStep');
  if (prevBtn && !prevBtn.dataset.bound) {
    prevBtn.dataset.bound = '1';
    prevBtn.addEventListener('click', () => {
      state.progress = Math.max(0, state.progress - 8);
      Store.get().lessonProgress = state.progress;
      Store.save();
      $('#progressFill').style.width = state.progress + '%';
      $('#progressPct').textContent = state.progress + '%';
      orbBubble('Bine. Recitim partea aceea.');
    });
  }

  const checkBtn = $('#checkAnswer');
  if (checkBtn && !checkBtn.dataset.bound) {
    checkBtn.dataset.bound = '1';
    checkBtn.addEventListener('click', () => {
      const a = $('#answerParam');
      const b = $('#answerVar');
      if (!a || !b) return;
      const va = (a.value || '').trim().toLowerCase();
      const vb = (b.value || '').trim().toLowerCase();
      const correctParam = ['nume', 'name', 'n'];
      const okA = correctParam.includes(va) && va.length > 0;
      const okB = vb === va && vb.length > 0;
      a.classList.remove('is-correct', 'is-wrong');
      b.classList.remove('is-correct', 'is-wrong');
      if (okA && okB) {
        a.classList.add('is-correct');
        b.classList.add('is-correct');
        orbBurst();
        orbBubble('Exact. Ți-ai prins ideea.');
        showToast('+12 XP · răspuns corect', '✓');
      } else if (!va || !vb) {
        setOrbState('confused');
        orbBubble('Pune ceva în fiecare câmp — nu e nicio greșeală să ghicim.');
        if (!va) a.classList.add('is-wrong');
        if (!vb) b.classList.add('is-wrong');
      } else {
        a.classList.add(okA ? 'is-correct' : 'is-wrong');
        b.classList.add(okB ? 'is-correct' : 'is-wrong');
        setOrbState('confused');
        orbBubble(va !== vb
          ? 'Aproape — verifică că folosești același nume în ambele locuri.'
          : 'Mai încearcă — gândește-te ce nume scurt are sens pentru o persoană salutată.');
      }
    });
  }

  const hintBtn = $('#hintBtn');
  const hint = $('#practiceHint');
  if (hintBtn && hint && !hintBtn.dataset.bound) {
    hintBtn.dataset.bound = '1';
    hintBtn.addEventListener('click', () => {
      const open = !hint.hasAttribute('hidden');
      if (open) {
        hint.setAttribute('hidden', '');
        hintBtn.textContent = 'Indiciu';
      } else {
        hint.removeAttribute('hidden');
        hintBtn.textContent = 'Ascunde indiciul';
        gsap.from(hint, { opacity: 0, y: 4, duration: .3, ease: 'power2.out' });
        setOrbState('listening');
        orbBubble('Indiciu mic, nu răspuns. Tu trebuie să legăm punctele.');
      }
    });
  }
}

function orbBubble(text) {
  const b = $('#orbBubble');
  if (!b) return;
  b.textContent = text;
  gsap.fromTo(b, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: .35, ease: 'power2.out' });
}

// =========================================================
// MINI-GAMES — Bug Hunter, Code Assemble, Output Predict, Word Match
// =========================================================
const sampleGames = {
  bug_hunter: {
    type: 'bug_hunter',
    prompt: 'Una din linii are un bug. Apasă pe ea.',
    lines: [
      "def saluta(nume):",
      "    print(f'Salut, {nume}!')",
      "saluta(Ana)",
    ],
    buggy_index: 2,
    fix: "saluta('Ana')",
  },
  code_assemble: {
    type: 'code_assemble',
    prompt: 'Pune liniile în ordinea corectă pentru a printa „Salut, Ana!".',
    blocks: [
      "    print(f'Salut, {nume}!')",
      "saluta('Ana')",
      "def saluta(nume):",
    ],
    correct_order: [2, 0, 1],
  },
  output_predict: {
    type: 'output_predict',
    prompt: 'Ce printează codul de mai jos?',
    code: "x = [1,2,3]\nprint(x[1] * 2)",
    options: ['2', '4', '6', 'eroare'],
    answer: 1,
  },
};

let _miniGameLoaded = false;
async function ensureMiniGameLoaded(force = false) {
  if (_miniGameLoaded && !force) return;
  _miniGameLoaded = true;
  const host = $('#minigameHost');
  if (!host) return;
  let game = null;
  if (state.currentLesson?.id && Auth.isLoggedIn()) {
    try {
      game = await api.miniGame(state.currentLesson.id, 'auto');
    } catch (_) { /* fallthrough */ }
  }
  if (!game || !game.type) {
    const keys = Object.keys(sampleGames);
    game = sampleGames[keys[Math.floor(Math.random() * keys.length)]];
  }
  renderMiniGame(host, game);
}

function renderMiniGame(host, game) {
  host.innerHTML = '';
  const type = game.type;
  if (type === 'bug_hunter') return renderBugHunter(host, game);
  if (type === 'code_assemble') return renderCodeAssemble(host, game);
  if (type === 'output_predict') return renderOutputPredict(host, game);
  if (type === 'word_match') return renderWordMatch(host, game);
  host.innerHTML = '<p class="muted">Tip de joc necunoscut.</p>';
}

function renderBugHunter(host, game) {
  const wrap = document.createElement('div');
  wrap.className = 'mg mg-bug';
  wrap.innerHTML = `
    <div class="mg-head">
      <span class="mg-tag">🐞 bug hunter</span>
      <span class="mg-prompt">${escapeHtml(game.prompt || 'Găsește bug-ul.')}</span>
    </div>
    <pre class="mg-code"><code id="bugLines"></code></pre>
    <p class="mg-feedback muted small" id="bugFb">apasă pe linia greșită.</p>
  `;
  host.appendChild(wrap);
  const codeEl = wrap.querySelector('#bugLines');
  game.lines.forEach((ln, idx) => {
    const span = document.createElement('span');
    span.className = 'mg-line';
    span.textContent = ln + '\n';
    span.addEventListener('click', () => {
      const fb = wrap.querySelector('#bugFb');
      if (idx === game.buggy_index) {
        span.classList.add('is-correct');
        fb.innerHTML = `<b>Da.</b> Linia ${idx + 1} avea bug. Corectă: <code>${escapeHtml(game.fix || '')}</code>`;
        showToast('+15 XP · bug găsit', '✓');
        orbBurst();
      } else {
        span.classList.add('is-wrong');
        fb.textContent = 'Hmm, asta e ok. Mai uită-te.';
        setOrbState('confused');
      }
    });
    codeEl.appendChild(span);
  });
}

function renderCodeAssemble(host, game) {
  const order = (game.correct_order || []).slice();
  const wrap = document.createElement('div');
  wrap.className = 'mg mg-assemble';
  wrap.innerHTML = `
    <div class="mg-head">
      <span class="mg-tag">🧩 code assemble</span>
      <span class="mg-prompt">${escapeHtml(game.prompt || 'Pune blocurile în ordinea corectă.')}</span>
    </div>
    <ol class="mg-blocks" id="asmBlocks"></ol>
    <button class="btn btn-primary mg-check" id="asmCheck">Verifică ordinea</button>
    <p class="mg-feedback muted small" id="asmFb"></p>
  `;
  host.appendChild(wrap);
  const ol = wrap.querySelector('#asmBlocks');
  // Shuffle for play
  const indices = game.blocks.map((_, i) => i);
  shuffleInPlace(indices);
  indices.forEach(i => {
    const li = document.createElement('li');
    li.className = 'mg-block';
    li.draggable = true;
    li.dataset.idx = i;
    li.textContent = game.blocks[i];
    li.addEventListener('dragstart', (e) => {
      li.classList.add('dragging');
      e.dataTransfer.setData('text/plain', String(i));
    });
    li.addEventListener('dragend', () => li.classList.remove('dragging'));
    li.addEventListener('dragover', (e) => e.preventDefault());
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      const dragged = ol.querySelector('.dragging');
      if (dragged && dragged !== li) {
        const rect = li.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        ol.insertBefore(dragged, before ? li : li.nextSibling);
      }
    });
    ol.appendChild(li);
  });
  wrap.querySelector('#asmCheck').addEventListener('click', () => {
    const cur = $$('.mg-block', ol).map(li => +li.dataset.idx);
    const expected = order.length ? order : indices;
    const fb = wrap.querySelector('#asmFb');
    if (JSON.stringify(cur) === JSON.stringify(expected)) {
      fb.textContent = 'Ordine perfectă. Asta-i fluxul.';
      $$('.mg-block', ol).forEach(li => li.classList.add('is-correct'));
      showToast('+18 XP · cod în ordine', '✓');
      orbBurst();
    } else {
      fb.textContent = 'Aproape — uită-te ce-ar fi rulat primul.';
      setOrbState('confused');
    }
  });
}

function renderOutputPredict(host, game) {
  const wrap = document.createElement('div');
  wrap.className = 'mg mg-predict';
  wrap.innerHTML = `
    <div class="mg-head">
      <span class="mg-tag">⚡ output predict</span>
      <span class="mg-prompt">${escapeHtml(game.prompt || 'Ce printează codul?')}</span>
    </div>
    <pre class="mg-code"><code>${escapeHtml(game.code || '')}</code></pre>
    <div class="mg-options"></div>
    <p class="mg-feedback muted small" id="predFb"></p>
  `;
  host.appendChild(wrap);
  const opts = wrap.querySelector('.mg-options');
  game.options.forEach((opt, i) => {
    const b = document.createElement('button');
    b.className = 'mg-option';
    b.textContent = opt;
    b.addEventListener('click', () => {
      const fb = wrap.querySelector('#predFb');
      if (i === game.answer) {
        b.classList.add('is-correct');
        fb.textContent = 'Exact. Bine văzut.';
        showToast('+10 XP · output corect', '✓');
        orbBurst();
      } else {
        b.classList.add('is-wrong');
        fb.textContent = 'Nu, încearcă altă opțiune.';
        setOrbState('confused');
      }
    });
    opts.appendChild(b);
  });
}

function renderWordMatch(host, game) {
  const wrap = document.createElement('div');
  wrap.className = 'mg mg-match';
  wrap.innerHTML = `
    <div class="mg-head">
      <span class="mg-tag">🔁 word match</span>
      <span class="mg-prompt">${escapeHtml(game.prompt || 'Potrivește perechile.')}</span>
    </div>
    <div class="mg-pairs"></div>
    <p class="mg-feedback muted small" id="matchFb"></p>
  `;
  host.appendChild(wrap);
  const pairsHost = wrap.querySelector('.mg-pairs');
  const left = game.pairs.map(p => p[0]);
  const right = game.pairs.map(p => p[1]).slice();
  shuffleInPlace(right);
  let chosenLeft = null;
  left.forEach((l, i) => {
    const lBtn = document.createElement('button');
    lBtn.className = 'mg-match-cell';
    lBtn.textContent = l;
    lBtn.dataset.side = 'L';
    lBtn.dataset.i = i;
    lBtn.addEventListener('click', () => {
      $$('.mg-match-cell[data-side="L"]', pairsHost).forEach(x => x.classList.remove('is-on'));
      lBtn.classList.add('is-on');
      chosenLeft = i;
    });
    pairsHost.appendChild(lBtn);
  });
  right.forEach((r) => {
    const rBtn = document.createElement('button');
    rBtn.className = 'mg-match-cell';
    rBtn.textContent = r;
    rBtn.dataset.side = 'R';
    rBtn.addEventListener('click', () => {
      if (chosenLeft === null) return;
      const expected = game.pairs[chosenLeft][1];
      const fb = wrap.querySelector('#matchFb');
      if (rBtn.textContent === expected) {
        rBtn.classList.add('is-correct');
        $$('.mg-match-cell.is-on[data-side="L"]', pairsHost).forEach(x => {
          x.classList.add('is-correct');
          x.disabled = true;
        });
        rBtn.disabled = true;
        fb.textContent = 'Exact.';
        chosenLeft = null;
      } else {
        rBtn.classList.add('is-wrong');
        setTimeout(() => rBtn.classList.remove('is-wrong'), 600);
        fb.textContent = 'Nu, mai încearcă.';
      }
    });
    pairsHost.appendChild(rBtn);
  });
}

function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

// =========================================================
// "Explică-mi" microinteraction
// =========================================================
const chip = $('#explainChip');
const popover = $('#explainPopover');
let lastSelectionRect = null;
let lastSelectedText = '';

document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) { chip?.classList.remove('is-on'); return; }
  const text = sel.toString().trim();
  if (text.length < 2) { chip?.classList.remove('is-on'); return; }
  const range = sel.getRangeAt(0);
  const node = range.commonAncestorContainer;
  const lessonCard = (node.nodeType === 1 ? node : node.parentElement)?.closest?.('.lesson-card');
  if (!lessonCard) { chip?.classList.remove('is-on'); return; }
  const rect = range.getBoundingClientRect();
  if (!rect || rect.width === 0) return;
  lastSelectionRect = rect;
  lastSelectedText = text;
  if (chip) {
    chip.style.left = (rect.left + rect.width / 2) + 'px';
    chip.style.top  = (rect.top + window.scrollY) + 'px';
    chip.classList.add('is-on');
  }
});

chip?.addEventListener('click', () => {
  chip.classList.remove('is-on');
  showExplainPopover(lastSelectionRect, lastSelectedText);
});

function showExplainPopover(rect, text) {
  if (!rect || !popover) return;
  popover.classList.add('is-on');
  const pw = 360;
  let left = rect.left + rect.width / 2 - pw / 2;
  left = Math.max(16, Math.min(window.innerWidth - pw - 16, left));
  let top = rect.bottom + 12;
  popover.style.left = left + 'px';
  popover.style.top  = top + 'px';
  setExplain('simple', text);
  gsap.fromTo(popover,
    { opacity: 0, y: -8, scale: .98 },
    { opacity: 1, y: 0, scale: 1, duration: .25, ease: 'power2.out' });
  setOrbState('speaking');
  orbBubble(`Mă uit la „${text.slice(0, 24)}${text.length > 24 ? '…' : ''}".`);
}

function setExplain(mode, text) {
  const label = text.length > 32 ? text.slice(0, 32).trim() + '…' : text;
  let body = '';
  if (mode === 'simple') {
    body = `<div class="explain-quote">„${label}"</div>În cuvinte simple: parametrul e o cutie pe care o umpli când chemi funcția. La fiecare apel poți pune altceva în cutie — așa refolosești același cod cu valori diferite.`;
  } else if (mode === 'example') {
    body = `<div class="explain-quote">„${label}"</div>Imaginează-ți o cafenea: <code>fa_cafea(tip)</code>. <code>tip</code> e parametrul. „espresso", „cappuccino", „latte" sunt argumente. Funcția e aceeași — răspunde diferit în funcție de ce-i dai.`;
  } else {
    body = `<div class="explain-quote">„${label}"</div>Un <b>parametru</b> e o variabilă locală funcției, legată de un argument la momentul apelului. Are scope local, viața egală cu execuția funcției, separată de variabilele globale (excepție: <code>global</code>/<code>nonlocal</code>).`;
  }
  $('#explainBody').innerHTML = body;
}

popover?.addEventListener('click', (e) => {
  const pill = e.target.closest('.pill[data-mode]');
  if (pill) {
    $$('.explain-pills .pill').forEach(p => p.classList.toggle('is-on', p === pill));
    setExplain(pill.dataset.mode, lastSelectedText);
  }
});

$('#explainClose')?.addEventListener('click', () => {
  popover.classList.remove('is-on');
  setOrbState('idle');
  orbBubble('Spune „Explică-mi" dacă ceva nu e clar.');
});

$('#saveWord')?.addEventListener('click', () => {
  showToast('salvat în Statistica', '+');
});

// =========================================================
// CELEBRATION
// =========================================================
let celebrateFx = null;

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// Quick burst — fired on +XP / correct answer in a mini-game.
// Squash → elastic scale-up → settle, plus a single plasma shockwave ring.
function orbBurst() {
  setOrbState('happy');
  if (prefersReducedMotion()) {
    setTimeout(() => setOrbState('idle'), 800);
    return;
  }
  theOrb.classList.remove('is-bursting');
  void theOrb.offsetWidth;          // force reflow → restart animation
  theOrb.classList.add('is-bursting');
  spawnShockwave('plasma', 0);
  setTimeout(() => theOrb.classList.remove('is-bursting'), 700);
  setTimeout(() => setOrbState('idle'), 1200);
}

// Mega-boom — full peak-end dopamine spike at lesson completion.
// Squash → elastic peak → recoil → second peak, plus 3 staggered
// shockwave rings + 12 ray bursts.
function orbBoom() {
  setOrbState('celebrating');
  if (prefersReducedMotion()) return;
  theOrb.classList.remove('is-boom');
  void theOrb.offsetWidth;
  theOrb.classList.add('is-boom');
  spawnShockwave('plasma', 0);
  spawnShockwave('gold',   140);
  spawnShockwave('plasma', 280);
  for (let i = 0; i < 12; i++) {
    spawnRay(i * 30, i % 2 === 0 ? 'gold' : 'plasma', i * 12);
  }
  setTimeout(() => theOrb.classList.remove('is-boom'), 1500);
}

function spawnShockwave(kind = 'plasma', delay = 0) {
  setTimeout(() => {
    const ring = document.createElement('div');
    ring.className = 'orb-shockwave-ring' + (kind === 'gold' ? ' gold' : '');
    theOrb.appendChild(ring);
    setTimeout(() => ring.remove(), 1000);
  }, delay);
}

function spawnRay(angleDeg, kind = 'gold', delay = 0) {
  setTimeout(() => {
    const ray = document.createElement('div');
    ray.className = 'orb-ray-burst' + (kind === 'plasma' ? ' plasma' : '');
    ray.style.setProperty('--ray-angle', angleDeg + 'deg');
    theOrb.appendChild(ray);
    setTimeout(() => ray.remove(), 800);
  }, delay);
}

let _orbBoomTimer = null;

function celebrate() {
  const overlay = $('#celebrate');
  overlay.classList.add('is-on');
  gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: .25 });
  gsap.fromTo('.celebrate-card', { scale: .92, y: 12, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: .6, ease: 'back.out(1.6)' });
  moveOrbToHost('celebrate', { duration: .6 });
  // Trigger the dopamine bang once the orb finishes flying to the
  // celebrate host (otherwise the burst transform + FLIP transform
  // fight each other and the orb visibly stutters). Save the timer
  // ID so closeCelebrate can cancel it if the user dismisses the
  // overlay before the boom fires (otherwise the orb would get stuck
  // in the celebrating state on the lesson view).
  if (_orbBoomTimer) clearTimeout(_orbBoomTimer);
  _orbBoomTimer = setTimeout(() => { _orbBoomTimer = null; orbBoom(); }, 620);
  if (celebrateFx) celebrateFx.stop();
  celebrateFx = startCelebrateFx($('#celebrateFx'));
}

$('#celebrateClose')?.addEventListener('click', closeCelebrate);
$('#celebrateNext')?.addEventListener('click',  closeCelebrate);

function closeCelebrate() {
  const overlay = $('#celebrate');
  if (_orbBoomTimer) { clearTimeout(_orbBoomTimer); _orbBoomTimer = null; }
  if (celebrateFx) { celebrateFx.stop(); celebrateFx = null; }
  gsap.to(overlay, { opacity: 0, duration: .25, onComplete: () => {
    overlay.classList.remove('is-on');
    moveOrbToHost('lesson');
    setOrbState('idle');
  }});
}

function startCelebrateFx(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let stopped = false;
  function resize() {
    const w = canvas.offsetWidth, h = canvas.offsetHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  let W = canvas.offsetWidth, H = canvas.offsetHeight;
  let cx = W / 2, cy = H / 2;
  const waves = [
    { r: 30, a: 0.5, w: 6, life: 0,   maxLife: 130 },
    { r: 30, a: 0.32, w: 4, life: -40, maxLife: 160 },
    { r: 30, a: 0.22, w: 3, life: -80, maxLife: 190 },
  ];
  const embers2 = Array.from({ length: 130 }, () => ({
    x: Math.random() * W,
    y: -Math.random() * H * 0.5,
    vx: (Math.random() - .5) * 0.5,
    vy: 0.5 + Math.random() * 1.6,
    r: 1 + Math.random() * 2.2,
    flicker: Math.random() * Math.PI * 2,
    flickerSpeed: 0.05 + Math.random() * 0.1,
    color: Math.random() < .35 ? '#FFFFD9' : '#EFDD8D',
    life: 0,
  }));
  function draw() {
    if (stopped) return;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    waves.forEach(w => {
      w.life += 1;
      if (w.life > 0) {
        const t = w.life / w.maxLife;
        const r = 30 + t * Math.max(W, H) * 0.65;
        const alpha = w.a * Math.max(0, 1 - t);
        ctx.strokeStyle = `rgba(255, 255, 217, ${alpha})`;
        ctx.lineWidth = w.w * (1 - t * 0.5);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (w.life > w.maxLife) { w.life = -10 - Math.random() * 30; }
    });
    embers2.forEach(p => {
      p.x += p.vx + Math.sin(p.life * 0.02) * 0.3;
      p.y += p.vy;
      p.flicker += p.flickerSpeed;
      p.life += 1;
      if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; p.life = 0; }
      const alpha = (0.6 + Math.sin(p.flicker) * 0.4) * 0.85;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
      grad.addColorStop(0, p.color === '#FFFFD9' ? `rgba(255, 255, 217, ${alpha})` : `rgba(239, 221, 141, ${alpha})`);
      grad.addColorStop(1, 'rgba(239, 221, 141, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255, 246, 204, ${alpha})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.5, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(draw);
  }
  draw();
  return { stop() { stopped = true; ctx.clearRect(0,0,W,H); } };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// =========================================================
// STATISTICA — fetches /api/me/stats + leaderboard
// =========================================================
async function renderStats() {
  if (!Auth.isLoggedIn()) return;
  let stats;
  try {
    stats = await api.stats();
    state.statsCache = stats;
  } catch (err) {
    showToast('nu pot lua statistica acum', '!');
    return;
  }
  $$('[data-stat-streak]').forEach(el => el.textContent = stats.streak.current);
  $$('[data-stat-longest]').forEach(el => el.textContent = stats.streak.longest);
  $$('[data-stat-xp-week]').forEach(el => el.textContent = stats.xp.week);
  $$('[data-stat-xp-today]').forEach(el => el.textContent = stats.xp.today);
  $$('[data-stat-xp-total]').forEach(el => el.textContent = stats.xp.total);
  $$('[data-stat-mastered]').forEach(el => el.textContent = stats.mastered.total);
  $$('[data-stat-mastered-new]').forEach(el => el.textContent = stats.mastered.new_today);
  const totalDone = (stats.lessons.by_subject || []).reduce((s, x) => s + (x.completed || 0), 0);
  const inProg    = (stats.lessons.by_subject || []).reduce((s, x) => s + (x.in_progress || 0), 0);
  $$('[data-stat-lessons-done]').forEach(el => el.textContent = totalDone);
  $$('[data-stat-lessons-progress]').forEach(el => el.textContent = inProg);

  // Heatmap
  const hm = $('#heatmap');
  hm.innerHTML = '';
  const xps = stats.heatmap.map(d => d.xp);
  const maxXp = Math.max(40, ...xps);
  stats.heatmap.forEach(d => {
    const cell = document.createElement('div');
    cell.className = 'heat-cell';
    const intensity = d.xp <= 0 ? 0 : Math.min(1, d.xp / maxXp);
    cell.style.setProperty('--heat', intensity.toFixed(2));
    cell.title = `${d.day} · ${d.xp} XP`;
    hm.appendChild(cell);
  });

  // Subject breakdown
  const sb = $('#subjectBreakdown');
  sb.innerHTML = '';
  if (!stats.lessons.by_subject.length) {
    sb.innerHTML = '<div class="muted small subject-empty">Începi un curs · statistica apare aici.</div>';
  } else {
    stats.lessons.by_subject.forEach(s => {
      const card = document.createElement('div');
      card.className = 'subject-card';
      const total = (s.completed || 0) + (s.in_progress || 0);
      const pct = total ? Math.round(((s.completed || 0) / total) * 100) : 0;
      card.innerHTML = `
        <div class="subject-name">${escapeHtml(s.subject)}</div>
        <div class="subject-bar"><i style="width:${pct}%"></i></div>
        <div class="subject-meta muted small">${s.completed} terminate · ${s.in_progress} în progres</div>
      `;
      sb.appendChild(card);
    });
  }

  // Mastered concepts grid
  const grid = $('#masteredGrid');
  const empty = $('#masteredEmpty');
  const recent = stats.mastered.recent || [];
  if (recent.length) {
    empty.style.display = 'none';
    grid.innerHTML = '';
    const tagLabel = { new: 'nou', review: 'de reluat', known: 'știut' };
    recent.forEach(w => {
      const el = document.createElement('div');
      el.className = 'vocab-card' + (w.tag === 'known' ? ' is-known' : '');
      el.innerHTML = `
        <span class="vocab-word">${escapeHtml(w.label)}</span>
        <span class="vocab-def">${escapeHtml(w.definition || '')}${w.code_example ? ` <code>${escapeHtml(w.code_example)}</code>` : ''}</span>
        <span class="vocab-meta">
          <span class="vocab-tag tag-${w.tag}">${tagLabel[w.tag] || w.tag}</span>
          <span class="vocab-source">${escapeHtml(w.source_lesson_id || '')}</span>
        </span>`;
      grid.appendChild(el);
    });
  } else {
    grid.innerHTML = '';
    empty.style.display = '';
  }

  // Leaderboard
  await renderLeaderboard(state.leaderboardPeriod);
}

async function renderLeaderboard(period = 'weekly') {
  state.leaderboardPeriod = period;
  $$('#leaderboardToggle .filter-pill').forEach(b => b.classList.toggle('is-on', b.dataset.period === period));
  let lb;
  try {
    lb = await api.leaderboard(period);
  } catch (_) {
    return;
  }
  const ol = $('#leaderboard');
  ol.innerHTML = '';
  if (!lb.top.length) {
    ol.innerHTML = '<li class="leaderboard-empty muted small">Încă nimeni în top — fii primul.</li>';
  } else {
    lb.top.forEach(row => {
      const li = document.createElement('li');
      li.className = 'leaderboard-row' + (row.is_me ? ' is-me' : '');
      li.innerHTML = `
        <span class="lb-rank">#${row.rank}</span>
        <span class="lb-name">${escapeHtml(row.display_name)}</span>
        <span class="lb-streak">🔥 ${row.streak_days || 0}</span>
        <span class="lb-xp">${row.xp} XP</span>
      `;
      ol.appendChild(li);
    });
  }
  const me = $('#leaderboardMe');
  if (lb.me && lb.me.rank && !lb.me.in_top) {
    me.hidden = false;
    me.innerHTML = `
      <div class="leaderboard-row is-me">
        <span class="lb-rank">#${lb.me.rank}</span>
        <span class="lb-name">${escapeHtml(lb.me.display_name)} (tu)</span>
        <span class="lb-streak">🔥 ${lb.me.streak_days || 0}</span>
        <span class="lb-xp">${lb.me.xp} XP</span>
      </div>`;
  } else {
    me.hidden = true;
  }
}

$('#leaderboardToggle')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-period]');
  if (!b) return;
  renderLeaderboard(b.dataset.period);
});

$('#masteredSearch')?.addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  $$('#masteredGrid .vocab-card').forEach(card => {
    const txt = card.textContent.toLowerCase();
    card.style.display = (!q || txt.includes(q)) ? '' : 'none';
  });
});

// =========================================================
// HOME — refresh dynamic content from latest stats
// =========================================================
async function refreshHome() {
  if (!Auth.isLoggedIn()) return;
  let stats;
  try { stats = await api.stats(); state.statsCache = stats; }
  catch (_) { return; }
  $$('[data-streak]').forEach(el => el.textContent = stats.streak.current);
  $$('[data-mastered-total]').forEach(el => el.textContent = stats.mastered.total);
  $$('[data-mastered-new]').forEach(el => el.textContent = stats.mastered.new_today);
  // Avatar initial
  const u = Auth.user;
  const initial = (u && u.name && u.name[0]) ? u.name[0].toUpperCase() : '?';
  $$('[data-avatar]').forEach(el => el.textContent = initial);
}

// =========================================================
// SETTINGS
// =========================================================
function initSettingsView() {
  const data = Store.get();
  const s = data.settings;

  $$('.toggle-input[data-setting]').forEach(input => {
    const key = input.dataset.setting;
    input.checked = !!s[key];
    if (input.dataset.bound) return;
    input.dataset.bound = '1';
    input.addEventListener('change', () => {
      s[key] = input.checked;
      Store.save();
      applySettings();
      pushSettings();
      showToast(input.checked ? 'pornit' : 'oprit', '✓');
    });
  });

  $$('.seg-picker[data-setting]').forEach(seg => {
    const key = seg.dataset.setting;
    $$('button[data-val]', seg).forEach(b => {
      b.classList.toggle('is-on', b.dataset.val === s[key]);
    });
    if (seg.dataset.bound) return;
    seg.dataset.bound = '1';
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-val]');
      if (!b) return;
      $$('button[data-val]', seg).forEach(x => x.classList.toggle('is-on', x === b));
      s[key] = b.dataset.val;
      Store.save();
      applySettings();
      pushSettings();
      showToast(`${key} → ${b.dataset.val}`, '✓');
    });
  });

  const slider = $('#setEmbers');
  const valEl = $('#embersValue');
  if (slider) {
    slider.value = s.embersIntensity;
    if (valEl) valEl.textContent = s.embersIntensity + '%';
    if (!slider.dataset.bound) {
      slider.dataset.bound = '1';
      slider.addEventListener('input', () => {
        s.embersIntensity = +slider.value;
        if (valEl) valEl.textContent = s.embersIntensity + '%';
        applySettings();
      });
      slider.addEventListener('change', () => {
        Store.save();
        pushSettings();
      });
    }
  }

  const logout = $('#logoutBtn');
  if (logout && !logout.dataset.bound) {
    logout.dataset.bound = '1';
    logout.addEventListener('click', () => {
      Auth.clear();
      Store.get().lastView = 'welcome';
      Store.save();
      showToast('ai ieșit din cont', '✓');
      showView('welcome');
    });
  }
}

let _settingsPushTimer = null;
function pushSettings() {
  if (!Auth.isLoggedIn()) return;
  if (_settingsPushTimer) clearTimeout(_settingsPushTimer);
  _settingsPushTimer = setTimeout(() => {
    api.saveSettings(Store.get().settings).catch(() => {});
  }, 600);
}

function applySettings() {
  const s = Store.get().settings;
  document.documentElement.style.setProperty('--embers-opacity', (s.embersIntensity / 100).toFixed(2));
  document.body.classList.toggle('force-focus', !!s.forceFocus);
  document.body.classList.toggle('silent', !!s.silent);
  const focused = state.view === 'lesson' || s.forceFocus;
  document.body.classList.toggle('in-lesson', focused);
}

// =========================================================
// TOP BUTTONS in lesson: Mod focus + Pauză
// =========================================================
let pauseEmbersFlag = false;
window.addEventListener('DOMContentLoaded', () => {
  const focusBtn = $('#focusModeBtn');
  if (focusBtn) {
    const sync = () => focusBtn.classList.toggle('is-on', !!Store.get().settings.forceFocus);
    sync();
    focusBtn.addEventListener('click', () => {
      const s = Store.get().settings;
      s.forceFocus = !s.forceFocus;
      Store.save();
      applySettings();
      sync();
      showToast(s.forceFocus ? 'mod focus pornit' : 'mod focus oprit', '☾');
    });
  }
  const pauseBtn = $('#pauseBtn');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      pauseEmbersFlag = !pauseEmbersFlag;
      pauseBtn.classList.toggle('is-on', pauseEmbersFlag);
      pauseBtn.textContent = pauseEmbersFlag ? 'Reia' : 'Pauză';
      document.body.classList.toggle('embers-paused', pauseEmbersFlag);
      showToast(pauseEmbersFlag ? 'particule în pauză' : 'particule reluate', '⏸');
    });
  }

  $$('.recent-item').forEach(el => {
    el.addEventListener('click', () => showView('lesson'));
  });
  $$('.btn-link[data-go-list]').forEach(el => {
    el.addEventListener('click', () => showView('stats'));
  });
});

// =========================================================
// TOAST
// =========================================================
function showToast(text, icon = '✓') {
  const stack = $('#toastStack');
  if (!stack) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span class="toast-icon">${icon}</span><span>${text}</span>`;
  stack.appendChild(t);
  gsap.fromTo(t, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: .3, ease: 'power2.out' });
  setTimeout(() => {
    gsap.to(t, { y: -8, opacity: 0, duration: .25, ease: 'power2.in', onComplete: () => t.remove() });
  }, 2200);
}

// =========================================================
// INITIAL ROUTING
// =========================================================
window.addEventListener('load', () => {
  applySettings();
  // Place orb at the active view's host (welcome by default).
  placeOrbInstantlyAt('welcome');
  setOrbState('idle');
  // (resize listener is registered globally above via scheduleOrbReAnchor)

  gsap.from('.welcome-wrap .display',  { y: 24, opacity: 0, duration: .9, delay: .3, ease: 'power3.out' });
  gsap.from('.welcome-wrap .lead',     { y: 14, opacity: 0, duration: .8, delay: .55, ease: 'power3.out' });
  gsap.from('.welcome-wrap .btn',      { y: 10, opacity: 0, duration: .7, delay: .75, ease: 'power3.out' });
  gsap.from('.welcome-wrap .footnote', { opacity: 0, duration: .6, delay: .95 });

  // Returning user → resume at last protected view if logged in
  if (Auth.isLoggedIn()) {
    const last = Store.get().lastView;
    if (last && PROTECTED_VIEWS.has(last)) {
      setTimeout(() => showView(last), 50);
    } else {
      setTimeout(() => showView('home'), 50);
    }
  }
});
