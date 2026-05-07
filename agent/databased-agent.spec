# PyInstaller spec file — explicit control over bundling.
# Built with: py -3.8 -m PyInstaller databased-agent.spec
#
# Why a spec file? --hidden-import + --paths flags don't reliably pick up
# our sibling modules (startup, config_ui, tray) on Python 3.8 + Windows.
# This spec lists them as data files explicitly so they always land in
# the bundle regardless of analysis quirks.
import os
from PyInstaller.utils.hooks import collect_submodules

HERE = os.path.abspath(os.path.dirname(SPEC))

# Sibling modules — copy them into the bundle root so they're importable.
extra_files = [
    (os.path.join(HERE, 'startup.py'), '.'),
    (os.path.join(HERE, 'config_ui.py'), '.'),
    (os.path.join(HERE, 'tray.py'), '.'),
]

# Hidden imports — modules that PyInstaller's static analysis can't see.
# pystray + PIL hooks ship with PyInstaller, so we don't need collect_all here;
# their hooks pull in everything they need automatically. We just declare the
# Win32 backend explicitly because pystray picks the backend at import time.
hidden = [
    'startup',
    'config_ui',
    'tray',
    'pystray._win32',
    'PIL._tkinter_finder',
]
hidden += collect_submodules('tkinter')

a = Analysis(
    ['agent.py'],
    pathex=[HERE],
    binaries=[],
    datas=extra_files,
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tzdata'],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='databased-agent',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,            # --windowed
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='databased-agent',
)
