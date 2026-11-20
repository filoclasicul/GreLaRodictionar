# 🔊 Text-to-Speech Quick Start Guide

Citire vocală în 30 de secunde!

## Pași Rapizi

### 1️⃣ Accesează Textele
```
GrecLaRo → Texte → Autori latini (sau Autori greci)
```

### 2️⃣ Alege un Text
```
De exemplu: M. Tullius Cicero → Pro P. Quinctio
```

### 3️⃣ Deschide un Capitol
```
Selectează orice capitol din operă
```

### 4️⃣ Apasă Butonul Roșu
```
🔊 Citește
```

**Done!** ✅ Textul se citește automat! 🎧

---

## Comenzi Disponibile

| Buton | Acțiune |
|-------|---------|
| 🔊 Citește | Pornește lectura |
| ⏹️ Oprește | Oprește complet |
| ⏸️ Pauză | Pauză/Reluare |
| [◄─●─►] | Reglează viteza |

---

## Tipuri de Viteză

```
0.5x  |  0.6x  |  0.8x  |  1.0x  |  1.2x  |  1.5x  |  2.0x
 zeer  |  lent  |  bună  | normal | repede | foarte | maxim
 lent  |        |        |        |        | repede |
```

**Recomandare:** 0.8x pentru Latină (mai clar)

---

## Cazuri de Utilizare

### 📚 Lucru la Birou
```
Viteză: 1.0x
Mod: Luminos
Citire: Continuă până la finalizare
```

### 🚗 Conducție/Autobuz
```
Viteză: 0.6x
Mod: Întunecat
Volum: Maxim
```

### 🎓 Studiu
```
Viteză: 0.8x
Pauzează între fraze
Verifică dicționarul pentru cuvinte noi
```

### 🌙 Seara Relaxare
```
Viteză: 0.7x
Mod: Întunecat
Volum: Mediu
```

---

## Probleme și Soluții

### ❌ **Nu aud nimic**
✅ **Soluție:**
1. Verific volumul browserului
2. Verific volumul sistemului
3. Reîncarcă pagina
4. Testez cu alt browser (Chrome, Edge, Safari)

### ❌ **Pronuncia e ciudată**
✅ **Soluție:**
- E normal! Sistemele de TTS folosesc pronunție aproximativă
- Înclinațiile și accentele grecești/latine sunt dificile de sintetizat
- Vorbește mai lent (0.5x-0.6x) pentru mai multă claritate

### ❌ **Merge lent pe telefon**
✅ **Soluție:**
1. Încarcă vocea (odată la început)
2. Funcționează offline după cache
3. Reîncarcă browser-ul pe fonduri libere

### ❌ **Nu funcționează pe Firefox**
✅ **Soluție:**
- Firefox are suport limitat
- Utilizează Chrome, Edge, Safari, Opera

---

## Fapte Interesante

🎯 **Ce Browser-e Suportă?**
- Chrome, Chromium ✓
- Edge ✓
- Safari (iOS, macOS) ✓
- Opera ✓
- Firefox (beta) ⚠️

📊 **Performanță:**
- Fără lag după inițializare
- Funcționează complet OFFLINE
- Zero date tracking
- Fără subscripție

🎨 **Design:**
- Responsive (merge pe desktop+mobile)
- Suportă teme (clar/întunecat)
- Accesibil (WCAG AA)

---

## Combinații cu Alte Funcții

### 📖 TTS + Dicționar
```
1. Ascultă textul cu TTS (viteza 0.8x)
2. Pauzează când auzi un cuvânt necunoscut
3. Copiază cuvântul și caută în dicționar
4. Reia lectura
```

### 🔍 TTS + Căutare
```
1. Caută după autor (ex: "Cicero")
2. Vezi rezultatele textelor
3. Deschide textul complet
4. Citește vocală pentru întreg textul
```

### ✨ TTS + Fragmente Zilei
```
1. Reîmprospătează fragmentele zilei
2. Apasă 🔊 Citește pe oricare
3. Ascultă o propoziție latinească motivantă
4. Accesează textul complet dacă îți place
```

---

## Setări Avansate (Pentru Developers)

### Inițializare Manuală
```javascript
// Verifică suport
if (tts.isSupported()) {
  console.log('TTS disponibil!');
}

// Pornire citire
tts.speak('Salve!', 'lat');  // Latină
tts.speak('Χαῖρε!', 'grc');  // Greacă

// Reglare viteză
tts.setRate(0.8);  // Viteza 0.8x
```

### Adăugare Controale la Element Custom
```javascript
const myText = document.getElementById('my-text');
addTTSControls(myText, 'Text de citit', 'lat');
```

---

## Raportare Probleme

Dacă ceva nu funcționează:
1. Apasă ❓ **Feedback** (în aplicație)
2. Descrie problema
3. Menționnează browserul tău
4. Submit!

---

## Credit

**Tehnologie:** Web Speech API (W3C)
**Design:** GrecLaRo UI System
**Limbă:** Română (România)
**Status:** Beta (Stabil)

---

**Gata! Ai puterea unei voici antice în buzunarul tău! 🎧**

Enjoy! 🎉

---

*Ultima update: 2026-11-20*
