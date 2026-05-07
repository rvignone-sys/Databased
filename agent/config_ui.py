"""First-run setup wizard for the DataBased agent.

Collects bootstrap config + an optional first sync pair (local source folder
plus the target folder on the network share). The Pi auto-creates the first
sync job once the operator approves this PC in the dashboard. After that,
all source/target editing happens from the dashboard's gear modal.

Also persists a `last-known` copy of the form so the wizard can pre-fill
even after agent.json has been deleted (e.g. when testing a rebuilt exe).
"""
# PEP 563 deferred annotations — required for Python 3.8 (Win7 build target).
from __future__ import annotations
import json
import os
import socket
import sys
import tkinter as tk
from tkinter import ttk, messagebox, filedialog
from pathlib import Path

import startup  # type: ignore  # local module


ICON_OPTIONS = [
    ("orbitrap", "LC-HRMS Orbitrap"),
    ("smps", "Aerosol Sizing"),
    ("chamber", "Environmental Chamber"),
    ("gcms", "GC-MS"),
    ("gcfid", "GC-FID"),
    ("uvvis", "UV-Vis"),
    ("inficon", "Portable GC-MS"),
]

# Match the dashboard's dark glass palette.
BG = "#06111b"
PANEL = "#0c1d2d"
PANEL_HI = "#13283c"
INK = "#e5eef7"
SUB = "#91a6b8"
FAINT = "#6b7f90"
CYAN = "#67e8f9"
CYAN_INK = "#052432"
BORDER = "#1a3041"


LAST_KNOWN_FILENAME = "agent.last.json"


