# Architecture（TypeScript + Vite + PixiJS）

Clean Architecture（presentation → application → domain の一方向依存）で組んでいます。

> 経緯：当初は Pyxel（Python）で実装し、その後 TypeScript に移植した。移植版が Pyxel 版と同じ結果になることを差分テストで確認できたため、Pyxel 版は 2026-10-04 に削除し、`web/` をリポジトリ直下へ移した（[decisions.md](decisions.md) D19・D20）。

```
src/
  presentation ──▶ application ──▶ domain
  (PixiJS/GSAP/     (XState 状態機械、    (ルール。純粋 TS。
   Howler/入力)      ビュー、イベント)      フレームワーク・I/O・Math.random 禁止)
        │                  ▲
        └─ infrastructure ─┘  (crypto 乱数、localStorage 保存。application の Port を実装)
  main.ts = Composition Root（ここだけが具体クラスを結線する）
```

| 層 | ディレクトリ | 依存してよいもの | 禁止 |
|---|---|---|---|
| domain | `src/domain` | domain のみ | 外側の層、pixi/gsap/howler/xstate、`Math.random`、`crypto`、`localStorage`、DOM |
| application | `src/application` | domain, `xstate` | infrastructure, presentation, 描画・音ライブラリ |
| infrastructure | `src/infrastructure` | domain, application | presentation |
| presentation | `src/presentation` | 全層, pixi.js, pixi-filters, gsap, howler | ルールの再実装（判定は必ず domain/application に聞く） |

境界は **ESLint（`no-restricted-imports`）** と **`tests/architecture.test.ts`** の二重で検出します。

## 設計判断（ADR 要約）

1. **カードは判別共用体の凍結オブジェクト**（`{kind:'normal',rank,suit}` / `{kind:'joker',id}`）。全列挙 316 万手で大量生成するためクラスにしない。
2. **仮の値は `domain/config.ts` に集約**。`defineConfig(overrides)` で深いマージ＋検証。ルールコードに数字を直書きしない。
3. **乱数は Port**（`domain/random.ts` の `Randomizer`）。本番 `crypto.getRandomValues`（棄却サンプリングで偏りなし）、テストは `seededRandomizer(seed)`。
4. **プログレは整数（1/1000 枚単位）で保持**。浮動小数の誤差で切り上げが1枚ずれるのを防ぐ。増分は小数3桁までを設定検証で保証。
5. **状態機械は XState（application 層）**。presentation は「コマンドを送る・ビューを描く・イベントで音と演出を鳴らす」だけ。状態は即時に進み、演出の待ち時間は presentation が持つ。
6. **描画は論理 320×240、ステージを ×2 して 640×480 に描画**し、CSS で整数倍優先に拡大。テクスチャは nearest。CRT フィルター（pixi-filters）で走査線を出す。
7. **画像・音声ファイルは使わない**。カード・ドット文字はコードで描き、効果音は WAV をコードで合成して Howler に data URI で渡す（権利物を使わない、PWA のキャッシュも小さい）。

## Module contracts（Phase 1）

### domain/hand.ts（Agent A）
```ts
export function evaluateHand(hand: readonly Card[]): HandRank;              // 5 cards, 0..2 jokers, strongest match
export function evaluateHighLowBonus(hand: readonly Card[]): HighLowBonus;   // 5 non-joker cards
```

### domain/freeGame.ts, progressive.ts, payout.ts ＋ infrastructure（Agent B）
```ts
export function detectFreeGame(hand: readonly Card[], cfg: FreeGameConfig): FreeGameTrigger | null;

export class ProgressivePool {                  // mutable entity, integer thousandths internally
  constructor(cfg: ProgressiveConfig, values?: Partial<Record<ProgressiveLine, number>>);
  value(line: ProgressiveLine): number;         // medals (may be fractional)
  displayValue(line: ProgressiveLine): number;  // ceil
  addMaxBetGame(): void;                        // every counter += increment
  award(line: ProgressiveLine): number;         // ceil(value); reset that line only
  snapshot(): Record<ProgressiveLine, number>;
}

export interface Payout { hand: HandRank; line: PayLine | null; amount: number; progressiveLine: ProgressiveLine | null }
export function settleMainGame(hand: HandRank, bet: number, pool: ProgressivePool, cfg: GameConfig,
                               opts: { freeGame: boolean }): Payout;

// application/saveData.ts
export function parseSaveData(raw: unknown): SaveData | null;   // defensive validation (D12)
// infrastructure/cryptoRandom.ts
export function cryptoRandomizer(): Randomizer;
// infrastructure/localStorageSaveRepository.ts
export class LocalStorageSaveRepository implements SaveRepository { constructor(key?: string, storage?: Storage | null) }
export class MemorySaveRepository implements SaveRepository {}  // tests / storage-less environments
```

### domain/doubleDown/*（Agent C）
ダブルダウンの意味論（旧 Pyxel 版 `domain/double_down/*` から移植）。
`common.ts`：`canDouble`, `mustAutoSettle`, `applyCap`, `splitHalf`, `canHalfDouble`, `DoubleDownError`, `Phase`
`standard.ts` / `redBlack.ts`：1回勝負のラウンド（`deal` → `pick(index)` → 結果）
`highLow.ts`：`HighLowGame`（最大4回、ボーナス、ジョーカー強制終了、ARCADE/FAIR 抽選）

### presentation 部品（Agent D）
`palette.ts`, `pixelFont.ts`（コードで描くドット文字）, `cardArt.ts`（カードのテクスチャ生成）, `chiptune.ts`（WAV 合成）＋ `sound.ts`（Howler ラッパー）, `crt.ts`（CRT フィルター設定）, `gallery.html`（部品の目視確認ページ）

## Phase 2 以降

- **application/session（Agent E）**：XState v5 の `setup().createMachine()`。`events.ts`（EventKind 一覧）、`view.ts`（`toView(snapshot): SessionView`）、`createGameSession(deps)` ファサード（`send(command)`, `view()`, `drainEvents()`, `subscribe()`）。
- **presentation/app（Agent F）**：Pixi アプリ、レイアウト、入力（キーボード＋タッチボタン）、GSAP 演出、PWA。
