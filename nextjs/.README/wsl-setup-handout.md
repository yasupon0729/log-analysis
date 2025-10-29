# WSL 利用者向けセットアップ手順（配布用）

WSL2 上で Docker と Git が入っているメンバーが、本リポジトリを受け取ってアプリを動かすまでの流れをまとめた手順書です。
ここに書かれている以外のツールは初期状態では存在しない前提で説明しています。

---

## 1. 前提条件の確認

- WSL2（Ubuntu 24.04 など）で systemd が有効になっていること  
  `systemctl --user status` がエラーにならなければ OK
- Docker Desktop などで Linux コンテナが使える状態であること  
  `docker --version` でバージョンが表示されれば OK
- Git が利用可能であること
  `git --version` でバージョンが表示されれば OK

※ ここまでが満たされない場合は社内 wiki に従ってセットアップしてください。

---

## 2. 必要なツールの導入

1. asdf（未導入の場合）
   ```bash
   git clone https://github.com/asdf-vm/asdf.git ~/.asdf --branch v0.16.5
   echo '. "$HOME/.asdf/asdf.sh"' >> ~/.bashrc
   echo '. "$HOME/.asdf/completions/asdf.bash"' >> ~/.bashrc
   exec $SHELL
   ```
2. Bun 1.3.1 を asdf でインストール
   ```bash
   asdf plugin add bun https://github.com/asdf-community/asdf-bun.git
   asdf install bun 1.3.1
   bun --version  # 1.3.1 と表示されること
   ```
   ※ Node.js が未導入の場合は `asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git` → `asdf install nodejs latest` → `asdf global nodejs <version>` も実行してください。
3. リポジトリを取得
   ```bash
   git clone git@github.com:yasupon0729/log-analysis.git
   cd log-analysis
   ```
4. make をインストール（未導入の場合）
   ```bash
   sudo apt update
   sudo apt install -y make
   ```

---

## 3. 認証情報の準備

リポジトリ内に機密情報は含めていないため、以下は別途担当者から受け取ってください。

- .wnv.local
- .env.production
- gexel.cloud 用 SSH 秘密鍵（例: `gexel_cloud.pem`）

### SSH 鍵の配置

1. 受け取った鍵ファイルを `~/.ssh/gexel_cloud.pem` に保存し、権限を設定します。
   ```bash
   chmod 600 ~/.ssh/gexel_cloud.pem
   ```
2. `~/.ssh/config` に以下を追記します。既にある場合は重複しないように調整してください。
   ```sshconfig
   Host gexel-cloud-tunnel
       HostName gexel.cloud
       User ubuntu
       IdentityFile ~/.ssh/gexel_cloud.pem
       LocalForward 3307 localhost:3306
       ServerAliveInterval 60
       ServerAliveCountMax 3
   ```

---

## 4. 環境変数ファイルの作成

`nextjs` ディレクトリ直下に以下 2 ファイルを用意します。

1. ローカル開発用: `nextjs/.env.local`
2. Docker 用: `nextjs/.env.production`

どちらも以下の項目を記入します（値は受け取ったものを使用）。

```dotenv
NODE_ENV=development       # .env.production では production でも可
LOG_LEVEL=debug            # 本番相当なら info

AWS_ACCESS_KEY_ID=*****
AWS_SECRET_ACCESS_KEY=*****
AWS_REGION=ap-northeast-1

LOG_ENCRYPTION_KEY=********************************

MYSQL_HOST=127.0.0.1       # Docker 用は host.docker.internal
MYSQL_PORT=3307
MYSQL_USER=*****
MYSQL_PASSWORD=*****
MYSQL_DATABASE=GeXeLDB
MYSQL_POOL_SIZE=10
MYSQL_TIMEZONE=Asia/Tokyo
```

- ローカル開発 (`bun dev`, `bun run build`) では `.env.local` が優先されます。
- Docker 起動 (`docker compose up`, `make up-with-tunnel`) で読み込まれるのは `.env.production` です。

---

## 5. SSH トンネル（systemd ユーザーサービス）の初期化

初回のみ以下を実行すると、`~/.config/systemd/user/gexel-tunnel.service` が作成され、ポート `3307` でトンネルが常駐します。

```bash
make up-with-tunnel
```

- 既にサービスが存在すれば自動で起動のみ行われます。
- 状態確認: `./scripts/status-gexel-tunnel.sh`
- 失敗時の再起動: `systemctl --user restart gexel-tunnel.service`
- ポート確認: `ss -ltnp | grep 3307` に `0.0.0.0:3307` が表示されれば成功です。

---

## 6. アプリケーションの起動方法

### 6-1. ローカル開発（ホストで実行）

```bash
cd nextjs
bun dev --turbopack --port 3729
```

- `http://localhost:3729` へアクセスすると UI が表示されます。
- バックエンドの MySQL 接続確認は `curl http://localhost:3729/api/mysql/check` で `{"ok":true}` を確認。

### 6-2. 本番ビルドの確認

```bash
cd nextjs
bun run build
bun start --port 3729
```

- build / start 中も `.env.local` が優先されます。

### 6-3. Docker コンテナでの起動

```bash
make up-with-tunnel   # トンネル確認込みで起動
```

- コンテナ停止は `docker compose down`、ログ確認は `docker compose logs -f web`。
- アクセス先は `http://localhost:3729`。MySQL 疎通確認は同じく `/api/mysql/check`。

---

## 7. よくあるトラブルと対処

- **`curl http://localhost:3729/api/mysql/check` がタイムアウト**  
  - `systemctl --user status gexel-tunnel.service` でトンネルが動いているか確認  
  - `docker compose exec web node -e "..."` などで `host.docker.internal:3307` に接続できるか確認する
- **ポート 3307 が使用中でトンネルが起動しない**  
  - `ss -ltnp | grep 3307` で競合プロセスを確認し、不要なトンネルを停止
- **Docker で 3729 にアクセスできない**  
  - `docker compose ps` でステータスを確認  
  - `docker compose up -d --force-recreate` で再作成

---

## 8. 次にやること

1. `/upload` 画面から `.log.gz.enc` をアップロードし、ログ復号が動作するか確認する  
2. S3 からログ一覧を取得する場合は、環境変数 `S3_*` 系の値も設定すること

以上で配布時のセットアップは完了です。困った場合は `./scripts/status-gexel-tunnel.sh` と `docker compose logs web` の出力を添えて開発メンバーに共有してください。
