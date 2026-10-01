# Darija lernen

Kleine PWA zum Lernen von Deutsch → Darija (Lateinschrift). Kein Build-Schritt, reines HTML/CSS/JS.

## Lokal starten

```bash
cd ~/Desktop/Projekte/Darija && python3 -m http.server 8642
```

Dann http://localhost:8642 öffnen.

## Online

Läuft über GitHub Pages: https://mokahlinio.github.io/darija/
Auf dem iPhone in Safari öffnen → Teilen → „Zum Home-Bildschirm“.

Neue Inhalte: Pakete in `tools/make_packs.py` ergänzen, `python3 tools/make_packs.py` ausführen, committen und pushen.
Bereits veröffentlichte Pakete bei Änderungen immer mit höherer `version` – dann bietet die App „Aktualisieren“ an.

## Daten

- Alles liegt im `localStorage` des jeweiligen Geräts.
- Unter **Mehr → Backup** exportieren/importieren (Import führt zusammen, löscht nichts).
- **Liste einfügen** nimmt eine Karte pro Zeile: `Deutsch = Darija | Notiz`.
  Mehrere Schreibweisen mit `/` trennen: `Danke = chokran / shukran`.
