"""
Wispucci AI Tutor Skills — token-optimized teaching capabilities.

Every prompt is kept under 150 tokens to minimise cost.
Uses JSON mode for structured output — no wasted "okay let me explain" preambles.
Default model: gpt-4o-mini (cheapest per-token across all providers).
"""
import json
import hashlib
import time
from typing import Any, AsyncIterator

from backend.config import settings as cfg

# ─── Token costs (OpenAI per-1M-token, as of 2025) ─────
# gpt-4o-mini:  $0.15 / $0.60  (input/output)
# gpt-4o:       $2.50 / $10.00
# gpt-3.5-turbo: $0.50 / $1.50
# Target: under 200 tokens per response → ~$0.00012 per call

# ─── In-memory cache ────────────────────────────────────
# Caches explanation results to avoid re-calling AI for repeated text
_explain_cache: dict[str, tuple[float, str]] = {}
_CACHE_TTL = 3600  # 1 hour


def _cache_key(selected_text: str, mode: str, subject: str = "") -> str:
    raw = f"{selected_text}|{mode}|{subject}".strip().lower()
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


def _cached_get(key: str) -> str | None:
    entry = _explain_cache.get(key)
    if entry:
        ts, val = entry
        if time.time() - ts < _CACHE_TTL:
            return val
        del _explain_cache[key]
    return None


def _cached_set(key: str, val: str) -> None:
    _explain_cache[key] = (time.time(), val)
    # Prune old entries
    if len(_explain_cache) > 500:
        now = time.time()
        for k in list(_explain_cache.keys()):
            if now - _explain_cache[k][0] > _CACHE_TTL:
                del _explain_cache[k]


# ─── AI caller ──────────────────────────────────────────


async def _call_ai(
    system: str,
    user: str,
    json_mode: bool = True,
    temperature: float = 0.5,
    max_tokens: int = 384,
    model: str | None = None,
) -> str:
    """
    Call OpenAI-compatible API. Returns raw response text.
    If no API key — returns a mock.
    """
    import httpx

    model = model or cfg.AI_MODEL
    if not cfg.AI_API_KEY or cfg.AI_API_KEY.startswith("sk-your-"):
        return _mock_response(user)

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=45) as client:
        resp = await client.post(
            f"{cfg.AI_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {cfg.AI_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        if resp.status_code != 200:
            return "{}"
        data = resp.json()
        return data["choices"][0]["message"]["content"]


async def _stream_ai(
    system: str,
    user: str,
    temperature: float = 0.5,
    max_tokens: int = 384,
    model: str | None = None,
) -> AsyncIterator[str]:
    """
    Stream tokens one at a time via SSE.
    Falls back to mock when API key is missing.
    """
    import httpx

    model = model or cfg.AI_MODEL

    if not cfg.AI_API_KEY or cfg.AI_API_KEY.startswith("sk-your-"):
        mock = _mock_response(user)
        for char in mock:
            yield char
        return

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    async with httpx.AsyncClient(timeout=60) as client:
        async with client.stream(
            "POST",
            f"{cfg.AI_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {cfg.AI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": True,
            },
        ) as resp:
            if resp.status_code != 200:
                return
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:]
                if data == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                    content = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    if content:
                        yield content
                except json.JSONDecodeError:
                    continue


def _mock_response(user_prompt: str) -> str:
    """Fallback when no API key is set."""
    p = user_prompt.lower()
    if "curs" in p or "modul" in p or "lecție" in p:
        return json.dumps({
            "title": "Modul nou",
            "lessons": [
                {
                    "title": "Lecția 1: Introducere",
                    "body": "Teoria de bază a subiectului. Explicații clare, pas cu pas.",
                    "exercises": [
                        {"type": "fill", "prompt": "Completează: Un parametru este o variabilă declarată în ___ funcției.", "blanks": ["semnătura"], "hint": "Unde scrii numele funcției?"},
                    ],
                },
                {
                    "title": "Lecția 2: Aprofundare",
                    "body": "Exemple practice și edge cases.",
                    "exercises": [
                        {"type": "code", "prompt": "Scrie o funcție `dublu(n)` care returnează `n * 2`.", "expected": "def dublu(n):\n    return n * 2", "hint": "Folosește `def` și `return`."},
                    ],
                },
            ],
        }, ensure_ascii=False)
    if "exerciți" in p or "exercise" in p:
        return json.dumps({
            "exercises": [
                {"type": "fill", "prompt": "Completează: `___ salut():`", "blanks": ["def"], "hint": "Cuvântul cheie pentru a defini o funcție."},
                {"type": "choice", "prompt": "Ce face `return`?", "options": ["Oprește funcția și returnează o valoare", "Pornește un loop", "Șterge variabila"], "answer": 0},
                {"type": "code", "prompt": "Scrie o funcție care returnează suma a două numere.", "expected": "def suma(a, b):\n    return a + b", "hint": "Primești doi parametri și îi aduni."},
            ],
        }, ensure_ascii=False)
    return json.dumps({"explanation": "Conceptul se referă la o idee fundamentală. Gândește-te la el ca la un bloc de construcție."}, ensure_ascii=False)


