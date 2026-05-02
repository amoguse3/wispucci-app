// =========================================================
// Wispucci demo v4 — brows + eye-shine, calm celebration, constellation generation
// =========================================================

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const state = {
  subject: 'Programare',
  topic: 'Python — bazele',
  level: 2,
  progress: 47,
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

  // Animate orb to its host for this view
  moveOrbToHost(name);

  // Toggle in-lesson body class so background FX calm down for reading
  document.body.classList.toggle('in-lesson', name === 'lesson');

  // Drive orb state
  if (name === 'welcome')           setOrbState('idle');
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

  const nextBtn = $('#nextStep');
  if (nextBtn && !nextBtn.dataset.bound) {
    nextBtn.dataset.bound = '1';
    nextBtn.addEventListener('click', () => {
      state.progress = Math.min(100, state.progress + 8);
      $('#progressFill').style.width = state.progress + '%';
      $('#progressPct').textContent = state.progress + '%';
      setOrbState('thinking');
      orbBubble('Hai să mai vedem un pas.');
      gsap.fromTo('.lesson-card', { x: 0 }, { x: -8, duration: .15, yoyo: true, repeat: 1, ease: 'power1.inOut' });
      if (state.progress >= 100) celebrate();
    });
  }
  const prevBtn = $('#prevStep');
  if (prevBtn && !prevBtn.dataset.bound) {
    prevBtn.dataset.bound = '1';
    prevBtn.addEventListener('click', () => {
      state.progress = Math.max(0, state.progress - 8);
      $('#progressFill').style.width = state.progress + '%';
      $('#progressPct').textContent = state.progress + '%';
    });
  }

  const checkBtn = $('#checkAnswer');
  if (checkBtn && !checkBtn.dataset.bound) {
    checkBtn.dataset.bound = '1';
    checkBtn.addEventListener('click', () => {
      setOrbState('happy');
      orbBubble('Foarte bine. Asta e ideea.');
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
  btn.textContent = '✓ Salvat';
  setTimeout(() => { btn.textContent = '+ Salvează în vocabular'; }, 1500);
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
