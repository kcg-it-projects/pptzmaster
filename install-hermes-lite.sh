#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Hermes-Lite Universal Installer
# Ein curl-Befehl, alles drin. Docker-first, Nano-Fallback.
#
# Usage:
#   curl -sS https://raw.githubusercontent.com/kcg-it-projects/pptzmaster/main/install-hermes-lite.sh | bash -s <server-name>
#   curl -sS https://raw.githubusercontent.com/kcg-it-projects/pptzmaster/main/install-hermes-lite.sh | ssh root@<target> bash -s <server-name>
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SERVER_NAME="${1:?Usage: $0 <server-name>}"
BASE="/opt/hermes-lite"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*"; }

echo "═══════════════════════════════════════════"
echo " Hermes-Lite Installer — $SERVER_NAME"
echo "═══════════════════════════════════════════"

# ── Basis ───────────────────────────────────────────────────────────
mkdir -p "$BASE"/{ssh,logs,task} && chmod 700 "$BASE/ssh"

# ── .env (vom User zu befüllen) ─────────────────────────────────────
if [[ ! -f "$BASE/.env" ]]; then
    cat > "$BASE/.env.template" <<'EOF'
# Hermes-Lite Konfiguration
# Setze deinen API-Key und benenne die Datei um in .env
ANTHROPIC_API_KEY=sk-ant-...
HERMES_LITE_SERVER_NAME=changeme
EOF
    warn "$BASE/.env fehlt. Bitte $BASE/.env.template ausfüllen und in .env umbenennen."
    warn "ANTHROPIC_API_KEY=***   fi

# ── Docker-Prüfung ──────────────────────────────────────────────────
if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
    DEPLOY_MODE="docker"
    log "Docker verfügbar → Docker-Variante"
else
    DEPLOY_MODE="nano"
    log "Kein Docker → Nano-Variante (Systemd-Timer)"
fi

# ═══════════════════════════════════════════════════════════════════
# DOCKER-VARIANTE
# ═══════════════════════════════════════════════════════════════════
if [[ "$DEPLOY_MODE" == "docker" ]]; then

    # Allowlist
    cat > "$BASE/allowlist.yaml" <<'EOF'
allowed_commands:
  - "systemctl status *"
  - "df -h"
  - "free -m"
  - "docker ps"
  - "docker logs --tail *"
  - "docker inspect *"
  - "tail -n *"
  - "journalctl -u * --since *"
  - "ss -tlnp"
  - "uptime"
  - "who"
  - "cat /etc/hostname"
  - "cat /etc/os-release"
  - "curl -sI *"
EOF

    # Netzwerk
    docker network inspect hermes-net &>/dev/null || docker network create hermes-net

    # Alten Container entfernen
    docker rm -f "hermes-lite-$SERVER_NAME" 2>/dev/null || true

    # Container starten (alle 7 Sicherheitsschichten)
    docker run -d --name "hermes-lite-$SERVER_NAME" \
      --restart unless-stopped \
      --read-only \
      --tmpfs /opt/data:rw,noexec,size=128m \
      --memory=512m --cpus=1 --pids-limit=50 \
      --cap-drop=ALL --security-opt=no-new-privileges \
      --network=hermes-net \
      --env-file="$BASE/.env" \
      -v "$BASE/allowlist.yaml:/etc/hermes/allowlist.yaml:ro" \
      -v "$BASE/logs:/opt/data/logs:rw" \
      nousresearch/hermes-agent:latest

    log "Container gestartet: hermes-lite-$SERVER_NAME"

fi

# ═══════════════════════════════════════════════════════════════════
# NANO-VARIANTE
# ═══════════════════════════════════════════════════════════════════
if [[ "$DEPLOY_MODE" == "nano" ]]; then

    # ── Nano Python-Script ──────────────────────────────────────────
    cat > "$BASE/nano.py" <<'PYEOF'
