"""Apache Guacamole REST client.

Used by /api/computers/<id>/rdp-session: per click, we
  1. Auth as the Guac admin (guacadmin/<GUAC_ADMIN_PASS>)
  2. Find or create a Guacamole connection for this computer
  3. Return the embed URL for the dashboard's iframe modal

Notes:
* The connection has hostname/port/username pre-set but NO password —
  Guacamole prompts the operator for the Windows password in-browser
  on first use, then caches it for the session.
* The auth token is admin-level. It's fine for our closed-network use
  because only authenticated dashboard users can call this endpoint.
"""
import base64
import os
import urllib.parse
from typing import Optional

import requests


_DEFAULT_PORT = os.environ.get("GUAC_HOST_PORT", "8081")
GUAC_BASE = os.environ.get("GUAC_BASE_URL", f"http://127.0.0.1:{_DEFAULT_PORT}")
# Data source name comes from /api/tokens response and is set by setup.sh.
# Common values: "postgresql", "mysql", "sqlite". Default matches the
# upstream Postgres compose; flcontainers/guacamole auto-detects.
DATA_SOURCE = os.environ.get("GUAC_DATA_SOURCE", "postgresql")


class GuacamoleError(RuntimeError):
    pass


def _admin_creds() -> tuple[str, str]:
    pw = os.environ.get("GUAC_ADMIN_PASS")
    if not pw:
        raise GuacamoleError(
            "GUAC_ADMIN_PASS is not set in .env. Run deploy/guacamole/setup.sh first."
        )
    return ("guacadmin", pw)


def _get_token(session: requests.Session) -> str:
    user, pw = _admin_creds()
    r = session.post(
        f"{GUAC_BASE}/api/tokens",
        data={"username": user, "password": pw},
        timeout=10,
    )
    if r.status_code != 200:
        raise GuacamoleError(f"Guacamole login failed: HTTP {r.status_code} {r.text[:200]}")
    return r.json()["authToken"]


def _connection_identifier(session: requests.Session, token: str, name: str) -> Optional[str]:
    """Look up a connection by display name. Guacamole uses numeric identifiers
    internally; we key by the name we set (the computer's friendly name)."""
    r = session.get(
        f"{GUAC_BASE}/api/session/data/{DATA_SOURCE}/connections",
        params={"token": token},
        timeout=10,
    )
    r.raise_for_status()
    for ident, conn in r.json().items():
        if conn.get("name") == name:
            return ident
    return None


def _build_parameters(protocol: str, hostname: str, port: int,
                      username: Optional[str], password: Optional[str],
                      security_mode: str) -> dict:
    """Protocol-specific connection parameters for the Guacamole REST API."""
    if protocol == "vnc":
        # Standard VNC has no concept of a username — server auth is just a
        # password. (Some variants like RealVNC add username; not supported here.)
        params = {
            "hostname": hostname,
            "port": str(port),
            "color-depth": "32",
            "cursor": "remote",
        }
        if password:
            params["password"] = password
        return params
    # default / rdp
    params = {
        "hostname": hostname,
        "port": str(port),
        "username": username or "",
        "security": security_mode if security_mode in ("any", "nla", "rdp", "tls") else "any",
        "ignore-cert": "true",
        "resize-method": "display-update",
        "enable-wallpaper": "false",
        "enable-theming": "false",
        "enable-font-smoothing": "true",
        "enable-full-window-drag": "false",
        "enable-desktop-composition": "false",
        "enable-menu-animations": "false",
        "color-depth": "16",
    }
    if password:
        params["password"] = password
    return params


def _create_or_update_connection(
    session: requests.Session,
    token: str,
    name: str,
    protocol: str,
    hostname: str,
    port: int,
    username: Optional[str],
    security_mode: str,
    password: Optional[str] = None,
) -> str:
    """Create or update a connection; returns the Guacamole connection identifier.

    If `password` is provided, the connection auto-connects with no in-browser
    credential prompt. Connection name includes the protocol so an RDP and a
    VNC connection to the same host can coexist if you swap protocols.
    """
    qualified_name = f"{name} ({protocol.upper()})"
    body = {
        "parentIdentifier": "ROOT",
        "name": qualified_name,
        "protocol": protocol,
        "parameters": _build_parameters(protocol, hostname, port, username, password, security_mode),
        "attributes": {"max-connections": "", "max-connections-per-user": ""},
    }
    existing = _connection_identifier(session, token, qualified_name)
    if existing:
        r = session.put(
            f"{GUAC_BASE}/api/session/data/{DATA_SOURCE}/connections/{existing}",
            params={"token": token},
            json=body,
            timeout=10,
        )
        r.raise_for_status()
        return existing
    r = session.post(
        f"{GUAC_BASE}/api/session/data/{DATA_SOURCE}/connections",
        params={"token": token},
        json=body,
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["identifier"]


def _client_id(connection_identifier: str) -> str:
    """Guacamole's URL fragment encodes the connection as base64(<id>\\0c\\0<datasource>)."""
    raw = f"{connection_identifier}\x00c\x00{DATA_SOURCE}".encode()
    return base64.b64encode(raw).decode().rstrip("=")


def mint_session(name: str, hostname: str, port: int, username: Optional[str] = None,
                 security_mode: str = "any", password: Optional[str] = None,
                 protocol: str = "rdp") -> dict:
    """One-shot: auth, create/update connection, return embed payload."""
    s = requests.Session()
    token = _get_token(s)
    conn_id = _create_or_update_connection(
        s, token, name, protocol, hostname, port, username, security_mode, password=password,
    )
    cid = _client_id(conn_id)
    base = GUAC_BASE.rstrip("/")
    # Embed URL — fragment params survive iframe load. We pass token as a fragment
    # so it isn't logged by reverse proxies.
    url = f"{base}/#/client/{cid}?token={urllib.parse.quote(token)}"
    return {
        "url": url,
        "guacamole_base": base,
        "connection_id": conn_id,
        "expires_in": 3600,  # Guacamole token TTL
    }
