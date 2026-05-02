# Wispucci — Backend TODO

> Acest prototip e 100% frontend. Toată logica e în `app.js` și starea
> persistă în `localStorage` sub cheia `wispucci.v1`. Mai jos e exact ce
> trebuie să construiești în backend ca să devină produs real.

## Stack sugerat (alege)

| Opțiune | Punct forte | Slăbiciune |
|---|---|---|
| **Supabase** | Postgres + Auth + Storage + Realtime gata. Tu doar scrii Edge Functions pentru AI. | Vendor-lock parțial. |
| **FastAPI + Postgres + Redis** | Flexibil, control total, ușor de scalat. | Tu administrezi infra. |
| **Next.js Route Handlers + Drizzle + Postgres** | 1 repo, 1 deploy, 1 limbaj. | Fără Realtime nativ — adaugi Pusher/Ably. |
| **Hono + Cloudflare Workers + D1** | Edge-first, ieftin, latență mică. | D1 încă imatur. |

**Recomandare:** **Supabase** dacă vrei să ajungi rapid în producție, **FastAPI** dacă vrei flexibilitate maximă pentru AI streaming.

---

## Modele de date (Postgres / Supabase)

```sql
-- Utilizatori
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  language text default 'ro',
  created_at timestamptz default now(),
  -- Profil învățare
  current_subject text,                -- ex: 'Programare'
  current_topic text,                  -- ex: 'Python — bazele'
  current_level smallint default 1,    -- 0..3
  -- Streak / XP
  streak_days int default 0,
  longest_streak int default 0,
  last_streak_day date,
  xp_total int default 0,
  -- Setări (vezi /api/me/settings)
  settings jsonb default '{
    "forceFocus": false,
    "silent": false,
    "tone": "cald",
    "pace": "normal",
    "embersIntensity": 60
  }'::jsonb
);

-- Module & lecții (conținut)
create table modules (
  id uuid primary key default gen_random_uuid(),
  subject text not null,               -- 'Programare', 'Limbă', etc.
  topic text not null,                 -- 'Python — bazele', 'JavaScript modern', ...
  level smallint not null,             -- 0..3
  index smallint not null,             -- ordinea modulului în topic
  title text not null,                 -- 'Funcții'
  summary text,
  estimated_minutes int,
  unique (subject, topic, level, index)
);

create table lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid references modules(id) on delete cascade,
  index smallint not null,             -- L1, L2, L3, L4
  title text not null,                 -- 'Funcții cu parametri'
  body markdown,                       -- conținut teorie
  practice jsonb,                      -- { type, code, blanks, expected }
  notes_template markdown,
  unique (module_id, index)
);

-- Progresul utilizatorului
create table user_progress (
  user_id uuid references users(id) on delete cascade,
  lesson_id uuid references lessons(id) on delete cascade,
  progress_pct smallint default 0,     -- 0..100
  completed_at timestamptz,
  attempts int default 0,
  last_seen_at timestamptz default now(),
  primary key (user_id, lesson_id)
);

-- Vocabular
create table vocab_words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  word text not null,
  definition text not null,
  source_lesson_id uuid references lessons(id) on delete set null,
  code_example text,
  tag text default 'new',              -- 'new' | 'review' | 'known'
  added_at timestamptz default now(),
  last_seen_at timestamptz,
  unique (user_id, word)
);

-- Evenimente (audit / analiză)
create table events (
  id bigserial primary key,
  user_id uuid references users(id) on delete cascade,
  type text not null,                  -- 'lesson_started', 'lesson_completed', 'word_saved', 'explain_used', 'streak_extended', 'lesson_failed_question'
  payload jsonb,
  created_at timestamptz default now()
);

-- Conversații cu AI tutor (pt context & istoric)
create table tutor_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  lesson_id uuid references lessons(id) on delete set null,
  started_at timestamptz default now()
);

create table tutor_messages (
  id bigserial primary key,
  conversation_id uuid references tutor_conversations(id) on delete cascade,
  role text not null,                  -- 'user' | 'assistant' | 'system'
  content text not null,
  mode text,                           -- 'simple' | 'example' | 'tehnic'
  selected_text text,                  -- ce a evidențiat user-ul când a apăsat „Explică-mi"
  created_at timestamptz default now()
);
```