# ═══════════════════════════════════════════════════════════
# TONE & SUBJECT GUIDANCE — applied to every prompt
# ═══════════════════════════════════════════════════════════

# Tone presets, indexed by Settings.tone. Each value is a 1-line
# instruction injected into the system prompt to shift voice.
_TONE_GUIDE = {
    "cald": (
        "Vorbește cald, ca un prieten răbdător. Tu/dumneata = NU, mereu 'tu'. "
        "Folosești 'hai', 'stai', 'gata'. Niciodată 'dragă elev', niciodată corporate."
    ),
    "prieten": (
        "Vorbești ca un prieten apropiat. Direct, casual, glumă subtilă. "
        "Memos ('clasic'), inside-jokes scurte. Niciodată jargon corporate."
    ),
    "profi": (
        "Ton profesionist, concis, fapte. Zero glume. "
        "Termeni tehnici corecți. Tot 'tu', nu dumneata."
    ),
}


# Subject-track knobs: how to teach each domain. Keep prompts short — every
# extra token costs money. These map AGENTS.md principles to model guidance.
_SUBJECT_GUIDE = {
    "Programare": (
        "Domeniu: PROGRAMARE. Cod runnable, exemple scurte (≤6 linii). "
        "Teoria explică DE CE, nu doar CE. Mereu un 'edge case' concret. "
        "Exerciții 'code' obligatorii — userul scrie cod, nu doar bifează. "
        "Aha-moment: 'codul meu rulează'."
    ),
    "Limbă străină": (
        "Domeniu: LIMBĂ STRĂINĂ. Vocabular + structuri reale folosite. "
        "Niciodată 'EU' ca pronume neutru — alege un context (ex: 'la cafenea'). "
        "Exerciții 'fill' și 'match' dominante. Pronunție în paranteze [pron]. "
        "Aha-moment: 'am zis o frază reală'."
    ),
    "Matematică": (
        "Domeniu: MATEMATICĂ. Pas cu pas vizibil. Niciodată 'evident' sau "
        "'trivial'. Exerciții 'fill' cu numere + 'choice' cu opțiuni. "
        "Aha-moment: 'am rezolvat fără ajutor'."
    ),
    "Altceva": (
        "Domeniu: GENERAL. Concepte cheie + exemplu real din viață. "
        "Mix de 'choice' și 'fill'."
    ),
}


def _tone_line(tone: str) -> str:
    return _TONE_GUIDE.get(tone, _TONE_GUIDE["cald"])


def _subject_line(subject: str) -> str:
    return _SUBJECT_GUIDE.get(subject, _SUBJECT_GUIDE["Altceva"])


# ═══════════════════════════════════════════════════════════
# SKILL 1 — GENERARE CURS / MODUL (subject + tone aware)
# ═══════════════════════════════════════════════════════════

COURSE_SYSTEM = """Ești Wispucci, tutor EdTech pentru Gen Z (12-25 ani, atenție 8s).
{tone_line}
{subject_line}

Output STRICT JSON, fără text în afara JSON. Construiești {count} lecții consecutive,
de la bază la aplicație practică. Fiecare lecție:
- title: titlu scurt cu un verb (max 40 char). NU "Lecția 1 — Introducere"; e plictisitor.
- hook: 1 propoziție în deschidere care răspunde la "DE CE-mi pasă?" (max 16 cuvinte).
- body: 120-180 cuvinte, 2-3 paragrafe scurte. Limbaj simplu. NU 'evident', NU 'trivial'.
  Strecoară 1 analogie din viața reală sau o glumă mică.
- key_terms: 2-4 concepte/cuvinte cheie ale lecției (string array). Le salvăm în Statistica.
- exercises: 2-3 exerciții cu dificultate progresivă.
- mini_game: opțional, doar 1 din 3 lecții. Tip: bug_hunter | code_assemble | output_predict
  (vezi schema mini_game mai jos).
Tipuri de exerciții:
  fill — {type:"fill", prompt:"...", blanks:["r1","r2"], hint:"..."}
  choice — {type:"choice", prompt:"...", options:["a","b","c","d"], answer:0}
  code — {type:"code", prompt:"...", expected:"cod corect", hint:"..."}
  match — {type:"match", prompt:"...", pairs:[["a","1"],["b","2"]]}
Schema mini_game (toate optional, alegi 1 tip):
  bug_hunter — {type:"bug_hunter", prompt:"găsește bug-ul", lines:["l1","l2",...], buggy_index:N, fix:"corecție"}
  code_assemble — {type:"code_assemble", prompt:"...", blocks:["b1","b2","b3"], correct_order:[2,0,1]}
  output_predict — {type:"output_predict", prompt:"...", code:"...", options:["a","b","c"], answer:0}
Răspuns DOAR JSON, zero caractere în plus."""


