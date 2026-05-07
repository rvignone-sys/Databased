"""System-tray icon + menu for the DataBased agent.

Generates a cyan hex icon (matches the dashboard logo) at runtime — no
icon file to ship. The icon color flips to coral when the agent can't
reach the Pi.
"""
# Need PEP 563 deferred annotations for Python 3.8 (Win7 build target):
# the `Path | None` PEP 604 union syntax in run_tray's signature would
# otherwise fail at parse time.
from __future__ import annotations
import math
import os
import sys
import threading
import webbrowser
from pathlib import Path

from PIL import Image, ImageDraw
import pystray
from pystray import Menu, MenuItem


CYAN = (103, 232, 249, 255)
CORAL = (251, 113, 133, 255)
INK = (8, 19, 31, 255)


def _hex_image(color: tuple, size: int = 64) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx = cy = size / 2
    r = size * 0.42
    # Pointy-top hex (vertices at 30, 90, ... degrees)
    pts = []
    for i in range(6):
        theta = math.radians(60 * i + 90)
        pts.append((cx + r * math.cos(theta), cy + r * math.sin(theta)))
    draw.polygon(pts, fill=INK, outline=color, width=max(1, int(size * 0.06)))
    # Center dot
    rd = size * 0.16
    draw.ellipse((cx - rd, cy - rd, cx + rd, cy + rd), fill=color)
    return img


class AgentState:
    """Shared state read by the tray menu, mutated by background loops."""
    def __init__(self):
        self._lock = threading.Lock()
        self.connected = False
        self.last_heartbeat_ago = "never"
        self.syncing = False
        self.last_error: str | None = None

    def set(self, **fields):
        with self._lock:
            for k, v in fields.items():
                setattr(self, k, v)

    def status_label(self) -> str:
        with self._lock:
            if self.last_error:
                return f"Status: error · {self.last_error[:40]}"
            if self.syncing:
                return "Status: syncing"
            if self.connected:
                return f"Status: connected · {self.last_heartbeat_ago}"
            return "Status: offline"


def _open_log(log_path: Path):
    def _do():
        try:
            if sys.platform == "win32":
                os.startfile(str(log_path))  # type: ignore[attr-defined]
            elif sys.platform == "darwin":
                os.system(f"open '{log_path}'")
            else:
                os.system(f"xdg-open '{log_path}' &")
        except Exception:  # noqa: BLE001
            pass
    return _do


def _open_dashboard(pi_url: str):
    return lambda: webbrowser.open(pi_url)


def _open_folder(folder: Path):
    def _do():
        try:
            if sys.platform == "win32":
                os.startfile(str(folder))  # type: ignore[attr-defined]
            elif sys.platform == "darwin":
                os.system(f"open '{folder}'")
            else:
                os.system(f"xdg-open '{folder}' &")
        except Exception:  # noqa: BLE001
            pass
    return _do


def _rerun_setup(config_path: Path, on_quit):
    """Stop the agent and re-launch with --setup. Use a fresh process so the
    Tk wizard owns the main thread (pystray was holding it)."""
    def _do():
        import subprocess
        try:
            if getattr(sys, "frozen", False):
                cmd = [sys.executable, "--setup", "--config", str(config_path)]
            else:
                cmd = [sys.executable, sys.argv[0], "--setup", "--config", str(config_path)]
            subprocess.Popen(cmd, close_fds=True)
        except Exception:  # noqa: BLE001
            pass
        on_quit()
    return _do


def run_tray(state: AgentState, cfg: dict, log_path: Path, on_quit,
             config_path: Path | None = None, on_check_update=None,
             on_open_internet=None) -> None:
    """Start the tray icon. Blocks until the user picks Quit."""
    icon_holder = {"icon": None, "last_color": CORAL}

    def make_icon():
        return _hex_image(CYAN if state.connected and not state.last_error else CORAL)

    icon_holder["icon"] = make_icon()

    def menu():
        items = [
            MenuItem("DataBased Agent", lambda *_: None, enabled=False),
            MenuItem(lambda item: state.status_label(), lambda *_: None, enabled=False),
            MenuItem(lambda item: f"This PC: {cfg['computer_name']}", lambda *_: None, enabled=False),
            Menu.SEPARATOR,
            MenuItem("Open Dashboard", _open_dashboard(cfg["pi_url"])),
            MenuItem("Open Log File", _open_log(log_path)),
            MenuItem("Open Config Folder", _open_folder(log_path.parent)),
        ]
        if config_path is not None:
            items.append(MenuItem("Re-run Setup…", _rerun_setup(config_path, on_quit)))
        if on_check_update is not None:
            items.append(MenuItem("Check for Updates Now", lambda *_: threading.Thread(target=on_check_update, daemon=True).start()))
        if on_open_internet is not None:
            items.append(MenuItem("Open Internet (via Pi tunnel)", lambda *_: threading.Thread(target=on_open_internet, daemon=True).start()))
        items += [
            Menu.SEPARATOR,
            MenuItem("Quit", lambda icon, item: (on_quit(), icon.stop())),
        ]
        return Menu(*items)

    icon = pystray.Icon("databased-agent", icon_holder["icon"], "DataBased Agent", menu())

    # Background refresh: re-evaluate menu/icon every second so status & color stay live.
    def refresh_loop():
        import time as _t
        while True:
            _t.sleep(1)
            try:
                desired = CYAN if state.connected and not state.last_error else CORAL
                if desired != icon_holder["last_color"]:
                    icon.icon = _hex_image(desired)
                    icon_holder["last_color"] = desired
                icon.update_menu()
            except Exception:  # noqa: BLE001
                pass

    threading.Thread(target=refresh_loop, daemon=True).start()
    icon.run()