#!/usr/bin/env python3
"""Hermes Nano — ultraleicht, Systemd-Timer-getriggert."""
import json, os, subprocess, sys, urllib.request
from datetime import datetime, timezone

TASK_FILE = "/opt/hermes-lite/task/pending.json"
STATE_FILE = "/opt/hermes-lite/state.json"
LOCK_FILE = "/opt/hermes-lite/running.lock"
ALLOWED = [
    "systemctl status", "df -h", "free -m", "docker ps",
    "tail -n", "ss -tlnp", "uptime", "journalctl -u",
]

if os.path.exists(LOCK_FILE):
    sys.exit(0)
open(LOCK_FILE, "w").close()

def cleanup():
    try: os.remove(LOCK_FILE)
    except OSError: pass

try:
    if not os.path.exists(TASK_FILE):
        sys.exit(0)
    with open(TASK_FILE) as f:
        task = json.load(f)
    os.remove(TASK_FILE)

    prompt = task.get("prompt", "")
    if not prompt:
        cleanup(); sys.exit(0)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not set")
        cleanup(); sys.exit(1)

    req_body = json.dumps({
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 1024,
        "messages": [{"role": "user", "content": f"""Du bist ein Server-Diagnose-Agent.
Erlaubte Shell-Commands: {', '.join(ALLOWED)}

Task: {prompt}

Antworte NUR mit Shell-Commands, einen pro Zeile."""}]
    }).encode()

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=req_body,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read())

    commands = result["content"][0]["text"].strip().split("\n")
    results = []
    for cmd in commands:
        cmd = cmd.strip()
        if not cmd:
            continue
        if not any(cmd.startswith(a) for a in ALLOWED):
            results.append(f"REJECTED: {cmd}")
            continue
        try:
            out = subprocess.check_output(cmd, shell=True, stderr=subprocess.STDOUT, timeout=15, text=True)
            results.append(f"OK: {cmd}\n{out.strip()}")
        except subprocess.CalledProcessError as e:
            results.append(f"ERROR ({e.returncode}): {cmd}\n{e.output.strip()}")
        except subprocess.TimeoutExpired:
            results.append(f"TIMEOUT: {cmd}")

    state = {"last_run": datetime.now(timezone.utc).isoformat(), "task": task, "results": results}
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)

    if task.get("webhook"):
        try:
            wh_body = json.dumps(state).encode()
            wh_req = urllib.request.Request(task["webhook"], data=wh_body, headers={"content-type": "application/json"})
            urllib.request.urlopen(wh_req, timeout=10)
        except Exception:
            pass
finally:
    cleanup()
PYEOF
    chmod 755 "$BASE/nano.py"

    # ── Systemd Service ─────────────────────────────────────────
    cat > /etc/systemd/system/hermes-nano.service <<'UNITEOF'
[Unit]
Description=Hermes Nano Agent
After=network.target

[Service]
Type=oneshot
User=nobody
WorkingDirectory=/opt/hermes-lite
EnvironmentFile=/opt/hermes-lite/.env
ExecStart=/usr/bin/python3 /opt/hermes-lite/nano.py
MemoryMax=64M
CPUQuota=25%
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=/opt/hermes-lite
NoNewPrivileges=yes
UNITEOF

    # ── Systemd Timer ───────────────────────────────────────────
    cat > /etc/systemd/system/hermes-nano.timer <<'TIMEREOF'
[Unit]
Description=Hermes Nano Timer (every 5 minutes)

[Timer]
OnCalendar=*:0/5
RandomizedDelaySec=30
Persistent=true

[Install]
WantedBy=timers.target
TIMEREOF

    systemctl daemon-reload
    systemctl enable --now hermes-nano.timer
    log "Nano installiert. Timer läuft alle 5 Minuten."
fi

# ═══════════════════════════════════════════════════════════════════
# SSH-SETUP (beide Varianten)
# ═══════════════════════════════════════════════════════════════════

