# Labreporthelp

Ein Schreibprogramm für Laborprotokolle und wissenschaftliche Arbeiten: wie Word, aber mit schnelleren Diagrammen und Tabellen und später mit KI-Unterstützung (Claude).

## Stand

**Schritt 1 – Grundgerüst** (fertig)
- Texteditor im Browser mit einer A4-Seite
- Fett, kursiv, unterstrichen, durchgestrichen, Überschriften, Listen, Ausrichtung
- Rückgängig / Wiederholen
- Speichern als Datei (`*.lrh.json`) und wieder Öffnen (auch mit Strg+S / Strg+O)
- Automatisches Zwischenspeichern im Browser, damit beim Neuladen nichts verloren geht

**Schritt 2 – Aufzieh-Werkzeug** (fertig)
- Button „Aufziehen“ wählen, dann mit gedrückter linker Maustaste ein Feld aufziehen
- Beim Loslassen erscheint ein Menü: „Diagramm“ oder „Tabelle“ (Esc bricht ab)
- Das Diagramm füllt genau das gezogene Feld: kariert, mit x- und y-Achse
- Am Griff unten rechts lässt sich das Feld größer ziehen, das Raster wächst mit
- „Tabelle“ fügt eine echte Tabelle in der gezogenen Größe ein

**Schritt 3 – Diagramm formatieren** (fertig)
- Diagramm anklicken → rechts öffnet sich „Diagramm formatieren“ (wie in Word)
- Achsen: 2 (x, y) oder 3 (zusätzliche y-Achse rechts)
- Pro Achse: Beschriftung, Einheit, Startwert und Abschnitte
  - feste Schrittweite (z. B. 10 → 0, 10, 20, 30 …) oder
  - automatisch bis zu einem Endwert (das Programm wählt eine runde Schrittweite)
- Hintergrund kariert, punktiert oder blanko, Kästchengröße einstellbar
- Dicke Linie und Zahl alle N Kästchen (Standard: alle 5)
- Breite und Höhe als Zahl eingeben, Diagramm löschen
- Diagramm mit der Maus verschieben: seitlich und an eine andere Stelle im Text
- Das Diagramm rastet auf ganze Abschnitte ein und ist ringsum mit einem Rahmen geschlossen (Kästchen bleiben quadratisch)

**Claude Desktop verbinden** (neu, nutzt dein Claude-Abo)
- Du schreibst in der Claude-Desktop-App, z. B. „Erstelle in Labreporthelp eine
  Messwerttabelle mit Zeit [s] und Temperatur [°C], 10 Zeilen“, und die Tabelle
  erscheint an der Cursorposition in deinem Dokument
- Claude kann Tabellen, Diagrammfelder und Text einfügen und das Dokument lesen
- Oben rechts zeigt die App „Claude Desktop verbunden“
- Kein API-Schlüssel nötig, es zählt dein normales Claude-Abo

Geht auch mit dem **kostenlosen Claude-Konto** (der Chat in der App braucht dagegen Pro oder Max).
Am einfachsten: im Chat-Fenster (✦ Claude) auf „Stattdessen Claude Desktop benutzen“ → „Mit Claude Desktop verbinden“
klicken, dann Claude Desktop neu starten. Im Release-Paket geht es auch mit „Claude Desktop verbinden.bat“.

