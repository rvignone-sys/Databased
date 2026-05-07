"""Windows auto-start registration via the HKCU Run registry key.
No extra deps; built-in winreg only. Silent no-op on non-Windows.
"""
import os
import sys

REG_PATH = r"Software\Microsoft\Windows\CurrentVersion\Run"
REG_NAME = "DataBasedAgent"


def _exe_command() -> str:
    """The command to register: the bundled exe (frozen) or `pythonw agent.py` (dev)."""
    if getattr(sys, "frozen", False):
        return f'"{sys.executable}"'
    # Dev: prefer pythonw on Windows so no console window flashes.
    py = sys.executable
    if os.name == "nt" and py.lower().endswith("python.exe"):
        pyw = py[:-len("python.exe")] + "pythonw.exe"
        if os.path.exists(pyw):
            py = pyw
    script = os.path.abspath(sys.argv[0])
    return f'"{py}" "{script}"'


def is_enabled() -> bool:
    if os.name != "nt":
        return False
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_PATH, 0, winreg.KEY_READ) as key:
            winreg.QueryValueEx(key, REG_NAME)
            return True
    except FileNotFoundError:
        return False
    except OSError:
        return False


def enable() -> bool:
    if os.name != "nt":
        return False
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_PATH, 0, winreg.KEY_SET_VALUE) as key:
            winreg.SetValueEx(key, REG_NAME, 0, winreg.REG_SZ, _exe_command())
        return True
    except OSError:
        return False


def disable() -> bool:
    if os.name != "nt":
        return False
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_PATH, 0, winreg.KEY_SET_VALUE) as key:
            winreg.DeleteValue(key, REG_NAME)
        return True
    except FileNotFoundError:
        return True
    except OSError:
        return False
