# `images/` — assets statice ale prototipului

Pune aici orice imagine de care ai nevoie:

- **dovezi / screenshots** (poți să-mi le citezi în chat ca să fiu pe aceeași pagină)
- **fundaluri** alternative pentru welcome / lesson / celebrate
- **avatare** pentru cont utilizator
- **iconițe ale modulelor** dacă vrei să înlocuiești emoji-urile actuale

## Cum le folosești în cod

### În HTML (img direct)
```html
<img src="./images/numele-fisierului.jpg" alt="descriere" />
```

### În CSS (background)
```css
.welcome-wrap {
  background-image: url('./images/welcome-bg.jpg');
  background-size: cover;
}
```

### Numiri recomandate
- `welcome-bg.jpg` — fundal pentru ecranul de welcome
- `lesson-bg.jpg` — fundal pentru ecranul de lecție
- `avatar-default.png` — avatar implicit
- `module-2-cover.png` — cover pentru modulul 2

## Format

- **Fotografii** → `.jpg` (cu compresie, sub 200 KB de imagine)
- **Iconițe** → `.svg` (vector, scalabil)
- **Screenshots / UI** → `.png` (lossless, sub 500 KB)

## Note

- Numele fișierelor: doar litere mici, cifre și `-` (kebab-case). Fără spații, fără diacritice.
- `.gitkeep` ține folderul în git când e gol — nu îl șterge.
