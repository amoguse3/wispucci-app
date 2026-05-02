// =========================================================
// Wispucci demo v4 — brows + eye-shine, calm celebration, constellation generation
// =========================================================

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

// =========================================================
// PERSISTENT STATE (localStorage)
// =========================================================
const STORE_KEY = 'wispucci.v1';
const defaultStore = {
  streak: 3,
  longestStreak: 12,
  xpWeek: 142,
  xpToday: 47,
  xpTotal: 1248,
  lessonsDone: 8,
  lessonsTotal: 24,
  lastView: 'welcome',
  knownWords: [],         // ids of vocab words the user marked as "știu"
  customWords: [],        // user-added (e.g. via Salvează în vocabular)
  settings: {
    forceFocus: false,
    silent: false,
    tone: 'cald',
    pace: 'normal',
    embersIntensity: 60,
  },
  lessonProgress: 47,
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
    reset: () => {
      try { localStorage.removeItem(STORE_KEY); } catch (_) {}
      Object.assign(data, defaultStore);
      data.settings = Object.assign({}, defaultStore.settings);
    },
  };
})();

const state = {
  subject: 'Programare',
  topic: 'Python — bazele',
  level: 2,
  progress: Store.get().lessonProgress,
  view: 'welcome',
};

const TOPICS = {
  'Programare': [
    { title: 'Python — bazele', sub: 'Variabile · funcții · liste', icon: 'PY', est: '4 module · 25 min' },
    { title: 'JavaScript modern', sub: 'ES6+ · async · DOM',         icon: 'JS', est: '5 module · 30 min' },
    { title: 'Rust',             sub: 'Ownership · borrow · traits', icon: 'RS', est: '6 module · 45 min' },
    { title: 'Go',               sub: 'Concurency · interfaces',     icon: 'GO', est: '4 module · 28 min' },
    { title: 'Algoritmi',        sub: 'Sortări · căutări · grafuri', icon: '∑',  est: '6 module · 40 min' },
    { title: 'OOP',              sub: 'Clase · moștenire · polim.',  icon: '◇',  est: '4 module · 22 min' },
    { title: 'Web — front',      sub: 'HTML · CSS · React',          icon: '⌘',  est: '5 module · 35 min' },
    { title: 'API REST',         sub: 'HTTP · JSON · auth',          icon: '⇄',  est: '4 module · 28 min' },
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
    { title: 'Algebră',         sub: 'expresii · ecuații · sistem', icon: 'a+b', est: '5 module · 35 min' },
    { title: 'Analiză',         sub: 'limite · derivate · integ.',  icon: '∫',   est: '6 module · 45 min' },
    { title: 'Statistică',      sub: 'medii · varianță · teste',    icon: 'σ',   est: '4 module · 28 min' },
    { title: 'Trigonometrie',   sub: 'sin · cos · identități',      icon: 'θ',   est: '4 module · 24 min' },
    { title: 'Logaritmi',       sub: 'log · exp · ecuații',         icon: 'log', est: '3 module · 18 min' },
    { title: 'Probabilități',   sub: 'evenimente · Bayes',          icon: 'P',   est: '4 module · 26 min' },
  ],
  'Altceva': [
    { title: 'Fizică',     sub: 'mecanică · electricitate', icon: 'φ', est: '5 module · 35 min' },
    { title: 'Chimie',     sub: 'organic · reacții',         icon: 'C', est: '4 module · 28 min' },
    { title: 'Istorie',    sub: 'epoci · procese',           icon: 'H', est: '6 module · 40 min' },
    { title: 'Biologie',   sub: 'celulă · genetică',         icon: 'β', est: '5 module · 32 min' },
    { title: 'Filozofie',  sub: 'logică · etică',            icon: 'Φ', est: '4 module · 26 min' },
    { title: 'Economie',   sub: 'micro · macro · finanțe',   icon: '€', est: '5 module · 30 min' },
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
    this.resize = this.resize.bind(this);
    this.tick = this.tick.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
    this.spawn();
    requestAnimationFrame(this.tick);
  }
  resize() {
    const c = this.canvas;
    const w = c.offsetWidth, h = c.offsetHeight;
    c.width = w * this.dpr; c.height = h * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.W = w; this.H = h;
  }
  spawn() {
    this.particles = Array.from({ length: this.density }, () => this.makeParticle(true));
  }
  makeParticle(initial = false) {
    return {
      x: Math.random() * this.W,
      y: initial ? Math.random() * this.H : this.H + 10,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -0.15 - Math.random() * this.maxSpeed,
      r: 0.6 + Math.random() * 1.6,
      alpha: 0,
      maxAlpha: 0.35 + Math.random() * 0.55,
      life: 0,
      maxLife: 800 + Math.random() * 1200,
      hueShift: Math.random() < 0.3 ? 1 : 0,
      flicker: Math.random() * Math.PI * 2,
      flickerSpeed: 0.04 + Math.random() * 0.06,
    };
  }
  tick() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.x += p.vx + Math.sin(p.life * 0.005) * 0.3;
      p.y += p.vy;
      p.life += 1;
      p.flicker += p.flickerSpeed;
      const lifeRatio = p.life / p.maxLife;
      if (lifeRatio < 0.15) p.alpha = (lifeRatio / 0.15) * p.maxAlpha;
      else if (lifeRatio > 0.7) p.alpha = ((1 - lifeRatio) / 0.3) * p.maxAlpha;
      else p.alpha = p.maxAlpha;
      p.alpha *= 0.7 + Math.sin(p.flicker) * 0.3;
      if (p.y < -20 || p.life > p.maxLife) {
        this.particles[i] = this.makeParticle();
        continue;
      }
      const color = p.hueShift
        ? `rgba(255, 255, 217, ${p.alpha})`
        : `rgba(239, 221, 141, ${p.alpha})`;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
      grad.addColorStop(0, color);
      grad.addColorStop(0.4, `rgba(239, 221, 141, ${p.alpha * 0.4})`);
      grad.addColorStop(1, 'rgba(239, 221, 141, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255, 246, 204, ${p.alpha * 0.9})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(this.tick);
  }
}
const embers = new EmbersBackground($('#embersCanvas'), { density: 40 });

