import { useState } from "react";
import { D } from "./theme";
import { UI } from "./icons";

// Optional private recipes — drop a file at web/src/help-local.jsx that
// `export default`s a SECTIONS-shaped array, and it gets merged in below.
// The file is gitignored so personal paths/IPs/credentials never get
// committed. If the file is absent, this resolves to an empty object and
// the public list is unchanged.
const _localModules = import.meta.glob("./help-local.jsx", { eager: true });
const LOCAL_SECTIONS = (() => {
  for (const m of Object.values(_localModules)) {
    if (Array.isArray(m?.default)) return m.default;
  }
  return [];
})();


// Future-you reference. Each entry has a title, a short "when to use it"
// description, and one or more shell commands. Edit this file to add more.
const SECTIONS = [
  {
    title: "Restart the Pi service",
    when: "After editing pi/ code, after running init_db, or any time the API behaves stale.",
    cmds: [
      "sudo systemctl restart databased",
      "sudo systemctl status databased",
      "sudo journalctl -u databased -f      # tail logs",
    ],
  },
  {
    title: "Apply DB schema changes",
    when: "After adding a column to a model in pi/models.py.",
    cmds: [
      "cd /home/$USER/databased",
      ".venv/bin/python -m pi.init_db",
      "sudo systemctl restart databased",
    ],
  },
  {
    title: "Build the Windows agent",
    when: "After any change to agent/*.py — produces dist\\databased-agent\\.",
    cmds: [
      "# On the Windows build machine:",
      "cd S:\\Databased\\Agent          # or local C:\\build\\databased\\agent",
      ".\\build.ps1",
      "# Then copy dist\\databased-agent\\ to the NAS share at",
      "# \\\\<NAS>\\Share\\Databased\\Agent\\databased-agent\\",
    ],
  },
  {
    title: "Push the new agent build to all PCs",
    when: "After uploading the new databased-agent\\ folder to the NAS.",
    cmds: [
      "# Dashboard → Settings → Fleet → \"Push update\"",
      "# Each agent on 0.19+ checks the NAS within ~5 seconds and self-updates.",
    ],
  },
  {
    title: "Sync source: Pi → Windows build PC (git)",
    when: "Before each Windows build, to pick up edits I made on the Pi.",
    cmds: [
      "# On the Pi (when changes are ready):",
      "cd /home/$USER/databased",
      "git add -A && git commit -m \"summary of change\"",
      "",
      "# On the Windows build machine:",
      "cd C:\\build\\databased     # or wherever you cloned",
      "git pull",
    ],
  },
  {
    title: "Clone the repo on a new Windows machine (one-time)",
    when: "Setting up a fresh build machine.",
    cmds: [
      "mkdir C:\\build && cd C:\\build",
      "git clone <your-user>@<pi-ip>:/home/$USER/databased databased",
      "# replace <pi-ip> with the Pi's IP — same one you SSH to",
    ],
  },
  {
    title: "Rebuild the web bundle",
    when: "After editing web/src/*.jsx. Lives at web/dist after each build.",
    cmds: [
      "cd /home/$USER/databased/web",
      "npm run build",
      "# Hard-refresh the dashboard in the browser to load the new bundle.",
    ],
  },
  {
    title: "Drop a new game in the overlay",
    when: "Editing or adding HTML games for the logo modal.",
    cmds: [
      "# Files in web/public/games/ are served live by Flask at /games/<filename>",
      "# No rebuild needed — drop the file and refresh the dashboard.",
      "cp /path/to/MyGame.html /home/$USER/databased/web/public/games/",
    ],
  },
  {
    title: "Mount the NAS share on the Pi (CIFS/SMB)",
    when: "First-time Pi setup or after a network move where the NAS is at a new IP/hostname. The Pi needs the share mounted so it can ship builds, read agent files, and stat the build-ready badge.",
    cmds: [
      "# 1. Install the CIFS client (one-time)",
      "sudo apt-get update -qq",
      "sudo apt-get install -y cifs-utils",
      "",
      "# 2. Create the mount point (matches what the existing setup uses)",
      "sudo mkdir -p /mnt/share",
      "",
      "# 3. Store credentials in a root-only file so the password isn't in fstab",
      "sudo nano /etc/cifs-credentials      # then paste:",
      "# username=<nas-user>",
      "# password=<your password>",
      "# domain=WORKGROUP",
      "sudo chmod 600 /etc/cifs-credentials",
      "",
      "# 4. Add to /etc/fstab (one line — the uid/gid keep files owned by <your-user>)",
      "sudo nano /etc/fstab                 # then add:",
      "# //<NAS-IP-or-hostname>/Storage  /mnt/share  cifs  credentials=/etc/cifs-credentials,uid=1000,gid=1000,iocharset=utf8,vers=3.1.1,nofail,_netdev  0  0",
      "",
      "# 5. Mount it now (and confirm)",
      "sudo mount -a",
      "mount | grep cifs",
      "ls /mnt/share",
      "",
      "# Common gotchas:",
      "# - 'permission denied' → check credentials + that the NAS user has share access",
      "# - 'host is down' → ping the NAS IP first; check the new network",
      "# - vers=3.1.1 fails → try vers=2.1 or vers=3.0 (older NAS firmware)",
      "# - files not editable from <your-user> → make sure uid=1000 (run `id` to confirm)",
    ],
  },
  {
    title: "Windows 7 PCs — required prerequisites",
    when: "Setting up the agent on a Win7 host. Build is Python 3.8 so it runs on Win7 + Win10/11; Win7 needs a couple of MS runtimes installed first.",
    cmds: [
      "# On the Win7 PC, install (one-time):",
      "# 1. KB2999226 — Universal C Runtime",
      "#    https://www.catalog.update.microsoft.com/Search.aspx?q=kb2999226",
      "# 2. Visual C++ 2015-2022 Redistributable (x64)",
      "#    https://aka.ms/vs/17/release/vc_redist.x64.exe",
      "# 3. KB3033929 — SHA-2 code signing support (only if older Win7)",
      "",
      "# On the build machine: install Python 3.8 from python.org",
      "#   https://www.python.org/downloads/release/python-3810/",
      "# build.ps1 picks it up automatically via 'py -3.8'.",
    ],
  },
  {
    title: "Headless Pi at full resolution (no monitor / dongle needed)",
    when: "Setting up a fresh Pi for headless lab use. Without these, VNC/x11vnc shows a tiny ~800x800 viewport because the Pi has no display to mirror.",
    cmds: [
      "# Edit /boot/firmware/config.txt:",
      "sudo nano /boot/firmware/config.txt",
      "",
      "# Confirm these lines look like this — the dtoverlay must NOT have",
      "# ',composite' on the end (that disables HDMI entirely on Pi 4):",
      "dtoverlay=vc4-kms-v3d",
      "hdmi_force_hotplug=1",
      "hdmi_group=2          # 2 = DMT (PC monitor modes)",
      "hdmi_mode=82          # 82 = 1920x1080 @ 60Hz",
      "",
      "sudo reboot",
      "",
      "# After reboot, Pi acts as if a 1080p monitor is always plugged in,",
      "# even when nothing's connected. x11vnc mirrors that virtual display.",
      "# No HDMI dongle required.",
    ],
  },
  {
    title: "Headless Pi remote desktop — use xrdp (skip VNC)",
    when: "RealVNC on a headless Pi shows a tiny ~800x800 viewport because there's no real display. xrdp creates its own X session at the resolution the client connects with — fixes this entirely.",
    cmds: [
      "# On the Pi:",
      "sudo apt-get install -y xrdp",
      "sudo systemctl enable --now xrdp",
      "",
      "# Add the xrdp user to the ssl-cert group so it can read the cert key",
      "sudo adduser xrdp ssl-cert",
      "sudo systemctl restart xrdp",
      "",
      "# Dashboard's Pi Host VNC button now defaults to RDP/3389 and connects",
      "# via Guacamole. Username = your Pi user (<your-user>), password = your",
      "# Pi password. Guacamole prompts on first connect and caches.",
      "",
      "# If you want to keep VNC instead, set in the databased systemd unit:",
      "#   Environment=PI_HOST_PROTOCOL=vnc",
      "#   Environment=PI_HOST_PORT=5900",
    ],
  },
  {
    title: "Set up the internet tunnel (offline-network browsing via Pi)",
    when: "First-time Pi setup so the agent's tray 'Open Internet' menu works on offline lab PCs.",
    cmds: [
      "# On the Pi:",
      "cd /home/$USER/databased",
      "sudo bash tools/install_internet_tunnel.sh",
      "",
      "# Adjust the allowed subnet first if your offline network isn't 192.168.0.0/16:",
      "sudo TUNNEL_SUBNET=10.0.0.0/24 bash tools/install_internet_tunnel.sh",
      "",
      "# Per-PC: agent tray → 'Open Internet (via Pi tunnel)'",
      "# Launches Edge/Chrome with --proxy-server=http://<pi-ip>:8888.",
      "# Closing the browser ends the tunnel — no system proxy is touched.",
    ],
  },
  {
    title: "Set up agents to flip-flop between home + lab networks",
    when: "Pi physically moves between two networks (different IPs each side). Agent picks whichever URL responds.",
    cmds: [
      "# Set primary + alts on every approved agent at once:",
      ".venv/bin/python tools/configure_agents.py --base /mnt/share/Test \\",
      "  --pi-url http://<lab-pi-ip>:5000 \\",
      "  --pi-url-alt http://<home-pi-ip>:5000 \\",
      "  --pi-url-alt http://<pi-host>.local:5000",
      "",
      "# Each agent probes alts at startup and whenever the primary stops",
      "# responding, then auto-switches. No reconfig needed when the Pi moves.",
      "# Wizard also has the field if setting up a fresh PC.",
    ],
  },
  {
    title: "Mass-update agent.json after a network move",
    when: "Pi got a new IP/hostname, or NAS share name changed — every PC's agent.json needs the new pi_url and/or update_source_path.",
    cmds: [
      "# On the Windows machine where S:\\Test\\<PC>\\Agent\\ lives:",
      "python S:\\Databased\\tools\\configure_agents.py --base S:\\Test \\",
      "  --pi-url http://<pi-host>.local:5000 \\",
      "  --update-source \\\\NewNAS\\Share\\Databased\\Agent",
      "",
      "# Add --dry-run first to preview changes before writing.",
      "# Each modified file gets a timestamped .bak alongside it.",
    ],
  },
  {
    title: "Reset/recover a stuck agent (cmd ping loop)",
    when: "Old agent (≤0.19.0) got stuck mid-update — should not recur on 0.19.1+.",
    cmds: [
      "# On the lab PC:",
      "# 1. Task Manager → kill all cmd.exe and PING.EXE",
      "# 2. In the install folder, delete _databased_update.bat",
      "# 3. Save agent.json aside, rename databased-agent\\ → .bak,",
      "#    rename databased-agent.new\\ → databased-agent\\, restore agent.json",
      "# 4. Double-click databased-agent\\databased-agent.exe",
    ],
  },
  {
    title: "Tail Pi logs",
    when: "Debugging API errors or scheduler activity.",
    cmds: [
      "sudo journalctl -u databased -n 100 --no-pager     # last 100 lines",
      "sudo journalctl -u databased -f                    # live tail",
      "sudo journalctl -u databased --since \"5 minutes ago\"",
    ],
  },
  {
    title: "Inspect the DB",
    when: "Sanity-check what agents reported, current versions, etc.",
    cmds: [
      "cd /home/$USER/databased",
      ".venv/bin/python -c \"",
      "from pi.app import create_app",
      "from pi.models import db, Computer",
      "app = create_app()",
      "with app.app_context():",
      "    rows = db.session.execute(db.select(Computer.name, Computer.agent_version)).all()",
      "    for r in rows: print(r)\"",
    ],
  },
];


