"""Mass-update agent.json files across many lab PCs in one go.

Use case: the Pi moved to a new network and got a new IP/hostname, OR the NAS
was renamed, so every PC's agent.json needs the new pi_url and/or
update_source_path. Walking each PC by hand is painful — this script finds
every agent.json under a root folder and rewrites the two fields atomically,
keeping a timestamped .bak copy.

Run on the Windows build machine where the per-PC config tree is mounted
(typically S:\\Test\\<PCName>\\Agent\\agent.json).

Examples:
  # Just pi_url
  python configure_agents.py --base S:\\Test --pi-url http://databased.local:5000

  # Both
  python configure_agents.py --base S:\\Test ^
    --pi-url http://databased.local:5000 ^
    --update-source \\\\<NAS>\\Share\\Databased\\Agent

  # Dry run (show what WOULD change, don't write)
  python configure_agents.py --base S:\\Test --pi-url http://... --dry-run

  # Apply to a single PC
  python configure_agents.py --base S:\\Test\\<PC-name> --pi-url http://...
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path


def find_agent_jsons(root: Path) -> list[Path]:
    """Recursive glob — handles both 'S:\\Test' (multi-PC) and a single PC dir."""
    return sorted(root.rglob("agent.json"))


def update_one(path: Path, pi_url: str | None, update_source: str | None,
               pi_url_alt: list | None, dry_run: bool) -> tuple[bool, dict]:
    """Returns (changed, summary_dict)."""
    try:
        with path.open("r", encoding="utf-8-sig") as f:
            cfg = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        return False, {"path": str(path), "error": f"could not read: {exc}"}

    before = {
        "pi_url": cfg.get("pi_url", ""),
        "pi_url_alt": cfg.get("pi_url_alt", []),
        "update_source_path": cfg.get("update_source_path", ""),
    }
    changed = False

    if pi_url is not None and cfg.get("pi_url") != pi_url:
        cfg["pi_url"] = pi_url.rstrip("/")
        changed = True
    if pi_url_alt is not None:
        normalized = [u.strip().rstrip("/") for u in pi_url_alt if u.strip()]
        if cfg.get("pi_url_alt") != normalized:
            cfg["pi_url_alt"] = normalized
            changed = True
    if update_source is not None and cfg.get("update_source_path") != update_source:
        cfg["update_source_path"] = update_source
        changed = True

    summary = {
        "path": str(path),
        "computer": cfg.get("computer_name", "?"),
        "before": before,
        "after": {
            "pi_url": cfg.get("pi_url"),
            "pi_url_alt": cfg.get("pi_url_alt", []),
            "update_source_path": cfg.get("update_source_path"),
        },
        "changed": changed,
    }

    if changed and not dry_run:
        # Timestamped backup so a botched run can be rolled back easily.
        bak = path.with_suffix(f".json.bak.{datetime.now():%Y%m%d-%H%M%S}")
        shutil.copy2(path, bak)
        with path.open("w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
        summary["backup"] = str(bak)

    return changed, summary


def main() -> int:
    ap = argparse.ArgumentParser(description="Mass-update DataBased agent configs.")
    ap.add_argument("--base", required=True, type=Path,
                    help="Folder to walk. Typically S:\\Test (multi-PC) or a single PC's Agent\\ folder.")
    ap.add_argument("--pi-url", help="New pi_url, e.g. http://databased.local:5000")
    ap.add_argument("--update-source",
                    help=r"New update_source_path, e.g. \\NewNAS\Share\Databased\Agent")
    ap.add_argument("--pi-url-alt", action="append", default=None,
                    help="Alternate Pi URL the agent will fall back to (repeat for multiple). "
                         "Useful when the Pi flips between home/lab networks.")
    ap.add_argument("--dry-run", action="store_true",
                    help="Print planned changes, don't write.")
    args = ap.parse_args()

    if args.pi_url is None and args.update_source is None and args.pi_url_alt is None:
        ap.error("need at least one of --pi-url, --pi-url-alt, or --update-source")

    if not args.base.exists():
        print(f"error: base path does not exist: {args.base}", file=sys.stderr)
        return 1

    paths = find_agent_jsons(args.base)
    if not paths:
        print(f"no agent.json files found under {args.base}")
        return 0

    print(f"found {len(paths)} agent.json file(s) under {args.base}")
    if args.dry_run:
        print("DRY RUN — no files will be modified.\n")

    changed_count = 0
    error_count = 0
    for p in paths:
        ok, s = update_one(p, args.pi_url, args.update_source, args.pi_url_alt, args.dry_run)
        if "error" in s:
            print(f"  ✕ {s['path']}\n      {s['error']}")
            error_count += 1
            continue
        prefix = "→" if ok else "·"
        print(f"  {prefix} {s['computer']:<20} {p}")
        if ok:
            changed_count += 1
            for field in ("pi_url", "pi_url_alt", "update_source_path"):
                if s["before"].get(field) != s["after"].get(field):
                    print(f"      {field}: {s['before'].get(field)!r} → {s['after'].get(field)!r}")
            if not args.dry_run:
                print(f"      backup: {s['backup']}")

    print(f"\n{'would change' if args.dry_run else 'changed'}: {changed_count}, "
          f"unchanged: {len(paths) - changed_count - error_count}, "
          f"errors: {error_count}")
    return 0 if error_count == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
