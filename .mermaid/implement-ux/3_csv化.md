```mermaid
sequenceDiagram
    %% 座標json、
    actor user as user
    participant nextjs as nextjs
    participant django as django
    participant server as 解析サーバ
       participant storage as s3

    participant db as データベース

    user->>+nextjs:計算(座標json to csv)
    %% 現在のExcelの生データを作成するイメージ

    nextjs->>+django: 計算依頼
    django->>+server: 計算依頼
    server->>+storage:座標json取得
    storage-->>-server:ok
    Note over server:jsonから計算※1
    server->>+storage:csv保存
    storage-->>-server:ok
    server->>-django:csv化完了通知
        django-->>-nextjs:

    nextjs->>+storage:csv取得依頼 ※2
    storage-->>-nextjs:ok
    note over nextjs:表示(グラフ表示するならこの段階)

```
※再計算ロジックは要検討しなければならない。<br>
※1 json to csv は、現在のExcel生データ<br>
※2 djangoから渡すのはデータ量的に愚策な気がする。<br>
※jsonを追加で渡せば、フィルター機能の時、スライダーなどを使用して、動的に画面を変更できそうな気がする。<br>
※バックエンドで非同期でExcel化まで走らせてしまうのはあり。<br>

※スケールバーの設定についても再考する必要あり、<br>
ゆくゆくは、この表示段階の前で、変更できるようにできたらなおよい。<br>
(いったんは放置してもよい気がしています)<br>