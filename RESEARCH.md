# Wispucci — Research & Design Plan

> Apreciere ca **design teacher / art director**. Lucrez în plan critic, nu în plan complezent.
> Sursa principală: AGENTS.md (Paul Graham + Nir Eyal + Luis von Ahn lens) + Don Norman + Yablonski + Refactoring UI.
> Ascult ce ai zis, dar pe câteva puncte voi argumenta CONTRA — pentru că asta îți cere AGENTS.md de la mentor.

---

## 1. Diagnoză rapidă (ce văd ca art director)

### Ce e bine
- Un orb cu personalitate (8 stări) e un **moat emoțional** pe care Duolingo nu-l are. Bună mișcare.
- Limba română nativă în UI = avantaj de tonalitate față de Sololearn/Brilliant care sună corporate.
- Stack 0-build, loc de iterație vizuală rapidă. Bun pentru MVP.
- Backend FastAPI + SQLAlchemy + JWT + AI-skills cu cache și rate limit — solid.

### Ce e prost (red flags)
1. **Trei verticale (limbă / cod / matematică / "altceva") = trei produse**. Pentru MVP ai timp pentru UNA. Recomandare: **Programare**, fiindcă:
   - codul îți dă un "demonstrabil" instant ("am scris cod care merge") — Duolingo nu-l poate copia ușor.
   - audiența ICP (12–25) e suprareprezentată în r/learnprogramming + TikTok #coding.
   - costul per AI-call e mai mic (răspunsuri text scurte, nu audio TTS).
   - Limba și matematica rămân pe roadmap, dar **dezactivăm cardurile lor pentru MVP** sau le marcăm "în curând".
2. **Demo controls** (dev-jump bar, emotion-row, ★ celebrate trigger) — îmi spui să le scot pentru MVP. Da. Sunt cringe, semnalează "produs neterminat", scad încrederea.
3. **Vocabular** ca tab principal e un blocaj cognitiv: dacă userul învață Python, n-are "cuvinte". Reframe: **Statistica** (cum mi-ai zis). Vom afișa ce e mastered indiferent de subiect.
4. **Fără login screen real** — useri returnează direct la `lastView`. Pentru MVP cu backend, trebuie auth, altfel n-ai retention măsurabilă.
5. **Bug orb**: în `home`, orb-ul "cade" jos (e în `home-hero-orb`, sub `home-greeting`). Vizual e o "scădere" abruptă față de welcome (centru) și onboarding (top-left mic). Fix: orb micșorat, fixat sus, layout consistent.
6. **Mock data în vocabular** (VOCAB_WORDS hardcodat) — trebuie scos, înlocuit cu fetch de la backend.

---

## 2. Principii pedagogice aplicate (gândire critică, nu copy-paste din literatură)

### A. Lecții — durată, structură, ritm
**Recomandare: 3–5 minute per lecție**, atomică, un singur concept, un exercițiu, un summary.
- **Gen Z attention span: 8 secunde** (AGENTS.md). Lecția trebuie să captureze în primele 10s.
- **Spaced practice**: după 3 lecții consecutive, **mini-test** cu 3-5 întrebări amestecate din toate.
- **Cadența recomandată:**
  ```
  L1 → L2 → L3 → MINI-TEST → L4 → L5 → L6 → MINI-TEST → MODULE TEST
  ```
- **Test = obligatoriu**, dar **fail = nu te scoate afară, doar reia**.
- **Peak-end rule** (Yablonski): finalul lecției (celebrate overlay) = peak. Asigură-te că finalul e *proporțional cu efortul*. Dacă userul a făcut o lecție de 30s, nu-i da fanfare cât pentru o lecție de 5min — devine cringe.

### B. Tonul lecțiilor — care merge, care nu

| Ton | Când îl folosești | Exemplu |
|-----|-------------------|---------|
| **Cald (default)** | începători, primele 5 lecții | "Hai să vedem împreună…" |
| **Prieten** | useri reveniți, după 7 zile streak | "Bă, am o întrebare pentru tine." |
| **Profesionist** | useri avansați, focus pe fapte | "Funcție pură: același input → același output." |

**Anti-patterns interzise** (din AGENTS.md):
- ❌ "Dragă elev,…" — scârbos, corporate
- ❌ Overexplaining ("acum vom vedea împreună cum…") — Gen Z scrolează
- ❌ "Felicitări că ai terminat lecția 1!" — fals dopamine, devine cringe
- ❌ Emoji spam — un emoji per mesaj, MAX, și doar contextual

