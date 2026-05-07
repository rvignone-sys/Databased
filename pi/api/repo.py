"""Repo / source-control connector — surfaces the orchestrator's git
state and SSH public key in the admin dashboard so you don't need to
SSH in to find them.

Read-only by default. POST /pull is admin-only and runs `git pull
--ff-only` in the repo root, capturing stdout/stderr.
"""
from __future__ import annotations

import os
import subprocess
from pathlib import Path

from flask import Blueprint, jsonify

from ..auth import admin_required


bp = Blueprint("repo", __name__, url_prefix="/api/repo")


def _repo_root() -> Path:
    # Repo lives one dir above pi/. Symlink-safe.
    return Path(__file__).resolve().parent.parent.parent


def _git(*args, cwd=None, timeout=15) -> tuple[int, str, str]:
    try:
        r = subprocess.run(
            ["git", *args],
            cwd=str(cwd or _repo_root()),
            capture_output=True, text=True, timeout=timeout,
        )
        return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 1, "", str(exc)


def _read_pubkey() -> tuple[str, str]:
    """Return (path, contents) of the user's SSH public key, or ('', '')
    if none exists. Tries ed25519 first, then RSA."""
    home = Path(os.path.expanduser("~"))
    for fname in ("id_ed25519.pub", "id_rsa.pub", "id_ecdsa.pub"):
        p = home / ".ssh" / fname
        if p.is_file():
            try:
                return str(p), p.read_text(encoding="utf-8").strip()
            except OSError:
                continue
    return "", ""


@bp.get("/info")
@admin_required
def info():
    """Snapshot of the repo + SSH key. Useful for the dashboard's
    Connections panel."""
    rc_branch, branch, _ = _git("rev-parse", "--abbrev-ref", "HEAD")
    rc_commit, commit, _ = _git("rev-parse", "--short", "HEAD")
    rc_remote, remote, _ = _git("config", "--get", "remote.origin.url")
    rc_status, status, _ = _git("status", "--porcelain")
    rc_msg, last_msg, _ = _git("log", "-1", "--pretty=%s")
    rc_when, last_when, _ = _git("log", "-1", "--pretty=%cI")
    pubkey_path, pubkey = _read_pubkey()
    return jsonify({
        "in_git": rc_branch == 0,
        "branch": branch if rc_branch == 0 else "",
        "commit": commit if rc_commit == 0 else "",
        "remote_url": remote if rc_remote == 0 else "",
        "dirty": bool(status) if rc_status == 0 else False,
        "last_commit_message": last_msg if rc_msg == 0 else "",
        "last_commit_at": last_when if rc_when == 0 else "",
        "ssh_pubkey": pubkey,
        "ssh_pubkey_path": pubkey_path,
    })


@bp.post("/pull")
@admin_required
def pull():
    """Run `git pull --ff-only`. Returns the combined output so the
    dashboard can show what happened. Doesn't restart the service —
    admin restarts manually if Python code changed."""
    rc, out, err = _git("pull", "--ff-only", timeout=60)
    return jsonify({
        "ok": rc == 0,
        "code": rc,
        "stdout": out,
        "stderr": err,
    })
