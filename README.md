# FiloClasicul

## Structura aplicației

- `index.html` conține structura și elementele interfeței, fără CSS sau JavaScript inline.
- `css/style.css` conține stilurile și temele vizuale.
- `js/main.js` inițializează interfața și conectează acțiunile utilizatorului.
- `js/dictionar.js` gestionează căutarea și afișarea dicționarului.
- `js/corpus.js` gestionează catalogul și afișarea textelor clasice.
- `js/tts.js` implementează funcția de text-to-speech (citire vocală) pentru texte.
- `data/litere/` păstrează dicționarele organizate pe limbă și literă; `data/texte/` păstrează textele organizate pe limbă și autor.

## Noutăți: Text-to-Speech (TTS) 🔊

Acum poți **asculta textele latine și grecești** cu voce sintetică! 

- Citire vocală pentru toate capitolele textelor
- Control viteză (0.5x - 2.0x)
- Butoane: Play, Stop, Pause/Resume
- Funcționează pe Chrome, Edge, Safari, Opera
- Citire din fragmente zilei și rezultate căutare

[Detalii complete](./TTS_FEATURE.md)