Einrichtung von Hand:
1. [Claude Desktop](https://claude.ai/download) installieren und anmelden
2. Im Projektordner `npm install` und dann `npm run claude-setup` ausführen.
   Das zeigt dir genau, was du wo in Claude Desktop einträgst.
3. Claude Desktop neu starten, `npm run dev` starten, App im Browser öffnen

**Claude-Chat in der App** (über dein Claude-Abo, kein API-Schlüssel)
- Button „✦ Claude“ oben rechts öffnet den Chat
- Modell wählbar: Haiku 5.5 (spart Nutzung), Sonnet 5.5, Opus 5.5 (Standard), Fable 5.1 (am stärksten, braucht am meisten)
- Dateien anhängen (📎 oder hineinziehen): PDF, Word (.docx), PowerPoint (.pptx), Bilder, Text.
  Z. B. die Versuchsanleitung hochladen und „Erstelle daraus die Messwerttabellen und Diagramme“ schreiben.
  Alte Formate (.doc, .ppt) bitte vorher als .docx/.pptx oder PDF speichern.
- Claude fügt an der Cursorposition Tabellen, Diagrammfelder und Text ein und kennt den Dokumentinhalt
- Technisch: Die App startet auf deinem Rechner Claude Code, das mit deinem Claude-Konto angemeldet ist.
  Gezählt wird deine normale Abo-Nutzung (Pro oder Max).

Einrichtung (einmalig):
1. Claude Code installieren. Windows: PowerShell öffnen und eingeben
   ```
   irm https://claude.ai/install.ps1 | iex
   ```
   Mac: im Terminal `curl -fsSL https://claude.ai/install.sh | bash`
   Windows zusätzlich: Claude Code braucht „Git für Windows“ (https://git-scm.com/download/win).
   `install.bat` installiert beides automatisch mit.
2. Ein neues Terminal öffnen, `claude` eingeben und mit deinem Claude-Konto anmelden. Danach mit `/exit` beenden.
3. `npm run dev` (neu) starten. Fertig.

**Schrift und Farben**
- Schriftfarbe (A) und Textmarker (✎) in der Werkzeugleiste
- Zwei Paletten: „Wissenschaft klassisch“ (gedeckte, dunkle Töne) und „Okabe-Ito“ (auch bei Farbsehschwäche unterscheidbar), dazu eigene Farben

**Drucken und PDF**
- „Drucken / PDF“ (Strg+P) druckt nur das Dokument im A4-Format mit Seitenrändern, ohne Adresse und Datum am Rand
- Gestrichelte Linien im Editor zeigen, wo beim Drucken eine neue Seite beginnt
- PDFs nachträglich bearbeiten: „Öffnen“ nimmt auch PDFs. Eine mit Labreporthelp über „Als PDF speichern“ (Chrome/Edge) erzeugte PDF enthält das ganze Dokument unsichtbar und öffnet sich wieder vollständig bearbeitbar, mit Tabellen, Diagrammen und Formatierung. Danach ändern und neu als PDF speichern.
- Fremde PDFs (oder PDFs aus „Microsoft Print to PDF“) werden als Text übernommen: Überschriften, Absätze, Listen und einfache Tabellen werden erkannt, Diagramme und Bilder nicht. Eingescannte PDFs ohne Text gehen nicht.
- Tabellen und Diagramme werden nicht von einem Seitenumbruch zerschnitten: passen sie nicht mehr auf die Seite, rutschen sie auf die nächste. Überschriften bleiben nicht allein unten auf der Seite stehen. Beim Drucken wird daraus ein echter Seitenumbruch.

**Tabellen** (wie Diagramme: beweglich und mit Eigenschaften)
- „Aufziehen“ → „Tabelle“ fügt eine echte Tabelle mit Kopfzeile ein (Größe passend zum Feld)
- Griff ✥ oben links: Tabelle verschieben (nach links/rechts und an eine andere Stelle im Text)
- Griff unten rechts: Tabelle größer/kleiner ziehen, Spalten wachsen gleichmäßig mit
- Linie zwischen zwei Spalten ziehen: einzelne Spalte breiter/schmaler
- In die Tabelle klicken → rechts öffnet sich „Tabelle formatieren“:
  - Beschriftung („Tabelle 1: …“) über oder unter der Tabelle, sie wandert beim Verschieben mit
  - Zeilen und Spalten (Anzahl, einfügen, löschen, Zellen verbinden), Kopfzeile an/aus
  - Pro Spalte: Größe und Einheit (geschrieben als „t [s]“, „t / s“ oder „t in s“), Ausrichtung, Breite
  - Linien: Gitter, nur waagerecht, wissenschaftlich (3 Linien), nur Rahmen oder keine; Stärke und Farbe
  - Farben: Kopfzeile, jede zweite Zeile einfärben; Schriftgröße
  - Größe und Lage: Breite, Zeilenhöhe, Abstand vom Rand, zentrieren, auf Seitenbreite
- Alte Dateien mit Tabellen-Platzhalter werden beim Öffnen automatisch in echte Tabellen umgewandelt

**Als Nächstes**
4. Desktop-App für PC und Laptop

## Auf einem neuen PC oder Laptop installieren (Windows)

**Am einfachsten: das fertige Paket aus „Releases“** (rechts auf der GitHub-Seite)
1. Beim neuesten Release **`Labreporthelp-windows.zip`** herunterladen und entpacken (Rechtsklick → „Alle extrahieren“).
2. **`Labreporthelp starten.bat`** doppelklicken. Node.js ist schon dabei. Beim ersten Start werden Git und
   Claude Code eingerichtet, und du meldest dich bei Claude an. Danach öffnet sich die App im Browser.

Für Entwickler: Ein neues Release entsteht, wenn ein Tag wie `v0.1.0` gepusht wird
(`.github/workflows/release.yml` baut dann das Paket mit `scripts/package-release.sh`).

**Oder aus dem Quellcode** (braucht mehr Installation)

1. Auf GitHub oben auf „Code“ → „Download ZIP“ klicken und die ZIP-Datei entpacken,
   z. B. nach `Dokumente\Labreporthelp`.
2. Im entpackten Ordner **`install.bat`** doppelklicken. Das Skript
   - installiert Node.js und Claude Code, falls sie fehlen,
   - richtet das Programm ein,
   - öffnet die Anmeldung bei Claude (dein Konto mit Pro oder Max),
   - legt eine Verknüpfung „Labreporthelp“ auf dem Desktop an.
   Falls Windows „Der Computer wurde durch Windows geschützt“ meldet: „Weitere Informationen“ → „Trotzdem ausführen“.
3. Danach startest du immer mit **`start.bat`** oder der Desktop-Verknüpfung.
   Der Browser öffnet sich von selbst. Das schwarze Fenster offen lassen, solange du arbeitest.

Deine Dokumente: „Speichern“ legt eine Datei zum Weiterbearbeiten an (nimm sie z. B. per USB-Stick oder Cloud mit).
„Drucken / PDF“ öffnet den Druckdialog. Dort als Drucker „Als PDF speichern“ wählen, um ein PDF zu bekommen.
Nur so lässt sich die PDF später über „Öffnen“ wieder vollständig bearbeiten („Microsoft Print to PDF“ geht auch,
dann wird beim Öffnen aber nur der Text übernommen).

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
- Code:
  - `src/App.tsx` – Hauptfenster
  - `src/components/Toolbar.tsx` – Werkzeugleiste
  - `src/components/DrawLayer.tsx` – Aufzieh-Werkzeug und Menü
  - `src/components/ChartView.tsx`, `src/extensions/ChartNode.ts` – Diagrammfeld
  - `src/components/ChartPanel.tsx` – Seitenleiste „Diagramm formatieren“
  - `src/lib/chartModel.ts` – Einstellungen und Berechnung der Abschnitte
  - `src/extensions/LabTable.ts` – Tabelle mit Griffen zum Verschieben und Vergrößern
  - `src/components/TablePanel.tsx` – Seitenleiste „Tabelle formatieren“
  - `src/lib/tableModel.ts` – Einstellungen der Tabelle und Hilfen zum Umbauen
  - `src/extensions/TablePlaceholderNode.ts` – wandelt alte Tabellen-Platzhalter um
  - `src/lib/documentFile.ts` – Speichern/Öffnen
  - `src/lib/pdfEmbed.ts`, `src/lib/pdfImport.ts` – Dokument in der PDF mitspeichern, PDFs wieder öffnen
  - `src/components/ChatPanel.tsx` – Chat mit Claude
  - `src/lib/aboChat.ts` – Chat-Anfrage aus der App
  - `server/aboChat.mjs` – startet Claude Code auf deinem Rechner (läuft in `npm run dev` mit)
  - `src/lib/attachments.ts` – Dateien für Claude lesen (PDF, Word, PowerPoint, Bilder)
  - `src/lib/documentTools.ts` – was Claude im Dokument tun kann
  - `mcp/server.mjs` – MCP-Server für Claude Desktop
  - `src/lib/desktopBridge.ts` – Verbindung der App zum MCP-Server