**Recomandare**: Folosesc tonul setat în `Settings → tone` ca prefix la prompt-urile AI. **Default = "cald"**, dar la D2+ voi sugera userului să schimbe pe "prieten" (un push social: "ești la 3 zile, treci pe ton de prieten?").

### C. Cum diferă învățarea limbilor vs programare

| Dimensiune | Limbi străine | Programare |
|-----------|----------------|-----------|
| **Unitatea de învățare** | cuvânt + structură gramaticală | concept + sintaxă |
| **Aha-moment** | "am zis o frază și a mers" | "am scris cod care a rulat" |
| **Greșeli** | de pronunție / acord | de sintaxă / logică |
| **Practică zilnică** | conversație / shadowing | scriere de cod |
| **Joc tipic eficient** | match cuvinte / listen-and-type / shadowing | drag-and-drop blocks / fix-the-bug / output-prediction |
| **Spaced repetition** | obligatoriu (uitați 80% în 24h) | mai puțin necesar (logica se reține diferit) |

**Concluzie**: nu poți avea **un singur format de lecție** care să servească ambele. **MVP = Programare doar**. Limbi pe v2.

### D. Mini-jocuri (gândire critică: care merită?)

Lista realistă, sortată după ROI:

1. **Bug Hunter** *(programare, top priority)* — Userul vede 3 linii de cod cu o eroare. Click pe linia greșită → +12 XP. **5 secunde/runda**, **dependență viscerală** (Hook: variable reward). Implementare: 30 lines JS.
2. **Code Assemble** *(programare)* — Bucăți de cod în ordine greșită, drag-drop pentru a le reorganiza. **30s/runda**. Bun pentru a învăța **structura/ordinea**.
3. **Output Prediction** *(programare)* — Vezi codul, ghicești output-ul. 3 opțiuni. **15s/runda**. Învață **execuție mentală**.
4. **Word Match** *(limbă, v2)* — drag pereche română ↔ engleză. Clasic, dar funcționează.
5. **Listen & Type** *(limbă, v2)* — audio → tastezi ce ai auzit. Cere TTS, ne lăsăm pentru v2.

Pentru **MVP**: implementez **Bug Hunter + Code Assemble** ca pane în `lesson` (între "Teorie" și "Practică"). Fiecare lecție generată are:
- 1 secțiune de teorie (text + cod)
- 1 mini-joc (Bug Hunter sau Code Assemble, randomized)
- 1 exercițiu de cod
- (la fiecare 3 lecții) 1 mini-test cu 5 întrebări mixte

### E. Fail-states — cum NU rupi ego-ul Gen Z

Reguli pe care le aplic în UX text:
- **Greșeală ≠ "Ai greșit"**. → "Aproape." sau "Hmm, mai aproape ca data trecută."
- **Indiciu disponibil oricând**, dar NU e default. Userul trebuie să-l ceară.
- **3 încercări greșite** → orb-ul intră în `confused`, **schimbă strategia**: "OK, hai să vedem altfel" → arată un exemplu rezolvat, apoi reîncearci tu.
- **Niciodată "cantitatea de greșeli totale"** afișată ca metrică. Asta e psihologie deprimantă, anti-Gen-Z.
- **Streak-ul se păstrează** dacă ai făcut **măcar o lecție pe zi**, fără cerință de "perfect". 26h grace period (deja în config) e bun.

### F. Statistici și Leaderboard — gandire critică

**Ce afișezi în Statistica:**
- Streak (cu best ever) — Hook: investment
- XP total + XP săptămâna asta + XP azi
- Lecții completate / module completate
- "Ce ai învățat" — tag cloud cu concepte/cuvinte mastered (peste programare, limbi, etc., **unificat**)
- Heatmap zilnic (GitHub-style) ultimele 8 săptămâni

**Ce NU afișezi**:
- ❌ Procent de greșeli — demoralizator
- ❌ "Timp mediu per exercițiu" — cei lenți se simt prost
- ❌ "Cei care au început același curs au terminat în X zile" — comparație toxică

**Leaderboard**:
- Top 10 săptămânal (luni–duminică) + top 10 all-time
- Userul își vede poziția chiar dacă e #847 — "ești pe locul X. Mai ai 23 XP până la #N-1." (variable reward, hook)
- **Privacy**: opțional `display_name` (nu email). Default afișează nume scurt.
- **Nu permitem cheating** trivial: 1 user = 1 leaderboard entry, XP doar prin completarea lecțiilor (nu manipulare client-side).

---

## 3. Ce voi face în acest PR (concret, ordine de execuție)

