#!/usr/bin/env python3
"""Reproducible development-only brand overlay for pinned upstream ERP checkouts.

Keeps upstream Git history and license files intact. Never run on production.
"""
from __future__ import annotations

import argparse
import re
import shutil
from pathlib import Path
from xml.sax.saxutils import escape


class BrandError(ValueError):
    pass


def valid_settings(name: str, initials: str, accent: str, currency: str, timezone: str) -> None:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 &'.,()/-]{1,79}", name):
        raise BrandError("School name must be 2-80 plain-text characters without quotes or newlines.")
    if not re.fullmatch(r"[A-Za-z0-9]{1,4}", initials):
        raise BrandError("Brand initials must be 1-4 letters or numbers.")
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", accent):
        raise BrandError("Accent must be a six-digit hexadecimal color.")
    if not re.fullmatch(r"[A-Z]{3}", currency):
        raise BrandError("Currency must be a three-letter uppercase ISO currency code.")
    if not re.fullmatch(r"[A-Za-z_]+/[A-Za-z_]+(?:/[A-Za-z_]+)?", timezone):
        raise BrandError("Timezone must be an IANA zone such as Africa/Lagos.")


def update_env(text: str, settings: dict[str, str]) -> str:
    lines = text.splitlines()
    replaced = set()
    output = []
    for line in lines:
        m = re.match(r"^([A-Z][A-Z0-9_]*)=", line)
        if m and m.group(1) in settings:
            key = m.group(1)
            if key not in replaced:
                output.append(key + "=" + settings[key])
                replaced.add(key)
        else:
            output.append(line)
    for key, value in settings.items():
        if key not in replaced:
            output.append(key + "=" + value)
    return "\n".join(output) + "\n"


def require_patchable(file: Path, original: str, replacement: str) -> str:
    text = file.read_text(encoding="utf-8")
    if original not in text and replacement not in text:
        raise BrandError("Unexpected upstream layout; refusing to patch: " + str(file))
    return text.replace(original, replacement)


def brand_engine(checkout: Path, engine: str, name: str, initials: str,
                 accent: str, currency: str, timezone: str) -> list[str]:
    valid_settings(name, initials, accent, currency, timezone)
    if engine not in ("skuul", "gegok12"):
        raise BrandError("Unsupported ERP engine")
    if not checkout.is_dir() or not (checkout / ".env.example").exists():
        raise BrandError("Upstream source not initialized: run git submodule update --init first.")

    env_path = checkout / ".env"
    original_env = env_path.read_text(encoding="utf-8") if env_path.exists() \
        else (checkout / ".env.example").read_text(encoding="utf-8")
    if re.search(r"(?m)^APP_ENV\s*=\s*['\"]?production['\"]?\s*$", original_env):
        raise BrandError("Refusing to modify an existing production environment.")

    # Check every upstream-specific patch target before making any changes.
    rewrites = {}
    if engine == "skuul":
        login = checkout / "resources/views/auth/login.blade.php"
        before = 'description="Sign in to continue to Skuul."'
        after = ":description=\"'Sign in to continue to '.config('app.name').'.'\""
        rewrites[login] = require_patchable(login, before, after)
        settings = {
            "APP_NAME": '"' + name + '"',
            "APP_CURRENCY": currency,
            "LOGO_PATH": '"brand/school-logo.svg"',
            "FAVICON_PATH": '"brand/school-logo.svg"'
        }
    else:
        logo = checkout / "resources/views/layouts/partials/logo.blade.php"
        rewrites[logo] = require_patchable(
            logo,
            "asset('/images/gego_k12.png')",
            "asset('brand/school-logo.svg')"
        ).replace('alt="GegoK12 Logo"', "alt=\"{{ config('app.name') }} Logo\"")
        favicon = checkout / "resources/views/layouts/partials/favicon.blade.php"
        if not favicon.is_file():
            raise BrandError("GegoK12 favicon partial not found")
        rewrites[favicon] = (
            "<link rel=\"icon\" type=\"image/svg+xml\" href=\"{{ asset('brand/school-logo.svg') }}\">\n"
            '<meta name="theme-color" content="' + accent + '">\n'
        )
        settings = {
            "APP_NAME": '"' + name + '"',
            "TIMEZONE": timezone
        }

    # A minimal, clean SVG mark for a school without an uploaded graphic asset.
    initials_xml = escape(initials.upper())
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">'
        '<rect width="256" height="256" rx="56" fill="' + accent + '"/>'
        '<text x="128" y="157" font-family="Arial,Helvetica,sans-serif" font-size="98" '
        'font-weight="700" text-anchor="middle" fill="#ffffff">' + initials_xml + '</text>'
        '</svg>\n'
    )
    asset = checkout / "public/brand/school-logo.svg"
    asset.parent.mkdir(parents=True, exist_ok=True)
    asset.write_text(svg, encoding="utf-8")
    for path, content in rewrites.items():
        path.write_text(content, encoding="utf-8")
    env_path.write_text(update_env(original_env, settings), encoding="utf-8")
    env_path.chmod(0o600)
    return [str(asset), str(env_path)] + [str(path) for path in rewrites]


def main() -> None:
    parser = argparse.ArgumentParser(description="White-label an initialized development ERP checkout")
    parser.add_argument("--engine", required=True, choices=["skuul", "gegok12"])
    parser.add_argument("--name", required=True, help="Your school or product name")
    parser.add_argument("--initials", required=True, help="1 to 4 letters or numbers for the fallback school mark")
    parser.add_argument("--accent", default="#e67436")
    parser.add_argument("--currency", default="NGN")
    parser.add_argument("--timezone", default="Africa/Lagos")
    args = parser.parse_args()
    checkout = Path(__file__).resolve().parent.parent / "upstream" / args.engine
    try:
        paths = brand_engine(checkout, args.engine, args.name, args.initials,
                             args.accent, args.currency, args.timezone)
    except (BrandError, OSError) as exc:
        parser.error(str(exc))
    print("Brand overlay applied to DEVELOPMENT checkout only:")
    for path in paths:
        print("  " + path)
    print("Review the upstream git diff. Preserve LICENSE and copyright notices.")


if __name__ == "__main__":
    main()
