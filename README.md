# 予約システム

## 概要
学園祭で出店する教室企画の予約システムを作成したいです。

## 利用ケース
出展者が、来場した方に対して予約番号を発行。

## システムユーザー
基本的にはスマホユーザーがメインとなる。OSはandroid, iOSとなる。
PCユーザの利用も一応考える。また、タブレットユーザーもいる。

## 使用技術
この部分に関しては相談しながら使用していきたい。
今回はローカルでの完結ではなく、各ユーザ端末での同時操作が考えられるため、クラウドサービスの利用も考えられる。

---

## 開発

- 要件：`want.md`（オフライン専用、実行委員が iPad / Windows PC の1台で操作する）
- 構成：Vite + React + TypeScript。保存先は Repository（`src/data/repository.ts`）で抽象化している
  - 実装は IndexedDB（Dexie）… `src/data/localRepository.ts`。データはその端末のブラウザにだけ保存され、端末間では同期しない
- 画面：予約（時間枠を選んで登録）／一覧（検索・変更・キャンセル・削除）／履歴（操作ログ）／設定
- アイコン：Google Material Symbols (Rounded)
- バージョン：`package.json` の `version` を画面の下部に表示する。更新のたびに番号を上げ、`CHANGELOG.md` に追記する

```sh
npm install
npm run dev      # http://localhost:5173 （同じWi-Fiのスマホからは、表示される Network のURLで開く）
npm test         # ユニットテスト
npm run build    # 型チェックと本番ビルド
```

初めて開いたら、設定 →「サンプルデータを入れる」で動作を確認できる。

## タブレットで使う

予約データは開いた端末のブラウザの中にだけ保存される。アプリは外部と通信しない（フォントとアイコンは同梱、本番ビルドは CSP で外部通信を禁止）。

```sh
npm run build
npm run preview  # http://localhost:4173 と、Network のURL（http://<PCのIP>:4173）で配信する
```

- 同じ Wi-Fi で使う：PC で上のコマンドを動かしたまま、タブレットのブラウザで Network のURLを開く。再読み込みには PC が要る（http ではオフライン起動の仕組みが働かない）
- オフラインで使う：HTTPS か localhost で一度開くと、以後は PC もネットもなしで起動できる。ブラウザのメニューから「ホーム画面に追加」する
  - HTTPS：`dist` を静的ホスティング（GitHub Pages など）に置く。置くのはプログラムだけで、予約データは載らない
  - localhost：Android は USB でつなぎ、`adb reverse tcp:4173 tcp:4173` でタブレットの `http://localhost:4173` を PC に転送して開く
- 端末を変えるとデータは引き継がれない。受付は1台で行い、区切りごとに設定から JSON を書き出して控える