def _build_course_prompt(
    subject: str, topic: str, level: int, lesson_count: int = 4
) -> str:
    level_labels = {0: "zero absolut", 1: "începător", 2: "mediu", 3: "avansat"}
    lvl = level_labels.get(level, "mediu")
    return (
        f"Subiect:{subject}\nTopic:{topic}\nNivel:{lvl}({level}/3)\n"
        f"Generează {lesson_count} lecții. Prima — conceptul de bază + de ce contează. "
        f"Ultima — aplicație practică (proiect mic). "
        f"Adaugă mini_game la cel puțin 1 lecție."
    )


async def generate_course(
    subject: str,
    topic: str,
    level: int,
    lesson_count: int = 4,
    tone: str = "cald",
) -> dict:
    """
    Build a full module: subject-aware lessons + exercises + optional mini-games.
    Tone is injected per Settings (cald|prieten|profi).
    Returns parsed JSON dict with 'title', 'lessons' list.
    """
    system = (
        COURSE_SYSTEM
        .replace("{count}", str(lesson_count))
        .replace("{tone_line}", _tone_line(tone))
        .replace("{subject_line}", _subject_line(subject))
    )
    user = _build_course_prompt(subject, topic, level, lesson_count)
    raw = await _call_ai(system, user, json_mode=True, max_tokens=3072)
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        result = json.loads(_mock_response(user))
    # Ensure minimum structure
    result.setdefault("title", f"{topic} — {subject}")
    result.setdefault("lessons", [])
    return result


# ═══════════════════════════════════════════════════════════
# SKILL 4b — TWO-PASS COURSE GENERATION
# (OUTLINE FIRST → user sees structure in ~2-3s,
#  per-lesson content generated on demand / prefetched in background)
# ═══════════════════════════════════════════════════════════

OUTLINE_SYSTEM = """Ești Wispucci, tutor EdTech pentru Gen Z (12-25 ani).
{tone_line}
{subject_line}

Generează DOAR scheletul cursului — titluri și subiecte scurte.
NU genera body, NU exerciții, NU mini-game. Doar structura.

Output STRICT JSON:
{
  "title": "Titlu modul (max 40 char, captivant, NU 'Curs de Python')",
  "lessons": [
    {
      "title": "titlu scurt cu verb (max 36 char)",
      "subject": "ce acoperă în 6-10 cuvinte",
      "tags": ["3-4 keywords scurte"],
      "minutes": 5
    }
  ]
}

Lecțiile merg de la BAZĂ → APLICAȚIE PRACTICĂ. Prima lecție răspunde
la 'de ce contează'. Ultima — proiect mic concret. Tags = key concepts."""


async def generate_course_outline(
    subject: str,
    topic: str,
    level: int,
    lesson_count: int = 4,
    tone: str = "cald",
) -> dict:
    """
    Fast first pass: returns just module title + lesson titles + tags.
    Token budget: ~250 in / ~250 out → ~$0.0001, ~2-3s wall clock.
    Used to populate the gen-screen so the user sees structure in <3s
    while the per-lesson content is fetched lazily.
    """
    system = (
        OUTLINE_SYSTEM
        .replace("{tone_line}", _tone_line(tone))
        .replace("{subject_line}", _subject_line(subject))
    )
    level_labels = {0: "zero absolut", 1: "începător", 2: "mediu", 3: "avansat"}
    lvl = level_labels.get(level, "mediu")
    user = (
        f"Subiect:{subject}\nTopic:{topic}\nNivel:{lvl}\n"
        f"Generează schelet de {lesson_count} lecții, hook-driven. "
        f"Fiecare titlu ≤36 caractere, începe cu verb dacă se poate."
    )
    raw = await _call_ai(system, user, json_mode=True, max_tokens=600)
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        result = {}

    # Defensive defaults so the frontend never sees an empty UI.
    result.setdefault("title", f"{topic} — {subject}")
    if not isinstance(result.get("lessons"), list) or not result["lessons"]:
        result["lessons"] = [
            {
                "title": f"Lecția {i + 1}",
                "subject": "intro",
                "tags": [],
                "minutes": 5,
            }
            for i in range(lesson_count)
        ]
    return result