### Fix-uri urgente
1. **Orb-bug**: home orb micșorat la **160×160** (vs 280) și ancorat **top-right** al hero, nu jos. Verifică pe mobile (pune-l deasupra textului ca în onboarding).
2. **Demo controls**: șterg `dev-jump` bar, `emotion-row`, `★ triggerCelebrate`, și butonul "Resetează datele demo" din settings.

### Auth flow real
3. Adaug ecranul **Login / Signup** ca prim ecran pentru utilizatori nou-veniți (după onboarding-4 generation, când "construiește lecția" se termină → "Salvează progresul" → login/signup → home).
4. Wireup la backend: `POST /api/auth/signup`, token în localStorage, refresh.
5. Sesiune persistentă: dacă există token valid → sare welcome și mergi la home.

### Vocabular → Statistica
6. Redenumesc tot UI-ul: tab, card-uri, stat label, default route.
7. Adaug `Statistica` view cu sub-secțiuni: **streak heatmap, XP card, modules progress, mastered concepts**, **leaderboard preview**.

### Backend nou
8. **Leaderboard endpoints**:
   - `GET /api/leaderboard/weekly` → top 10 + me
   - `GET /api/leaderboard/all-time` → top 10 + me
   - View MV: `weekly_xp` (user_id, sum xp ultima săpt.)
9. **Stats endpoint**: `GET /api/me/stats` → tot ce afișează Statistica într-un singur fetch.

### Skills agent (cursuri ahuene)
10. **`generate_course` v2**: prompt subject-aware (programming vs language vs math). Pentru programming: insistă pe runnable code, edge cases, "why this matters". 4 lecții în loc de 3, fiecare cu mini-test la finalul ei.
11. **Tone injection**: tonul user (cald/prieten/profi) intră în system prompt.
12. **`generate_test`** skill nou: la fiecare 3 lecții, 5 întrebări amestecate din lessons recente.
13. **`generate_minigame`** skill nou: pentru o lecție, generează **Bug Hunter** snippet (cod cu eroare deliberată).

### Mini-games în UI
14. **Bug Hunter** UI: tab nou "Joc" în `lesson-card`, click pe linia greșită.
15. **Code Assemble** UI: drag-drop list (HTML5 native).

### Documentație
16. **`images/README.md`** rescris cu rezoluții explicite per asset role.
17. **`RESEARCH.md`** (acest doc, dar curățat) commitat la rădăcina repo-ului.

---

## 4. Ce NU voi face în acest PR (ca să nu cadă timeline-ul)

Le scot din scope, le motivez, le las pe **v2**:

- **TTS audio pentru limbi** — costă bani, complică UI, MVP nu e despre limbi
- **Push notifications** — necesită backend de mailer/web-push, hosting fix
- **Discord auth + community** — efort > 1 zi, nu mută D1 retention în PR-ul ăsta
- **Analytics PostHog/Mixpanel** — îți recomand să-l adaugi tu cu un script tag de 5 minute, nu vreau să pun dependency pe API key extern fără credențiale
- **Limbi străine specifice** — modulele rămân, dar marker "Coming soon" pe carduri

---

## 5. Cum verific că am livrat

- Vizual: orb-ul nu mai cade în home (screenshot before/after)
- Vizual: zero butoane demo, nicio mențiune "demo" în prod UI
- Funcțional: signup → login → home → lecție → completare → vezi-te în leaderboard
- Funcțional: tab "Statistica" arată streak, XP, concepte mastered, leaderboard preview
- Funcțional: lecția generată conține Bug Hunter + Code Assemble + exercițiu
- Tehnic: `python -m py_compile backend/**.py` clean; backend pornește; `/api/health` ok
- Tehnic: `python -m http.server` randează frontend fără erori în consolă

---

## 6. Întrebări care îmi rămân (răspunde-mi când poți, nu blochez pe ele)

1. **Tonul "cald" — cum sună pentru tine?** Vreau să calibrez prompt-urile AI. Dă-mi 2-3 fraze model.
2. **Leaderboard — afișăm numele real sau handle?** Default propun handle generat (ex: "Maxim_42"), dar dacă vrei cu nume real, schimb.
3. **MVP doar Programare — agreezi?** Dacă nu, las' și Limbă, dar cu lecții simplified.
4. **Email-ul fondatorilor** pentru "contact" link în footer / settings — pun ceva placeholder sau pui tu?

Răspunzi la astea când ai timp. Eu execut acum punctele de mai sus.

---

> *"You judge a session by its peak and end."* — Yablonski / Kahneman
> Peak-ul tău trebuie să fie aha-moment-ul ("am scris cod care merge"). End-ul: streak preserved + +XP claritate. Restul e zgomot.
