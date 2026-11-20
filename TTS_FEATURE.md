# Text-to-Speech (TTS) Feature 🔊

## Descriere

Noul modul **Text-to-Speech** permite citirea vocală a textelor clasice latine și grecești din aplicația GrecLaRo. Utilizează Web Speech API-ul browserului pentru a genera vorbire sintetică naturală.

## Funcționalități

### Butoane de Control

După ce accesezi un text (capitol, rezultat de căutare, sau fragment din texte), vor apărea automat următoarele controale:

- **🔊 Citește** - Pornește lectura textului
- **⏹️ Oprește** - Oprește lectura
- **⏸️ Pauză** - Pune în pauză/Reia lectura
- **Viteză** - Regulator pentru controlul vitezei (0.5x - 2.0x)

### Locații Disponibile

Citirea vocală funcționează în următoarele locații:

1. **Capitolele textelor** - Citește întreg capitolul
2. **Rezultatele căutării** - Citește textul integral din rezultate
3. **Fragmentele zilei** - Citește fragmentele aleatorii din texte

## Cum să Utilizezi

### Pasul 1: Navigare la un Text
Accesează pagina "Texte" și selectează un text clasic (de exemplu, o operă de Cicero).

### Pasul 2: Deschidere Capitol
Deschide un capitol din textul selectat.

### Pasul 3: Utilizare TTS
În pagina capitolului, vei vedea o secțiune de control cu butoane:

```
🔊 Citește  |  ⏹️ Oprește  |  ⏸️ Pauză  |  Viteză: [◄─●─►] 1.0x
```

### Acțiuni Disponibile

```javascript
// Pornire lecturii
// Click pe butonul "🔊 Citește"

// Oprire lecturii
// Click pe butonul "⏹️ Oprește"

// Pauză/Reluare
// Click pe butonul "⏸️ Pauză"

// Reglare viteză
// Trageți regulatorul "Viteză" la stânga (mai lent) sau la dreapta (mai repede)
```

## Suport Browser

Web Speech API este suportat de următoarele browsere:

| Browser | Suport | Note |
|---------|--------|-------|
| Chrome | ✓ | Suport complet |
| Edge | ✓ | Suport complet |
| Safari | ✓ | Suport complet (iOS 14.5+) |
| Firefox | ⚠️ | Suport parțial |
| Opera | ✓ | Suport complet |

### Verificare Suport

Aplicația verifică automat dacă browserul suportă Web Speech API. Dacă browserul nu suportă această funcție, butoanele TTS nu vor apărea.

## Detalii Tehnice

### Limbile Suportate

- **Latină** - `lang: "la"`
- **Greacă Veche** - `lang: "el-GR"`

### Parametri de Citire

```javascript
// Setări implicite:
rate: 0.8    // 0.8x - vorbire mai lentă pentru claritate
pitch: 1.0   // tonul vocii
volume: 1.0  // volum maxim
```

### Modulul TTS

**Fișier:** `js/tts.js`

**Clasa principală:** `TextToSpeech`

**Metode disponibile:**

```javascript
// Pornire citire
tts.speak(text, language);  // language: 'lat' sau 'grc'

// Oprire
tts.stop();

// Pauză/Reluare
tts.togglePause();

// Setări
tts.setRate(0.5 - 2.0);     // Viteză
tts.setPitch(0.5 - 2.0);    // Ton
tts.setVolume(0 - 1);       // Volum
```

**Funcții helper:**

```javascript
// Adaugă controale TTS la un element
addTTSControls(container, text, language);

// Verific suport
tts.isSupported();  // boolean
```

## Implementare în Cod

### Pentru o Pagină de Text Existent

```javascript
// În funcția care afișează textul:
const textContainer = document.getElementById('my-text');
const language = 'lat'; // sau 'grc'

if (typeof tts !== 'undefined' && tts.isSupported()) {
  addTTSControls(textContainer, textContent, language);
}
```

## Limitări și Considerații

1. **Viteză de rețea** - Vocea sintetică se încarcă din cache-ul browserului
2. **Acuratețe pronunție** - Pronuncia latină/greacă este aproximativă (bazată pe setări OS)
3. **Lungime text** - Textele foarte lungi pot avea latență la start
4. **Spațiu de stocare** - Vocea sintetică necesită suport OS pentru sinteza vocii

## Setări de Acces (Accessibility)

- Butonele au etichete ARIA (`aria-label`)
- Controalele sunt accesibile cu tastatură
- Sunt incluse indicatoare vizuale (animație "pulse")
- Suportă moduri teme (clar/întunecat)

## Probleme Cunoscute

1. **Firefox**: Suportul Web Speech API este limitat
2. **iOS Safari**: Vocea sintetică poate necesita permisiuni suplimentare
3. **Pronunțare greacă**: Accentele și respirația greacă pot să nu fie pronunțate corect

## Viitoare Îmbunătățiri

- [ ] Suport pentru format audio descărcabil (MP3/WAV)
- [ ] Selector de voce (voce masculină/feminină)
- [ ] Suport pentru highlight text în timp real
- [ ] Savedcue progress (porțiune din text citit)

## Suport și Raportare Probleme

Dacă ai probleme cu funcția TTS:

1. Verific compatibilitatea browserului
2. Reîncarcă pagina
3. Raportează problema folosind butonul "Feedback" din aplicație

## Credit

Implementare: Web Speech API (W3C)
Stil: GrecLaRo Design System
Limbă: Română

---

**Ultima actualizare:** 2026-11-20