// =========================================================
// ORB FACE — eyes + mouth, state-driven expressions
// =========================================================
const orbFlyer = $('#orbFlyer');
const theOrb   = $('#theOrb');
const eyesG    = $('.face-eyes', theOrb);
const mouth    = $('.mouth', theOrb);
const eyeL     = $('.eye-l', theOrb);
const eyeR     = $('.eye-r', theOrb);

// Mouth path presets per state — same structure (M..Q..) for clean morph
const MOUTH_PATHS = {
  idle:        'M 40 65 Q 50 67 60 65',
  listening:   'M 40 65 Q 50 67 60 65',
  thinking:    'M 44 66 Q 50 64 56 66',
  speakingA:   'M 40 65 Q 50 67 60 65', // closed
  speakingB:   'M 40 64 Q 50 71 60 64', // open
  speakingC:   'M 40 65 Q 50 69 60 65', // half
  happy:       'M 35 62 Q 50 76 65 62',
  sad:         'M 35 70 Q 50 61 65 70',
  confused:    'M 38 66 Q 50 63 62 69',
  celebrating: 'M 32 60 Q 50 80 68 60',
};

const ORB_STATES = ['idle', 'listening', 'thinking', 'speaking', 'celebrating', 'confused', 'sad', 'happy'];
let currentOrbState = 'idle';
let speakingTimeline = null;
let blinkTimeout = null;
let isBlinking = false;

const orbFace = $('.orb-face', theOrb);

