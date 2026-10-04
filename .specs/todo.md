# TODO — FREE DEAL TWIN JOKERS (PROG) / Pyxel 版

仕様書: [.specs/game-spec.md](game-spec.md) ／ 設計: [.specs/architecture.md](architecture.md)

## 0. 論点思考（イシューツリー）

**メイン論点**: 「昔ゲームセンターで遊んだ 52JP（緑プログレ）を、Pyxel で“あの感じ”のまま遊べて、誰でも保守できるか？」

| # | サブ論点 | 判断基準（Yes になる条件） | 対応タスク |
|---|---|---|---|
| I1 | ルールは実機と同じか | 全 3,162,510 通り列挙で役の通り数が仕様の検算表と完全一致／RTP 92.24% を再現 | T1.1, T1.2 |
| I2 | お金の流れは正しいか | BET・配当・5BET 時配当・プログレ切り上げ・フリーゲーム2倍・最低 BET 保証が単体テストで固定 | T1.2 |
| I3 | ダブルダウン3種は仕様どおりか | 引き分け・ジョーカー・ハーフダブル端数・5,001枚自動精算・1万枚上限・ボーナスがテストで固定 | T1.3 |
| I4 | 状態遷移に抜け・行き止まりはないか | 全状態から BET 待ちに戻れる／不正操作は無視される／自動プレイで 1万ゲーム例外なし | T2.1, T4.2 |
| I5 | “レトロの雰囲気”が出ているか | 緑基調・ドット文字・チップチューン音・カードめくり演出・点滅 WIN 表示 | T1.4, T3.1 |
| I6 | 保守できる設計か | 依存方向が presentation→application→domain の一方向／仮の値は全て設定に集約／ruff・pytest が緑 | T0.*, T4.1 |
| I7 | 仕様の「仮」をどう扱うか | 仮の値は `GameConfig`（pydantic）に集約し、差し替えだけで済む | T0.2 |
| I8 | 技術制約 | uv / Python 3.13+ / pytest / pydantic v2 / Pyxel（kitao/pyxel の PyPI 配布物） | T0.1 |

> 仕様書の「技術構成」は HTML/JS を推奨しているが、本プロジェクトは依頼に従い Pyxel(Python) で実装する。Web Audio→Pyxel サウンド、ブラウザ保存→JSON ファイル保存、`crypto.getRandomValues`→`random.SystemRandom` に読み替える。
> 画面は 640×480 (仮) ではなく、レトロ感を優先して 320×240（4:3）で描き、Pyxel のウィンドウ拡大に任せる。

## 1. タスク（上から順に。同じフェーズ内は並列実行）

### Phase 0 — 土台（オーケストレーター）
- [x] T0.1 uv プロジェクト初期化（pyxel, pydantic, pytest, ruff）
- [x] T0.2 共有契約の作成：`domain/cards.py`、`domain/random_port.py`、各ドメイン enum、`domain/config.py`（全ての仮の値）
- [x] T0.3 アーキテクチャ文書 `.specs/architecture.md`

### Phase 1 — 独立部品（サブエージェント並列）
- [x] T1.1 [Agent A] 役判定（ワイルド2枚）＋ HIGH & LOW ボーナス判定＋全列挙検算テスト
- [x] T1.2 [Agent B] フリーゲーム判定・プログレッシブ・配当計算＋RTP検算＋乱数/保存インフラ
- [x] T1.3 [Agent C] ダブルダウン3種＋ハーフダブル＋上限ルール
- [x] T1.4 [Agent D] 描画・音の部品（パレット、カード描画、文字、効果音）

### Phase 2 — ゲーム進行
- [x] T2.1 [Agent E] `application/session.py` 状態機械＋ビューモデル＋イベント（Phase 1 に依存）

### Phase 3 — 画面
- [x] T3.1 [Agent F] Pyxel アプリ：レイアウト、入力割当、演出、タッチ用ボタン（T1.4, T2.1 に依存）

### Phase 4 — 仕上げ（オーケストレーター＋レビュー）
- [x] T4.1 敵対的レビュー（依存方向、仕様との突き合わせ、エッジケース）
- [x] T4.2 自動プレイ・スモークテスト（ヘッドレス相当で N フレーム実行）
- [x] T4.3 README（遊び方・設定の差し替え方・開発参加方法）