---

## Endpoints REST

### Auth
```
POST /api/auth/signup       { email, password, name }       → { token, user }
POST /api/auth/login        { email, password }             → { token, user }
POST /api/auth/logout       —                               → { ok }
POST /api/auth/forgot       { email }                       → { ok }
GET  /api/me                Bearer                          → { user }
```

### Settings
```
GET  /api/me/settings                       → { settings }
PUT  /api/me/settings  { settings }         → { settings }
DELETE /api/me/data    (rezetare demo)      → { ok }
```

### Lecții
```
GET  /api/modules?subject=Programare&topic=Python&level=2    → [{ module + lessons }]
GET  /api/lessons/:id                                        → { lesson, progress }
POST /api/lessons/:id/progress  { progress_pct }             → { progress }
POST /api/lessons/:id/complete  { final_score? }             → { progress, xp_gained, new_streak }
POST /api/lessons/:id/check     { answers }                  → { correct, hint?, feedback }
```

### Vocabular
```
GET    /api/vocab?filter=all|new|known|review&q=…   → [{ vocab_word }]
POST   /api/vocab                { word, def, source_lesson_id, code }
PATCH  /api/vocab/:id            { tag, def? }
DELETE /api/vocab/:id
```

### Streak / XP
```
GET  /api/me/streak     → { streak_days, longest_streak, last_streak_day }
POST /api/me/streak/extend   (când termini lecție)   → { streak_days, longest_streak }
GET  /api/me/xp/week    → { xp_today, xp_week, xp_total, by_day: [...] }
```

### AI tutor (cel mai important)
```
POST /api/tutor/explain
  body: {
    selected_text: "parametru",
    mode: "simple" | "example" | "tehnic",
    lesson_id: uuid,
    conversation_id?: uuid    // dacă continui o conversație
  }
  → stream (Server-Sent Events) {
    event: 'token',  data: '...'
    event: 'done',   data: { conversation_id, message_id, full_text }
  }

POST /api/tutor/lesson/build
  body: {
    subject, topic, level, user_focus_areas: [...]
  }
  → stream (SSE) {
    event: 'module_start',  data: { index, title }
    event: 'module_chunk',  data: { index, text }
    event: 'module_done',   data: { index, lesson_id }
    event: 'done',          data: { module_id, lessons: [...] }
  }
```

### Telemetrie
```
POST /api/events  { type, payload }   → { ok }
```

---

## Punctele de integrare exact din `app.js`

Înlocuiește acest cod cu apeluri reale când backend-ul e gata:

| Loc în `app.js` | Acum face | Înlocuiește cu |
|---|---|---|
| `Store.get/save/reset` (top of file) | `localStorage` | `fetch('/api/me')` la load + `fetch('/api/me/settings', { method: 'PUT' })` la save |
| `runGeneration()` | timeline GSAP cu module hardcodate | `fetch('/api/tutor/lesson/build', { ... })` cu SSE — fiecare `module_start` event activează modulul în UI |
| `setExplain(mode, text)` | string-uri hardcodate | `fetch('/api/tutor/explain', { ... })` cu SSE — token-urile streamate apar în `#explainBody` |
| `checkAnswer` handler | comparație locală cu `'nume'` | `fetch('/api/lessons/:id/check', { ... })` |
| `nextStep` handler la 100% | celebrate() local | înainte: `fetch('/api/lessons/:id/complete', ...)` → `xp_gained` din răspuns vine în `Store` și apoi `celebrate()` |
| `saveWord` handler | `Store.get().customWords.unshift(...)` | `fetch('/api/vocab', { method: 'POST', ... })` |
| `vocab-known-btn` click | `Store.get().knownWords toggle` | `fetch('/api/vocab/:id', { method: 'PATCH', ... })` |
| `renderVocab()` | citește `VOCAB_WORDS` const + Store | `fetch('/api/vocab')` cu filter în query |
| onload routing | `Store.get().lastView` | `fetch('/api/me')` → dacă există progres curent, du-l la home; dacă e cont nou, welcome |