# SSH-Key generieren
if [[ ! -f "$BASE/ssh/hermes_lite_ed25519" ]]; then
    ssh-keygen -t ed25519 -C "hermes-lite@$SERVER_NAME" -f "$BASE/ssh/hermes_lite_ed25519" -N "" -q
    log "SSH-Key generiert"
fi

# ForceCommand-Wrapper (nur wenn sshd läuft)
if command -v sshd &>/dev/null; then
    cat > "$BASE/ansible-wrapper.sh" <<'WRAPEOF'
#!/bin/bash
set -euo pipefail
LOG="/var/log/hermes-lite-commands.log"
REJECT="/var/log/hermes-lite-rejected.log"
CMD="${SSH_ORIGINAL_COMMAND:-}"
ALLOWED=("systemctl status" "systemctl is-active" "df -h" "df -i" "free -m" "free -h" "docker ps" "docker logs --tail" "docker inspect" "tail -n" "journalctl -u" "ss -tlnp" "ss -tln" "uptime" "who" "w" "cat /etc/hostname" "cat /etc/os-release" "curl -sI" "curl -sk")

if [[ -z "$CMD" ]]; then
    echo "ERROR: No command. Hermes-Lite requires SSH_ORIGINAL_COMMAND."
    echo "$(date -Iseconds) | REJECTED | (empty)" >> "$REJECT"
    exit 1
fi
for p in "${ALLOWED[@]}"; do
    if [[ "$CMD" == "$p"* ]]; then
        echo "$(date -Iseconds) | ALLOWED | $CMD" >> "$LOG"
        exec bash -c "$CMD"
    fi
done
echo "$(date -Iseconds) | REJECTED | $CMD" >> "$REJECT"
echo "REJECTED: Not in allowlist. Logged."
exit 1
WRAPEOF
    chmod 755 "$BASE/ansible-wrapper.sh"

    PUBKEY=$(cat "$BASE/ssh/hermes_lite_ed25519.pub")
    log "ForceCommand-Wrapper installiert"
    echo ""
    echo "═══ Für Zielserver: authorized_keys-Zeile ═══"
    echo "command=\"$BASE/ansible-wrapper.sh\",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty $PUBKEY"
    echo "══════════════════════════════════════════════"
fi

# ═══════════════════════════════════════════════════════════════════
# AUDITD (wenn verfügbar)
# ═══════════════════════════════════════════════════════════════════
if command -v auditctl &>/dev/null; then
    auditctl -w /opt/ -p rwxa -k hermes_lite_fs 2>/dev/null || true
    auditctl -w /etc/passwd -p rw -k hermes_critical 2>/dev/null || true
    log "auditd-Tracking aktiv"
fi

# ═══════════════════════════════════════════════════════════════════
# VERIFIKATION
# ═══════════════════════════════════════════════════════════════════
echo ""
echo "═══ Installation abgeschlossen ═══"
echo "Server:   $SERVER_NAME"
echo "Modus:    $DEPLOY_MODE"
echo "Basis:    $BASE"
echo "SSH-Key:  $BASE/ssh/hermes_lite_ed25519"
echo ""

if [[ "$DEPLOY_MODE" == "docker" ]]; then
    docker ps --filter "name=hermes-lite-$SERVER_NAME" --format 'Container: {{.Names}} | {{.Status}}'
    echo ""
    docker inspect "hermes-lite-$SERVER_NAME" --format '
Sicherheit:
  ReadOnly:    {{.HostConfig.ReadonlyRootfs}}
  Privileged:  {{.HostConfig.Privileged}}
  CapDrop:     {{.HostConfig.CapDrop}}
  Memory:      {{.HostConfig.Memory}} bytes
  PidsLimit:   {{.HostConfig.PidsLimit}}
  NoNewPriv:   {{index .HostConfig.SecurityOpt 0}}
'
fi

if [[ "$DEPLOY_MODE" == "nano" ]]; then
    systemctl status hermes-nano.timer --no-pager 2>/dev/null | head -4
fi

echo ""
echo "Nächster Schritt: $BASE/.env mit API-Key befüllen"
