# TODO — FREE DEAL TWIN JOKERS (PROG)

> 履歴：最初は Pyxel（Python）版として T0.1〜T4.x を実装・完了した。その後 TypeScript 版（下記 W 系）へ移植し、差分テストで同一性を確認したうえで Pyxel 版は 2026-10-04 に削除した（Phase 5）。

依頼: memo.md ／ 設計: [architecture.md](architecture.md)

## 0. 論点思考（イシューツリー）

**メイン論点**: 「52JP（緑プログレ）を、ブラウザ／スマホで“あの頃の筐体”の雰囲気のまま遊べて、仕様どおり正しく、誰でも保守できるか？」

| # | サブ論点 | 判断基準（Yes になる条件） | 対応タスク |
|---|---|---|---|
| W1 | ルールは仕様と同じか | TS の全 3,162,510 手列挙で役の通り数・FG 条件数・RTP 92.24% が仕様の検算表と一致 | W1.1, W1.2, W4.2 |
| W2 | お金の計算に誤差がないか | プログレを整数（1/1000 枚）で保持、切り上げ・FG 2倍・最低 BET 保証・上限がテストで固定 | W1.2, W1.3 |
| W3 | 状態遷移に抜けがないか | XState で「その状態で無効な操作」は REJECTED、全状態から BETTING に戻れる、ランダム操作 1 万回で例外なし | W2.1 |
| W4 | 描画とロジックが分離されているか | domain/application に pixi/gsap/howler/DOM が無い（ESLint＋architecture test） | W0.2, W4.1 |
| W5 | “レトロの雰囲気”が出ているか | 320×240 ドット絵、緑基調、ドット文字、CRT 走査線・にじみ、チップチューン、カードめくり・カウントアップ・点滅 WIN | W1.4, W3.1 |
| W6 | スマホ・オフラインで遊べるか | タッチボタン、初回タップで音解禁（Howler）、PWA でホーム追加・オフライン起動 | W3.1, W3.2 |
| W7 | 保守できるか | 層ごとのディレクトリ・契約文書・`bun run check` 一発で型/Lint/テスト、README に参加手順 | W0.*, W4.3 |
| W8 | 技術制約 | TypeScript / Vite / PixiJS v8 / GSAP / XState v5 / Vitest / Howler / vite-plugin-pwa | W0.1 |

## 1. タスク（上から順に。同じフェーズ内は並列実行）

### Phase 0 — 土台（オーケストレーター）
- [x] W0.1 Vite + TS プロジェクト作成、依存導入、Vitest の unit/slow プロジェクト分割
- [x] W0.2 層境界：ESLint `no-restricted-imports` ＋ `tests/architecture.test.ts`
- [x] W0.3 共有契約：`domain/cards.ts` `enums.ts` `config.ts` `random.ts`、`application/ports.ts` `saveData.ts`
- [x] W0.4 設計文書 `.specs/architecture.md`

### Phase 1 — 独立部品（サブエージェント並列）
- [x] W1.1 [Agent A] 役判定（ワイルド2枚）＋ HIGH & LOW ボーナス判定＋全列挙の通り数テスト
- [x] W1.2 [Agent B] フリーゲーム判定・プログレ・配当計算＋保存データ検証＋crypto 乱数＋localStorage 保存
- [x] W1.3 [Agent C] ダブルダウン3種＋ハーフダブル＋上限ルール
- [x] W1.4 [Agent D] Pixi 描画部品（パレット、ドット文字、カード絵、CRT）＋チップチューン合成＋Howler＋ギャラリー

### Phase 2 — ゲーム進行
- [x] W2.1 [Agent E] XState 状態機械＋ビュー＋イベント＋ファサード（W1.1〜W1.3 に依存）

### Phase 3 — 画面
- [x] W3.1 [Agent F] Pixi アプリ：レイアウト、入力（キー＋タッチ）、GSAP 演出、自動プレイ（W1.4, W2.1 に依存）
- [x] W3.2 PWA（manifest、Service Worker、アイコンはコード生成）

### Phase 4 — 仕上げ（オーケストレーター＋レビュー）
- [x] W4.1 敵対的レビュー（層境界、仕様・旧 Pyxel 版との突き合わせ、エッジケース）
- [x] W4.2 RTP 全列挙検算（slow テスト）とブラウザでの実機確認
- [x] W4.3 README（Web 版の遊び方・開発参加方法）

## 2. サブエージェント共通ルール（Web 版）
1. 担当ファイル以外は編集しない。共有契約（`domain/cards|enums|config|random.ts`、`application/ports|saveData.ts` の型）を変えたいときは報告する。
2. （移植当時のルール）Pyxel 版の同名モジュールとテストを正解として読み、同じ意味論で移植した。現在は仕様書と既存テストが正解。
3. 実装後に **自己敵対的レビュー**：「仕様のどの行を満たしたか」「どの入力で壊れるか」を列挙し、壊す側のテストを書いてから直す。
4. `bun run check` を通してから完了報告する。
5. 報告には「仕様と違う解釈をした箇所」「仮で決めた箇所」を必ず含める。

### Phase 5 — Pyxel 版の削除とルート移行
- [x] R5.1 Python / Pyxel 版（`src/twinjokers`、`tests/`、pyproject / uv）を削除
- [x] R5.2 `web/` の中身をリポジトリ直下へ移動
- [x] R5.3 ドキュメント更新（README、architecture、session-design、decisions、todo）
- [x] R5.4 コードのコメント・スクリプトのパス整理
- [x] R5.5 検証（`bun install` / `bun run check` / `test:slow` / `build` / `smoke` / `pwa:check` / `dev`）