LESSON_CONTENT_SYSTEM = """Ești Wispucci, tutor EdTech pentru Gen Z (12-25 ani, atenție 8s).
{tone_line}
{subject_line}

Generezi UNA SINGURĂ lecție completă. Nu inventa altele.

Output STRICT JSON, fără text în afara JSON:
{
  "hook": "1 propoziție 'de ce-mi pasă' (max 16 cuvinte)",
  "body": "120-180 cuvinte, 2-3 paragrafe scurte. Limbaj simplu. NU 'evident' / 'trivial'.
           Strecoară 1 analogie din viața reală sau o glumă mică.",
  "key_terms": ["2-4 concepte cheie"],
  "exercises": [
    {"type":"fill","prompt":"...","blanks":["r1"],"hint":"..."},
    {"type":"choice","prompt":"...","options":["a","b","c","d"],"answer":0},
    {"type":"code","prompt":"...","expected":"cod corect","hint":"..."}
  ],
  "mini_game": null
}
Tipuri exerciții: fill | choice | code | match. 2-3 exerciții, dificultate progresivă.
mini_game: opțional. Dacă incluzi, alege UN tip:
  bug_hunter | code_assemble | output_predict | word_match (limbi)
și respectă schema lor strictă (vezi documentație internă)."""


async def generate_lesson_content(
    subject: str,
    topic: str,
    level: int,
    lesson_title: str,
    lesson_subject: str,
    position: int,
    total: int,
    tone: str = "cald",
    include_mini_game: bool = False,
) -> dict:
    """
    Second pass: full content for ONE lesson (body + exercises + optional game).
    Token budget: ~400 in / ~700 out → ~$0.0004, ~5-8s wall clock.

    Called per-lesson so the first lesson is ready quickly and the rest are
    prefetched in the background while the user reads lesson 1.
    """
    system = (
        LESSON_CONTENT_SYSTEM
        .replace("{tone_line}", _tone_line(tone))
        .replace("{subject_line}", _subject_line(subject))
    )
    level_labels = {0: "zero absolut", 1: "începător", 2: "mediu", 3: "avansat"}
    lvl = level_labels.get(level, "mediu")
    mg_hint = "Adaugă mini_game (1 obiect, vezi schema)." if include_mini_game else "mini_game = null."
    user = (
        f"Subiect:{subject}\nTopic:{topic}\nNivel:{lvl}\n"
        f"Lecția {position}/{total}: {lesson_title}\n"
        f"Acoperă: {lesson_subject}\n"
        f"{mg_hint}"
    )
    raw = await _call_ai(system, user, json_mode=True, max_tokens=1400)
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        result = {}

    # Defensive defaults
    result.setdefault("hook", "")
    result.setdefault("body", "")
    result.setdefault("key_terms", [])
    result.setdefault("exercises", [])
    if "mini_game" not in result:
        result["mini_game"] = None
    return result


# ═══════════════════════════════════════════════════════════
# SKILL 5 — GENERARE MINI-TEST (la fiecare 3 lecții)
# ═══════════════════════════════════════════════════════════

MINI_TEST_SYSTEM = """Ești Wispucci. Construiești un MINI-TEST de 5 întrebări care
amestecă concepte din mai multe lecții recente. Spaced practice. NU repeți întrebări
din lecții — le reformulezi cu alte exemple.
{tone_line}
{subject_line}

Output STRICT JSON:
{
  "title":"Mini-test: <2-4 cuvinte>",
  "questions":[
    {"type":"choice","prompt":"...","options":["a","b","c","d"],"answer":0,"explanation":"o frază de ce"},
    ...
  ]
}
Toate 5 întrebări 'choice' cu 4 opțiuni, dificultate amestecată. Zero text extra."""


