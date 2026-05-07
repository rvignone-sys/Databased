"""Admin-managed master list of instrument types.

GET is open to any logged-in user (dropdowns need it).
POST/PATCH/DELETE are admin-only.

Lazy-seeds the defaults on first GET if the table is empty — covers upgrades
where init_db wasn't re-run.
"""
import re

from flask import Blueprint, jsonify, request
from flask_login import login_required

from ..models import Computer, InstrumentType, db, seed_instrument_types
from ..auth import admin_required


bp = Blueprint("instrument_types", __name__, url_prefix="/api/instrument-types")


_KEY_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,31}$")
_LUCIDE_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")


def _normalized_key(raw: str) -> str:
    return (raw or "").strip().lower()


# Patterns that strip the most dangerous SVG content. Not a full sanitizer —
# real defense-in-depth would use lxml or bleach with an SVG profile, but
# admin-only input on a closed lab network keeps this acceptable. We also
# render with dangerouslySetInnerHTML on the client, which means anything
# that survives this gets executed.
_SVG_DROP_TAGS = ("script", "iframe", "embed", "object", "foreignObject", "use")


def _sanitize_svg(raw):
    """Return a safe SVG string, or None if input is empty/invalid."""
    if not raw or not isinstance(raw, str):
        return None
    s = raw.strip()
    if not s:
        return None
    # Only accept things that look like an SVG document or fragment.
    if "<svg" not in s.lower():
        return None
    # Strip dangerous tags entirely (including children).
    for tag in _SVG_DROP_TAGS:
        s = re.sub(rf"<{tag}\b[^>]*>.*?</{tag}>", "", s, flags=re.IGNORECASE | re.DOTALL)
        s = re.sub(rf"<{tag}\b[^>]*/?>", "", s, flags=re.IGNORECASE)
    # Strip on*= event handlers (quoted + unquoted).
    s = re.sub(r"\s+on[a-z]+\s*=\s*\"[^\"]*\"", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s+on[a-z]+\s*=\s*'[^']*'", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s+on[a-z]+\s*=\s*[^\s/>]+", "", s, flags=re.IGNORECASE)
    # Strip javascript: / vbscript: / data:text/html URLs in href/xlink:href.
    s = re.sub(r"(href|xlink:href)\s*=\s*\"\s*(javascript|vbscript|data:text/html)[^\"]*\"", "", s, flags=re.IGNORECASE)
    s = re.sub(r"(href|xlink:href)\s*=\s*'\s*(javascript|vbscript|data:text/html)[^']*'", "", s, flags=re.IGNORECASE)
    # Hard cap size — generous for icon SVGs (typical Lucide is 1-3 KB).
    if len(s) > 200_000:
        return None
    return s


@bp.get("")
@login_required
def list_types():
    rows = db.session.execute(db.select(InstrumentType)).scalars().all()
    if not rows:
        seed_instrument_types()
        rows = db.session.execute(db.select(InstrumentType)).scalars().all()
    rows.sort(key=lambda t: ((t.sort_order or 100), t.label.lower()))
    return jsonify([t.to_dict() for t in rows])


@bp.post("")
@admin_required
def create_type():
    data = request.get_json(silent=True) or {}
    key = _normalized_key(data.get("key", ""))
    label = (data.get("label") or "").strip()
    if not key or not label:
        return jsonify({"error": "key and label required"}), 400
    if not _KEY_RE.match(key):
        return jsonify({"error": "key must be lowercase a–z, 0–9, _ or - (max 32)"}), 400
    if db.session.execute(db.select(InstrumentType).where(InstrumentType.key == key)).scalar_one_or_none():
        return jsonify({"error": "key already exists"}), 409

    lucide_name = (data.get("lucide_name") or "").strip().lower() or None
    if lucide_name and not _LUCIDE_NAME_RE.match(lucide_name):
        return jsonify({"error": "lucide_name must be kebab-case (e.g. flask-conical)"}), 400
    t = InstrumentType(
        key=key,
        label=label,
        sort_order=int(data.get("sort_order") or 100),
        notes=(data.get("notes") or "").strip() or None,
        svg=_sanitize_svg(data.get("svg")),
        lucide_name=lucide_name,
    )
    db.session.add(t)
    db.session.commit()
    return jsonify(t.to_dict()), 201


@bp.patch("/<int:type_id>")
@admin_required
def update_type(type_id: int):
    t = db.session.get(InstrumentType, type_id)
    if not t:
        return jsonify({"error": "not found"}), 404
    data = request.get_json(silent=True) or {}
    if "label" in data:
        new_label = (data["label"] or "").strip()
        if not new_label:
            return jsonify({"error": "label cannot be empty"}), 400
        t.label = new_label
    if "sort_order" in data:
        t.sort_order = int(data["sort_order"] or 100)
    if "notes" in data:
        t.notes = (data["notes"] or "").strip() or None
    if "svg" in data:
        # Empty / invalid → clear; otherwise sanitized markup
        t.svg = _sanitize_svg(data["svg"])
    if "lucide_name" in data:
        ln = (data["lucide_name"] or "").strip().lower() or None
        if ln and not _LUCIDE_NAME_RE.match(ln):
            return jsonify({"error": "lucide_name must be kebab-case"}), 400
        t.lucide_name = ln
    # Renaming `key` is not allowed — Computer.icon_type stores the key by value
    # and we don't want to cascade-rewrite. Delete + recreate if you need to.
    db.session.commit()
    return jsonify(t.to_dict())


@bp.delete("/<int:type_id>")
@admin_required
def delete_type(type_id: int):
    t = db.session.get(InstrumentType, type_id)
    if not t:
        return jsonify({"error": "not found"}), 404
    in_use = db.session.execute(
        db.select(db.func.count()).select_from(Computer).where(Computer.icon_type == t.key)
    ).scalar()
    if in_use:
        return jsonify({
            "error": f"in use by {in_use} instrument(s) — change their type first",
        }), 409
    db.session.delete(t)
    db.session.commit()
    return jsonify({"ok": True})