## 2. サブエージェント共通ルール
1. 担当ファイル以外は編集しない（共有契約の変更が必要ならオーケストレーターに報告）。
2. 実装後に **自己敵対的レビュー**：「仕様のどの行を満たしたか」「どの入力で壊れるか」を列挙し、壊す側のテストを書いてから直す。
3. `uv run pytest` と `uv run ruff check` を通してから完了報告する。
4. 報告には「仕様と違う解釈をした箇所」「仮で決めた箇所」を必ず含める。

---

# TODO — Web 版モダナイズ（TypeScript + Vite + PixiJS）

依頼: memo.md ／ 設計: [.specs/web-architecture.md](web-architecture.md) ／ 置き場所: `web/`（Pyxel 版は正解データとして残す）

## 0. 論点思考（イシューツリー）

**メイン論点**: 「52JP（緑プログレ）を、ブラウザ／スマホで“あの頃の筐体”の雰囲気のまま遊べて、Pyxel 版と同じく正しく、誰でも保守できるか？」

| # | サブ論点 | 判断基準（Yes になる条件） | 対応タスク |
|---|---|---|---|
| W1 | ルールは Pyxel 版・仕様と同じか | TS の全 3,162,510 手列挙で役の通り数・FG 条件数・RTP 92.24% が仕様の検算表と一致 | W1.1, W1.2, W4.2 |
| W2 | お金の計算に誤差がないか | プログレを整数（1/1000 枚）で保持、切り上げ・FG 2倍・最低 BET 保証・上限がテストで固定 | W1.2, W1.3 |
| W3 | 状態遷移に抜けがないか | XState で「その状態で無効な操作」は REJECTED、全状態から BETTING に戻れる、ランダム操作 1 万回で例外なし | W2.1 |
| W4 | 描画とロジックが分離されているか | domain/application に pixi/gsap/howler/DOM が無い（ESLint＋architecture test） | W0.2, W4.1 |
| W5 | “レトロの雰囲気”が出ているか | 320×240 ドット絵、緑基調、ドット文字、CRT 走査線・にじみ、チップチューン、カードめくり・カウントアップ・点滅 WIN | W1.4, W3.1 |
| W6 | スマホ・オフラインで遊べるか | タッチボタン、初回タップで音解禁（Howler）、PWA でホーム追加・オフライン起動 | W3.1, W3.2 |
| W7 | 保守できるか | 層ごとのディレクトリ・契約文書・`bun run check` 一発で型/Lint/テスト、README に参加手順 | W0.*, W4.3 |
| W8 | 技術制約 | TypeScript / Vite / PixiJS v8 / GSAP / XState v5 / Vitest / Howler / vite-plugin-pwa | W0.1 |

## 1. タスク（上から順に。同じフェーズ内は並列実行）

### Phase 0 — 土台（オーケストレーター）
- [x] W0.1 `web/` に Vite + TS プロジェクト作成、依存導入、Vitest の unit/slow プロジェクト分割
- [x] W0.2 層境界：ESLint `no-restricted-imports` ＋ `tests/architecture.test.ts`
- [x] W0.3 共有契約：`domain/cards.ts` `enums.ts` `config.ts` `random.ts`、`application/ports.ts` `saveData.ts`
- [x] W0.4 設計文書 `.specs/web-architecture.md`

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
- [x] W4.1 敵対的レビュー（層境界、仕様・Pyxel 版との突き合わせ、エッジケース）
- [x] W4.2 RTP 全列挙検算（slow テスト）とブラウザでの実機確認
- [x] W4.3 README（Web 版の遊び方・開発参加方法）

## 2. サブエージェント共通ルール（Web 版）
1. 担当ファイル以外は編集しない。共有契約（`domain/cards|enums|config|random.ts`、`application/ports|saveData.ts` の型）を変えたいときは報告する。
2. Pyxel 版の同名モジュールとテスト（`src/twinjokers/**`, `tests/**`）を正解として読み、同じ意味論で移植する。
3. 実装後に **自己敵対的レビュー**：「仕様のどの行を満たしたか」「どの入力で壊れるか」を列挙し、壊す側のテストを書いてから直す。
4. `cd web && bun run check` を通してから完了報告する。
5. 報告には「仕様・Pyxel 版と違う解釈をした箇所」「仮で決めた箇所」を必ず含める。
