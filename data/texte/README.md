# Baza de texte

Adaugă fișierele în `lat/<autor>/` sau `gr/<autor>/`, apoi adaugă fiecare cale relativă în `texte.json`:

```json
[
  {
    "path": "lat/Cicero/numele-textului.xml"
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
