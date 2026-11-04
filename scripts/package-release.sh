#!/usr/bin/env bash
# Baut das Windows-Paket "Labreporthelp-windows.zip" (fertige App + Node.js zum Mitnehmen).
# Aufruf: bash scripts/package-release.sh [ausgabeordner]
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-release-out}"
WORK="$(mktemp -d)"
PKG="$WORK/Labreporthelp"

# Neueste Node.js-LTS-Version ermitteln
NODE_VERSION="${NODE_VERSION:-$(curl -fsSL https://nodejs.org/dist/index.json | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(JSON.parse(s).find(r=>r.lts).version)})')}"
echo "Node.js $NODE_VERSION"

npm run build

mkdir -p "$PKG/node" "$PKG/server" "$PKG/scripts" "$PKG/mcp"
cp -r dist "$PKG/app"
cp server/aboChat.mjs server/standalone.mjs "$PKG/server/"
cp release/scripts/einrichten.ps1 release/scripts/claude-desktop.mjs "$PKG/scripts/"
# MCP-Server für Claude Desktop mit allen Bausteinen in eine Datei packen
npx rolldown mcp/server.mjs --platform node --format esm --minify --file "$PKG/mcp/server.mjs"
cp "release/Labreporthelp starten.bat" "release/Einrichtung wiederholen.bat" "release/Claude Desktop verbinden.bat" release/LIESMICH.txt "$PKG/"

# Node.js für Windows (64 Bit) holen und Prüfsumme kontrollieren
NODE_ZIP="node-$NODE_VERSION-win-x64.zip"
curl -fsSL -o "$WORK/$NODE_ZIP" "https://nodejs.org/dist/$NODE_VERSION/$NODE_ZIP"
curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt" | grep " $NODE_ZIP\$" > "$WORK/sum.txt"
(cd "$WORK" && sha256sum -c sum.txt)
unzip -q -j "$WORK/$NODE_ZIP" "node-$NODE_VERSION-win-x64/node.exe" "node-$NODE_VERSION-win-x64/LICENSE" -d "$PKG/node"

# Windows-Zeilenenden für Skripte und Textdateien
for f in "$PKG"/*.bat "$PKG"/LIESMICH.txt "$PKG"/scripts/*.ps1; do
  sed -i 's/\r$//; s/$/\r/' "$f"
done
git rev-parse --short HEAD > "$PKG/VERSION.txt" 2>/dev/null || true

mkdir -p "$OUT"
OUT_ABS="$(cd "$OUT" && pwd)"
rm -f "$OUT_ABS/Labreporthelp-windows.zip"
(cd "$WORK" && zip -q -r -9 "$OUT_ABS/Labreporthelp-windows.zip" Labreporthelp)
rm -rf "$WORK"
ls -lh "$OUT_ABS/Labreporthelp-windows.zip"
