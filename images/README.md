# `images/` — assets statice ale prototipului

Pune aici orice imagine de care ai nevoie. Toate sunt **opționale** —
prototipul rulează 100% fără ele (folosește SVG/CSS pentru orb, embers, UI).

---

## Asset-uri și rezoluții recomandate

Toate dimensiunile sunt `lățime × înălțime` în pixeli. Folosește `@2x` pentru
ecrane retina (ex: `logo.png` = 64×64, `logo@2x.png` = 128×128).

### Brand & favicon

| Fișier              | Rezoluție   | Format | Note                               |
|---------------------|-------------|--------|------------------------------------|
| `favicon.ico`       | 32×32       | .ico   | tab browser                        |
| `favicon-16.png`    | 16×16       | .png   | fallback explicit                  |
| `favicon-32.png`    | 32×32       | .png   | fallback explicit                  |
| `apple-touch.png`   | 180×180     | .png   | shortcut iOS / safari pin          |
| `og-image.png`      | 1200×630    | .png   | OpenGraph share (Facebook, X, IG)  |
| `logo-light.svg`    | vector      | .svg   | logo Wispucci pe fundal închis     |
| `logo-dark.svg`     | vector      | .svg   | logo pe fundal deschis             |
| `logo.png`          | 256×256     | .png   | fallback raster pentru logo        |

### Backgrounds (opționale; default e CSS gradient)

| Fișier              | Rezoluție   | Format | Note                                       |
|---------------------|-------------|--------|--------------------------------------------|
| `welcome-bg.jpg`    | 1920×1080   | .jpg   | fundal welcome — desktop                   |
| `welcome-bg-mob.jpg`| 1080×1920   | .jpg   | fundal welcome — mobile (verticală)        |
| `lesson-bg.jpg`     | 1920×1080   | .jpg   | fundal lecție — discret, fără concurență   |
| `celebrate-bg.png`  | 1920×1080   | .png   | celebrare (transparent peste embers)       |
| `embers-fallback.png`| 1024×1024  | .png   | fallback dacă canvas nu e suportat         |

### Iconițe modul / subiect

Folosite în topic-card / module-tile. Default e emoji + glyph; imaginea e
opțională ca să dai brand specific cursurilor.

| Fișier                         | Rezoluție   | Format | Note                |
|--------------------------------|-------------|--------|---------------------|
| `subject-programare.svg`       | vector      | .svg   | iconă pentru cod    |
| `subject-limba.svg`            | vector      | .svg   | iconă pentru limbi  |
| `subject-matematica.svg`       | vector      | .svg   | iconă pentru mate   |
| `module-{N}-cover.png`         | 800×450     | .png   | cover modul (16:9)  |

### Avatare default

| Fișier                | Rezoluție | Format | Note                                  |
|-----------------------|-----------|--------|---------------------------------------|
| `avatar-default.png`  | 256×256   | .png   | avatar fallback (cerc)                |
| `avatar-orb.png`      | 256×256   | .png   | avatar Wispucci (orb extras)          |

### Mini-game / lesson content (dacă vrei imagini în lecții)

| Fișier                  | Rezoluție   | Format | Note                                 |
|-------------------------|-------------|--------|--------------------------------------|
| `mg-bug-{topic}.png`    | 600×360     | .png   | screenshot cod cu bug, opțional      |
| `mg-assemble-{topic}.png`| 600×360    | .png   | hint vizual pentru code assemble     |

### Screenshots pentru documentație (PR / README repo principal)

| Fișier                  | Rezoluție   | Format | Note                                 |
|-------------------------|-------------|--------|--------------------------------------|
| `screen-welcome.png`    | 1440×900    | .png   | screenshot welcome (desktop)         |
| `screen-home.png`       | 1440×900    | .png   | screenshot home (desktop)            |
| `screen-lesson.png`     | 1440×900    | .png   | screenshot lecție (desktop)          |
| `screen-stats.png`      | 1440×900    | .png   | screenshot Statistica                |
| `screen-mobile.png`     | 390×844     | .png   | screenshot mobil (iPhone 14 Pro)     |

---

## Cum le folosești în cod

### În HTML
```html
<img src="./images/welcome-bg.jpg" alt="" loading="lazy" />
```

### În CSS
```css
.welcome-wrap {
  background-image: url('./images/welcome-bg.jpg');
  background-size: cover;
  background-position: center;
}
```

### Cu @2x retina
```html
<img
  src="./images/logo.png"
  srcset="./images/logo.png 1x, ./images/logo@2x.png 2x"
  width="64" height="64" alt="Wispucci"
/>
```

---

## Reguli

- **Numirea fișierelor:** kebab-case, doar litere mici / cifre / `-`. Fără
  spații, fără diacritice. Ex: `welcome-bg.jpg`, NU `Welcome BG.jpg`.
- **Format:**
  - Fotografii / fundaluri → `.jpg` (calitate 80%, sub 250 KB / imagine).
  - Iconițe → `.svg` (vector, scalabil).
  - Screenshots / UI → `.png` (lossless, sub 500 KB).
  - OpenGraph / share → `.png` (lossless, sub 800 KB).
- **Compresie:** rulează imaginile prin
  [TinyPNG](https://tinypng.com/) sau `cwebp` înainte de commit.
- **`.gitkeep`** ține folderul în git când e gol — nu îl șterge.
- **Drepturi:** folosește doar imagini ale tale sau cu licență liberă
  (Unsplash, Pexels). Niciodată stockuri plătite ale concurenților.
