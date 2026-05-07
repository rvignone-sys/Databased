#!/usr/bin/env bash
# Set up tinyproxy on the Pi so offline lab PCs can reach the internet through
# it (the agent's tray "Open Internet" menu item targets this).
#
# Run as root: sudo bash tools/install_internet_tunnel.sh
#
# Two-part install:
#   1) tinyproxy itself (apt) + helper script that the dashboard calls
#   2) sudoers entry so the Flask service can invoke just that helper
#
# After this, the dashboard's Settings → Fleet → Internet Tunnel toggle
# controls everything; you don't edit conf files by hand.

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: run with sudo" >&2
  exit 1
fi

REPO_USER="${SUDO_USER:-$USER}"   # user the databased service runs as
HELPER_SRC="$(dirname "$(readlink -f "$0")")/databased-tunnel"
HELPER_DEST="/usr/local/bin/databased-tunnel"
SUDOERS_FILE="/etc/sudoers.d/databased"

echo "==> installing tinyproxy"
apt-get update -qq
apt-get install -y -qq tinyproxy

echo "==> installing helper script"
install -m 0755 "$HELPER_SRC" "$HELPER_DEST"

echo "==> writing sudoers rule (user: $REPO_USER → $HELPER_DEST, NOPASSWD)"
cat > "$SUDOERS_FILE" <<EOF
# Granted to the databased service so it can manage tinyproxy lifecycle
# without running the whole Flask app as root.
$REPO_USER ALL=(root) NOPASSWD: $HELPER_DEST
EOF
chmod 0440 "$SUDOERS_FILE"
visudo -cf "$SUDOERS_FILE" >/dev/null

echo "==> stopping tinyproxy (default off — dashboard toggle controls)"
systemctl stop tinyproxy 2>/dev/null || true
systemctl disable tinyproxy 2>/dev/null || true

echo
echo "Done. Dashboard → Settings → Fleet → Internet Tunnel toggle is now live."
echo "Tunnel is OFF by default; flip the toggle in the dashboard to start it."
