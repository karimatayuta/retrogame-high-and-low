# GameSession 設計（application 層）

presentation からは **コマンドを送る → `view()` を描く → `drainEvents()` で音・演出を鳴らす** の3つだけ。
状態機械（XState v5、`src/application/gameMachine.ts`）は即時に進み、アニメーションの待ち時間は presentation が持つ。

```ts
const session = createGameSession({ config?, rng, saveRepository });
session.send({ type: 'BET_ONE' });   // true = 受理 / false = REJECTED（例外は投げない）
session.view();                      // SessionView（描画に必要なものすべて）
session.drainEvents();               // GameEvent[]（前回以降に起きたこと。上限 512 件）
session.subscribe(listener);         // コマンドのたびに view を通知
session.shutdown();                  // ページを閉じるとき（D13/D15）
```

## Phase（状態）

`SessionPhase` として画面に見える状態は6つ。`dealing` / `freeGameStep` / `winCheck` / `standardResult` / `redBlackResult` / `highLowResult` はその場で解決される中継状態で、presentation からは見えない。

```
                 ┌────────────── LOSE / TAKE SCORE / auto settle ───────────────┐
                 ▼                                                               │
 BETTING ──DEAL/MAX_BET──▶ dealing ─┬─ 配当なし & FG なし ─▶ BETTING             │
    ▲                               ├─ FG 突入 ─▶ FREE_GAME ──ADVANCE×N──▶ winCheck
    │                               └─ 配当あり ─▶ winCheck ─┬ >5000 ─▶ BETTING（AUTO_SETTLED）
    │                                                        └ >0 ─▶ DOUBLE_SELECT
    │        DOUBLE_SELECT ─HOLD/DOUBLE─▶ STANDARD_PICK ─HOLD 2..5─▶ WIN→winCheck / DRAW→STANDARD_PICK / LOSE→BETTING
    │                                  ─▶ RED_BLACK_PICK  ─HOLD 2..5─▶ WIN→winCheck / LOSE→BETTING
    │                                  ─▶ HIGH_LOW_GUESS ─HOLD/GUESS─▶ 勝ち継続→HIGH_LOW_GUESS / LOSE→BETTING / 完走・JOKER→精算
    └──────────────────────── COLLECT ─────────────────────────────────────────────┘
```

| Phase | 受け付けるコマンド |
|---|---|
| BETTING | `BET_ONE`, `MAX_BET`（足りない分だけ賭けてすぐ DEAL）, `DEAL`（BET 0 なら前回 BET で再 BET）, `ADD_MEDALS` |
| FREE_GAME | `ADVANCE`（presentation が一定間隔で自動送り。Space でも可） |
| DOUBLE_SELECT | `HOLD {n:1..5}`（メニュー項目：TAKE SCORE / HALF DOUBLE / STANDARD / HIGH & LOW / RED & BLACK）, `DOUBLE`（=STANDARD）, `COLLECT` |
| STANDARD_PICK | `HOLD {n:2..5}`（カード位置。HOLD 1 はディーラー）, `COLLECT`（DRAW 直後は不可） |
| RED_BLACK_PICK | `HOLD {n:2..5}`, `COLLECT` |
| HIGH_LOW_GUESS | `HOLD`（設定の LOW / HIGH ボタン）, `GUESS {guess}`, `COLLECT` |

- コマンドは `{ type: 'BET_ONE' }` のような判別共用体 `Command`（`commands.ts`）。`SHUTDOWN` は `shutdown()` だけが送る内部イベント。
- どの状態も受け付けないコマンドは **例外を投げず無視** し、`REJECTED` イベント（`detail = "COMMAND: 理由"`）を出す（presentation がブザー音を鳴らす）。
- HALF DOUBLE はトグル。ON のまま STANDARD / RED & BLACK を選ぶと確保分を即 CREDITS に入れ、残りで勝負。HIGH & LOW では無効（config）。
- 配当が上限（5000）を超えたら DOUBLE_SELECT に入らず自動精算（`AUTO_SETTLED`）。

## 金の流れ
- `BET_ONE` で即 CREDITS から引く（実機同様）。CREDITS 不足なら REJECTED。
- MAX BET の本番ゲーム（FG 以外）の配布時に `pool.addMaxBetGame()`、その後に評価・`settleMainGame`（D3）。
- FG 突入ゲーム自体の配当は通常どおり計算し、FG の合計配当（`win`）に含める。FG 中は BET を引かない。
- `COLLECT` / `AUTO_SETTLED` で `win` を CREDITS へ移し、戦績（`stats`）を更新して保存。
- `shutdown()`：残りの FG を消化し、未精算の配当・ダブルの掛け金・HIGH & LOW の途中配当を精算して保存。BETTING 中の未 DEAL の BET は CREDITS に戻して保存（D15, D16）。

## View（`view.ts`、readonly）
`SessionView`: phase, message(短い英語表示), credits, bet, lastBet, maxBet, win, lastPayout,
cards(5 slots: Card | null), faceUp(5), highlight, handRank, paidLine, gamePayout,
inFreeGame, freeGameTrigger, freeGamesLeft/Played/Total, freeGameWin,
paytable(行ごとの払出額・hit), progressive(ライン別の表示用整数), freeGameAwards,
doubleKind, halfDouble, menu(5 items + enabled/selected), highLow(rounds, bonusRows, bonusHand…), holdLabels, canCollect。
`toView(context, phase)`（`toView.ts`）が機械の context から作る純粋関数で、presentation はルールを再計算しない。

## Events（`events.ts`）
`GameEvent { kind, amount, detail, index, cards }`。
EventKind: BET, DEAL, HAND, NO_WIN, PROGRESSIVE_WON, FREE_GAME_AWARDED, FREE_GAME_STEP, FREE_GAME_END,
DOUBLE_START, HALF_DOUBLE_TOGGLED, DOUBLE_WIN, DOUBLE_LOSE, DOUBLE_DRAW, HIGH_LOW_STEP, JOKER, HIGH_LOW_BONUS,
COLLECT, AUTO_SETTLED, CREDITS_ADDED, REJECTED

## 内部構成
- `gameMachine.ts`：状態と遷移（ガード・アクション名のみ。先頭コメントに遷移図）。
- `steps.ts`：各アクションの実体。`(context, event) => { patch, events, save }` の純粋寄りな関数で、`gameActions.ts` が機械のアクションに包む。
- `sessionContext.ts`：機械の context（credits, bet, win, プログレ pool, 進行中のダブルゲームなど）と初期化・保存データ変換。
- `saveData.ts`：保存形式と `parseSaveData` の検証（D12, D17）。

## Ports（`ports.ts`）
- `SaveRepository`: `load(): SaveData | null`, `save(data): boolean`（どちらも例外を投げない）。実装は infrastructure（localStorage / メモリ）。
- `Randomizer` は domain の Port をそのまま使う（本番 `crypto`、テスト `seededRandomizer`）。
