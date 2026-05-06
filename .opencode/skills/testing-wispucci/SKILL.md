---
name: testing-wispucci
description: End-to-end runtime testing for the Wispucci app. Use when verifying onboarding, course generation, lessons, stats, settings, and mobile navigation.
---

# Testing Wispucci

## Devin Secrets Needed

- `AI_API_KEY` (optional): needed to test real AI course/lesson generation against the configured provider. Without it, the backend uses mock AI fallback.

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

## Smoke checks

```bash
curl -sS http://127.0.0.1:8801/api/health
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8765/
python -m py_compile backend/*.py backend/routers/*.py
```

## Primary manual flow

1. Welcome → click `Începe`.
2. Select a subject, preferably `Programare` for the clearest first-win path.
3. Try an empty custom topic first; it should be blocked with a toast.
4. Enter a valid topic and choose a level.
5. Generate the course, sign up with a unique test email, and verify whether the generated course is preserved or must be regenerated.
6. Open the first lesson and verify it has non-empty theory body plus exercise or mini-game content.
7. If content exists, test exercise feedback, `Explică-mi`, lesson progression, and celebration.
8. Test secondary surfaces: Stats, Settings persistence, invalid login error, and mobile drawer navigation.

## Mock AI caveat

When `AI_API_KEY` is absent, backend mock generation might not exercise the same schema as real AI responses. Always explicitly verify generated lesson rows/content are non-empty. If the UI shows a title-only lesson or no exercise tab, do not mark lesson/exercise/game flows as passed; report the blank lesson as a core activation failure.

Useful DB inspection command for local SQLite:

```bash
. .venv/bin/activate
python - <<'PY'
import sqlite3
con = sqlite3.connect('backend/wispucci.db')
for row in con.execute("select title, length(coalesce(body,'')), practice from lessons order by rowid desc limit 4"):
    print(row[0], 'body_len=', row[1], 'practice=', row[2][:120] if row[2] else None)
PY
```

## Recording guidance

Record UI testing only after backend/frontend are already running. Annotate at least:

- onboarding start,
- course generation result,
- lesson content assertion,
- secondary pages assertion,
- auth/mobile assertion.
