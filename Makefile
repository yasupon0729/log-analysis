# ============================================
# Docker Compose管理用Makefile
# ============================================
# Next.jsアプリケーションのDocker環境を管理するためのコマンド群
#
# 使用例:
#   make up              # コンテナを起動
#   make down            # コンテナを停止・削除
#   make build           # イメージをビルド
#   make build-up        # ビルドしてから起動
#   make build-no-cache  # キャッシュを使わずにビルド
#   make output-log      # 直近1時間のログをファイル出力
#   make output-log 24   # 直近24時間のログをファイル出力
# ============================================

COMPOSE_FILE=nextjs/docker-compose.yml
DOCKER_COMPOSE=docker compose -f $(COMPOSE_FILE)
ELECTRON_ENV_FILE ?= .env.electron
ELECTRON_ENV_PATH := $(abspath $(ELECTRON_ENV_FILE))

.PHONY: up down build build-up build-no-cache build-no-cache-up up-with-tunnel rebuild-up output-log

# コンテナをバックグラウンドで起動
up:
	$(DOCKER_COMPOSE) up -d
	@if [ -f "$(ELECTRON_ENV_PATH)" ]; then \
		. "$(ELECTRON_ENV_PATH)"; \
		case "$${ELECTRON_MODE:-}" in \
			1|true|TRUE|yes|YES) \
				echo "[info] Electron を起動します"; \
				ELECTRON_SKIP_DOCKER_START=1 bun run electron:start; \
				;; \
			*) \
				echo "[info] Electron モードは無効です"; \
				;; \
		esac; \
	else \
		echo "[info] $(ELECTRON_ENV_FILE) がないため Electron を起動しません"; \
	fi

# gexel.tunnel のトンネルサービスを活性化してから起動
up-with-tunnel:
	@if ! command -v systemctl >/dev/null 2>&1; then \
		echo "[error] systemctl が見つかりません。WSL や systemd 対応環境で実行してください。" >&2; \
		exit 1; \
	fi
	@if systemctl --user status gexel-tunnel.service >/dev/null 2>&1; then \
		echo "[info] gexel-tunnel.service は稼働中です"; \
	else \
		if systemctl --user list-unit-files | grep -q '^gexel-tunnel.service'; then \
			echo "[info] 既存の gexel-tunnel.service を起動します"; \
			systemctl --user start gexel-tunnel.service; \
		else \
			echo "[info] gexel-tunnel.service が存在しないためセットアップを実行します"; \
			./scripts/setup-gexel-tunnel.sh; \
		fi; \
	fi
	$(MAKE) up

# コンテナを停止して削除
down:
	$(DOCKER_COMPOSE) down

# イメージをビルド（起動はしない）
build:
	$(DOCKER_COMPOSE) build

# イメージをビルドしてからバックグラウンドで起動
build-up:
	$(DOCKER_COMPOSE) up --build -d

# キャッシュを使わずにイメージをビルド（依存関係の問題解決用）
build-no-cache:
	$(DOCKER_COMPOSE) build --no-cache

# キャッシュを使わずにビルドしてからバックグラウンドで起動
build-no-cache-up:
	$(DOCKER_COMPOSE) up --build --no-cache -d

ps:
	$(DOCKER_COMPOSE) ps

logs:
	$(DOCKER_COMPOSE) logs -f

# ログ出力用設定
LOG_EXPORT_DIR=logs_export
TIMESTAMP=$(shell date +%Y%m%d_%H%M%S)
DEFAULT_DURATION=1h

# make output-log [duration] の引数処理
ifeq (output-log,$(firstword $(MAKECMDGOALS)))
  # 2番目の引数を取得 (例: 24)
  RUN_ARGS := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
  # 引数がなければデフォルト、あれば 'h' を付与
  ifeq ($(RUN_ARGS),)
    DURATION := $(DEFAULT_DURATION)
  else
    DURATION := $(RUN_ARGS)h
  endif
  # 引数をターゲットとして解釈しないようにダミールールを定義
  $(eval $(RUN_ARGS):;@:)
endif

# ログファイル出力
output-log:
	@mkdir -p $(LOG_EXPORT_DIR)
	@echo "Exporting logs (since $(DURATION)) to $(LOG_EXPORT_DIR)/app_logs_$(TIMESTAMP).log ..."
	$(DOCKER_COMPOSE) logs --no-color --since $(DURATION) > $(LOG_EXPORT_DIR)/app_logs_$(TIMESTAMP).log
	@echo "Done. File saved to: $(LOG_EXPORT_DIR)/app_logs_$(TIMESTAMP).log"

# コンテナを停止・削除してから、トンネルサービスと共に起動
rebuild-up:
	$(MAKE) down
	$(MAKE) build
	$(MAKE) up-with-tunnel
