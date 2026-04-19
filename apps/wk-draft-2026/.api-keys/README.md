# API-keys — lokale opslag

Plak hier je API-keys als platte-tekst bestanden. Claude leest ze wanneer jij een data-update vraagt ("haal wedstrijd X op", "update de stand").

## Werkwijze

1. Registreer gratis op https://dashboard.api-football.com/register
2. Kopieer je API-key
3. Maak een bestand `api-football.txt` in deze folder — **alleen** de key op regel 1, verder niks
4. Klaar. Dat bestand is `.gitignore`-d; de key komt nooit in git of op de website.

> ⚠ **Zet de key NIET in deze README** — de README wordt wél gecommit (whitelist in `.gitignore`). Alleen `api-football.txt` is uitgesloten.

## Bestanden

- `api-football.txt` — API-Football (api-sports.io). **Verplicht** voor wedstrijd-updates.

## Security

- Laat deze folder nooit publiek staan.
- Deel hem niet via screenshots/chat.
- Roteer de key zodra je vermoedt dat hij gelekt is (via api-football dashboard).