function setMouth(name) {
  const path = MOUTH_PATHS[name] || MOUTH_PATHS.idle;
  // Smooth morph via attribute interpolation: GSAP can't morph SVG path strings
  // without MorphSVG, so we use a simple animated transition by setting d via
  // requestAnimationFrame interpolating Q control points.
  morphMouthTo(path);
}

let mouthTween = null;
function morphMouthTo(targetD) {
  const cur = parseQuadPath(mouth.getAttribute('d'));
  const tgt = parseQuadPath(targetD);
  if (!cur || !tgt) {
    mouth.setAttribute('d', targetD);
    return;
  }
  const obj = { ...cur };
  if (mouthTween) mouthTween.kill();
  mouthTween = gsap.to(obj, {
    mx: tgt.mx, my: tgt.my, cx: tgt.cx, cy: tgt.cy, ex: tgt.ex, ey: tgt.ey,
    duration: 0.45, ease: 'power2.out',
    onUpdate: () => {
      mouth.setAttribute('d',
        `M ${obj.mx.toFixed(2)} ${obj.my.toFixed(2)} Q ${obj.cx.toFixed(2)} ${obj.cy.toFixed(2)} ${obj.ex.toFixed(2)} ${obj.ey.toFixed(2)}`);
    },
  });
}

function parseQuadPath(d) {
  // Expects "M x y Q cx cy ex ey"
  const m = d.match(/M\s*([-\d.]+)\s+([-\d.]+)\s*Q\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
  if (!m) return null;
  return { mx: +m[1], my: +m[2], cx: +m[3], cy: +m[4], ex: +m[5], ey: +m[6] };
}

function setOrbState(name) {
  if (!ORB_STATES.includes(name)) return;
  ORB_STATES.forEach(s => theOrb.classList.remove('is-' + s));
  if (name !== 'idle') theOrb.classList.add('is-' + name);
  currentOrbState = name;

  if (speakingTimeline) { speakingTimeline.kill(); speakingTimeline = null; }

  // Apply face expression — eyes via CSS state classes, mouth via JS path morph
  if (name === 'speaking') {
    speakingTimeline = gsap.timeline({ repeat: -1 });
    const pattern = ['speakingA','speakingB','speakingA','speakingC','speakingB','speakingA'];
    pattern.forEach(p => {
      speakingTimeline.add(() => morphMouthTo(MOUTH_PATHS[p]));
      speakingTimeline.to({}, { duration: 0.18 });
    });
  } else {
    setMouth(name);
  }

  // Update label & emotion buttons
  const labelEl = $('#orbState');
  if (labelEl) labelEl.textContent = name === 'idle' ? 'ascultă' : name;
  $$('.emotion-btn').forEach(b => b.classList.toggle('is-on', b.dataset.emotion === name));

  // Restart blink loop (skip blink when sad/happy/celebrating since eyes already closed-ish)
  if (blinkTimeout) clearTimeout(blinkTimeout);
  if (!['happy', 'celebrating', 'sad'].includes(name)) {
    scheduleBlink();
  }
}

function scheduleBlink() {
  blinkTimeout = setTimeout(() => {
    if (isBlinking) return;
    isBlinking = true;
    orbFace.classList.add('blink');
    setTimeout(() => {
      orbFace.classList.remove('blink');
      isBlinking = false;
      scheduleBlink();
    }, 110);
  }, 2400 + Math.random() * 3000);
}

// =========================================================
// ORB POSITIONING — direct GSAP tween (no FLIP teleport)
// =========================================================

function getHostRect(viewName) {
  let host;
  if (viewName === 'welcome')               host = $('[data-orb-host="welcome"]');
  else if (viewName === 'home')             host = $('[data-orb-host="home"]');
  else if (viewName.startsWith('onboarding-')) host = $(`[data-orb-host="${viewName}"]`);
  else if (viewName === 'lesson')           host = $('[data-orb-host="lesson"]');
  else if (viewName === 'celebrate')        host = $('[data-orb-host="celebrate"]');
  return host;
}

function placeOrbInstantlyAt(viewName) {
  const host = getHostRect(viewName);
  if (!host) return;
  const r = host.getBoundingClientRect();
  gsap.set(orbFlyer, { x: r.left, y: r.top, width: r.width, height: r.height });
}

function moveOrbToHost(viewName, opts = {}) {
  const host = getHostRect(viewName);
  if (!host) return;
  const r = host.getBoundingClientRect();
  gsap.to(orbFlyer, {
    x: r.left, y: r.top, width: r.width, height: r.height,
    duration: opts.duration ?? 0.85,
    ease: opts.ease ?? 'power3.inOut',
  });
}

// =========================================================
// VIEW SWITCHING
// =========================================================

function showView(name) {
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

  // Hide orb for views without an orb host (vocab, settings)
  const hasOrb = ['welcome', 'home', 'lesson', 'celebrate'].includes(name) || name.startsWith('onboarding-');
  orbFlyer.style.opacity = hasOrb ? '1' : '0';
  orbFlyer.style.pointerEvents = hasOrb ? '' : 'none';

  // Animate orb to its host for this view
  if (hasOrb) moveOrbToHost(name);

  // Toggle in-lesson body class so background FX calm down for reading
  // Force-focus setting from Settings also reduces FX everywhere
  const focused = (name === 'lesson') || Store.get().settings.forceFocus;
  document.body.classList.toggle('in-lesson', focused);

  // Update topnav-links is-active across every page-style nav
  $$('[data-page-nav] li').forEach(li => {
    const link = li.querySelector('[data-go]');
    li.classList.toggle('is-active', !!(link && link.dataset.go === name));
  });

  // Persist last view (so refresh resumes here — except welcome, that's first-run only)
  if (['home', 'lesson', 'vocab', 'settings'].includes(name)) {
    Store.get().lastView = name;
    Store.save();
  }

  // View-specific init
  if (name === 'vocab')    renderVocab();
  if (name === 'settings') initSettingsView();

  // Drive orb state
  if (name === 'welcome')           setOrbState('idle');
  else if (name === 'home')         setOrbState('happy');
  else if (name === 'onboarding-1') setOrbState('listening');
  else if (name === 'onboarding-2') setOrbState('listening');
  else if (name === 'onboarding-3') setOrbState('listening');
  else if (name === 'onboarding-4') { setOrbState('thinking'); runGeneration(); }
  else if (name === 'lesson')       { setOrbState('idle'); initLesson(); }

  const el = $(`.view[data-view="${name}"]`);
  if (el && window.gsap) {
    gsap.from(el.querySelectorAll('.h1, .display, .lead, .card-grid, .topic-grid, .topic-custom, .level-grid, .gen-list, .gen-bar, .gen-pct, .lesson-card, .topnav, .ctxbar, .lesson-progress, .cta-row, .ob-progress, .orb-line, .footnote'), {
      opacity: 0, y: 8, duration: .45, stagger: .03, ease: 'power2.out', delay: .15
    });
  }
}

window.addEventListener('load', () => {
  // Position orb instantly on welcome host
  placeOrbInstantlyAt('welcome');
  setOrbState('idle');

  // Re-anchor on resize
  window.addEventListener('resize', () => placeOrbInstantlyAt(state.view));

  gsap.from('.welcome-wrap .display',  { y: 24, opacity: 0, duration: .9, delay: .3, ease: 'power3.out' });
  gsap.from('.welcome-wrap .lead',     { y: 14, opacity: 0, duration: .8, delay: .55, ease: 'power3.out' });
  gsap.from('.welcome-wrap .btn',      { y: 10, opacity: 0, duration: .7, delay: .75, ease: 'power3.out' });
  gsap.from('.welcome-wrap .footnote', { opacity: 0, duration: .6, delay: .95 });
});

// Wire navigation
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

// Emotion demo buttons
$$('.emotion-btn').forEach(b => {
  b.addEventListener('click', () => setOrbState(b.dataset.emotion));
});

// =========================================================
// GENERATION SCREEN
// =========================================================
let genTl;

function runGeneration() {
  const items = $$('#genList li');
  const fill = $('#genBarFill');
  const pct  = $('#genPct');
  const stream = $('#genStream');
  const thread = $('#genThreadFill');

  items.forEach(li => { li.classList.remove('is-active','is-done'); });
  if (fill) gsap.set(fill, { width: '0%' });
  if (thread) gsap.set(thread, { height: '0%' });
  if (pct) pct.textContent = '0%';

  const streamCtx = startStreamCanvas(stream);

  if (genTl) genTl.kill();
  genTl = gsap.timeline();

  const stepDuration = 1.0;
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

  genTl.add(() => {
    setOrbState('happy');
    streamCtx.stop();
    showView('lesson');
  }, '+=0.6');
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
  $$('.lesson-card .tab').forEach(tab => {
    if (tab.dataset.bound) return;
    tab.dataset.bound = '1';
    tab.addEventListener('click', () => {
      const t = tab.dataset.tab;
      $$('.lesson-card .tab').forEach(x => x.classList.toggle('is-active', x === tab));
      $$('.lesson-card .tab-pane').forEach(p => p.classList.toggle('is-active', p.dataset.pane === t));
      gsap.from('.tab-pane.is-active', { opacity: 0, y: 6, duration: .35, ease: 'power2.out' });
    });
  });

  // Initial paint of progress
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
        Store.get().xpToday += 47;
        Store.get().xpTotal += 47;
        Store.save();
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
        setOrbState('celebrating');
        orbBubble('Exact. Ți-ai prins ideea.');
        showToast('+12 XP · răspuns corect', '✓');
        Store.get().xpToday += 12;
        Store.get().xpTotal += 12;
        Store.save();
        setTimeout(() => setOrbState('happy'), 1200);
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
// "Explică-mi" microinteraction
// =========================================================
const chip = $('#explainChip');
const popover = $('#explainPopover');
let lastSelectionRect = null;
let lastSelectedText = '';

document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) { chip.classList.remove('is-on'); return; }
  const text = sel.toString().trim();
  if (text.length < 2) { chip.classList.remove('is-on'); return; }
  const range = sel.getRangeAt(0);
  const node = range.commonAncestorContainer;
  const lessonCard = (node.nodeType === 1 ? node : node.parentElement)?.closest?.('.lesson-card');
  if (!lessonCard) { chip.classList.remove('is-on'); return; }
  const rect = range.getBoundingClientRect();
  if (!rect || rect.width === 0) return;
  lastSelectionRect = rect;
  lastSelectedText = text;
  chip.style.left = (rect.left + rect.width / 2) + 'px';
  chip.style.top  = (rect.top + window.scrollY) + 'px';
  chip.classList.add('is-on');
});

