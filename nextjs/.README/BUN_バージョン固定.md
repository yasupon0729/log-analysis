# log-analysis

ログ解析アプリ

## 開発環境

- このリポジトリでは Bun 1.3.1 を利用します。ルートに配置した `.tool-versions` を読み込めるよう、バージョンマネージャーとして asdf を使用してください。
- 初回セットアップ例:

  ```bash
  # asdf が未導入の場合のセットアップ
  sudo apt update
  sudo apt install -y curl git
  git clone https://github.com/asdf-vm/asdf.git ~/.asdf --branch v0.14.1
  echo '. "$HOME/.asdf/asdf.sh"' >> ~/.bashrc
  echo '. "$HOME/.asdf/completions/asdf.bash"' >> ~/.bashrc
  source ~/.bashrc

  asdf plugin-add bun https://github.com/cometkim/asdf-bun.git
  asdf install
  bun --version  # -> 1.3.1
  ```

- 別バージョンの Bun を使用すると Panda CSS (`@styled-system` 周辺) のビルドが失敗するため、必ず asdf で指定バージョンに揃えてください。
- `~/.bun/bin` など既存バイナリの PATH が優先される場合は、`.bashrc` などで次の行を前方に追加し、`which bun` が `~/.asdf/shims/bun` を指すことを確認してください。

  ```bash
  export PATH="$HOME/.asdf/shims:$HOME/.asdf/bin:$PATH"
  ```
