# Baza de texte

Adaugă fișierele în `lat/<autor>/` sau `gr/<autor>/` și regenerează lista cu:

```bash
node scripts/build-text-manifest.mjs
```

Scriptul generează în `texte.json` calea și metadatele de catalog (titlu, autor, limbă și volum) pentru fiecare document. Documentele complete se încarcă doar când sunt necesare. Pentru o intrare adăugată manual, include metadatele pentru ca opera să apară corect în catalog și în recomandările de căutare:

```json
[
  {
    "path": "lat/Cicero/numele-textului.xml",
    "title": "Titlul operei",
    "author": "M. Tullius Cicero",
    "language": "lat",
    "volume": "1"
  }
]
```

Sunt acceptate fișiere TEI XML și fișiere JSON cu `title` și unul dintre `text`, `paragraphs` sau `chapters`. Exemplu JSON:

```json
{
  "title": "Titlul operei",
  "author": "Numele autorului",
  "language": "lat",
  "collectionTitle": "Titlul colecției",
  "volume": "1",
  "source": "Sursa textului",
  "license": "Licența",
  "licenseUrl": "https://example.org/licenta",
  "chapters": [
    {
      "number": "1",
      "heading": "Primul capitol",
      "paragraphs": ["Primul paragraf.", "Al doilea paragraf."]
    }
  ]
}
```

`chapters` poate conține obiecte cu `number`, `heading` și `text` în loc de `paragraphs`. În lipsa capitolelor, `text` poate fi un șir, iar `paragraphs` o listă de șiruri. Pagina „Texte” (`index.html#texte`) organizează documentele din ambele formate după autor, operă, volum și capitol. Sursa și licența sunt afișate cu textul. Colecția este separată de fișierele de date ale dicționarului.
