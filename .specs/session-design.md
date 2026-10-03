# GameSession 設計（application 層 / T2.1）

presentation からは **コマンドを送る → `view()` を描く → `drain_events()` で音・演出を鳴らす** の3つだけ。
状態機械は即時に進み、アニメーションの待ち時間は presentation が持つ。

## Phase（状態）

```
                 ┌────────────── LOSE / TAKE SCORE / auto settle ───────────────┐
                 ▼                                                               │
 BETTING ──deal──▶ (評価) ─┬─ 配当なし & FG なし ─▶ BETTING                      │
    ▲                     ├─ FG 突入 ─▶ FREE_GAME ──advance×N──▶ (合計>0) ─▶ DOUBLE_SELECT
    │                     └─ 配当あり ───────────────────────────────────▶ DOUBLE_SELECT
    │                                                                            │
    │        DOUBLE_SELECT ─HOLD/DOUBLE─▶ STANDARD_PICK ─pick─▶ WIN→DOUBLE_SELECT / DRAW→STANDARD_PICK / LOSE→BETTING
    │                                 ─▶ RED_BLACK_PICK  ─pick─▶ WIN→DOUBLE_SELECT / LOSE→BETTING
    │                                 ─▶ HIGH_LOW_GUESS ─guess─▶ WIN→HIGH_LOW_GUESS / 4勝・JOKER・>5000→精算 / LOSE→BETTING
    └──────────────────────── collect ─────────────────────────────────────────────┘
```

| Phase | 有効なコマンド |
|---|---|
| BETTING | `bet_one()`, `max_bet()`, `deal()`（BET 0 なら前回 BET で再 BET）, `add_medals()` |
| FREE_GAME | `advance()`（presentation が一定間隔で自動送り。Space でも可） |
| DOUBLE_SELECT | `hold(1..5)`（メニュー項目）, `double()`（=STANDARD）, `collect()` |
| STANDARD_PICK / RED_BLACK_PICK | `hold(2..5)`（カード位置 1..4。HOLD 1 はディーラー）, `collect()` は STANDARD の DRAW 直後は不可 |
| HIGH_LOW_GUESS | `hold(cfg.high_low_low_hold)`=LOW, `hold(cfg.high_low_high_hold)`=HIGH, `guess(HighLowGuess)`, `collect()` |

- 無効なコマンドは **例外を投げず無視** し、`Event(REJECTED)` を出す（presentation がブザー音を鳴らす）。
- HALF DOUBLE はトグル。ON のまま STANDARD / RED & BLACK を選ぶと確保分を即 CREDITS に入れ、残りで勝負。HIGH & LOW では無効（config）。
- 配当 > 5000 になったら DOUBLE_SELECT に入らず自動精算（AUTO_SETTLED イベント）。

## 金の流れ
- `bet_one()` で即 CREDITS から引く（実機同様）。CREDITS 不足なら REJECTED。
- MAX BET 本番ゲーム（FG 以外）の deal 時に `pool.add_max_bet_game()`、その後に評価・`settle_main_game`。
- FG 突入ゲーム自体の配当は通常どおり計算し、FG の合計配当に含める。FG 中は BET は引かない。
- `collect()` で `win` を CREDITS へ、戦績更新、保存。

## View（pydantic, frozen）
`SessionView`: phase, credits, bet, last_bet, win, cards(5 slots: card or None), face_up(5), held/highlight index,
hand_rank, paid_line, free_game_trigger, free_games_left, free_game_total, in_free_game,
progressive(display ints per line), menu(5 items + enabled flags), half_double, double_kind,
high_low(rounds_won, bonus_hand, bonus_amount, history), message(短い英語表示)。

## Events
`Event(kind: EventKind, amount: int = 0, detail: str = "")`。
EventKind: BET, DEAL, HAND, NO_WIN, FREE_GAME_AWARDED, FREE_GAME_STEP, FREE_GAME_END, PROGRESSIVE_WON,
DOUBLE_START, DOUBLE_WIN, DOUBLE_LOSE, DOUBLE_DRAW, JOKER, HIGH_LOW_BONUS, COLLECT, AUTO_SETTLED, CREDITS_ADDED, REJECTED

## Ports（application/ports.py）
- `SaveRepository`（Protocol）: `load() -> SaveData | None`, `save(data) -> bool`
- `Randomizer` は domain の Port をそのまま使う。
