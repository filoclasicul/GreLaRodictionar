# Configurarea formularului de mesaje

Formularul trimite emailuri printr-o funcție Cloudflare Pages și API-ul Resend. Adresa destinatarului și cheia API sunt citite numai pe server și nu sunt incluse în pagină.

## 1. Configurează Resend

1. Creează un cont la [Resend](https://resend.com/).
2. Adaugă și verifică domeniul de pe care vor fi expediate mesajele.
3. Creează o cheie API cu permisiunea de trimitere email.

## 2. Adaugă variabilele în Cloudflare

În proiectul Pages, deschide **Settings → Variables and Secrets** și configurează pentru mediul Production:

| Nume | Tip | Valoare |
|---|---|---|
| `RESEND_API_KEY` | Secret | Cheia API creată în Resend |
| `FEEDBACK_TO` | Variable | Adresa ta de primire |
| `RESEND_FROM_EMAIL` | Variable | Un expeditor de pe domeniul verificat, de exemplu `Dicționar <mesaje@domeniul-tău.ro>` |

Nu pune cheia API în HTML, JavaScript public sau în repository.

## 3. Publică site-ul

Funcția din `functions/api/feedback.js` devine ruta `POST /api/feedback` în Cloudflare Pages. Publică repository-ul cu rădăcina proiectului setată la rădăcina repository-ului și declanșează un nou deployment după adăugarea variabilelor.

Formularul include un câmp anti-spam ascuns și limite de validare. Pentru un site public, configurează și o regulă Cloudflare de limitare a cererilor către `/api/feedback`.
