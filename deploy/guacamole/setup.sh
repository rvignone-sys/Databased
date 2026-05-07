#!/usr/bin/env bash
# One-time setup for the Guacamole stack:
#   1. Generates a random Guacamole admin password and writes it to ../../.env (GUAC_ADMIN_PASS)
#   2. Brings the stack up
#   3. Rotates the default guacadmin/guacadmin password to GUAC_ADMIN_PASS
#
# Re-runnable. If the admin password is already set in .env, reuses it.
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(cd ../.. && pwd)"
ENV_FILE="$ROOT/.env"

require_env() {
    local key="$1"
    if grep -qE "^${key}=" "$ENV_FILE" 2>/dev/null; then
        grep -E "^${key}=" "$ENV_FILE" | tail -1 | cut -d= -f2-
    else
        local v
        v="$(openssl rand -hex 24 2>/dev/null || python3 -c 'import secrets; print(secrets.token_hex(24))')"
        echo "${key}=${v}" >> "$ENV_FILE"
        echo "$v"
    fi
}

echo "==> ensuring secrets in .env"
GUAC_ADMIN_PASS="$(require_env GUAC_ADMIN_PASS)"

# Host-side port. Defaults to 8081 (avoids the very common 8080).
HOST_PORT="$(grep -E '^GUAC_HOST_PORT=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2 || echo '')"
if [ -z "$HOST_PORT" ]; then
    HOST_PORT=8081
    echo "GUAC_HOST_PORT=${HOST_PORT}" >> "$ENV_FILE"
fi
export GUAC_HOST_PORT="$HOST_PORT"

echo "==> bringing stack up"
docker compose up -d

echo "==> waiting for Guacamole to start (this can take ~30s on first launch)"
for i in $(seq 1 90); do
    if curl -fsS -o /dev/null -w "%{http_code}" http://127.0.0.1:${HOST_PORT}/ 2>/dev/null | grep -qE "^(200|302|401|404)$"; then
        echo "    up after ~${i}s"
        break
    fi
    sleep 2
done
# Extra grace for Tomcat/Guac to finish initializing the DB.
sleep 5

# Try to rotate the default admin password. Idempotent — if the default
# already changed (rerun), the auth call fails harmlessly.
echo "==> rotating guacadmin password (if still default)"
TOKEN_RESPONSE="$(curl -fsS -X POST http://127.0.0.1:${HOST_PORT}/api/tokens \
    --data-urlencode 'username=guacadmin' \
    --data-urlencode 'password=guacadmin' 2>/dev/null || echo '')"
if [ -n "$TOKEN_RESPONSE" ]; then
    TOKEN=$(echo "$TOKEN_RESPONSE" | python3 -c 'import sys,json; print(json.load(sys.stdin)["authToken"])' 2>/dev/null || echo "")
    DATA_SOURCE=$(echo "$TOKEN_RESPONSE" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("dataSource","postgresql"))' 2>/dev/null || echo "postgresql")
    if [ -n "$TOKEN" ]; then
        if curl -fsS -X PUT "http://127.0.0.1:${HOST_PORT}/api/session/data/${DATA_SOURCE}/users/guacadmin/password?token=${TOKEN}" \
            -H "Content-Type: application/json" \
            -d "{\"oldPassword\":\"guacadmin\",\"newPassword\":\"${GUAC_ADMIN_PASS}\"}" 2>/dev/null; then
            echo "    rotated (data source: ${DATA_SOURCE})"
            # Persist the data source so the Flask client uses the right one.
            if grep -qE "^GUAC_DATA_SOURCE=" "$ENV_FILE"; then
                sed -i.bak -E "s|^GUAC_DATA_SOURCE=.*|GUAC_DATA_SOURCE=${DATA_SOURCE}|" "$ENV_FILE"
            else
                echo "GUAC_DATA_SOURCE=${DATA_SOURCE}" >> "$ENV_FILE"
            fi
        else
            echo "    rotate call failed (likely already rotated)"
        fi
    fi
else
    echo "    (default already rotated or Guacamole not ready — skipping)"
fi

echo
echo "Guacamole UI:       http://$(hostname -I | awk '{print $1}'):${HOST_PORT}/"
echo "Admin user:         guacadmin"
echo "Admin password:     see .env  (GUAC_ADMIN_PASS)"
echo
echo "If you just rotated, restart Flask so it reloads the .env:"
echo "  fuser -k 5000/tcp && cd $ROOT && nohup .venv/bin/python -m pi.app > /tmp/flask.log 2>&1 & disown"