def _exe_dir() -> Path:
    """Folder of the running exe (frozen) or the script (dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(sys.argv[0]).resolve().parent


def _last_known_paths() -> list[Path]:
    """Search order: next to the exe first (so users can carry settings with the
    exe), then a per-user location in LOCALAPPDATA so it survives folder wipes."""
    paths = [_exe_dir() / LAST_KNOWN_FILENAME]
    appdata = os.environ.get("LOCALAPPDATA")
    if appdata:
        paths.append(Path(appdata) / "DataBased" / LAST_KNOWN_FILENAME)
    return paths


def load_last_known() -> dict:
    for p in _last_known_paths():
        try:
            if p.exists():
                return json.loads(p.read_text(encoding="utf-8-sig"))
        except (OSError, json.JSONDecodeError):
            continue
    return {}


def save_last_known(cfg: dict) -> None:
    """Write to both candidate locations; ignore failures (read-only folder, etc.)."""
    for p in _last_known_paths():
        try:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
        except OSError:
            continue


def show_wizard(initial: dict | None = None) -> dict | None:
    initial = dict(initial or {})
    # Backfill anything not provided from the persisted "last known" file.
    last = load_last_known()
    for k, v in last.items():
        initial.setdefault(k, v)
    result: dict | None = None

    root = tk.Tk()
    root.title("DataBased — Setup")
    root.configure(bg=BG)
    root.geometry("520x780")
    root.minsize(520, 600)
    root.resizable(False, True)
    try:
        root.attributes("-topmost", True)
        root.after(200, lambda: root.attributes("-topmost", False))
    except tk.TclError:
        pass

    # Theme
    style = ttk.Style(root)
    try:
        style.theme_use("clam")
    except tk.TclError:
        pass
    style.configure("TLabel", background=BG, foreground=SUB, font=("Segoe UI", 9))
    style.configure("TEntry", fieldbackground=PANEL, foreground=INK, insertcolor=INK,
                    bordercolor=BORDER, lightcolor=BORDER, darkcolor=BORDER)
    # Combobox: separate styling for field, dropdown arrow, and the popup listbox.
    style.configure("TCombobox", fieldbackground=PANEL, background=PANEL, foreground=INK,
                    bordercolor=BORDER, lightcolor=BORDER, darkcolor=BORDER, arrowcolor=INK,
                    selectbackground=PANEL, selectforeground=INK)
    style.map("TCombobox",
              fieldbackground=[("readonly", PANEL), ("focus", PANEL)],
              foreground=[("readonly", INK)],
              selectbackground=[("readonly", PANEL)],
              selectforeground=[("readonly", INK)],
              background=[("readonly", PANEL), ("active", PANEL_HI)])
    style.configure("TCheckbutton", background=BG, foreground=INK, font=("Segoe UI", 9))
    # The popup Listbox of the Combobox is a native Tk widget — style via option_add.
    root.option_add("*TCombobox*Listbox.background", PANEL)
    root.option_add("*TCombobox*Listbox.foreground", INK)
    root.option_add("*TCombobox*Listbox.selectBackground", CYAN)
    root.option_add("*TCombobox*Listbox.selectForeground", CYAN_INK)
    root.option_add("*TCombobox*Listbox.font", "Segoe UI 10")
    root.option_add("*TCombobox*Listbox.borderWidth", 0)

    # Header
    header = tk.Frame(root, bg=BG)
    header.pack(fill="x", padx=22, pady=(20, 14))
    tk.Label(header, text="DATABASED · SETUP", bg=BG, fg=CYAN,
             font=("Segoe UI", 8, "bold")).pack(anchor="w")
    tk.Label(header, text="Configure this agent",
             bg=BG, fg=INK, font=("Segoe UI", 16, "bold")).pack(anchor="w", pady=(2, 4))
    tk.Label(header,
             text="Tells the Pi who this PC is and where its instrument data lives. "
                  "You can add more source folders later from the dashboard.",
             bg=BG, fg=SUB, font=("Segoe UI", 9), wraplength=476, justify="left").pack(anchor="w")
    if last:
        tk.Label(header,
                 text=f"✓ Pre-filled from last save",
                 bg=BG, fg=CYAN, font=("Segoe UI", 8, "italic")).pack(anchor="w", pady=(4, 0))

    # Footer must be packed BEFORE the body so it reserves bottom space.
    # Otherwise body's expand=True would push the buttons off-screen when
    # the form has lots of fields.
    footer = tk.Frame(root, bg=BG)
    footer.pack(side="bottom", fill="x", padx=22, pady=14)

    # Body — fills remaining vertical space above the footer.
    body = tk.Frame(root, bg=BG)
    body.pack(side="top", fill="both", expand=True, padx=22)

    def field_label(parent, text):
        tk.Label(parent, text=text.upper(), bg=BG, fg=FAINT,
                 font=("Segoe UI", 7, "bold")).pack(anchor="w", pady=(10, 4))

    def hint(parent, text):
        tk.Label(parent, text=text, bg=BG, fg=FAINT,
                 font=("Segoe UI", 8)).pack(anchor="w", pady=(2, 0))

    # Computer name
    field_label(body, "Computer name")
    name_var = tk.StringVar(value=initial.get("computer_name") or socket.gethostname())
    name_entry = ttk.Entry(body, textvariable=name_var, font=("Segoe UI", 10))
    name_entry.pack(fill="x", ipady=4)

    # Pi URL — prefer hostname over IP so the agent survives network moves.
    field_label(body, "Pi orchestrator URL")
    url_var = tk.StringVar(value=initial.get("pi_url") or "http://databased.local:5000")
    ttk.Entry(body, textvariable=url_var, font=("Consolas", 10)).pack(fill="x", ipady=4)
    hint(body, "Prefer the orchestrator hostname (mDNS *.local works on most networks) — survives IP changes")

    # Optional alternates — comma-separated. Agent probes them at startup and
    # whenever the primary stops responding, then auto-switches to whichever
    # responds. Useful when the orchestrator moves between networks.
    field_label(body, "Alternate URLs (optional, comma-separated)")
    alt_initial = initial.get("pi_url_alt") or ""
    if isinstance(alt_initial, list):
        alt_initial = ", ".join(alt_initial)
    url_alt_var = tk.StringVar(value=alt_initial)
    ttk.Entry(body, textvariable=url_alt_var, font=("Consolas", 10)).pack(fill="x", ipady=4)
    hint(body, "e.g. http://10.0.0.5:5000, http://192.168.1.50:5000  ·  agent picks first that responds")

    # Icon type — plain text field; validated against known list at save time but
    # unknown values are accepted (the dashboard falls back to a default icon).
    field_label(body, "Instrument type")
    icon_var = tk.StringVar(value=initial.get("icon_type") or "orbitrap")
    ttk.Entry(body, textvariable=icon_var, font=("Consolas", 10)).pack(fill="x", ipady=4)
    valid_keys = ", ".join(k for k, _ in ICON_OPTIONS)
    hint(body, f"options: {valid_keys}")

    # Folder picker helper — local source.
    def folder_row(parent, var: tk.StringVar, picker_kind: str, placeholder: str):
        row = tk.Frame(parent, bg=BG)
        row.pack(fill="x")
        entry = ttk.Entry(row, textvariable=var, font=("Consolas", 10))
        entry.pack(side="left", fill="x", expand=True, ipady=4)

        def browse():
            if picker_kind == "local":
                title = "Select local source folder"
            else:
                title = "Select target folder (network share OK)"
            initial_dir = var.get() or "C:\\"
            try:
                p = filedialog.askdirectory(parent=root, title=title, initialdir=initial_dir, mustexist=False)
            except tk.TclError:
                p = ""
            if p:
                # Normalize to backslashes on Windows for consistency with UNC handling.
                var.set(p.replace("/", "\\"))

        btn = tk.Button(row, text="📂  Browse",
                        bg=PANEL, fg=INK, activebackground=PANEL_HI, activeforeground=INK,
                        relief="flat", borderwidth=0, padx=10, pady=4,
                        font=("Segoe UI", 9), cursor="hand2", command=browse)
        btn.pack(side="left", padx=(6, 0), ipady=2)

    # Local source — optional. If left blank, the agent registers as a plain
    # "computer" with no initial sync job; admin can add jobs later via the
    # dashboard's gear modal.
    field_label(body, "Local source folder (optional — only for instruments that produce data)")
    source_var = tk.StringVar(value=initial.get("source_folder") or "")
    folder_row(body, source_var, "local", "C:/Users/...")
    hint(body, r"Leave blank for non-instrument PCs · e.g. C:\Users\<USER>\Documents\Data")

    # Target network folder — optional, but required if source is filled in.
    field_label(body, "Target folder (optional — required if source folder is set)")
    target_var = tk.StringVar(value=initial.get("target_folder") or "")
    folder_row(body, target_var, "network", r"\\NAS\share\...")
    hint(body, r"e.g. \\<NAS>\Share\Databased\<PCName>\Data")

    # Monitor path (storage stats — small, secondary)
    field_label(body, "Drive to monitor for storage stats")
    path_var = tk.StringVar(value=initial.get("monitor_path") or "C:\\")
    ttk.Entry(body, textvariable=path_var, font=("Consolas", 10)).pack(fill="x", ipady=4)

    # Auto-update source (network share where the latest exe lives)
    field_label(body, "Agent update source (network folder containing the build)")
    update_var = tk.StringVar(value=initial.get("update_source_path") or r"\\<NAS>\Share\Databased\Agent")
    folder_row(body, update_var, "network", r"\\NAS\share\Databased\Agent")
    hint(body, r"Path that holds 'databased-agent\databased-agent.exe' — agent checks hourly and self-updates")

    # File-server role (preferred at setup time; can be flipped later in dashboard)
    fileserver_var = tk.BooleanVar(value=bool(initial.get("is_file_server", False)))
    ttk.Checkbutton(body, text="This PC is the file server (NAS host)",
                    variable=fileserver_var).pack(anchor="w", pady=(18, 0))
    hint(body, "Pins it to the always-visible File Server panel on the dashboard")

    # Auto-start
    autostart_var = tk.BooleanVar(value=startup.is_enabled())
    ttk.Checkbutton(body, text="Start automatically on Windows login",
                    variable=autostart_var).pack(anchor="w", pady=(10, 0))

    # Status / error
    status = tk.Label(body, text="", bg=BG, fg="#fb7185", font=("Segoe UI", 9), wraplength=476, justify="left")
    status.pack(anchor="w", pady=(8, 0))

    # (footer was created above so it reserves bottom space; just add buttons)
    def on_save():
        nonlocal result
        name = name_var.get().strip()
        url = url_var.get().strip().rstrip("/")
        path = path_var.get().strip() or "C:\\"
        icon = icon_var.get().strip().lower()
        source = source_var.get().strip()
        target = target_var.get().strip()

        if not name:
            status.config(text="Computer name is required.")
            return
        if not url:
            status.config(text="Pi URL is required (e.g. http://192.168.1.50:5000)")
            return
        if not url.startswith("http"):
            status.config(text="Pi URL must start with http:// or https://")
            return
        # Source/target are optional, but if you set one you need the other —
        # otherwise the initial-job creation on the Pi has nowhere to copy to.
        if source and not target:
            status.config(text="Target folder is required when source is set.")
            return
        if target and not source:
            status.config(text="Source folder is required when target is set.")
            return

        if autostart_var.get():
            if not startup.enable():
                if not messagebox.askyesno(
                    "DataBased",
                    "Couldn't write to Windows startup registry. Continue anyway?"):
                    return
        else:
            startup.disable()

        # Parse the alternate-URLs field (comma-separated string → list).
        alts_raw = url_alt_var.get().strip()
        alts = [u.strip().rstrip("/") for u in alts_raw.split(",") if u.strip()]
        result = {
            "pi_url": url,
            "pi_url_alt": alts,
            "computer_name": name,
            "icon_type": icon,
            "monitor_path": path,
            "source_folder": source,
            "target_folder": target,
            "is_file_server": fileserver_var.get(),
            "update_source_path": update_var.get().strip(),
            "heartbeat_interval_seconds": initial.get("heartbeat_interval_seconds", 30),
            "poll_interval_seconds": initial.get("poll_interval_seconds", 5),
            "metrics_interval_seconds": initial.get("metrics_interval_seconds", 5),
            "update_check_interval_seconds": initial.get("update_check_interval_seconds", 3600),
        }
        save_last_known(result)
        root.destroy()

    def on_cancel():
        root.destroy()

    save_btn = tk.Button(footer, text="Save & Start", bg=CYAN, fg=CYAN_INK,
                         activebackground="#7df2ff", activeforeground=CYAN_INK,
                         font=("Segoe UI", 10, "bold"), relief="flat", borderwidth=0,
                         padx=18, pady=8, cursor="hand2", command=on_save)
    save_btn.pack(side="right")

    cancel_btn = tk.Button(footer, text="Cancel", bg=BG, fg=INK,
                           activebackground=PANEL, activeforeground=INK,
                           font=("Segoe UI", 10), relief="flat", borderwidth=0,
                           padx=14, pady=8, cursor="hand2", command=on_cancel)
    cancel_btn.pack(side="right", padx=(0, 8))

    name_entry.focus_set()
    root.mainloop()
    return result


def write_config(path: Path, cfg: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


if __name__ == "__main__":
    out = show_wizard()
    print(out)
