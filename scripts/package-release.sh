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
cp server/aboChat.mjs server/standalone.mjs server/desktopConfig.mjs server/markitdown.mjs server/markitdown_convert.py "$PKG/server/"
cp release/scripts/einrichten.ps1 release/scripts/claude-desktop.mjs release/scripts/update.mjs release/scripts/update-installieren.bat "$PKG/scripts/"
# MCP-Server für Claude Desktop mit allen Bausteinen in eine Datei packen
npx rolldown mcp/server.mjs --platform node --format esm --minify --file "$PKG/mcp/server.mjs"
cp "release/Labreporthelp starten.bat" "release/Einrichtung wiederholen.bat" "release/Claude Desktop verbinden.bat" release/LIESMICH.txt "$PKG/"

# Node.js für Windows (64 Bit) holen und Prüfsumme kontrollieren
NODE_ZIP="node-$NODE_VERSION-win-x64.zip"
curl -fsSL -o "$WORK/$NODE_ZIP" "https://nodejs.org/dist/$NODE_VERSION/$NODE_ZIP"
curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt" | grep " $NODE_ZIP\$" > "$WORK/sum.txt"
(cd "$WORK" && sha256sum -c sum.txt)
unzip -q -j "$WORK/$NODE_ZIP" "node-$NODE_VERSION-win-x64/node.exe" "node-$NODE_VERSION-win-x64/LICENSE" -d "$PKG/node"

# Python für Windows (64 Bit) mit Microsoft markitdown: wandelt hochgeladene Versuchsanleitungen
# (PDF, Word, PowerPoint, Excel) in Markdown um, bevor sie an Claude gehen.
# Quelle ist das offizielle NuGet-Paket "python" der Python Software Foundation (enthält alles, was
# python.exe braucht). Die Pakete werden als fertige Windows-Wheels geholt, nichts wird kompiliert.
PY_MINOR="${PY_MINOR:-3.13}"
PY_VERSION="${PY_VERSION:-$(curl -fsSL https://api.nuget.org/v3-flatcontainer/python/index.json | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m=process.argv[1]+".";
  console.log(JSON.parse(s).versions.filter(v=>v.startsWith(m)&&!v.includes("-")).pop())})' "$PY_MINOR")}"
echo "Python $PY_VERSION"
curl -fsSL -o "$WORK/python.nupkg" "https://api.nuget.org/v3-flatcontainer/python/$PY_VERSION/python.$PY_VERSION.nupkg"
# Prüfsumme (SHA-512) aus dem NuGet-Katalog kontrollieren
PY_CATALOG="$(curl -fsSL --compressed "https://api.nuget.org/v3/registration5-gz-semver2/python/$PY_VERSION.json" | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).catalogEntry))')"
PY_HASH="$(curl -fsSL "$PY_CATALOG" | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(j.packageHashAlgorithm!=="SHA512")process.exit(1);console.log(j.packageHash)})')"
[ "$(openssl dgst -sha512 -binary "$WORK/python.nupkg" | base64 -w0)" = "$PY_HASH" ] || { echo "Prüfsumme von Python stimmt nicht" >&2; exit 1; }
mkdir -p "$WORK/py"
unzip -q "$WORK/python.nupkg" 'tools/*' -d "$WORK/py"
mv "$WORK/py/tools" "$PKG/python"
# Nicht gebraucht: Tests, IDLE, Tk
rm -rf "$PKG/python/Lib/test" "$PKG/python/Lib/idlelib" "$PKG/python/Lib/tkinter" "$PKG/python/Lib/turtledemo" \
       "$PKG/python/DLLs/"_tk*.pyd "$PKG/python/DLLs/"tcl*.dll "$PKG/python/DLLs/"tk*.dll "$PKG/python/tcl"
MARKITDOWN_SPEC="$(sed -n "s/^export const MARKITDOWN_SPEC = '\\(.*\\)'$/\\1/p" scripts/markitdown-setup.mjs)"
echo "$MARKITDOWN_SPEC"
python3 -m pip install --disable-pip-version-check -q --no-compile \
  --target "$PKG/python/Lib/site-packages" \
  --platform win_amd64 --implementation cp --python-version "$PY_MINOR" --only-binary=:all: \
  "$MARKITDOWN_SPEC"
# Platz sparen: magika (Dateityp-Erkennung über ein KI-Modell, braucht onnxruntime und die Visual-C++-Laufzeit)
# wird nicht gebraucht, weil die Dateiendung immer bekannt ist; server/markitdown_convert.py ersetzt es.
# Dazu Tests, pip und Entwicklerdateien.
SP="$PKG/python/Lib/site-packages"
rm -rf "$SP"/magika "$SP"/magika-* "$SP"/onnxruntime "$SP"/onnxruntime-* "$SP"/flatbuffers "$SP"/flatbuffers-* \
       "$SP"/google "$SP"/protobuf-* "$SP"/pip "$SP"/pip-* "$SP"/bin \
       "$PKG/python/include" "$PKG/python/libs" "$PKG/python/Lib/ensurepip"
find "$PKG/python" -type d \( -name __pycache__ -o -name tests \) -prune -exec rm -rf {} +

# Windows-Zeilenenden für Skripte und Textdateien
for f in "$PKG"/*.bat "$PKG"/LIESMICH.txt "$PKG"/scripts/*.ps1 "$PKG"/scripts/*.bat; do
  sed -i 's/\r$//; s/$/\r/' "$f"
done
# Versionsnummer (z. B. v0.2.0) für die Update-Prüfung beim Start; ohne Release nur die Commit-Kennung
if [ -n "${RELEASE_VERSION:-}" ]; then
  echo "$RELEASE_VERSION" > "$PKG/VERSION.txt"
else
  git rev-parse --short HEAD > "$PKG/VERSION.txt" 2>/dev/null || true
fi

mkdir -p "$OUT"
OUT_ABS="$(cd "$OUT" && pwd)"
rm -f "$OUT_ABS/Labreporthelp-windows.zip"
(cd "$WORK" && zip -q -r -9 "$OUT_ABS/Labreporthelp-windows.zip" Labreporthelp)
rm -rf "$WORK"
ls -lh "$OUT_ABS/Labreporthelp-windows.zip"
