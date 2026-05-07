# TightVNC installers

Bundled VNC server installers for the lab PCs. We ship these in-repo so a fresh
`git clone` on a new machine has everything it needs to set up remote-desktop
access without hunting them down again.

## Files

- `tightvnc-2.8.87-gpl-setup-64bit.msi` — use this on every modern Windows PC
- `tightvnc-2.8.87-gpl-setup-32bit.msi` — only if you ever encounter a 32-bit-only host

## Install steps (per lab PC)

1. Run the 64-bit MSI as Administrator.
2. Choose **Custom** → enable only **TightVNC Server** (skip the Viewer unless
   you want to RDP *out* from this PC).
3. Set both **Primary** and **Control** passwords. Use the same password
   you'll enter in the dashboard's gear modal under
   *Remote password (RDP/VNC)* so the agent's mint-session flow can connect
   without a prompt.
4. Make sure "Run TightVNC Server as a Windows service" is checked.
5. After install, in the agent's gear modal:
   - Set **Remote protocol** to `vnc`
   - Set **Remote port** to `5900` (default)
   - Save — the dashboard will mint Guacamole sessions to this PC.

## Updating the bundled version

When TightVNC ships a new version, drop the new MSI here and `git rm` the old
one. Bump this README's version reference. Keep both architectures in sync.
