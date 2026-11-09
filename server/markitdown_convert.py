"""Wandelt eine Datei (PDF, Word, PowerPoint, Excel, HTML ...) mit Microsoft markitdown in Markdown um.

Aufruf:  python markitdown_convert.py <datei>   -> Markdown auf stdout (UTF-8)
         python markitdown_convert.py --check   -> Versionsnummer, wenn markitdown nutzbar ist
Wird vom lokalen Labreporthelp-Server gestartet (server/markitdown.mjs).
"""
import logging
import sys
import types


def _magika_stub():
    """markitdown erkennt Dateitypen mit magika (braucht onnxruntime und die Visual-C++-Laufzeit).
    Fehlt die Laufzeit, reicht auch die Dateiendung: dann ein Ersatz, der "unbekannt" meldet."""
    try:
        import magika  # noqa: F401

        return
    except Exception:  # ImportError oder DLL-Fehler unter Windows
        pass

    class _Result:
        status = "unavailable"

    class Magika:
        def identify_stream(self, _stream):
            return _Result()

    stub = types.ModuleType("magika")
    stub.Magika = Magika
    sys.modules["magika"] = stub


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
    # Warnungen von pdfminer & Co. (z. B. zu Schriften) nicht ausgeben
    logging.disable(logging.WARNING)
    _magika_stub()
    try:
        from markitdown import MarkItDown, __version__
    except Exception as e:
        print(f"markitdown ist nicht installiert ({e})", file=sys.stderr)
        return 3

    if len(sys.argv) != 2:
        print("Aufruf: markitdown_convert.py <datei> | --check", file=sys.stderr)
        return 2
    if sys.argv[1] == "--check":
        print(__version__)
        return 0

    try:
        result = MarkItDown(enable_plugins=False).convert(sys.argv[1])
    except Exception as e:
        print(f"{type(e).__name__}: {e}", file=sys.stderr)
        return 1
    sys.stdout.write(result.text_content or "")
    return 0


if __name__ == "__main__":
    sys.exit(main())