async def generate_mini_test(
    subject: str,
    topic: str,
    recent_lesson_titles: list[str],
    tone: str = "cald",
) -> dict:
    """Generate a 5-question mixed mini-test from the last few lessons."""
    system = (
        MINI_TEST_SYSTEM
        .replace("{tone_line}", _tone_line(tone))
        .replace("{subject_line}", _subject_line(subject))
    )
    titles = "; ".join(recent_lesson_titles[:5]) or topic
    user = (
        f"Subiect:{subject}\nTopic:{topic}\nLecții recente:{titles}\n"
        f"5 întrebări mixate, ușor → mediu → o întrebare grea la final."
    )
    raw = await _call_ai(system, user, json_mode=True, max_tokens=900)
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        result = {
            "title": f"Mini-test: {topic}",
            "questions": [],
        }
    result.setdefault("title", f"Mini-test: {topic}")
    result.setdefault("questions", [])
    return result


# ═══════════════════════════════════════════════════════════
# SKILL 6 — GENERARE MINI-GAME (Bug Hunter / Code Assemble)
# ═══════════════════════════════════════════════════════════

MINI_GAME_SYSTEM = """Ești Wispucci. Construiești un MINI-JOC pentru o lecție.
Trebuie sub 30 secunde de joc, instant feedback, dependență viscerală.
{tone_line}
{subject_line}

Output STRICT JSON, alegi UN tip:
- bug_hunter: {"type":"bug_hunter","prompt":"...","lines":["...","..."],"buggy_index":N,"fix":"..."}
- code_assemble: {"type":"code_assemble","prompt":"...","blocks":["b1","b2","b3"],"correct_order":[2,0,1]}
- output_predict: {"type":"output_predict","prompt":"...","code":"...","options":["a","b","c","d"],"answer":N}

Regulă: pentru limbă străină folosește 'word_match' în loc:
- word_match: {"type":"word_match","prompt":"...","pairs":[["en1","ro1"],["en2","ro2"]]}
Răspuns DOAR JSON."""


async def generate_minigame(
    subject: str,
    topic: str,
    lesson_title: str,
    game_type: str = "auto",
    tone: str = "cald",
) -> dict:
    """Generate a single mini-game tied to a lesson."""
    system = (
        MINI_GAME_SYSTEM
        .replace("{tone_line}", _tone_line(tone))
        .replace("{subject_line}", _subject_line(subject))
    )
    user = (
        f"Subiect:{subject}\nTopic:{topic}\nLecția:{lesson_title}\n"
        f"Tip preferat:{game_type if game_type != 'auto' else 'alegi tu cel mai eficient'}"
    )
    raw = await _call_ai(system, user, json_mode=True, max_tokens=600)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Fallback for offline / no-key dev: trivial bug_hunter
        return {
            "type": "bug_hunter",
            "prompt": "Găsește linia greșită.",
            "lines": [
                "def saluta(nume):",
                "    print(f'Salut, {nume}!')",
                "saluta(Ana)",
            ],
            "buggy_index": 2,
            "fix": "saluta('Ana')",
        }


# ═══════════════════════════════════════════════════════════
# SKILL 2 — GENERARE EXERCIȚII
# ═══════════════════════════════════════════════════════════

EXERCISE_SYSTEM = """Ești Wispucci. Output STRICT JSON, fără text extra.
Generează exerciții educaționale. Tipuri:
  fill — {type:"fill", prompt:"...", blanks:["r1","r2"], hint:"..."}
  choice — {type:"choice", prompt:"...", options:["a","b","c","d"], answer:0}
  code — {type:"code", prompt:"...", expected:"cod corect", hint:"indiciu"}
  match — {type:"match", prompt:"...", pairs:[["a","1"],["b","2"]]}
3-5 exerciții, dificultate progresivă. Răspuns DOAR JSON."""


def _build_exercise_prompt(topic: str, level: int, focus: str = "") -> str:
    level_labels = {0: "zero", 1: "începător", 2: "mediu", 3: "avansat"}
    lvl = level_labels.get(level, "mediu")
    extra = f" Focus:{focus}." if focus else ""
    return f"Generează 3-5 exerciții despre {topic}, nivel {lvl}.{extra} Măcar 1 fill și 1 code."


async def generate_exercises(
    topic: str,
    level: int,
    focus: str = "",
    count: int = 4,
) -> list[dict]:
    """Generate exercises for a topic. Returns list of exercise dicts."""
    system = EXERCISE_SYSTEM
    user = _build_exercise_prompt(topic, level, focus)
    raw = await _call_ai(system, user, json_mode=True, max_tokens=1536)
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        result = json.loads(_mock_response(user))
    exercises = result.get("exercises", []) or []
    return exercises[:count]


