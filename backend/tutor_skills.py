"""
Wispucci AI Tutor Skills — token-optimized teaching capabilities.

Every prompt is kept under 150 tokens to minimise cost.
Uses JSON mode for structured output — no wasted "okay let me explain" preambles.
Default model: gpt-4o-mini (cheapest per-token across all providers).
"""
import json
import hashlib
import re
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
        "Mix de 'choice' și 'fill'. Fiecare lecție trebuie să aibă un scenariu "
        "concret, nu eseu generic."
    ),
}

_GENERIC_FILLER_PATTERNS = (
    r"\b(este important|foarte important|acest subiect este|în zilele noastre)\b",
    r"\b(vom explora|vom discuta|vom învăța despre|în această lecție vom)\b",
    r"\b(pentru a înțelege mai bine|joacă un rol crucial)\b",
)


def _tone_line(tone: str) -> str:
    return _TONE_GUIDE.get(tone, _TONE_GUIDE["cald"])


def _subject_line(subject: str) -> str:
    return _SUBJECT_GUIDE.get(subject, _SUBJECT_GUIDE["Altceva"])


def _lesson_format_line(subject: str) -> str:
    if subject == "Programare":
        return (
            "Format obligatoriu: 1 rezultat runnable → 1 exemplu de cod → "
            "user editează cod. Body include bloc ```js/py/...``` și exercițiu code."
        )
    if subject == "Limbă străină":
        return (
            "Format obligatoriu: context real → 3 fraze utile → mini-dialog → "
            "user completează o replică. Include pronunție scurtă [aprox]."
        )
    if subject == "Matematică":
        return (
            "Format obligatoriu: intuiție → exemplu numeric rezolvat pe pași → "
            "user rezolvă un pas. Include formulă sau calcul concret."
        )
    return (
        "Format obligatoriu: outcome concret → model mental → scenariu real → "
        "user aplică ideea într-o situație verificabilă."
    )


# ═══════════════════════════════════════════════════════════
# SKILL 1 — GENERARE CURS / MODUL (subject + tone aware)
# ═══════════════════════════════════════════════════════════

COURSE_SYSTEM = """Ești Wispucci, tutor EdTech pentru Gen Z (12-25 ani, atenție 8s).
{tone_line}
{subject_line}
{format_line}

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
- final_check: DOAR pentru ultima lecție. Un mini-proiect/mini-test care verifică outcome-ul cursului.
Tipuri de exerciții:
  fill — {type:"fill", prompt:"...", blanks:["r1","r2"], hint:"..."}
  choice — {type:"choice", prompt:"...", options:["a","b","c","d"], answer:0}
  code — {type:"code", prompt:"...", expected:"cod corect", hint:"..."}
  match — {type:"match", prompt:"...", pairs:[["a","1"],["b","2"]]}
Schema mini_game (toate optional, alegi 1 tip):
  bug_hunter — {type:"bug_hunter", prompt:"găsește bug-ul", lines:["l1","l2",...], buggy_index:N, fix:"corecție"}
  code_assemble — {type:"code_assemble", prompt:"...", blocks:["b1","b2","b3"], correct_order:[2,0,1]}
  output_predict — {type:"output_predict", prompt:"...", code:"...", options:["a","b","c"], answer:0}
Schema final_check:
  {"type":"project|quiz","prompt":"task concret","success_criteria":["2-4 criterii verificabile"]}
Răspuns DOAR JSON, zero caractere în plus."""


