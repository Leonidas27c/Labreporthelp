# Labreporthelp

Ein Schreibprogramm für Laborprotokolle und wissenschaftliche Arbeiten: wie Word, aber mit schnelleren Diagrammen und Tabellen und später mit KI-Unterstützung (Claude).

## Stand

**Schritt 1 – Grundgerüst** (fertig)
- Texteditor im Browser mit einer A4-Seite
- Fett, kursiv, unterstrichen, durchgestrichen, Überschriften, Listen, Ausrichtung
- Rückgängig / Wiederholen
- Speichern als Datei (`*.lrh.json`) und wieder Öffnen (auch mit Strg+S / Strg+O)
- Automatisches Zwischenspeichern im Browser, damit beim Neuladen nichts verloren geht

**Als Nächstes**
2. Aufzieh-Werkzeug: Feld mit der Maus aufziehen → Menü „Tabelle“ / „Diagramm“
3. Diagramm-Einstellungen: Achsen (Anzahl, Beschriftung, Einheit), Hintergrund (kariert, punktiert, blanko)
4. Desktop-App für PC und Laptop

## Starten (für Einsteiger)

1. **Node.js installieren:** Auf <https://nodejs.org> die Version „LTS“ herunterladen und installieren.
2. **Projekt herunterladen:** Auf GitHub oben auf „Code“ → „Download ZIP“ klicken und die ZIP-Datei entpacken.
   (Oder mit Git: `git clone https://github.com/Leonidas27c/Labreporthelp.git`)
3. **Terminal im Projektordner öffnen:**
   - Windows: Den Ordner im Explorer öffnen, oben in die Adresszeile `cmd` tippen und Enter drücken.
   - Mac: Rechtsklick auf den Ordner → „Neues Terminal beim Ordner“.
4. **Einmalig die Bausteine installieren:**
   ```
   npm install
   ```
5. **Programm starten:**
   ```
   npm run dev
   ```
   Danach im Browser <http://localhost:5173> öffnen. Beenden mit Strg+C im Terminal.

## Technik

- [React](https://react.dev) + TypeScript, gebaut mit [Vite](https://vite.dev)
- Texteditor: [Tiptap](https://tiptap.dev)
- Code: `src/App.tsx` (Hauptfenster), `src/components/Toolbar.tsx` (Werkzeugleiste), `src/lib/documentFile.ts` (Speichern/Öffnen)
