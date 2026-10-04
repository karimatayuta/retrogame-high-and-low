"""Generates python_trace.json.gz: scripted-rng random play through the Python GameSession."""
import gzip, json, sys
from twinjokers.application.session import GameSession
from twinjokers.application.save_data import SaveData
from twinjokers.domain.config import GameConfig
from twinjokers.domain.enums import HighLowGuess

M = 2**32
class Lcg:
    def __init__(self, seed): self.x = (seed * 2654435761 + 12345) % M
    def u(self):
        self.x = (self.x * 1664525 + 1013904223) % M
        return self.x
    def int(self, lo, hi): return lo + (self.u() >> 8) % (hi - lo)
    def random(self): return self.u() / M
    def shuffle(self, x):
        for i in range(len(x) - 1, 0, -1):
            j = self.int(0, i + 1)
            x[i], x[j] = x[j], x[i]
    def choice(self, seq): return seq[self.int(0, len(seq))]
    def randrange(self, a, b=None, step=1): raise NotImplementedError

CMDS = ['BET_ONE','MAX_BET','DEAL','ADVANCE','H1','H2','H3','H4','H5','DOUBLE','COLLECT','HIGH','LOW','ADD_MEDALS','H2','H3','H4','ADVANCE','MAX_BET','DEAL']
def lab(c): return None if c is None else ('JKR' if c.is_joker else str(c))

def snap(s):
    v = s.view()
    return dict(phase=v.phase.value, message=v.message, credits=v.credits, bet=v.bet, lastBet=v.last_bet, win=v.win,
        lastPayout=v.last_payout, cards=[lab(c) for c in v.cards], faceUp=list(v.face_up), highlight=v.highlight,
        handRank=v.hand_rank.value if v.hand_rank else None, paidLine=v.paid_line.value if v.paid_line else None,
        gamePayout=v.game_payout, fgLeft=v.free_games_left, fgPlayed=v.free_games_played, fgTotal=v.free_game_total,
        fgWin=v.free_game_win, progressive={k.value: n for k, n in v.progressive.items()}, doubleKind=v.double_kind.value if v.double_kind else None,
        halfDouble=v.half_double, menu=[[m.label, m.enabled, m.selected] for m in v.menu], holdLabels=list(v.hold_labels),
        canCollect=v.can_collect, hl=None if v.high_low is None else [v.high_low.active, v.high_low.rounds_won, v.high_low.current_amount, v.high_low.next_amount, v.high_low.bonus_hand, v.high_low.bonus_amount, v.high_low.outcome],
        stats=s.stats.model_dump())

out = []
for seed in range(int(sys.argv[1])):
    rng = Lcg(seed); cmdr = Lcg(seed + 100000)
    s = GameSession(GameConfig(), rng)
    steps = []
    for _ in range(int(sys.argv[2])):
        c = CMDS[cmdr.int(0, len(CMDS))]
        if c == 'BET_ONE': ok = s.bet_one()
        elif c == 'MAX_BET': ok = s.max_bet()
        elif c == 'DEAL': ok = s.deal()
        elif c == 'ADVANCE': ok = s.advance()
        elif c[0] == 'H' and len(c) == 2: ok = s.hold(int(c[1]))
        elif c == 'DOUBLE': ok = s.double()
        elif c == 'COLLECT': ok = s.collect()
        elif c == 'HIGH': ok = s.guess(HighLowGuess.HIGH)
        elif c == 'LOW': ok = s.guess(HighLowGuess.LOW)
        else: ok = s.add_medals()
        ev = [[e.kind.value, e.amount, '' if e.kind.value == 'REJECTED' else e.detail, e.index, [lab(x) for x in e.cards]] for e in s.drain_events()]
        steps.append(dict(cmd=c, ok=ok, events=ev, view=snap(s)))
    out.append(steps)
with gzip.open('web/tests/review/fixtures/python_trace.json.gz', 'wt', compresslevel=9) as f:
    json.dump(out, f)