chip.addEventListener('click', () => {
  chip.classList.remove('is-on');
  showExplainPopover(lastSelectionRect, lastSelectedText);
});

function showExplainPopover(rect, text) {
  if (!rect) return;
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

popover.addEventListener('click', (e) => {
  const pill = e.target.closest('.pill[data-mode]');
  if (pill) {
    $$('.explain-pills .pill').forEach(p => p.classList.toggle('is-on', p === pill));
    setExplain(pill.dataset.mode, lastSelectedText);
  }
});

$('#explainClose').addEventListener('click', () => {
  popover.classList.remove('is-on');
  setOrbState('idle');
  orbBubble('Spune „Explică-mi" dacă ceva nu e clar.');
});

$('#saveWord').addEventListener('click', () => {
  const btn = $('#saveWord');
  const word = (lastSelectedText || '').trim();
  if (!word) {
    showToast('selectează un cuvânt mai întâi', '!');
    return;
  }
  const data = Store.get();
  const id = 'custom_' + word.toLowerCase().replace(/[^a-z0-9ăâîșț]+/gi, '_').slice(0, 32);
  if (!data.customWords.find(w => w.id === id)) {
    data.customWords.unshift({
      id,
      word: word.length > 32 ? word.slice(0, 32) + '…' : word,
      def: 'Salvat din lecție. Apasă ca să vezi explicația când revii.',
      tag: 'new',
      source: 'M2 · L4',
      addedAt: Date.now(),
    });
    Store.save();
  }
  refreshVocabCounters();
  btn.textContent = '✓ Salvat în vocabular';
  showToast('salvat în vocabular', '+');
  setTimeout(() => { btn.textContent = '+ Salvează în vocabular'; }, 1800);
});

// =========================================================
// CELEBRATION
// =========================================================
let celebrateFx = null;

function celebrate() {
  const overlay = $('#celebrate');
  overlay.classList.add('is-on');
  gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: .25 });
  gsap.fromTo('.celebrate-card', { scale: .92, y: 12, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: .6, ease: 'back.out(1.6)' });

  moveOrbToHost('celebrate', { duration: .6 });
  setOrbState('celebrating');

  if (celebrateFx) celebrateFx.stop();
  celebrateFx = startCelebrateFx($('#celebrateFx'));
}

