# /results モーダルの S3 ListBucket 断続エラー 現状まとめ

作成日: 2026-01-18

## 症状
- `/results` のモーダルを開くと、以下のエラーが断続的に表示される。
  - `User: arn:aws:iam::449873012347:user/LogAnalysis_Matsumoto is not authorized to perform: s3:ListBucket on resource: "arn:aws:s3:::gexel-secure-storage" with an explicit deny in an identity-based policy`
- 同じ解析 ID でも、時間を置くと成功したり失敗したりする。
- 画像表示は S3 から取得しているため、表示できた時点では GetObject は成功している。

## 仕様と現在の実装
- モーダルのプレビュー取得は `/api/analysis-results` を呼び出し、S3 の ListBucket 相当でファイル一覧を集約する。
- ListBucket が失敗した場合は即時にエラー表示となり、フォールバック処理は実行されない。
- ListBucket が成功してもプレビューが空の場合は、`/api/analysis-results/fallback` 等のフォールバックを試す。
- `src/app/results/page-client.tsx` に「5秒待って1回だけ再試行（forceRefresh=1）」を追加したが、改善は確認できていない。

## これまでの確認・観測
- `logs/server/app-dev.log` / `logs/client/app-dev.log` に AccessDenied の記録は見当たらない。
- curl による確認では、以下が観測された。
  - `GET /api/analysis-results/object?...` が 200 OK になるケースがある（GetObject 成功）。
  - 特定の解析 ID では `NoSuchKey` が返り、`/api/analysis-results/object` は 500 を返す。
    - 現在の実装は GetObject の失敗を一律 500 にしているため、500 でも AccessDenied とは限らない。
- 「同じ ID で時間経過により成功/失敗が変化する」事実から、単純な prefix 間違いだけでは説明できない。

## 現状の結論
- エラーは S3 側の明示的 deny として返っているため、IAM/バケットポリシーの条件が関与している可能性が高い。
- 一方で同一 ID の成功/失敗が切り替わる点から、アプリ側のリクエストタイミングや S3 側の条件変化の切り分けが必要。
- 5秒リトライは効果なし。エラーは依然として断続的に再現する。

## 追加の仮説: IP 制限ポリシーと経路の揺れ
- IAM ポリシーで `aws:SourceIp` を使った明示的 deny がある場合、経路が変わると ListBucket が断続的に拒否される。
- VPC エンドポイント経由では `aws:SourceIp` が期待どおり評価されず、許可 IP と一致しないため明示的 deny が発火しうる。
- IPv6 デュアルスタック環境では、プライバシー拡張等で一時的に別 IPv6 が使われると許可外になる。
- AWS 内部経由の呼び出しでは `sourceIPAddress` が `AWS Internal` のように記録され、IP 条件に合致しないケースがある。
- 明示的 deny は Allow を上書きするため、ポリシー側の条件調整が必須。

## 対処方針（ポリシー側）
- VPC エンドポイント利用時は `aws:SourceIp` ではなく `aws:VpcSourceIp` / `aws:SourceVpce` を使う。
- IPv6 を許可する場合は想定する IPv6 プレフィックス全体を含める（単一アドレス許可では揺れる）。
- `aws:ViaAWSService` / `aws:PrincipalIsAWSService` を使い、AWS 内部呼び出しを deny 対象から外す。

## 追加調査の候補
- CloudTrail で AccessDenied の `sourceIPAddress` と `vpcEndpointId` を確認し、成功時と比較する。
- 失敗時の `userAgent` / `requestParameters` を見て、ListBucket の発行主体や経路が変わっていないか確認する。
- IAM/バケットポリシー側の明示的 deny 条件の再確認（時間帯、IP、MFA、VPC Endpoint、タグ、セッション条件など）。
- ListBucket 失敗時に GetObject/HEAD の直接取得にフォールバックできないか検討。
- 失敗時に STS `GetCallerIdentity` を記録し、実際の認証主体が揺れていないかを確認。