def _build_course_prompt(
    subject: str, topic: str, level: int, lesson_count: int = 4
) -> str:
    level_labels = {0: "zero absolut", 1: "începător", 2: "mediu", 3: "avansat"}
    lvl = level_labels.get(level, "mediu")
    return (
        f"Subiect:{subject}\nTopic:{topic}\nNivel:{lvl}({level}/3)\n"
        f"Outcome curs: în ~20 min userul poate aplica {topic} într-un caz real.\n"
        f"Generează {lesson_count} lecții. Prima — primul rezultat concret + de ce contează. "
        f"Fiecare lecție are acțiune verificabilă. Ultima — final_check cu proiect/test mic. "
        f"Adaugă mini_game la lecția 1 sau ultima."
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
        .replace("{format_line}", _lesson_format_line(subject))
    )
    user = _build_course_prompt(subject, topic, level, lesson_count)
    best_result: dict | None = None
    best_score = -1
    for attempt in range(2):
        prompt = user
        if attempt:
            prompt += (
                "\nRegenerare: cursul anterior a fost prea slab/generic. "
                "Fiecare lecție trebuie să aibă body >=120 cuvinte, exerciții, "
                "progresie clară și final_check în ultima lecție."
            )
        raw = await _call_ai(system, prompt, json_mode=True, max_tokens=3072)
        try:
            result = json.loads(raw)
        except json.JSONDecodeError:
            result = json.loads(_mock_response(user))
        result = _normalize_course_result(result, subject, topic)
        quality = score_course_quality(result, subject=subject, topic=topic, level=level)
        result["quality"] = quality
        if quality["score"] > best_score:
            best_result = result
            best_score = quality["score"]
        if quality["passed"]:
            return result

    fallback = best_result or _normalize_course_result(json.loads(_mock_response(user)), subject, topic)
    repaired_lessons = []
    lessons = fallback.get("lessons", [])
    for index, lesson in enumerate(lessons):
        repaired = _repair_lesson_content(
            lesson,
            subject=subject,
            topic=topic,
            lesson_title=str(lesson.get("title") or f"Lecția {index + 1}"),
            lesson_subject=str(lesson.get("title") or topic),
            include_mini_game=index in (0, len(lessons) - 1),
            include_final_check=index == len(lessons) - 1,
            position=index + 1,
            total=len(lessons),
        )
        repaired["title"] = str(lesson.get("title") or f"Lecția {index + 1}")
        repaired_lessons.append(repaired)
    fallback["lessons"] = repaired_lessons
    fallback["quality"] = score_course_quality(fallback, subject=subject, topic=topic, level=level)
    return fallback


# ═══════════════════════════════════════════════════════════
# SKILL 4b — TWO-PASS COURSE GENERATION
# (OUTLINE FIRST → user sees structure in ~2-3s,
#  per-lesson content generated on demand / prefetched in background)
# ═══════════════════════════════════════════════════════════

OUTLINE_SYSTEM = """Ești Wispucci, tutor EdTech pentru Gen Z (12-25 ani).
{tone_line}
{subject_line}
{format_line}

Generează DOAR scheletul cursului — titluri și subiecte scurte.
NU genera body, NU exerciții, NU mini-game. Doar structura.

Output STRICT JSON:
{
  "title": "Titlu modul (max 40 char, captivant, NU 'Curs de Python')",
  "outcome": "ce poate face userul după ~20 min",
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
la 'de ce contează'. Ultima — proiect mic/test final concret. Tags = key concepts."""


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
        .replace("{format_line}", _lesson_format_line(subject))
    )
    level_labels = {0: "zero absolut", 1: "începător", 2: "mediu", 3: "avansat"}
    lvl = level_labels.get(level, "mediu")
    user = (
        f"Subiect:{subject}\nTopic:{topic}\nNivel:{lvl}\n"
        f"Outcome: userul aplică {topic} într-un caz real în ~20 min.\n"
        f"Generează schelet de {lesson_count} lecții, hook-driven. "
        f"Fiecare titlu ≤36 caractere, începe cu verb dacă se poate. "
        f"Ultima lecție include test/proiect final."
    )
    raw = await _call_ai(system, user, json_mode=True, max_tokens=400)
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        result = {}

    # Defensive defaults so the frontend never sees an empty UI.
    result.setdefault("title", f"{topic} — {subject}")
    if not isinstance(result.get("outcome"), str) or not result["outcome"].strip():
        result["outcome"] = f"Aplici {topic} într-un caz real, fără text generic."
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
{format_line}