# ═══════════════════════════════════════════════════════════
# SKILL 3 — EXPLICAȚIE (token-optimized, cu cache)
# ═══════════════════════════════════════════════════════════

EXPLAIN_SYSTEM_SIMPLE = "Ești Wispucci. Explică în 1-3 fraze, ca unui prieten. Fără jargon. Folosește o analogie din viața reală. Răspuns DOAR text, zero JSON."

EXPLAIN_SYSTEM_EXAMPLE = "Ești Wispucci. Explică cu un exemplu concret de cod, apoi comentează-l linie cu linie în 2-3 fraze. Răspuns DOAR text."

EXPLAIN_SYSTEM_TECH = "Ești Wispucci. Dă definiția tehnică corectă + un edge case. 2-3 fraze, precis. Răspuns DOAR text."


def _build_explain_prompt(text: str, lesson_title: str = "") -> str:
    ctx = f"Lecția:{lesson_title}. " if lesson_title else ""
    return f"{ctx}Explică:{text}"


async def generate_explanation(
    selected_text: str,
    mode: str = "simple",
    lesson_title: str = "",
    use_cache: bool = True,
) -> str:
    """
    Explain a piece of text in 1-3 sentences.
    Mode: simple | example | tehnica.
    Caches results per (text+mode+subject) for 1 hour.
    """
    # Check cache first
    key = _cache_key(selected_text, mode, lesson_title)
    if use_cache:
        cached = _cached_get(key)
        if cached:
            return cached

    system = {
        "simple": EXPLAIN_SYSTEM_SIMPLE,
        "example": EXPLAIN_SYSTEM_EXAMPLE,
        "tehnic": EXPLAIN_SYSTEM_TECH,
    }.get(mode, EXPLAIN_SYSTEM_SIMPLE)

    user = _build_explain_prompt(selected_text, lesson_title)

    # Non-streaming, short response — 128 tokens max
    result = await _call_ai(
        system, user, json_mode=False, temperature=0.5, max_tokens=128
    )

    if use_cache:
        _cached_set(key, result)

    return result


async def stream_explanation(
    selected_text: str,
    mode: str = "simple",
    lesson_title: str = "",
    use_cache: bool = True,
) -> AsyncIterator[str]:
    """Stream an explanation token-by-token. Caches the result afterwards."""
    key = _cache_key(selected_text, mode, lesson_title)
    if use_cache:
        cached = _cached_get(key)
        if cached:
            for char in cached:
                yield char
            return

    system = {
        "simple": EXPLAIN_SYSTEM_SIMPLE,
        "example": EXPLAIN_SYSTEM_EXAMPLE,
        "tehnic": EXPLAIN_SYSTEM_TECH,
    }.get(mode, EXPLAIN_SYSTEM_SIMPLE)

    user = _build_explain_prompt(selected_text, lesson_title)

    full = ""
    async for token in _stream_ai(system, user, temperature=0.5, max_tokens=128):
        full += token
        yield token

    if use_cache and full:
        _cached_set(key, full)


# ═══════════════════════════════════════════════════════════
# SKILL 4 — EVALUARE RĂSPUNS (check exercise answer)
# ═══════════════════════════════════════════════════════════

CHECK_SYSTEM = """Ești Wispucci. Evaluezi răspunsul unui elev. Output STRICT JSON:
{"correct":true/false, "feedback":"1 frază caldă, constructivă, română", "hint":"opțional — indiciu mic dacă greșit"}"""


def _build_check_prompt(exercise_prompt: str, expected: str, user_answer: str) -> str:
    return (
        f"Exercițiu:{exercise_prompt}\nRăspuns așteptat:{expected}\nRăspuns elev:{user_answer}\n"
        f"Evaluează. Corect dacă e semantic echivalent, nu trebuie să fie identic."
    )


async def check_answer(
    exercise_prompt: str,
    expected: str,
    user_answer: str,
) -> dict:
    """Evaluate a student's answer. Returns {correct, feedback, hint?}."""
    system = CHECK_SYSTEM
    user = _build_check_prompt(exercise_prompt, expected, user_answer)
    raw = await _call_ai(system, user, json_mode=True, max_tokens=160)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Simple fallback
        is_correct = user_answer.strip().lower() == expected.strip().lower()
        return {
            "correct": is_correct,
            "feedback": "Corect, bravo!" if is_correct else "Mai încearcă.",
        }
