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

.PHONY: up down build build-up build-no-cache build-no-cache-up

# コンテナをバックグラウンドで起動
up:
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