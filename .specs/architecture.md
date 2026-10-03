# Architecture

Clean Architecture（依存は外→内の一方向）。新しく参加する人は「どの層に置くか」だけ判断できれば迷わない構成にしています。

```
presentation  ──▶  application  ──▶  domain
(Pyxel 描画/入力/音)  (状態機械・ユースケース)  (ルール・純粋関数・値オブジェクト)
       │                   ▲
       └── infrastructure ─┘  (乱数・保存の実装。application の Port を満たす)
```

| 層 | パッケージ | 依存してよいもの | 禁止 |
|---|---|---|---|
| domain | `twinjokers.domain` | 標準ライブラリ, pydantic | pyxel, ファイルI/O, `random` モジュールの直接使用 |
| application | `twinjokers.application` | domain | pyxel, ファイルI/O |
| infrastructure | `twinjokers.infrastructure` | domain, application | pyxel |
| presentation | `twinjokers.presentation` | 全層 | ルールの再実装（判定は必ず domain/application に聞く） |

`twinjokers/__main__.py` が組み立て役（Composition Root）で、ここだけが具体クラスを結線します。

## 設計判断（ADR 要約）

1. **値オブジェクトは dataclass、境界は pydantic**。`Card` は全列挙（316万手）で大量に触るため `frozen dataclass(slots)`。設定 `GameConfig`、保存データ、画面向けビューモデルは pydantic v2（検証・JSON 化が必要な境界）。
2. **仮の値は `domain/config.py` に集約**。ルールコードに数字を直書きしない。
3. **乱数は Port 化**（`domain/random_port.Randomizer`）。本番は `random.SystemRandom`、テストは seed 付き `random.Random`。
4. **状態機械は application 層**。presentation は「コマンドを送る・スナップショットを描く・イベントで音や演出を鳴らす」だけ。
5. **アニメーションは presentation の責務**。application は即時に状態を進め、イベント列を返す。presentation がイベントを時間をかけて再生する。

## Module contracts（Phase 1）

### domain/hand.py（Agent A）
```python
def evaluate_hand(hand: Sequence[Card]) -> HandRank        # 5 cards, 0..2 jokers, strongest match
def evaluate_high_low_bonus(hand: Sequence[Card]) -> HighLowBonus  # 5 non-joker cards
```

### domain/free_game.py, progressive.py, payout.py（Agent B）
```python
def detect_free_game(hand, config: FreeGameConfig) -> FreeGameTrigger | None

class ProgressivePool:                       # mutable entity
    def __init__(self, config: ProgressiveConfig, values: Mapping[PayLine, float] | None = None)
    def value(self, line: PayLine) -> float
    def display_value(self, line: PayLine) -> int           # ceil
    def add_max_bet_game(self) -> None                      # all counters += increment
    def award(self, line: PayLine) -> int                   # ceil(value), reset that line only
    def snapshot(self) -> dict[PayLine, float]

@dataclass(frozen=True) class Payout:  # result of one main/free game
    hand: HandRank; line: PayLine | None; amount: int; progressive_line: PayLine | None
def settle_main_game(hand: HandRank, bet: int, pool: ProgressivePool,
                     config: GameConfig, *, free_game: bool) -> Payout
```

### domain/double_down/*（Agent C）
`common.py`：`split_half(amount) -> (kept, stake)`, `can_double(amount, cfg)`, `cap(amount, cfg)`
`standard.py` / `red_black.py`：1 回勝負のラウンドオブジェクト（`deal()` → `pick(index)` → 結果）
`high_low.py`：`HighLowGame`（最大4回、ボーナス、ジョーカー強制終了）

### infrastructure（Agent B）
`rng.py`：`SystemRandomizer`、`storage.py`：`SaveData`(pydantic) + `JsonSaveRepository`（失敗しても例外を外に出さず「保存なし」で動く）

### presentation 部品（Agent D）
`palette.py`, `card_sprite.py`（コードでカードを描く）, `text.py`, `sound.py`（チップチューン効果音）