function CommandBlock({ cmds }) {
  return (
    <pre style={{
      margin: "8px 0 0", padding: "10px 12px", borderRadius: 8,
      background: "rgba(0,0,0,.30)", border: "1px solid rgba(255,255,255,.06)",
      fontFamily: "Geist Mono", fontSize: 11, color: D.ink, lineHeight: 1.55,
      overflow: "auto", whiteSpace: "pre",
    }}>
      {cmds.join("\n")}
    </pre>
  );
}


function HelpRow({ section, open, onToggle }) {
  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,.05)" }}>
      <div
        onClick={onToggle}
        style={{ padding: "12px 0", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
      >
        <span style={{ width: 10, fontSize: 9, color: D.faint, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", display: "inline-block", textAlign: "center" }}>▶</span>
        <span style={{ fontSize: 12, color: D.ink, fontWeight: 600, flex: 1 }}>{section.title}</span>
      </div>
      {open ? (
        <div style={{ paddingBottom: 12, marginLeft: 18 }}>
          <div style={{ fontSize: 11, color: D.sub, marginBottom: 4 }}>{section.when}</div>
          <CommandBlock cmds={section.cmds} />
        </div>
      ) : null}
    </div>
  );
}


export default function HelpSection() {
  // Persist whether the whole panel is expanded so it stays out of the way
  // by default and your preference survives reloads.
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem("databased.helpCollapsed");
    return saved === null ? true : saved === "1";
  });
  const [openIdx, setOpenIdx] = useState(null);
  function setAndPersist(v) {
    setCollapsed(v);
    localStorage.setItem("databased.helpCollapsed", v ? "1" : "0");
  }

  return (
    <div style={{ background: D.glass, border: D.glassBorder, borderRadius: 16, padding: 22, marginBottom: 14 }}>
      <button
        onClick={() => setAndPersist(!collapsed)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: 0, background: "transparent", border: "none", cursor: "pointer", color: D.ink, textAlign: "left" }}
      >
        <UI name="logs" size={14} />
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#fff", flex: 1 }}>Help & Reference</h2>
        <span style={{ fontSize: 10, color: D.faint, fontFamily: "Geist Mono" }}>{SECTIONS.length + LOCAL_SECTIONS.length} recipes</span>
        <span style={{ fontSize: 10, color: D.faint, transform: collapsed ? "none" : "rotate(90deg)", transition: "transform .15s", display: "inline-block", width: 10, textAlign: "center" }}>▶</span>
      </button>
      {!collapsed ? (
        <>
          <p style={{ margin: "8px 0", fontSize: 12, color: D.sub }}>
            Common commands and recipes for building, deploying, and recovering. Edit <code style={{ color: D.cyan }}>web/src/HelpSection.jsx</code> to add more.
          </p>
          {[...SECTIONS, ...LOCAL_SECTIONS].map((s, i) => (
            <HelpRow
              key={s.title}
              section={s}
              open={openIdx === i}
              onToggle={() => setOpenIdx(openIdx === i ? null : i)}
            />
          ))}
          {LOCAL_SECTIONS.length ? (
            <div style={{ marginTop: 10, fontSize: 10, color: D.faint }}>
              Includes {LOCAL_SECTIONS.length} private recipe{LOCAL_SECTIONS.length === 1 ? "" : "s"} from <code style={{ color: D.cyan }}>web/src/help-local.jsx</code> (gitignored).
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