Generezi UNA SINGURĂ lecție completă. Nu inventa altele.

REGULA DE AUR: exercițiul TREBUIE să folosească DOAR sintaxa și funcțiile
care apar EXPLICIT în body (cu cod). Dacă body-ul nu arată cum se face X,
exercițiul NU are voie să ceară să faci X.

Output STRICT JSON, fără text în afara JSON:
{
  "hook": "1 propoziție 'de ce-mi pasă' (max 14 cuvinte)",
  "body": "120-180 cuvinte, 2-3 paragrafe scurte. Trebuie să conțină
           CEL PUȚIN 2 exemple concrete de cod (sau echivalent — frază
           pentru limbi străine, formulă pentru mate). Folosește blocuri
           ```limbaj … ``` pentru cod. NU doar metafore — arată sintaxa
           reală, pas cu pas. Limbaj simplu (clasa a 8-a). NU 'evident'.
           Maxim 1 analogie din viața reală.",
  "key_terms": ["2-3 concepte cheie din body"],
  "cards": [
    {"front":"termen sau întrebare scurtă (max 6 cuvinte)",
     "back":"răspuns/definiție concret (max 18 cuvinte). poți include `cod` inline."}
  ],
  "exercises": [
    {"type":"fill","prompt":"...","blanks":["r1"],"hint":"..."}
  ],
  "mini_game": null,
  "final_check": null
}

cards: 3-5 obiecte. Fiecare card e UN concept din body, NU repetare. front =
termen/întrebare scurtă; back = răspunsul concret. Folosit pentru repetiție
spațiată după lecție. Conceptele DOAR din ce a fost prezentat în body.

EXACT 1 exercițiu. Tipuri: fill | choice | code.
- fill: completează un cuvânt/funcție din EXEMPLELE deja arătate în body.
        Ex: dacă body-ul a folosit `console.log('Salut')`, fill întreabă
        ce funcție afișează în consolă.
- choice: 3-4 opțiuni, doar UN răspuns corect din ce s-a explicat în body.
- code: maxim 2-3 linii. Folosește DOAR funcția/keyword-ul arătat în body.
        Include "expected" cu codul corect și "hint" care îl ghidează către
        exemplul din body.

NU CERE niciodată în exercițiu:
- input() / output complex dacă body n-a arătat input()
- bucle / condiționale dacă body n-a arătat bucle / condiționale
- concepte din lecții viitoare

Reguli stricte JSON:
- code: include "expected" (cod corect, sintaxă identică cu body-ul) și "hint".
- choice: include "options" (3-4 elemente) și "answer" (index 0-based).
- fill: include "blanks" (lista cu răspunsuri) și "hint".

mini_game: opțional. Dacă incluzi, alege UN tip:
  bug_hunter | code_assemble | output_predict | word_match (limbi)
și respectă schema lor strictă. Mini-game-ul are aceeași regulă: doar
concepte deja prezentate în body.

