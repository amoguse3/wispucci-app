---
name: testing-wispucci
description: End-to-end runtime testing for the Wispucci app. Use when verifying onboarding, universal course generation, lessons, stats, settings, and mobile navigation.
---

# Testing Wispucci

## Devin Secrets Needed

- `AI_API_KEY` (required for real AI course/lesson generation against the configured provider). Without it, the backend uses mock AI fallback and may not exercise the same schemas or latency as production-like generation.

## Local setup

From the repo root:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
```

Run backend:

```bash
. .venv/bin/activate
uvicorn backend.main:app --host 127.0.0.1 --port 8801 --reload
```

Run frontend in a second shell:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765` in Chrome. The frontend defaults to local API unless `?api=prod` was previously stored in `sessionStorage`; use `?api=local` if needed.

For fresh anonymous testing, clear browser state before opening the app:

```js
localStorage.clear(); sessionStorage.clear(); location.href = 'http://127.0.0.1:8765'
```

## Smoke checks

```bash
curl -sS http://127.0.0.1:8801/api/health
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8765/
python -m py_compile backend/*.py backend/routers/*.py
```

## Primary universal onboarding flow

Use this when testing the universal course generator UX:

1. Welcome → click `Începe`.
2. Verify the headline is `Ce vrei să înțelegi?` and the page has one central topic input plus shortcut examples.
3. Enter a custom topic such as `Roman history basics` and click `Generează preview`.
4. Verify preview title matches the topic exactly, the promise mentions the chosen level, and the preview has 4 lesson bullets plus a first exercise card.
5. Change at least one level card (`Zero`, `Începător`, `Mediu`, `Avansat`) and verify the preview promise updates.
6. Fill the preview exercise and click `Verifică`; feedback should appear before signup.
7. Click `Construiește cursul` while logged out; signup should open instead of generation starting immediately.
8. Sign up with a unique test email and verify generation resumes automatically rather than dropping to Home.
9. Open lesson 1 and verify it has non-empty body text plus exercise or mini-game content.
10. Run DB verification for the generated module; lesson 1 should have `body_len >= 80` and `exercise_count >= 1`.

## Shortcut and subject framing checks

Test at least one shortcut card to verify subject-specific preview copy:

- `JavaScript variables` should infer/programmatically set `Programare` and show a snippet/code exercise framing.
- `Spanish for travel` should frame language practice.
- `Linear algebra for ML` should frame math practice.
- `How taxes work in Romania` should use general/`Altceva` framing.

## Narrow/mobile check

For onboarding/preview changes, resize the browser to a narrow mobile-like width and verify:

- topic input and shortcut cards remain reachable,
- level cards stack without clipping critical text,
- preview card scrolls to first exercise,
- `Schimbă subiectul` and `Construiește cursul` remain clickable.

A Linux desktop resize command that worked in testing:

```bash
wmctrl -r :ACTIVE: -b remove,maximized_vert,maximized_horz
wmctrl -r :ACTIVE: -e 0,0,0,390,844
```

## Mock AI caveat

When `AI_API_KEY` is absent, backend mock generation might not exercise the same schema as real AI responses. Always explicitly verify generated lesson rows/content are non-empty. If the UI shows a title-only lesson or no exercise tab, do not mark lesson/exercise/game flows as passed; report the blank lesson as a core activation failure.

Useful DB inspection command for local SQLite:

```bash
. .venv/bin/activate
python - <<'PY'
import json, sqlite3
con = sqlite3.connect('backend/wispucci.db')
con.row_factory = sqlite3.Row
topic = 'Roman history basics'
module = con.execute("select rowid, id, subject, topic, level, title, estimated_minutes from modules where topic = ? order by rowid desc limit 1", (topic,)).fetchone()
print('module:', dict(module) if module else None)
if module:
    for row in con.execute("select `index`, title, length(coalesce(body,'')) as body_len, practice from lessons where module_id = ? order by `index`", (module['id'],)):
        practice = json.loads(row['practice'] or '{}')
        exercises = practice.get('exercises') or []
        print({'index': row['index'], 'title': row['title'], 'body_len': row['body_len'], 'exercise_count': len(exercises), 'has_mini_game': bool(practice.get('mini_game'))})
PY
```

## Recording guidance

Record UI testing only after backend/frontend are already running. Annotate at least:

- onboarding start,
- custom topic preview render,
- preview exercise feedback,
- signup gate and resumed generation,
- lesson content assertion,
- shortcut subject framing assertion,
- narrow/mobile preview assertion when relevant.
