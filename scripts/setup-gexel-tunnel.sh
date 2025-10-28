#!/usr/bin/env bash

set -euo pipefail

SERVICE_DIR="${HOME}/.config/systemd/user"
SERVICE_FILE="${SERVICE_DIR}/gexel-tunnel.service"

echo "[setup] gexel.tunnel systemd ユーザーサービスを設定します"

if ! command -v systemctl >/dev/null 2>&1; then
  echo "[error] systemctl が見つかりません。WSL や systemd 対応環境で実行してください。" >&2
  exit 1
fi

mkdir -p "${SERVICE_DIR}"

cat <<'EOF' >"${SERVICE_FILE}"
[Unit]
Description=SSH tunnel to gexel.cloud
After=network.target

[Service]
ExecStart=/usr/bin/ssh -o ExitOnForwardFailure=yes -o ServerAliveInterval=60 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=accept-new gexel-cloud-tunnel -NT
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

echo "[setup] サービスファイルを ${SERVICE_FILE} に配置しました"

systemctl --user daemon-reload
systemctl --user enable --now gexel-tunnel.service

echo "[setup] gexel-tunnel.service を有効化し起動しました"
echo "[hint] 稼働状況は 'systemctl --user status gexel-tunnel.service' で確認できます"