$('#celebrateClose').addEventListener('click', closeCelebrate);
$('#celebrateNext').addEventListener('click',  closeCelebrate);

function closeCelebrate() {
  const overlay = $('#celebrate');
  if (celebrateFx) { celebrateFx.stop(); celebrateFx = null; }
  gsap.to(overlay, { opacity: 0, duration: .25, onComplete: () => {
    overlay.classList.remove('is-on');
    moveOrbToHost('lesson');
    setOrbState('idle');
  }});
}

$('#triggerCelebrate').addEventListener('click', () => {
  if (state.view !== 'lesson') {
    showView('lesson');
    setTimeout(celebrate, 700);
  } else {
    celebrate();
  }
});

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

// =========================================================
// VOCABULAR
// =========================================================
const VOCAB_WORDS = [
  { id: 'param',     word: 'parametru',     def: 'Variabilă locală a unei funcții, legată la apel de un argument.', tag: 'review',  source: 'M2 · L4', code: 'def f(<b>x</b>):' },
  { id: 'arg',       word: 'argument',      def: 'Valoarea pe care o dai funcției la apel (umpli „cutia" parametrului).', tag: 'review', source: 'M2 · L4', code: 'f(<b>5</b>)' },
  { id: 'fstring',   word: 'f-string',      def: 'String cu interpolare: pune variabile direct între acolade.', tag: 'review',  source: 'M2 · L3', code: 'f"Salut, {nume}!"' },
  { id: 'scope',     word: 'scope',         def: 'Zona în care o variabilă există. Local funcției ≠ global.',         tag: 'new',     source: 'M2 · L4', code: 'def f(): x = 1' },
  { id: 'return',    word: 'return',        def: 'Trimite o valoare înapoi din funcție și oprește execuția.',          tag: 'new',     source: 'M2 · L3', code: 'return x*2' },
  { id: 'list',      word: 'listă',         def: 'Colecție ordonată, mutabilă, indexată de la 0.',                      tag: 'known',   source: 'M2 · L1', code: '[1, 2, 3]' },
  { id: 'dict',      word: 'dicționar',     def: 'Pereche cheie → valoare. Cheie unică, valoare orice.',                tag: 'known',   source: 'M2 · L2', code: "{'a': 1}" },
  { id: 'tuple',     word: 'tuplu',         def: 'Listă imutabilă. O dată fixată, nu se mai schimbă.',                  tag: 'known',   source: 'M2 · L2', code: '(1, 2, 3)' },
  { id: 'iter',      word: 'iterator',      def: 'Obiect care produce valori una câte una pe „next()".',                tag: 'new',     source: 'M3 · L1', code: 'iter([1,2])' },
  { id: 'comp',      word: 'comprehension', def: 'Mod compact de a construi liste/dict/seturi.',                        tag: 'new',     source: 'M3 · L1', code: '[x*2 for x in xs]' },
  { id: 'lambda',    word: 'lambda',        def: 'Funcție mică fără nume, definită inline.',                             tag: 'review',  source: 'M3 · L2', code: 'lambda x: x+1' },
  { id: 'recursion', word: 'recursie',      def: 'Funcție care se cheamă pe ea însăși până la cazul de bază.',           tag: 'review',  source: 'M3 · L3', code: 'def f(n): return f(n-1)' },
  { id: 'closure',   word: 'closure',       def: 'Funcție care „își amintește" variabilele din contextul în care a fost creată.', tag: 'new', source: 'M3 · L4', code: 'def outer(): x=1; def inner(): print(x); return inner' },
  { id: 'mutable',   word: 'mutabil',       def: 'Obiect care se poate modifica după creare (listă, dict).',           tag: 'known',   source: 'M2 · L2', code: 'l.append(4)' },
  { id: 'immutable', word: 'imutabil',      def: 'Obiect care nu se poate modifica (string, tuplu, int).',              tag: 'known',   source: 'M2 · L2', code: 's = "abc"' },
  { id: 'try',       word: 'try / except',  def: 'Prinzi o eroare în loc să crape programul.',                          tag: 'review',  source: 'M4 · L1', code: 'try: ... except: ...' },
  { id: 'class',     word: 'clasă',         def: 'Șablon care produce obiecte cu date și comportament.',                 tag: 'new',     source: 'M5 · L1', code: 'class Cat: ...' },
  { id: 'inh',       word: 'moștenire',     def: 'O clasă preia comportamentul alteia și-l extinde.',                    tag: 'new',     source: 'M5 · L2', code: 'class Dog(Animal): ...' },
];

