#!/usr/bin/env python3
"""Build the self-contained editorial edition without altering data or application.

    python scripts/build_editorial.py
    python scripts/build_editorial.py --check

No third-party Python packages or network requests are required. Font files are
already embedded in site/fonts.css. --check validates sources and compares the
three existing outputs with a fresh in-memory build without writing any files.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import sys
import tempfile


IMMUTABLE_SOURCES = {
    "site/data.js": "756bdb445df5ec4a852bdc155b48117840e5aba9eab7b4b0048749a0a1f74194",
    "site/app.js": "6b6cd6df7e13c0bb83261730a55c0ac139c3af8e90fdaa69a7a20e03fd72e5ff",
}


def source(root: Path, name: str) -> str:
    """Read exact UTF-8 source bytes; never rewrite or normalize the input."""
    path = root / name
    if not path.is_file():
        raise ValueError(f"Missing source: {path}")
    raw = path.read_bytes()
    expected = IMMUTABLE_SOURCES.get(name)
    if expected and hashlib.sha256(raw).hexdigest() != expected:
        raise ValueError(
            f"Original source changed: {path}. Restore the original file; "
            "the editorial redesign must preserve application and data bytes."
        )
    return raw.decode("utf-8")


def artifact_fragment(page: str) -> str:
    """Retain the original artifact format: head content + body, no scaffolding."""
    page = re.sub(r"^</head>[^\S\r\n]*\r?\n?", "\n", page, flags=re.IGNORECASE | re.MULTILINE)
    patterns = (
        r"^<!doctype\s+html[^>]*>[^\S\r\n]*\r?\n?",
        r"^</?(?:html|head|body)\b[^>]*>[^\S\r\n]*\r?\n?",
        r"^<meta\b[^>]*\bcharset\s*=[^>]*>[^\S\r\n]*\r?\n?",
        r"^<meta\b[^>]*\bname\s*=\s*[\"']viewport[\"'][^>]*>[^\S\r\n]*\r?\n?",
    )
    for pattern in patterns:
        page = re.sub(pattern, "", page, flags=re.IGNORECASE | re.MULTILINE)
    return page


def compile_outputs(root: Path) -> dict[str, bytes]:
    template = source(root, "site/index.template.html")
    fonts = source(root, "site/fonts.css")
    editorial_css = source(root, "site/editorial.css")
    airjet_css = source(root, "site/airjet.css")
    ocean = "data:image/webp;base64," + base64.b64encode((root / "site/assets/ocean-v2.webp").read_bytes()).decode("ascii")
    if airjet_css.count("/*__OCEAN_ASSET__*/") != 1:
        raise ValueError("Expected one ocean asset marker in airjet.css")
    airjet_css = airjet_css.replace("/*__OCEAN_ASSET__*/", ocean)
    aircraft = "data:image/webp;base64," + base64.b64encode((root / "site/assets/aircraft/aircraft-poster.webp").read_bytes()).decode("ascii")
    if airjet_css.count("/*__AIRCRAFT_ASSET__*/") != 1:
        raise ValueError("Expected one aircraft poster marker in airjet.css")
    airjet_css = airjet_css.replace("/*__AIRCRAFT_ASSET__*/", aircraft)
    manifest = json.loads((root / "site/assets/aircraft/frames/manifest.json").read_text())
    frames = ["data:image/webp;base64," + base64.b64encode((root / "site/assets/aircraft/frames" / frame["file"]).read_bytes()).decode("ascii") for frame in manifest["frames"]]
    motion_js = source(root, "site/airjet-motion.js")
    if motion_js.count("/*__AIRCRAFT_FRAMES__*/") != 1 or len(frames) < 2:
        raise ValueError("Missing 3D fallback sequence or its build marker")
    motion_js = motion_js.replace("/*__AIRCRAFT_FRAMES__*/", json.dumps(frames, separators=(",", ":"))[1:-1])
    mobile_manifest = json.loads((root / "site/assets/aircraft/frames-mobile/manifest.json").read_text())
    mobile_frames = ["data:image/webp;base64," + base64.b64encode((root / "site/assets/aircraft/frames-mobile" / frame["file"]).read_bytes()).decode("ascii") for frame in mobile_manifest["frames"]]
    if motion_js.count("/*__MOBILE_FRAMES__*/") != 1 or airjet_css.count("/*__MOBILE_POSTER__*/") != 1 or len(mobile_frames) < 2:
        raise ValueError("Missing mobile 3D sequence or its build marker")
    motion_js = motion_js.replace("/*__MOBILE_FRAMES__*/", json.dumps(mobile_frames, separators=(",", ":"))[1:-1])
    airjet_css = airjet_css.replace("/*__MOBILE_POSTER__*/", mobile_frames[0])
    replacements = {
        "/*__DATA__*/": source(root, "site/data.js"),
        "/*__JS__*/": source(root, "site/app.js"),
        "/*__EDITORIAL_CSS__*/": fonts + "\n\n" + editorial_css + "\n\n" + airjet_css + "\n\n" + source(root, "site/refinements.css"),
        "/*__EDITORIAL_JS__*/": source(root, "site/editorial.js") + "\n\n" + source(root, "site/aircraft-scene.js") + "\n\n" + motion_js + "\n\n" + source(root, "site/refinements.js") + "\n\n" + source(root, "site/fleet-geometry.js") + "\n\n" + source(root, "site/fleet-viewer.js"),
    }
    for marker in replacements:
        count = template.count(marker)
        if count != 1:
            raise ValueError(f"Expected exactly one {marker} in template; found {count}.")
    # A single substitution pass prevents accidental expansion of source strings
    # that happen to contain the name of a build marker.
    marker_pattern = re.compile("|".join(re.escape(marker) for marker in replacements))
    page = marker_pattern.sub(lambda match: replacements[match.group(0)], template)
    page_bytes = page.encode("utf-8")
    return {
        "index.html": page_bytes,
        "site/artifact.html": artifact_fragment(page).encode("utf-8"),
        "dist/index.html": page_bytes,
    }


def write_atomic(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".build-", delete=False) as temp:
        temporary = Path(temp.name)
        try:
            temp.write(content)
            temp.flush()
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    try:
        temporary.chmod(0o644)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--check", action="store_true", help="Validate existing outputs without writing.")
    args = parser.parse_args()
    root = args.root.resolve()
    try:
        outputs = compile_outputs(root)
        mismatches = []
        for name, content in outputs.items():
            path = root / name
            if args.check:
                if not path.is_file() or path.read_bytes() != content:
                    mismatches.append(name)
            else:
                write_atomic(path, content)
                print(f"Built {name}: {len(content):,} bytes")
        if mismatches:
            raise ValueError("Outputs are missing or stale: " + ", ".join(mismatches))
    except (OSError, UnicodeError, ValueError) as error:
        print(f"Build failed: {error}", file=sys.stderr)
        return 1
    if args.check:
        print("Verified: all three outputs match the current sources.")
    print("Verified: site/data.js and site/app.js match the unchanged original SHA-256 hashes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
