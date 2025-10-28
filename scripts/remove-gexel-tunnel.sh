#!/usr/bin/env bash

set -euo pipefail

SERVICE_FILE="${HOME}/.config/systemd/user/gexel-tunnel.service"

echo "[remove] gexel-tunnel.service を停止し削除します"

if ! command -v systemctl >/dev/null 2>&1; then
  echo "[error] systemctl が見つかりません。WSL や systemd 対応環境で実行してください。" >&2
  exit 1
fi

systemctl --user disable --now gexel-tunnel.service || true

if [ -f "${SERVICE_FILE}" ]; then
  rm -f "${SERVICE_FILE}"
  echo "[remove] ${SERVICE_FILE} を削除しました"
else
  echo "[remove] ${SERVICE_FILE} は存在しませんでした"
fi

systemctl --user daemon-reload

echo "[remove] 完了しました"
