# AGENTS.md

AI コーディングエージェント（Claude Code、Codex など）がこのリポジトリで作業するときの指針です。人間向けの説明は [README.md](README.md) を参照してください。

## 言語

- **基本的な言語は日本語です。** ユーザーへの返答、作業報告、ドキュメント（README、`.specs/` 配下）、Pull Request の説明は日本語で書いてください。
- コード中の識別子は英語です。コードコメントは、周囲のコメントに合わせてください（既存のコメントは主に英語）。
- コミットメッセージは既存の履歴に合わせ、Conventional Commits 形式の英語で書いてください（例: `feat(domain): ...`、`fix(presentation): ...`、`docs: ...`）。
- 画面に表示する文言は、実機に合わせた英語表記（`CREDITS`、`TAKE SCORE` など）のままにしてください。

## プロジェクト概要

シグマ社のビデオポーカー「FREE DEAL TWIN JOKERS (PROG)」（52JP、緑プログレ）を再現したブラウザゲームです。TypeScript + Vite + PixiJS で作り、PWA としてスマホでもオフラインで遊べます。

- 仕様書: [.specs/game-spec.md](.specs/game-spec.md)（確認済／推定／仮 のラベル付き）
- 設計: [.specs/architecture.md](.specs/architecture.md)、[.specs/session-design.md](.specs/session-design.md)
- 仕様にない点の判断記録: [.specs/decisions.md](.specs/decisions.md)
- TODO と論点整理: [.specs/todo.md](.specs/todo.md)

## コマンド

パッケージ管理とスクリプト実行には **Bun** を使います（npm / npx は使わない）。

```sh
bun install
bun run dev          # 開発サーバー（http://localhost:5173、/gallery.html で部品ギャラリー）
bun run check        # 型チェック + ESLint + ユニットテスト（作業完了前に必ず通す）
bun run test:slow    # 全 3,162,510 手の列挙検算（ルールを変えたら必ず通す）
bun run smoke        # ブラウザで自動プレイ 20 秒（画面を変えたら通す）
bun run build        # 本番ビルド（dist/、PWA 込み）
bun run pwa:check    # 本番ビルドがオフラインで起動するか確認
bun run icons        # PWA アイコンをコードから再生成
```

画面の確認には `?seed=N`（乱数固定・保存なし）、`?autoplay=1`、`?scene=win|standard|redblack|highlow|freegame|jackpot` が使えます。スクリーンショットは `bun scripts/shot.mjs <url> <out.png>` や `bun scripts/play.mjs` で撮れます（出力先は git 管理外の `.qa/` を推奨）。

## アーキテクチャ（必ず守ること）

Clean Architecture で、依存は外から内への一方向です。

```
presentation ──▶ application ──▶ domain
      └── infrastructure ──┘（application の Port を実装）
src/main.ts = Composition Root（具体クラスを結線する唯一の場所）
```

| 層 | 置くもの | 禁止 |
|---|---|---|
| `src/domain` | ルール（役判定、配当、プログレ、フリーゲーム、ダブルダウン）、設定、乱数 Port | 外側の層の import、pixi / gsap / howler / xstate、`Math.random`、`crypto`、`localStorage`、DOM |
| `src/application` | XState の状態機械、ビュー（`toView`）、イベント、ファサード（`gameSession`）、保存 Port | infrastructure / presentation の import、描画・音ライブラリ |
| `src/infrastructure` | crypto 乱数、localStorage 保存 | presentation の import |
| `src/presentation` | PixiJS 描画、GSAP 演出、Howler 効果音、入力 | ルールの再実装（判定は必ず `SessionView` と domain / application に任せる） |

- 層の違反は ESLint（`no-restricted-imports`）と `tests/architecture.test.ts` が検出します。テストを緩めて通すのではなく、コードを正しい層に置いてください。
- 迷ったら「ルールを変える → domain」「操作の流れを変える → application」「見た目・音を変える → presentation」。
- 状態遷移図は `src/application/gameMachine.ts` の先頭コメントにあります。遷移を変えたら図も更新してください。

## 実装ルール

- **数値を直書きしない。** 配当表、フリーゲーム回数、プログレ増分、ダブルダウン上限、ボーナス倍率、抽選モードなど仕様の値は `src/domain/config.ts` に集約されています。仕様で「仮」「推定」の値も含め、ここで変更してください。
- **乱数は必ず `Randomizer` Port 経由。** テストでは `seededRandomizer(seed)` を使い、再現可能にします。
- **プログレッシブは 1/1000 枚単位の整数で保持します**（浮動小数の誤差で切り上げがずれるのを防ぐため。D18）。
- **画像・音声ファイルを追加しない。** カード、ドット文字、効果音、アイコンはすべてコードで生成しています。実機の画像・音・ロゴなどの権利物は使わないでください。
- **保存データのキーを変えない。** `twinjokers.save.v1`、`twinjokers.web.prefs.v1` を変えると既存プレイヤーの CREDITS とプログレが消えます。形式を変える場合は `parseSaveData` で旧形式を読めるようにしてください。
- 不正な操作は例外を投げず、`REJECTED` イベントとして扱う設計です。この方針を崩さないでください。
- 仕様にない解釈をしたら [.specs/decisions.md](.specs/decisions.md) に 1 行追記してください。

## テスト

- 変更する層を決め、壊れる入力のテストを先に書いてから直してください（自己敵対的レビュー）。
- `tests/review/differential.test.ts` は、削除済みの旧 Pyxel 版から記録した固定の正解データ（`tests/review/fixtures/python_trace.json.gz`）と全ステップ一致するかを確認します。生成スクリプトはもうないので再生成できません。ルールを意図して変えた結果このテストが落ちる場合は、黙って消さず、更新・廃止の判断をユーザーに確認してください。
- テスト名・ファイル配置は既存に合わせます（`tests/<層>/*.test.ts`、重い列挙は `*.slow.test.ts`）。

## 作業の進め方

- 完了報告の前に `bun run check` を通してください。ルールを変えたら `bun run test:slow`、画面を変えたら `bun run smoke` も。
- 画面の変更は、スクリーンショットを撮って目で確認してください（320×240 のドット絵が崩れていないか、文字が重なっていないか）。
- コミット・プッシュはユーザーに頼まれたときだけ行ってください。`main` へ直接コミットせず、ブランチを切ってください。
- 大きな作業でサブエージェントを使う場合は、担当ファイルを分けて並列にし、共有の契約（`src/domain/{cards,enums,config,random}.ts`、`src/application/ports.ts` など）の変更はオーケストレーターに集約してください。
