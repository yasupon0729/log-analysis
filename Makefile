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
# ============================================

COMPOSE_FILE=nextjs/docker-compose.yml
DOCKER_COMPOSE=docker compose -f $(COMPOSE_FILE)

.PHONY: up down build build-up build-no-cache build-no-cache-up up-with-tunnel rebuild-up

# コンテナをバックグラウンドで起動
up:
	$(DOCKER_COMPOSE) up -d

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
	$(DOCKER_COMPOSE) up -d

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

# コンテナを停止・削除してから、トンネルサービスと共に起動
rebuild-up:
	$(MAKE) down
	$(MAKE) build
	$(MAKE) up-with-tunnel