let activeVocabFilter = 'all';

function refreshVocabCounters() {
  const data = Store.get();
  const total = VOCAB_WORDS.length + (data.customWords || []).length;
  $$('[data-vocab-total]').forEach(el => { el.textContent = total; });
}

function renderVocab() {
  const grid = $('#vocabGrid');
  const empty = $('#vocabEmpty');
  if (!grid) return;

  const data = Store.get();
  const known = new Set(data.knownWords || []);
  const all = [
    ...(data.customWords || []),
    ...VOCAB_WORDS,
  ].map(w => ({ ...w, tag: known.has(w.id) ? 'known' : (w.tag || 'new') }));

  const search = ($('#vocabSearch')?.value || '').trim().toLowerCase();
  const filtered = all.filter(w => {
    if (activeVocabFilter !== 'all' && w.tag !== activeVocabFilter) return false;
    if (search) {
      const blob = (w.word + ' ' + w.def).toLowerCase();
      if (!blob.includes(search)) return false;
    }
    return true;
  });

  grid.innerHTML = '';
  if (filtered.length === 0) {
    empty?.removeAttribute('hidden');
    return;
  }
  empty?.setAttribute('hidden', '');

  const tagLabel = { new: 'nou', review: 'de reluat', known: 'știut' };
  filtered.forEach(w => {
    const card = document.createElement('div');
    card.className = 'vocab-card' + (w.tag === 'known' ? ' is-known' : '');
    card.innerHTML = `
      <span class="vocab-word">${escapeHtml(w.word)}</span>
      <span class="vocab-def">${w.def}${w.code ? ` <code>${w.code}</code>` : ''}</span>
      <span class="vocab-meta">
        <span class="vocab-tag tag-${w.tag}">${tagLabel[w.tag] || w.tag}</span>
        <span class="vocab-source">${w.source || ''}</span>
        <button class="vocab-known-btn" data-known-id="${w.id}">${w.tag === 'known' ? '✓ știu' : 'știu'}</button>
      </span>
    `;
    card.querySelector('.vocab-known-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const data = Store.get();
      const set = new Set(data.knownWords || []);
      if (set.has(w.id)) set.delete(w.id);
      else set.add(w.id);
      data.knownWords = Array.from(set);
      Store.save();
      renderVocab();
      showToast(set.has(w.id) ? `„${w.word}" marcat ca știut` : `„${w.word}" e iar de reluat`, '✓');
    });
    card.addEventListener('click', () => {
      showToast(`${w.word}: ${w.def.slice(0, 70)}${w.def.length > 70 ? '…' : ''}`, 'i');
    });
    grid.appendChild(card);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Wire vocab toolbar
window.addEventListener('DOMContentLoaded', () => {
  const search = $('#vocabSearch');
  if (search) {
    search.addEventListener('input', () => renderVocab());
  }
  const filters = $('#vocabFilters');
  if (filters) {
    filters.addEventListener('click', (e) => {
      const b = e.target.closest('[data-vfilter]');
      if (!b) return;
      $$('[data-vfilter]', filters).forEach(x => x.classList.toggle('is-on', x === b));
      activeVocabFilter = b.dataset.vfilter;
      renderVocab();
    });
  }
});

// =========================================================
// SETTINGS
// =========================================================
function initSettingsView() {
  const data = Store.get();
  const s = data.settings;

  // Toggles
  $$('.toggle-input[data-setting]').forEach(input => {
    const key = input.dataset.setting;
    input.checked = !!s[key];
    if (input.dataset.bound) return;
    input.dataset.bound = '1';
    input.addEventListener('change', () => {
      s[key] = input.checked;
      Store.save();
      applySettings();
      showToast(input.checked ? 'pornit' : 'oprit', '✓');
    });
  });

  // Segmented pickers
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
      showToast(`${key} → ${b.dataset.val}`, '✓');
    });
  });

  // Slider
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
      });
    }
  }

  // Reset
  const reset = $('#resetData');
  if (reset && !reset.dataset.bound) {
    reset.dataset.bound = '1';
    reset.addEventListener('click', () => {
      Store.reset();
      applySettings();
      refreshGlobalUI();
      initSettingsView();
      showToast('demo resetat — toate datele șterse', '⟳');
    });
  }
}