---

## AI prompt skeleton (pentru tutor)

System prompt de bază:
```
Ești Wispucci — un tutor AI. Voce caldă, scurtă, sinceră, fără jargon corporate. Scrii în limba { user.language }.
Personalitate: răbdător, curios, dă exemple concrete, întreabă „ai prins?" la fiecare 2-3 idei.
Niciodată nu condescendent. Niciodată „great question!".
Niveluri:
- mode=simple: vorbește ca unui prieten (analogii din viața reală, fără cod la prima frază).
- mode=example: dă un exemplu concret (cod / problema reală), apoi explică-l linie cu linie.
- mode=tehnic: definiție corectă + edge cases, fără analogii. Pentru cineva care vrea să înțeleagă.
Ton: { user.settings.tone } — „cald" / „prieten" / „profesionist".
Ritm: { user.settings.pace } — „lent" (mult context, mai multe verificări), „normal", „rapid" (răspuns scurt, direct).
```

User prompt când userul apasă „Explică-mi":
```
Userul citește lecția „{ lesson.title }" și a evidențiat textul:
„{ selected_text }"
Modul: { mode }
Explică în 2-4 propoziții. Dacă e simple, dă o analogie. Dacă e example, dă cod. Dacă e tehnic, dă definiția exactă.
```

---

## Realtime

- **Streak update** când userul completează prima lecție a zilei → push notif (web push API) prin Supabase Realtime sau WebSocket.
- **Explică-mi streaming** prin SSE (Server-Sent Events) — frontend-ul afișează token cu token în `#explainBody`.

---

## Securitate

- **Rate limit** `/api/tutor/*` la 30 req/h per user (AI e scump).
- **Sanitizează** orice text venit de la user înainte să-l trimiți la AI (PII scrubbing dacă e nevoie).
- **OWASP:** input validation, JWT cu expirare 24h, CORS strict pe domeniul de prod.

---

## Ce poate aștepta (v2)

- **Voice mode** (Wispucci vorbește) — Eleven Labs / OpenAI TTS, redă audio în loc de bubble text.
- **Spaced repetition** pentru vocabular (algoritm SM-2 sau FSRS) — cuvintele reapar la intervale calculate.
- **Achievements** vizuale (insigne pentru streak 7/30/100, primul modul terminat, etc.).
- **Friends / leaderboard** opțional — peer-pressure pozitivă.
- **Mobile app** (PWA install / Capacitor wrapper).

---

## Ce am făcut deja în frontend (poți miza pe el)

- ✅ Toate view-urile: Welcome, Home, 4 onboarding, Generation, Lesson, Vocabular, Settings, Celebrate
- ✅ Tranziții shared-element (Orb-ul zboară între view-uri cu GSAP)
- ✅ 8 stări vizuale ale Orb-ului cu morph SVG (idle, listening, thinking, speaking, celebrating, confused, sad, happy)
- ✅ Toast notifications + microinteracțiuni feedback
- ✅ localStorage cu schemă completă — copy-paste mental pentru tabela `users.settings`
- ✅ Vocabular: search, 4 filtre, mark-as-known, persist
- ✅ Settings: 5 toggles + slider, toate persiste
- ✅ Practice tab: input-uri reale, validare răspuns, hint, celebrate la 100%
- ✅ Cinematic background (embers + aurora + grain) — config-driven prin `--embers-opacity`
