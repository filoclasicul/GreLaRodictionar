# Funcție Text-to-Speech pentru Profilurile Autorilor

## Descriere

Am adăugat funcționalitate text-to-speech pentru citirea descrierilor autorilor latini și greci din pagina de navigare a textelor clasice.

## Ce s-a adăugat

### 1. **Modificări în `js/corpus.js`** (linia ~1424-1430)
- Adăugat controale TTS sub profilul fiecărui autor
- Detectează automat limba (latină/greacă) bazată pe `textNavigation.languageGroup`
- Citește descrierea textului autorului atunci când utilizatorul apasă butonul "🔊 Citește"

### 2. **Modificări în `css/style.css`** (liniile 1363-1377)
- Stil CSS pentru containerul TTS din profilul autorului
- Design harmonios cu restul paginii (culoare gold-light, padding mic)
- Butoane redimensionate pentru a se încadra bine în profilul compact

### 3. **Imagini Autor Actualizate în `js/main.js`**
- Adăugat imagini pentru Lucretius, Quintilian și Seneca
- URL-uri de Wikimedia Commons pentru imagini cu calitate bună

## Cum funcționează

1. Accesezi pagina "Texte clasice" din aplicație
2. Selectezi o colecție de autori (Autori latini sau Autori greci)
3. Fiecare autor are un profil cu imagine și descriere
4. Sub descriere apare butonul **"🔊 Citește"** (dacă browserul suportă Web Speech API)
5. Apasă butonul pentru a auzi descrierea citită în voce
6. Poți ajusta viteza de citire, face pauză sau opri citirea

## Limbile suportate

- **Latină** (`la`): Pentru autori latini (Caesar, Cicero, Vergiliu, etc.)
- **Greacă veche** (`el-GR`): Pentru autori greci (Platon, Aristotel, Homer, etc.)

## Compatibilitate cu browserele

- ✅ Chrome/Chromium (complet suportat)
- ✅ Edge (complet suportat)
- ✅ Safari (complet suportat)
- ✅ Opera (complet suportat)
- ⚠️ Firefox (suport parțial)

## Fișiere modificate

- `js/corpus.js` - Adăugat logica TTS pentru profilurile autorilor
- `css/style.css` - Adăugat stilul pentru containerul TTS din profilul autorului
- `js/main.js` - Adăugat imagini noi pentru Lucretius, Quintilian, Seneca