final_check: DOAR pentru ultima lecție. Dacă e ultima, include:
{"type":"project|quiz","prompt":"ce face userul","success_criteria":["2-4 criterii"]}"""


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
        .replace("{format_line}", _lesson_format_line(subject))
    )
    level_labels = {0: "zero absolut", 1: "începător", 2: "mediu", 3: "avansat"}
    lvl = level_labels.get(level, "mediu")
    mg_hint = "Adaugă mini_game (1 obiect, vezi schema)." if include_mini_game else "mini_game = null."
    final_hint = (
        "Este ultima lecție: include final_check cu mini-proiect/test verificabil."
        if position == total
        else "final_check = null."
    )
    user = (
        f"Subiect:{subject}\nTopic:{topic}\nNivel:{lvl}\n"
        f"Lecția {position}/{total}: {lesson_title}\n"
        f"Acoperă: {lesson_subject}\n"
        f"{mg_hint}\n{final_hint}"
    )
    best_result: dict | None = None
    best_score = -1
    for attempt in range(3):
        prompt = user
        if attempt:
            prompt += (
                "\nRăspunsul anterior a fost incomplet. Returnează JSON valid cu "
                "hook, body concret, EXACT 1 exercițiu bazat pe body, zero filler generic."
            )
        try:
            raw = await _call_ai(
                system,
                prompt,
                json_mode=True,
                max_tokens=1800 if include_mini_game else 1400,
            )
            result = _parse_json_object(raw)
        except Exception:
            result = {}
        result = _normalize_lesson_content(result)
        quality = score_lesson_quality(
            result,
            subject=subject,
            topic=topic,
            position=position,
            total=total,
        )
        result["quality"] = quality
        if quality["score"] > best_score:
            best_result = result
            best_score = quality["score"]
        if quality["passed"]:
            return result

    if best_result and _has_lesson_content(best_result):
        return _repair_lesson_content(
            best_result,
            subject=subject,
            topic=topic,
            lesson_title=lesson_title,
            lesson_subject=lesson_subject,
            include_mini_game=include_mini_game,
            include_final_check=position == total,
            position=position,
            total=total,
        )
    fallback = _fallback_lesson_content(
        subject=subject,
        topic=topic,
        lesson_title=lesson_title,
        lesson_subject=lesson_subject,
        include_mini_game=include_mini_game,
        include_final_check=position == total,
    )
    fallback["quality"] = score_lesson_quality(fallback, subject=subject, topic=topic, position=position, total=total)
    return fallback


def _parse_json_object(raw: str) -> dict:
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start < 0 or end <= start:
            return {}
        try:
            parsed = json.loads(raw[start:end + 1])
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}


def _normalize_lesson_content(result: dict) -> dict:
    hook = result.get("hook")
    body = result.get("body")
    key_terms = result.get("key_terms")
    cards = result.get("cards")
    exercises = result.get("exercises")
    final_check = result.get("final_check")
    quality = result.get("quality") if isinstance(result.get("quality"), dict) else None
    normalized = {
        "hook": hook.strip() if isinstance(hook, str) else "",
        "body": body.strip() if isinstance(body, str) else "",
        "key_terms": key_terms if isinstance(key_terms, list) else [],
        "cards": _normalize_cards(cards, key_terms if isinstance(key_terms, list) else []),
        "exercises": exercises if isinstance(exercises, list) else [],
        "mini_game": result.get("mini_game") if isinstance(result, dict) else None,
        "final_check": final_check if isinstance(final_check, dict) else None,
    }
    if quality:
        normalized["quality"] = quality
    return normalized


def _normalize_cards(cards, key_terms_fallback) -> list[dict]:
    """
    Coerce cards to [{front, back}, ...]. Drops malformed entries and falls
    back to key_terms (term -> term) when the model didn't return any cards
    so the cards endgame stage always has at least 2-3 cards to show.
    """
    out: list[dict] = []
    if isinstance(cards, list):
        for c in cards:
            if not isinstance(c, dict):
                continue
            front = c.get("front") or c.get("term") or c.get("q")
            back = c.get("back") or c.get("definition") or c.get("a")
            if not isinstance(front, str) or not isinstance(back, str):
                continue
            front = front.strip()
            back = back.strip()
            if not front or not back:
                continue
            out.append({"front": front[:120], "back": back[:280]})
    if len(out) < 2 and isinstance(key_terms_fallback, list):
        for term in key_terms_fallback:
            if not isinstance(term, str) or not term.strip():
                continue
            front = term.strip()[:120]
            if any(c["front"].lower() == front.lower() for c in out):
                continue
            out.append({"front": front, "back": f"concept-cheie din lecție · {front}"})
            if len(out) >= 3:
                break
    return out[:6]


def _normalize_course_result(result: dict, subject: str, topic: str) -> dict:
    title = result.get("title")
    lessons = result.get("lessons")
    normalized_lessons = []
    if isinstance(lessons, list):
        for lesson in lessons:
            if isinstance(lesson, dict):
                normalized_lessons.append(_normalize_lesson_content({
                    **lesson,
                    "hook": lesson.get("hook") or "",
                    "body": lesson.get("body") or "",
                    "key_terms": lesson.get("key_terms") or [],
                    "exercises": lesson.get("exercises") or [],
                    "mini_game": lesson.get("mini_game"),
                    "final_check": lesson.get("final_check"),
                }) | {"title": str(lesson.get("title") or "Lecție scurtă").strip()})
    return {
        "title": title.strip() if isinstance(title, str) and title.strip() else f"{topic} — {subject}",
        "lessons": normalized_lessons,
    }


def _has_lesson_content(result: dict) -> bool:
    body = result.get("body")
    exercises = result.get("exercises")
    return (
        isinstance(body, str)
        and len(body.strip()) >= 80
        and isinstance(exercises, list)
        and len(exercises) > 0
    )


def _contains_generic_filler(text: str) -> bool:
    lowered = text.lower()
    return any(re.search(pattern, lowered) for pattern in _GENERIC_FILLER_PATTERNS)


def _valid_exercise(exercise: dict) -> bool:
    if not isinstance(exercise, dict):
        return False
    prompt = exercise.get("prompt")
    if not isinstance(prompt, str) or len(prompt.strip()) < 12:
        return False
    ex_type = exercise.get("type")
    if ex_type == "fill":
        return isinstance(exercise.get("blanks"), list) and bool(exercise["blanks"]) and isinstance(exercise.get("hint"), str)
    if ex_type == "choice":
        return (
            isinstance(exercise.get("options"), list)
            and len(exercise["options"]) >= 3
            and isinstance(exercise.get("answer"), int)
        )
    if ex_type == "code":
        return isinstance(exercise.get("expected"), str) and bool(exercise["expected"].strip()) and isinstance(exercise.get("hint"), str)
    if ex_type == "match":
        return isinstance(exercise.get("pairs"), list) and len(exercise["pairs"]) >= 2
    return False


def score_lesson_quality(
    lesson: dict,
    subject: str,
    topic: str,
    position: int,
    total: int,
) -> dict:
    issues: list[str] = []
    score = 0
    body = lesson.get("body", "")
    hook = lesson.get("hook", "")
    exercises = lesson.get("exercises", [])
    final_check = lesson.get("final_check")

    if isinstance(hook, str) and 8 <= len(hook.strip()) <= 140:
        score += 10
    else:
        issues.append("missing_hook")

    if isinstance(body, str) and len(body.strip()) >= 240:
        score += 25
    elif isinstance(body, str) and len(body.strip()) >= 80:
        score += 15
    else:
        issues.append("body_too_short")

    if isinstance(body, str) and topic.lower().split()[0] in body.lower():
        score += 8
    else:
        issues.append("topic_not_visible")

    if isinstance(body, str) and not _contains_generic_filler(body):
        score += 12
    else:
        issues.append("generic_filler")

    valid_exercises = [ex for ex in exercises if _valid_exercise(ex)]
    if valid_exercises:
        score += 20
    else:
        issues.append("missing_valid_exercise")

    if subject == "Programare":
        if "```" in body and any(ex.get("type") == "code" for ex in valid_exercises):
            score += 10
        else:
            issues.append("programming_needs_code")
    elif subject == "Limbă străină":
        if any(marker in body for marker in ("[", "dialog", "replic", "fraz")):
            score += 10
        else:
            issues.append("language_needs_phrase_context")
    elif subject == "Matematică":
        if any(marker in body for marker in ("=", "+", "-", "×", "/", "pas")):
            score += 10
        else:
            issues.append("math_needs_steps")
    else:
        if any(word in body.lower() for word in ("exemplu", "situație", "scenariu", "caz real")):
            score += 10
        else:
            issues.append("general_needs_scenario")

    if position == total:
        criteria = final_check.get("success_criteria") if isinstance(final_check, dict) else None
        if isinstance(final_check, dict) and isinstance(criteria, list) and len(criteria) >= 2:
            score += 15
        else:
            issues.append("missing_final_check")
    else:
        score += 5

    fatal_issues = {
        "body_too_short",
        "missing_valid_exercise",
        "programming_needs_code",
        "language_needs_phrase_context",
        "math_needs_steps",
        "general_needs_scenario",
        "missing_final_check",
    }
    return {
        "score": min(score, 100),
        "passed": score >= 75 and not fatal_issues & set(issues),
        "issues": issues,
    }


def score_course_quality(result: dict, subject: str, topic: str, level: int) -> dict:
    lessons = result.get("lessons") if isinstance(result, dict) else []
    issues: list[str] = []
    if not isinstance(lessons, list) or len(lessons) < 4:
        return {"score": 0, "passed": False, "issues": ["not_enough_lessons"]}

    lesson_scores = [
        score_lesson_quality(lesson, subject=subject, topic=topic, position=i + 1, total=len(lessons))
        for i, lesson in enumerate(lessons)
    ]
    avg = sum(item["score"] for item in lesson_scores) // len(lesson_scores)
    if avg < 75:
        issues.append("lesson_average_too_low")
    if not any(lesson.get("mini_game") for lesson in lessons):
        issues.append("missing_mini_game")
    if not isinstance(lessons[-1].get("final_check"), dict):
        issues.append("missing_course_final_check")
    if len({str(lesson.get("title", "")).strip().lower() for lesson in lessons}) < len(lessons):
        issues.append("duplicate_titles")
    return {
        "score": max(0, min(100, avg - len(issues) * 5)),
        "passed": avg >= 75 and not issues,
        "issues": issues,
        "lessons": lesson_scores,
        "level": level,
    }


def _repair_lesson_content(
    lesson: dict,
    subject: str,
    topic: str,
    lesson_title: str,
    lesson_subject: str,
    include_mini_game: bool,
    include_final_check: bool,
    position: int,
    total: int,
) -> dict:
    quality = score_lesson_quality(
        lesson,
        subject=subject,
        topic=topic,
        position=position,
        total=total,
    )
    if quality["passed"]:
        lesson["quality"] = quality
        return lesson

    fallback = _fallback_lesson_content(
        subject=subject,
        topic=topic,
        lesson_title=lesson_title,
        lesson_subject=lesson_subject,
        include_mini_game=include_mini_game,
        include_final_check=include_final_check,
    )
    repaired = {
        **lesson,
        "hook": lesson.get("hook") if len(str(lesson.get("hook") or "").strip()) >= 8 else fallback["hook"],
        "body": lesson.get("body") if len(str(lesson.get("body") or "").strip()) >= 240 and not _contains_generic_filler(str(lesson.get("body") or "")) else fallback["body"],
        "key_terms": lesson.get("key_terms") or fallback["key_terms"],
        "cards": lesson.get("cards") if isinstance(lesson.get("cards"), list) and lesson.get("cards") else fallback["cards"],
        "exercises": lesson.get("exercises") if "missing_valid_exercise" not in quality["issues"] and "programming_needs_code" not in quality["issues"] else fallback["exercises"],
        "mini_game": lesson.get("mini_game") or fallback["mini_game"],
        "final_check": lesson.get("final_check") or fallback["final_check"],
    }
    repaired["quality"] = score_lesson_quality(
        repaired,
        subject=subject,
        topic=topic,
        position=position,
        total=total,
    )
    return repaired


def _fallback_lesson_content(
    subject: str,
    topic: str,
    lesson_title: str,
    lesson_subject: str,
    include_mini_game: bool,
    include_final_check: bool = False,
) -> dict:
    if subject == "Programare":
        body = (
            f"{lesson_title} pornește de la o idee simplă: {lesson_subject}. "
            f"În {topic}, nu înveți ca să memorezi definiții, ci ca să faci un "
            "mic rezultat care rulează.\n\n"
            "Exemplu scurt:\n```js\nconst nume = 'Ana';\nconsole.log(nume);\n```\n"
            "Aici creezi o valoare și o afișezi. E ca o etichetă pe un sertar: "
            "știi unde ai pus ceva și îl poți folosi mai târziu.\n\n"
            "Schimbă valoarea și rulează din nou:\n```js\nconst nume = 'Mihai';\n"
            "console.log('Salut, ' + nume);\n```\nAsta e baza: modifici puțin, "
            "vezi imediat efectul, apoi construiești peste."
        )
        exercise = {
            "type": "code",
            "prompt": "Scrie 2 linii: creează `nume` cu valoarea 'Alex' și afișează-l.",
            "expected": "const nume = 'Alex';\nconsole.log(nume);",
            "hint": "Folosește exact modelul cu `const` și `console.log` din lecție.",
        }
        game = {
            "type": "bug_hunter",
            "prompt": "Găsește linia care nu respectă exemplul.",
            "lines": [
                "const nume = 'Alex';",
                "console.log(nume);",
                "console.log(varsta);",
            ],
            "buggy_index": 2,
            "fix": "console.log(nume);",
        } if include_mini_game else None
        final_check = {
            "type": "project",
            "prompt": "Construiește un mini-exemplu care creează o valoare, o schimbă și o afișează.",
            "success_criteria": [
                "folosește o variabilă",
                "afișează rezultatul",
                "codul are maxim 5 linii",
            ],
        } if include_final_check else None
    else:
        body = (
            f"{lesson_title} înseamnă să iei {lesson_subject} și să-l folosești "
            f"într-un exemplu concret despre {topic}. Nu încerca să reții tot; "
            "caută primul pas care îți dă un rezultat vizibil.\n\n"
            "Model simplu: vezi ideea, o repeți cu un exemplu, apoi schimbi un "
            "detaliu. Așa creierul nu primește un zid de teorie, ci o bucată "
            "mică pe care o poate testa.\n\n"
            "Regula pentru această lecție: explică ideea în cuvintele tale, apoi "
            "dă un exemplu propriu. Dacă poți face asta fără să copiezi textul, "
            "ai înțeles suficient ca să mergi mai departe."
        )
        exercise = {
            "type": "fill",
            "prompt": "Completează: întâi înțeleg ideea, apoi dau un ___ propriu.",
            "blanks": ["exemplu"],
            "hint": "Cuvântul apare în lecție de mai multe ori.",
        }
        game = {
            "type": "output_predict",
            "prompt": f"Ce răspuns arată că ai aplicat {topic}, nu doar ai memorat?",
            "code": f"Situație: explici {topic} unui prieten printr-un exemplu concret.",
            "options": [
                "Dau un exemplu verificabil și explic pasul-cheie.",
                "Spun că subiectul este important.",
                "Copiez definiția fără context.",
            ],
            "answer": 0,
        } if include_mini_game else None
        final_check = {
            "type": "quiz",
            "prompt": f"Aplică {topic} într-un exemplu propriu și explică de ce funcționează.",
            "success_criteria": [
                "are un exemplu concret",
                "folosește ideea principală",
                "poate fi verificat de altcineva",
            ],
        } if include_final_check else None

    if subject == "Programare":
        cards = [
            {"front": "variabilă", "back": "etichetă pe o valoare; o folosești cu numele ei."},
            {"front": "console.log", "back": "afișează o valoare ca să verifici ce se întâmplă."},
            {"front": "const", "back": "variabilă care nu se schimbă după ce-i dai o valoare."},
        ]
    else:
        cards = [
            {"front": str(topic)[:40] or "ideea cursului", "back": f"o aplici prin un exemplu concret, nu prin definiție."},
            {"front": str(lesson_subject)[:40] or "subiectul lecției", "back": "îl explici cuiva fără să copiezi textul."},
            {"front": "exemplu", "back": "fragment scurt prin care arăți că ai înțeles ideea."},
        ]

    return {
        "hook": "Înveți mai repede când vezi imediat ce poți face cu ideea.",
        "body": body,
        "key_terms": [topic, lesson_subject, "exemplu"],
        "cards": cards,
        "exercises": [exercise],
        "mini_game": game,
        "final_check": final_check,
    }


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
    if len(result["questions"]) < 5:
        result["questions"] = _fallback_mini_test_questions(subject, topic)
    return result


def _fallback_mini_test_questions(subject: str, topic: str) -> list[dict]:
    if subject == "Programare":
        return [
            {
                "type": "choice",
                "prompt": "Ce dovedește că ai înțeles exemplul de cod?",
                "options": ["Îl poți modifica și rula", "Îl reciți pe de rost", "Îi schimbi fontul", "Îl pui într-un titlu"],
                "answer": 0,
                "explanation": "Codul înțeles poate fi schimbat fără să se rupă.",
            },
            {
                "type": "choice",
                "prompt": "Când folosești un exemplu scurt?",
                "options": ["Înainte de teoria mare", "După 30 definiții", "Doar la final", "Niciodată"],
                "answer": 0,
                "explanation": "Exemplul scurt creează aha-moment rapid.",
            },
            {
                "type": "choice",
                "prompt": "Ce trebuie să aibă un exercițiu code bun?",
                "options": ["Expected output/cod", "Doar o poveste", "Patru metafore", "Zero hint"],
                "answer": 0,
                "explanation": "Feedback-ul are nevoie de un rezultat verificabil.",
            },
            {
                "type": "choice",
                "prompt": "Care e semnul unui bug simplu?",
                "options": ["O linie nu respectă modelul", "Tot codul e perfect", "Nu există input", "Tema e prea scurtă"],
                "answer": 0,
                "explanation": "Bug hunter verifică diferența dintre model și abatere.",
            },
            {
                "type": "choice",
                "prompt": "Finalul bun pentru coding este…",
                "options": ["un mini-proiect runnable", "un eseu lung", "un citat", "o listă fără task"],
                "answer": 0,
                "explanation": "Rezultatul trebuie demonstrat.",
            },
        ]
    return [
        {
            "type": "choice",
            "prompt": f"Ce arată că ai înțeles {topic}?",
            "options": ["Îl aplic într-un exemplu propriu", "Repet o definiție generică", "Spun că e important", "Sar peste practică"],
            "answer": 0,
            "explanation": "Înțelegerea apare când poți aplica ideea.",
        },
        {
            "type": "choice",
            "prompt": "Ce face un model mental bun?",
            "options": ["Simplifică prima decizie", "Adaugă jargon", "Lungește lecția", "Ascunde exemplul"],
            "answer": 0,
            "explanation": "Modelul mental reduce încărcarea cognitivă.",
        },
        {
            "type": "choice",
            "prompt": "De ce folosim scenarii reale?",
            "options": ["Ca userul să testeze ideea", "Ca textul să pară lung", "Ca să evităm feedback", "Ca să ascundem outcome-ul"],
            "answer": 0,
            "explanation": "Scenariul real face răspunsul verificabil.",
        },
        {
            "type": "choice",
            "prompt": "Care task e cel mai bun?",
            "options": ["Aplică ideea în 60 secunde", "Citește 5 pagini", "Memorează tot", "Așteaptă următoarea lecție"],
            "answer": 0,
            "explanation": "Micro-acțiunea creează primul win.",
        },
        {
            "type": "choice",
            "prompt": "Un final check bun are…",
            "options": ["criterii de succes clare", "doar felicitări", "zero context", "o definiție vagă"],
            "answer": 0,
            "explanation": "Criteriile clare arată dacă rezultatul chiar există.",
        },
    ]


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
