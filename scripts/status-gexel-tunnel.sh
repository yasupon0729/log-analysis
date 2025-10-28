#!/usr/bin/env bash

set -euo pipefail

echo "[status] gexel-tunnel.service の状態を確認します"

if ! command -v systemctl >/dev/null 2>&1; then
  echo "[error] systemctl が見つかりません。WSL や systemd 対応環境で実行してください。" >&2
  exit 1
fi

systemctl --user status gexel-tunnel.service