function applySettings() {
  const s = Store.get().settings;
  document.documentElement.style.setProperty('--embers-opacity', (s.embersIntensity / 100).toFixed(2));
  document.body.classList.toggle('force-focus', !!s.forceFocus);
  document.body.classList.toggle('silent', !!s.silent);
  // Refresh in-lesson focus toggle
  const focused = state.view === 'lesson' || s.forceFocus;
  document.body.classList.toggle('in-lesson', focused);
}

// =========================================================
// GLOBAL UI REFRESH (streak, vocab count, xp)
// =========================================================
function refreshGlobalUI() {
  const data = Store.get();
  $$('[data-streak]').forEach(el => { el.textContent = data.streak; });
  $$('[data-xp-total]').forEach(el => { el.textContent = data.xpTotal; });
  refreshVocabCounters();
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
      showToast(pauseEmbersFlag ? 'particule \u00een pauz\u0103' : 'particule reluate', '⏸');
    });
  }

  // Recent items click → switch to lesson
  $$('.recent-item').forEach(el => {
    el.addEventListener('click', () => {
      showView('lesson');
    });
  });

  // "Vezi toate" button → vocab page (placeholder)
  $$('.btn-link[data-go-list]').forEach(el => {
    el.addEventListener('click', () => showView('vocab'));
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
  refreshGlobalUI();
  refreshVocabCounters();

  const last = Store.get().lastView;
  if (last && last !== 'welcome' && ['home', 'lesson', 'vocab', 'settings'].includes(last)) {
    // Returning user — go straight to last view (most often home)
    setTimeout(() => showView(last), 50);
  }
});
