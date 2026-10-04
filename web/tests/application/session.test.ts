/** GameSession: phase transitions, money rules, rejection of invalid commands (port of tests/application/test_session.py). */
import { describe, expect, it } from 'vitest';
import { card, cards } from '@/domain/cards';
import type { SaveData } from '@/application/saveData';
import { EMPTY_STATS } from '@/application/saveData';
import type { SessionPhase } from '@/application/view';
import {
  FIVE_KIND, FOUR_FACES_FIVE_KIND, FOUR_KIND, JOKER_ANYTHING, NOTHING, RB_WIN, ROYAL, STANDARD_WIN,
  THREE_BLACK_FACES, THREE_KIND, TWO_PAIR, FakeRepository, hold, kinds, ledgerOk, makeConfig, makeSession,
  playToWin, sessionIn,
} from './sessionHelpers';

const send = (s: ReturnType<typeof makeSession>, type: Parameters<typeof s.send>[0]['type']) =>
  s.send({ type } as Parameters<typeof s.send>[0]);

// --------------------------------------------------------------------------
// construction, saving, loading
// --------------------------------------------------------------------------

describe('construction, saving, loading', () => {
  it('starts with initial credits and initial progressive, without any event', () => {
    const s = makeSession();
    const v = s.view();
    expect([v.phase, v.credits, v.bet, v.win]).toEqual(['BETTING', 1000, 0, 0]);
    expect(v.message).toBe('PLACE YOUR BET');
    expect(v.progressive['FIVE OF A KIND']).toBe(2500);
    expect(v.cards).toEqual([null, null, null, null, null]);
    expect(s.drainEvents()).toEqual([]);
  });

  it('load restores credits, progressive and stats', () => {
    const repo = new FakeRepository({
      version: 1, credits: 77, progressive: { 'ROYAL FLUSH': 1300.5 }, stats: { ...EMPTY_STATS, gamesPlayed: 9 },
    });
    const s = makeSession([], { repo });
    expect(s.view().credits).toBe(77);
    expect(s.view().progressive['ROYAL FLUSH']).toBe(1301); // ceil
    expect(s.stats.gamesPlayed).toBe(9);
  });

  it('save round trip after a paid max bet game', () => {
    const repo = new FakeRepository();
    const s = makeSession([NOTHING], { repo });
    expect(send(s, 'MAX_BET')).toBe(true);
    expect(repo.data?.credits).toBe(995);
    expect(repo.data?.progressive['4 OF A KIND / FULL HOUSE']).toBeCloseTo(40.24);
    expect(repo.data?.stats.gamesPlayed).toBe(1);
    expect(repo.data?.stats.totalBet).toBe(5);
    const again = makeSession([], { repo });
    expect(again.view().credits).toBe(995);
    expect(again.view().progressive['FLUSH / STRAIGHT']).toBe(33); // ceil(32.335)
  });

  it('a failing or throwing repository does not break the game', () => {
    for (const repo of [new FakeRepository(null, true), new FakeRepository(null, false, true)]) {
      const s = makeSession([NOTHING], { repo });
      expect(send(s, 'MAX_BET')).toBe(true);
      expect(s.view().credits).toBe(995);
      expect(repo.saves).toBe(1);
    }
  });

  it('a repository whose load throws means no save', () => {
    const repo = new FakeRepository();
    repo.load = () => { throw new Error('boom'); };
    expect(makeSession([], { repo }).view().credits).toBe(1000);
  });

  it('saves after every settlement kind', () => {
    const repo = new FakeRepository();
    const s = makeSession([JOKER_ANYTHING], { repo });
    playToWin(s, 4);
    const n = repo.saves;
    expect(send(s, 'COLLECT')).toBe(true);
    expect(repo.saves).toBe(n + 1);
    expect(repo.data?.credits).toBe(1000); // -4 +4
    send(s, 'ADD_MEDALS');
    expect(repo.saves).toBe(n + 2);
    expect(repo.data?.credits).toBe(1100);
  });

  it('add medals with a pending bet saves the bet as still owned (not eaten by a reload)', () => {
    const repo = new FakeRepository();
    const s = makeSession([], { repo });
    send(s, 'BET_ONE');
    send(s, 'BET_ONE');
    send(s, 'ADD_MEDALS');
    expect(s.view().credits).toBe(1098);
    expect(repo.data?.credits).toBe(1100);
  });

  it('corrupt progressive values in a save do not crash start-up (D12)', () => {
    const bad: unknown[] = [
      { 'THREE OF A KIND': 3 }, // a line without a counter
      { 'FIVE OF A KIND': Number.NaN },
      { 'FIVE OF A KIND': Number.POSITIVE_INFINITY },
      { 'FIVE OF A KIND': -5 },
      { 'FIVE OF A KIND': 'x' },
      { __proto__: { 'FIVE OF A KIND': 9999 } },
    ];
    for (const progressive of bad) {
      const repo = new FakeRepository({ version: 1, credits: 500, progressive, stats: EMPTY_STATS } as SaveData);
      const v = makeSession([], { repo }).view();
      expect(v.credits).toBe(500);
      expect(v.progressive['FIVE OF A KIND']).toBe(2500);
    }
  });

  it('a save with unusable credits falls back to defaults (D12)', () => {
    for (const credits of [-1, 1.5, Number.NaN, '5']) {
      const repo = new FakeRepository({ version: 1, credits, progressive: {}, stats: EMPTY_STATS } as unknown as SaveData);
      expect(makeSession([], { repo }).view().credits).toBe(1000);
    }
  });

  it('valid counters survive next to corrupt ones', () => {
    const repo = new FakeRepository({
      version: 1, credits: 1, progressive: { 'ROYAL FLUSH': 1300.5, 'TWO PAIR': 9 } as never, stats: EMPTY_STATS,
    });
    expect(makeSession([], { repo }).view().progressive['ROYAL FLUSH']).toBe(1301);
  });
});

// --------------------------------------------------------------------------
// betting
// --------------------------------------------------------------------------

describe('betting', () => {
  it('bet one deducts immediately up to max', () => {
    const s = makeSession();
    for (let i = 1; i <= 5; i++) {
      expect(send(s, 'BET_ONE')).toBe(true);
      expect([s.view().bet, s.view().credits]).toEqual([i, 1000 - i]);
    }
    expect(send(s, 'BET_ONE')).toBe(false); // already 5
    expect(kinds(s).filter((k) => k === 'REJECTED')).toHaveLength(1);
    expect(s.view().credits).toBe(995);
  });

  it('is rejected without credits', () => {
    const s = makeSession([], { config: makeConfig({ credits: 0 }) });
    expect(send(s, 'BET_ONE')).toBe(false);
    expect(send(s, 'DEAL')).toBe(false);
    expect(send(s, 'MAX_BET')).toBe(false);
    expect(kinds(s)).toEqual(['REJECTED', 'REJECTED', 'REJECTED']);
    expect(s.view().message).toBe('NO CREDITS - ADD MEDALS');
  });

  it('max bet only deducts the missing amount and deals', () => {
    const s = makeSession([NOTHING]);
    send(s, 'BET_ONE');
    send(s, 'BET_ONE');
    s.drainEvents();
    expect(send(s, 'MAX_BET')).toBe(true);
    expect(s.stats.totalBet).toBe(5);
    const ev = s.drainEvents();
    expect(ev.filter((e) => e.kind === 'BET').map((e) => e.amount)).toEqual([3]);
    expect(ev.map((e) => e.kind)).toContain('DEAL');
    expect(s.view().credits).toBe(995);
    expect(s.phase).toBe('BETTING'); // no win
  });

  it('max bet is rejected when credits do not cover the missing part', () => {
    const s = makeSession([], { config: makeConfig({ credits: 3 }) });
    expect(send(s, 'MAX_BET')).toBe(false);
    expect([s.view().credits, s.view().bet]).toEqual([3, 0]);
    send(s, 'BET_ONE');
    send(s, 'BET_ONE'); // bet 2, credits 1 -> missing 3
    expect(send(s, 'MAX_BET')).toBe(false);
    expect([s.view().bet, s.view().credits]).toEqual([2, 1]);
  });

  it('max bet with credits exactly equal to the missing part is accepted', () => {
    const s = makeSession([NOTHING], { config: makeConfig({ credits: 5 }) });
    expect(send(s, 'MAX_BET')).toBe(true);
    expect(s.view().credits).toBe(0);
  });

  it('deal with no bet repeats the last bet (D10)', () => {
    const s = makeSession([NOTHING, NOTHING]);
    playToWin(s, 3);
    expect([s.view().bet, s.view().lastBet, s.view().credits]).toEqual([0, 3, 997]);
    expect(send(s, 'DEAL')).toBe(true); // re-bets 3
    expect(s.view().credits).toBe(994);
    expect(s.stats.totalBet).toBe(6);
  });

  it('deal with no bet and no history is rejected', () => {
    const s = makeSession();
    expect(send(s, 'DEAL')).toBe(false);
    expect(s.view().credits).toBe(1000);
  });

  it('deal with no bet and too few credits is rejected, then works after add medals', () => {
    const s = makeSession([NOTHING], { config: makeConfig({ credits: 5 }) });
    send(s, 'MAX_BET'); // credits now 0, last bet 5
    expect(send(s, 'DEAL')).toBe(false);
    expect(s.view().credits).toBe(0);
    expect(send(s, 'ADD_MEDALS')).toBe(true);
    expect(send(s, 'DEAL')).toBe(true);
  });

  it('deal with exactly enough credits to repeat the last bet is accepted', () => {
    const s = makeSession([NOTHING, NOTHING], { config: makeConfig({ credits: 6 }) });
    playToWin(s, 3); // credits 3
    expect(send(s, 'DEAL')).toBe(true);
    expect(s.view().credits).toBe(0);
  });

  it('message follows the bet', () => {
    const s = makeSession();
    expect(s.view().message).toBe('PLACE YOUR BET');
    send(s, 'BET_ONE');
    expect(s.view().message).toBe('PRESS DEAL');
  });
});

// --------------------------------------------------------------------------
// main game
// --------------------------------------------------------------------------

describe('main game', () => {
  it('no win returns to betting and keeps the cards visible', () => {
    const s = makeSession([NOTHING]);
    playToWin(s, 2);
    const v = s.view();
    expect([v.phase, v.win, v.credits]).toEqual(['BETTING', 0, 998]);
    expect(v.handRank).toBe('NOTHING');
    expect(v.paidLine).toBeNull();
    expect(v.cards[0]).toEqual(card('2S'));
    expect(v.faceUp.every(Boolean)).toBe(true);
    expect(kinds(s)).toContain('NO_WIN');
    expect(v.message).toBe('NO WIN');
  });

  it.each([
    [JOKER_ANYTHING, 1, 1, 'JOKER ANYTHING'],
    [TWO_PAIR, 3, 6, 'TWO PAIR'],
    [THREE_KIND, 4, 12, 'THREE OF A KIND'],
    [FOUR_KIND, 2, 20, '4 OF A KIND / FULL HOUSE'],
    [FOUR_KIND, 5, 41, '4 OF A KIND / FULL HOUSE'], // 40 + counter growth: ceil(40.24) = 41
    [TWO_PAIR, 5, 8, 'TWO PAIR'],
  ] as const)('a win goes to DOUBLE_SELECT with the paytable payout (%s bet %i)', (hand, bet, expected, line) => {
    const s = makeSession([hand]);
    playToWin(s, bet);
    const v = s.view();
    expect(v.phase).toBe('DOUBLE_SELECT');
    expect(v.win).toBe(expected);
    expect(v.paidLine).toBe(line);
    expect(v.credits).toBe(1000 - bet); // nothing is paid until collect
    expect(v.message).toBe('DOUBLE UP?');
  });

  it('collect pays and a second collect is rejected', () => {
    const s = makeSession([TWO_PAIR]);
    playToWin(s, 3);
    expect(send(s, 'COLLECT')).toBe(true);
    const v = s.view();
    expect([v.phase, v.credits, v.win, v.lastPayout]).toEqual(['BETTING', 1003, 0, 6]);
    expect(send(s, 'COLLECT')).toBe(false);
    expect(s.view().credits).toBe(1003);
    expect(s.stats.totalWon).toBe(6);
    expect(s.stats.biggestWin).toBe(6);
  });

  it('royal flush at max bet pays the progressive counter and resets it', () => {
    const s = makeSession([ROYAL]);
    send(s, 'MAX_BET');
    const v = s.view();
    expect(v.win).toBe(1251); // ceil(1250.03)
    expect(v.progressive['ROYAL FLUSH']).toBe(1250); // reset
    expect(v.progressive['FIVE OF A KIND']).toBe(2501); // others kept growing
    expect(s.drainEvents().some((e) => e.kind === 'PROGRESSIVE_WON' && e.amount === 1251)).toBe(true);
  });

  it('progressive grows only for paid max bet games', () => {
    const s = makeSession([NOTHING, NOTHING, NOTHING]);
    playToWin(s, 4);
    expect(s.view().progressive['FIVE OF A KIND']).toBe(2500);
    send(s, 'MAX_BET');
    expect(s.view().progressive['FIVE OF A KIND']).toBe(2501);
  });

  it('the paytable view is priced for the current bet', () => {
    const s = makeSession();
    let rows = Object.fromEntries(s.view().paytable.map((r) => [r.line, r]));
    expect(rows['JOKER ANYTHING']?.payout).toBe(1); // nothing bet yet: shows 1 BET
    for (let i = 0; i < 3; i++) send(s, 'BET_ONE');
    rows = Object.fromEntries(s.view().paytable.map((r) => [r.line, r]));
    expect(rows['TWO PAIR']?.payout).toBe(6);
    expect(rows['ROYAL FLUSH']?.progressive).toBe(false);
    for (let i = 0; i < 2; i++) send(s, 'BET_ONE');
    rows = Object.fromEntries(s.view().paytable.map((r) => [r.line, r]));
    expect(rows['ROYAL FLUSH']?.progressive).toBe(true);
    expect(rows['ROYAL FLUSH']?.payout).toBe(1250);
    expect(rows['THREE OF A KIND']?.payout).toBe(12);
    expect(rows['TWO PAIR']?.progressive).toBe(false);
    expect(Object.keys(rows)).toHaveLength(8);
  });

  it('marks the paid row as hit', () => {
    const s = makeSession([TWO_PAIR]);
    playToWin(s, 1);
    expect(s.view().paytable.filter((r) => r.hit).map((r) => r.line)).toEqual(['TWO PAIR']);
  });

  it('view cards are real card objects', () => {
    const s = makeSession([TWO_PAIR]);
    playToWin(s, 1);
    expect(s.view().cards).toEqual(cards(TWO_PAIR));
  });
});

// --------------------------------------------------------------------------
// auto settlement and cap
// --------------------------------------------------------------------------

describe('auto settlement and cap', () => {
  it('a win over 5000 is settled automatically', () => {
    const s = makeSession([FIVE_KIND], { config: makeConfig({ fiveProgressive: 5000 }) });
    send(s, 'MAX_BET');
    const v = s.view();
    expect([v.phase, v.credits, v.lastPayout, v.message]).toEqual(['BETTING', 995 + 5001, 5001, 'YOU WIN']);
    expect(kinds(s)).toContain('AUTO_SETTLED');
  });

  it('a win of exactly 5000 can still be doubled (5000 vs 5001 boundary)', () => {
    const s = makeSession([FIVE_KIND], { config: makeConfig({ fiveProgressive: 4999 }) }); // 4999.05 -> 5000
    send(s, 'MAX_BET');
    expect(s.view().win).toBe(5000);
    expect(s.phase).toBe('DOUBLE_SELECT');
    expect(s.view().menu.filter((m) => m.enabled && m.item !== 'TAKE SCORE').length).toBeGreaterThan(0);
  });

  it('menu flags reflect can-double', () => {
    let s = sessionIn('DOUBLE_SELECT');
    expect(s.view().menu.every((m) => m.enabled)).toBe(true); // win = 4
    s = makeSession([JOKER_ANYTHING]);
    playToWin(s, 1); // win 1: half double impossible
    const items = Object.fromEntries(s.view().menu.map((m) => [m.item, m]));
    expect(items['HALF DOUBLE']?.enabled).toBe(false);
    expect(items['STANDARD']?.enabled).toBe(true);
    expect(items['TAKE SCORE']?.enabled).toBe(true);
    expect(s.view().menu.map((m) => m.label)).toEqual(['HALF DOUBLE', 'STANDARD', 'HIGH & LOW', 'RED & BLACK', 'TAKE SCORE']);
    expect(s.view().holdLabels).toEqual(s.view().menu.map((m) => m.label));
  });
});

// --------------------------------------------------------------------------
// free game
// --------------------------------------------------------------------------

describe('free game', () => {
  it('runs to the end and costs nothing', () => {
    const s = makeSession([THREE_BLACK_FACES]);
    playToWin(s, 2);
    let v = s.view();
    expect([v.phase, v.inFreeGame]).toEqual(['FREE_GAME', true]);
    expect([v.freeGamesLeft, v.freeGameTotal, v.freeGamesPlayed]).toEqual([5, 5, 0]);
    expect(v.freeGameTrigger).toBe('3 R/B FACES');
    expect(v.message).toBe('FREE GAME 0/5');
    expect(v.credits).toBe(998);
    expect(v.freeGameAwards.at(-1)).toEqual({ label: '3 R/B FACES', games: 5 });
    let total = 0;
    while (s.phase === 'FREE_GAME') {
      const before = s.view().freeGamesPlayed;
      expect(send(s, 'ADVANCE')).toBe(true);
      expect(s.view().credits === 998 || s.phase !== 'FREE_GAME').toBe(true); // FG never costs
      total += 1;
      expect(s.view().freeGamesPlayed).toBe(before + 1);
      expect(total).toBeLessThan(1000);
    }
    expect(s.stats.freeGamesPlayed).toBe(total);
    expect(s.stats.gamesPlayed).toBe(1);
    expect(s.stats.totalWon).toBe(0); // nothing credited yet
    v = s.view();
    expect(['DOUBLE_SELECT', 'BETTING']).toContain(v.phase);
    expect(v.win >= 2 * total || v.phase === 'BETTING').toBe(true);
  });

  it('the trigger game pays normally and counts into the FG total', () => {
    const s = makeSession([FOUR_FACES_FIVE_KIND, NOTHING, NOTHING, NOTHING]);
    playToWin(s, 1);
    let v = s.view();
    expect([v.phase, v.win, v.freeGamesLeft]).toEqual(['FREE_GAME', 500, 10]); // ANY 4 FACES
    send(s, 'ADVANCE');
    v = s.view();
    expect([v.win, v.freeGamesLeft]).toEqual([501, 9]); // NOTHING: min payout = bet (1)
    expect(s.drainEvents().filter((e) => e.kind === 'FREE_GAME_STEP').map((e) => e.amount)).toEqual([1]);
  });

  it('a retrigger adds games', () => {
    const s = makeSession([THREE_BLACK_FACES, NOTHING, THREE_BLACK_FACES], { seed: 3 });
    playToWin(s, 1);
    send(s, 'ADVANCE'); // NOTHING hand
    expect([s.view().freeGamesLeft, s.view().freeGameTotal]).toEqual([4, 5]);
    send(s, 'ADVANCE'); // retrigger: +5
    const v = s.view();
    expect([v.freeGamesLeft, v.freeGameTotal, v.freeGamesPlayed]).toEqual([8, 10, 2]);
    expect(s.drainEvents().some((e) => e.kind === 'FREE_GAME_AWARDED' && e.amount === 5)).toBe(true);
    expect(v.message).toBe('FREE GAME 2/10');
  });

  it('the payout is doubled with a minimum of the bet', () => {
    const s = makeSession([THREE_BLACK_FACES, TWO_PAIR, NOTHING]);
    playToWin(s, 3);
    expect(s.view().win).toBe(0);
    send(s, 'ADVANCE');
    expect(s.view().win).toBe(12); // two pair 3x2=6, doubled
    send(s, 'ADVANCE');
    expect(s.view().win).toBe(15); // min payout = bet 3
  });

  it('does not increment the progressive by default', () => {
    const s = makeSession([THREE_BLACK_FACES, NOTHING]);
    send(s, 'MAX_BET');
    const base = s.view().progressive['FIVE OF A KIND'];
    send(s, 'ADVANCE');
    send(s, 'ADVANCE');
    expect(s.view().progressive['FIVE OF A KIND']).toBe(base);
  });

  it('increments the progressive when configured', () => {
    const s = makeSession([THREE_BLACK_FACES, NOTHING], { config: makeConfig({ progressiveInFreeGame: true }) });
    send(s, 'MAX_BET');
    send(s, 'ADVANCE');
    expect(s.view().progressive['FLUSH / STRAIGHT']).toBe(33); // 32 + 2*.335 = 32.67 -> 33
    expect(s.view().progressive['FIVE OF A KIND']).toBe(2501);
  });

  it('the FG win is capped at 10000 and then auto settled', () => {
    const five = FOUR_FACES_FIVE_KIND;
    const s = makeSession([five, five, five], { seed: 1 });
    send(s, 'MAX_BET'); // trigger game pays the counter (2501), 10 games
    expect(s.view().win).toBe(2501);
    send(s, 'ADVANCE'); // 2 x 2500 -> 7501 (counter reset to 2500 after the first win)
    expect(s.view().win).toBe(7501);
    send(s, 'ADVANCE'); // +5000 -> capped
    expect(s.view().win).toBe(10000);
    s.drainEvents();
    for (let n = 0; s.phase === 'FREE_GAME'; n++) {
      send(s, 'ADVANCE');
      expect(n).toBeLessThan(2000);
    }
    expect([s.view().credits, s.view().phase]).toEqual([995 + 10000, 'BETTING']);
    expect(s.drainEvents().filter((e) => e.kind === 'AUTO_SETTLED').map((e) => e.amount)).toEqual([10000]);
    expect(ledgerOk(s, 1000)).toBe(true);
  });

  it('an FG total over 5000 auto settles without double', () => {
    const s = makeSession([THREE_BLACK_FACES], { seed: 5 });
    send(s, 'MAX_BET');
    while (s.phase === 'FREE_GAME') send(s, 'ADVANCE');
    expect(s.view().win).toBeLessThanOrEqual(5000);
    expect(ledgerOk(s, 1000)).toBe(true);
  });
});

// --------------------------------------------------------------------------
// double down menu & half double
// --------------------------------------------------------------------------

describe('double down menu and half double', () => {
  it('an odd amount keeps the extra medal and pays at once', () => {
    const s = makeSession([THREE_KIND, STANDARD_WIN]);
    playToWin(s, 1); // win 3
    expect(s.view().credits).toBe(999);
    expect(hold(s, 1)).toBe(true); // HALF DOUBLE toggles
    expect(s.view().halfDouble).toBe(true);
    expect(s.view().menu[0]?.selected).toBe(true);
    expect(s.view().credits).toBe(999); // not paid yet
    expect(send(s, 'DOUBLE')).toBe(true); // starts STANDARD with the stake
    const v = s.view();
    expect(v.credits).toBe(999 + 2); // kept (2) goes to credits immediately
    expect([v.win, v.phase, v.halfDouble]).toEqual([1, 'STANDARD_PICK', false]);
    expect(hold(s, 2)).toBe(true); // win: stake 1 x 2
    expect([s.view().win, s.view().phase]).toEqual([2, 'DOUBLE_SELECT']);
    expect(send(s, 'COLLECT')).toBe(true);
    expect(s.view().credits).toBe(1003);
    expect(ledgerOk(s, 1000)).toBe(true);
  });

  it('a half double loss keeps the half', () => {
    const s = makeSession([THREE_KIND, STANDARD_WIN]);
    playToWin(s, 1);
    hold(s, 1);
    hold(s, 2); // STANDARD, half on
    expect(hold(s, 5)).toBe(true); // lose (2H < 5S)
    const v = s.view();
    expect([v.phase, v.credits, v.win]).toEqual(['BETTING', 1001, 0]);
    expect(ledgerOk(s, 1000)).toBe(true);
  });

  it('the half double toggle works twice and emits events', () => {
    const s = sessionIn('DOUBLE_SELECT');
    s.drainEvents();
    hold(s, 1);
    hold(s, 1);
    expect(s.drainEvents().map((e) => [e.kind, e.detail])).toEqual([['HALF_DOUBLE_TOGGLED', 'ON'], ['HALF_DOUBLE_TOGGLED', 'OFF']]);
    expect(s.view().halfDouble).toBe(false);
  });

  it('half double is unavailable for a win of one', () => {
    const s = makeSession([JOKER_ANYTHING]);
    playToWin(s, 1);
    expect(hold(s, 1)).toBe(false);
    expect(s.view().halfDouble).toBe(false);
    expect(kinds(s).at(-1)).toBe('REJECTED');
  });

  it('a win of 2 can be half doubled with a stake of 1', () => {
    const s = makeSession([TWO_PAIR, STANDARD_WIN]);
    playToWin(s, 1); // win 2
    hold(s, 1);
    expect(send(s, 'DOUBLE')).toBe(true);
    expect([s.view().win, s.view().credits]).toEqual([1, 999 + 1]);
    expect(ledgerOk(s, 1000)).toBe(true);
  });

  it('half double disables HIGH & LOW by config', () => {
    const s = sessionIn('DOUBLE_SELECT');
    hold(s, 1);
    const menu = Object.fromEntries(s.view().menu.map((m) => [m.item, m]));
    expect(menu['HIGH & LOW']?.enabled).toBe(false);
    expect(menu['STANDARD']?.enabled).toBe(true);
    expect(hold(s, 3)).toBe(false);
    expect(s.phase).toBe('DOUBLE_SELECT');
    hold(s, 1); // off again
    expect(hold(s, 3)).toBe(true);
    expect(s.phase).toBe('HIGH_LOW_GUESS');
  });

  it('half double in HIGH & LOW when the config allows', () => {
    const s = makeSession([JOKER_ANYTHING, '8S 9H 3D 4C 5C'], { config: makeConfig({ halfInHighLow: true }) });
    playToWin(s, 4);
    hold(s, 1);
    expect(hold(s, 3)).toBe(true);
    expect([s.view().credits, s.view().win]).toEqual([996 + 2, 2]);
  });

  it('the take score item collects', () => {
    const s = sessionIn('DOUBLE_SELECT');
    expect(hold(s, 5)).toBe(true);
    expect([s.view().credits, s.phase]).toEqual([1000, 'BETTING']);
  });

  it('half double on, then take score pays the whole amount', () => {
    const s = sessionIn('DOUBLE_SELECT');
    hold(s, 1);
    hold(s, 5);
    expect(s.view().credits).toBe(1000);
    expect(s.view().halfDouble).toBe(false);
  });
});

// --------------------------------------------------------------------------
// STANDARD
// --------------------------------------------------------------------------

describe('STANDARD', () => {
  it('shows only the dealer card until the pick', () => {
    const v = sessionIn('STANDARD_PICK').view();
    expect(v.doubleKind).toBe('STANDARD');
    expect(v.cards).toEqual([card('5S'), null, null, null, null]);
    expect(v.faceUp).toEqual([true, false, false, false, false]);
    expect([v.message, v.win]).toEqual(['PICK A CARD', 4]);
    expect(v.holdLabels).toEqual(['', 'PICK', 'PICK', 'PICK', 'PICK']);
    expect(v.canCollect).toBe(true);
  });

  it('a win returns to DOUBLE_SELECT with the doubled amount', () => {
    const s = sessionIn('STANDARD_PICK');
    expect(hold(s, 2)).toBe(true);
    const v = s.view();
    expect([v.phase, v.win, v.highlight]).toEqual(['DOUBLE_SELECT', 8, 1]);
    expect(v.faceUp.every(Boolean)).toBe(true);
    expect(v.cards).toEqual(cards(STANDARD_WIN));
    expect(send(s, 'COLLECT')).toBe(true);
    expect(s.view().credits).toBe(1004);
    expect(ledgerOk(s, 1000)).toBe(true);
  });

  it('a chain of wins', () => {
    const s = makeSession([JOKER_ANYTHING, STANDARD_WIN, STANDARD_WIN]);
    playToWin(s, 4);
    send(s, 'DOUBLE');
    hold(s, 2);
    send(s, 'DOUBLE');
    hold(s, 2);
    expect(s.view().win).toBe(16);
    send(s, 'COLLECT');
    expect(s.view().credits).toBe(1012);
  });

  it('a loss goes to BETTING with the cards visible', () => {
    const s = sessionIn('STANDARD_PICK');
    expect(hold(s, 5)).toBe(true);
    const v = s.view();
    expect([v.phase, v.win, v.credits, v.message]).toEqual(['BETTING', 0, 996, 'YOU LOSE']);
    expect(v.faceUp.every(Boolean)).toBe(true);
    expect(v.cards[4]).toEqual(card('2H'));
    expect(kinds(s)).toContain('DOUBLE_LOSE');
    expect(ledgerOk(s, 1000)).toBe(true);
  });

  it('a draw redeals and cannot be collected', () => {
    const s = makeSession([JOKER_ANYTHING, STANDARD_WIN, '7S 2D 9C 8H 3C']);
    playToWin(s, 4);
    send(s, 'DOUBLE');
    s.drainEvents();
    expect(hold(s, 4)).toBe(true); // 5C == 5S: draw
    const v = s.view();
    expect([v.phase, v.message]).toEqual(['STANDARD_PICK', 'DRAW - PICK AGAIN']);
    expect(v.cards).toEqual([card('7S'), null, null, null, null]);
    expect(v.canCollect).toBe(false);
    const draw = s.drainEvents().find((e) => e.kind === 'DOUBLE_DRAW');
    expect(draw?.index).toBe(3);
    expect(draw?.cards).toEqual(cards(STANDARD_WIN));
    expect(send(s, 'COLLECT')).toBe(false);
    expect([s.view().win, s.phase]).toEqual([4, 'STANDARD_PICK']);
    expect(hold(s, 2)).toBe(true); // 2D < 7S: lose
    expect(s.phase).toBe('BETTING');
  });

  it('a draw then a win allows collect again', () => {
    const s = makeSession([JOKER_ANYTHING, STANDARD_WIN, '5S 6H 3D 4C 2H']);
    playToWin(s, 4);
    send(s, 'DOUBLE');
    expect(hold(s, 4)).toBe(true); // draw
    expect(s.view().canCollect).toBe(false);
    expect(hold(s, 2)).toBe(true); // 6H beats 5S
    expect([s.view().win, s.view().canCollect]).toEqual([8, true]);
    expect(send(s, 'COLLECT')).toBe(true);
    expect(s.view().credits).toBe(1004);
  });

  it('collecting before the pick returns the stake', () => {
    const s = sessionIn('STANDARD_PICK');
    expect(send(s, 'COLLECT')).toBe(true);
    expect([s.view().credits, s.phase]).toEqual([1000, 'BETTING']);
  });

  it('HOLD 1 (the dealer card) is rejected', () => {
    const s = sessionIn('STANDARD_PICK');
    expect(hold(s, 1)).toBe(false);
    expect(s.phase).toBe('STANDARD_PICK');
  });

  it('a win above 5000 auto settles', () => {
    const s = makeSession([FIVE_KIND, STANDARD_WIN], { config: makeConfig({ fiveProgressive: 3000 }) });
    send(s, 'MAX_BET');
    expect(s.view().win).toBe(3001);
    send(s, 'DOUBLE');
    hold(s, 2);
    const v = s.view();
    expect([v.phase, v.credits, v.lastPayout]).toEqual(['BETTING', 995 + 6002, 6002]);
    expect(ledgerOk(s, 1000)).toBe(true);
  });

  it('a win is capped at 10000', () => {
    const s = makeSession([FIVE_KIND, STANDARD_WIN], { config: makeConfig({ fiveProgressive: 4999.95 }) });
    send(s, 'MAX_BET'); // 4999.95 + .05 = 5000
    expect(s.view().win).toBe(5000);
    send(s, 'DOUBLE');
    hold(s, 2);
    expect(s.view().credits).toBe(995 + 10000);
    expect(ledgerOk(s, 1000)).toBe(true);
  });
});

// --------------------------------------------------------------------------
// RED & BLACK
// --------------------------------------------------------------------------

describe('RED & BLACK', () => {
  it('wins and loses', () => {
    const s = sessionIn('RED_BLACK_PICK', RB_WIN);
    expect(s.view().doubleKind).toBe('RED & BLACK');
    expect(s.view().cards[0]).toEqual(card('5S'));
    expect(hold(s, 2)).toBe(true); // 9C is black like 5S
    expect([s.view().win, s.phase]).toEqual([8, 'DOUBLE_SELECT']);
    const s2 = sessionIn('RED_BLACK_PICK', RB_WIN);
    expect(hold(s2, 3)).toBe(true); // 3D red
    expect([s2.phase, s2.view().win, s2.view().message]).toEqual(['BETTING', 0, 'YOU LOSE']);
  });

  it('flush bonus', () => {
    const s = makeSession([JOKER_ANYTHING, '2S 4S 6S 8S 10S']);
    playToWin(s, 4);
    hold(s, 4);
    hold(s, 2);
    expect(s.view().win).toBe(4 * 2 + 4 * 8);
    expect(send(s, 'COLLECT')).toBe(true);
    expect(s.view().credits).toBe(1036);
    expect(ledgerOk(s, 1000)).toBe(true);
  });
});

// --------------------------------------------------------------------------
// HIGH & LOW
// --------------------------------------------------------------------------

describe('HIGH & LOW', () => {
  const DECK = '8S 9H 3D QC 2S';

  it('entry view', () => {
    const v = sessionIn('HIGH_LOW_GUESS', DECK).view();
    expect(v.doubleKind).toBe('HIGH & LOW');
    expect(v.cards).toEqual([card('8S'), null, null, null, null]);
    expect(v.faceUp).toEqual([true, false, false, false, false]);
    expect([v.message, v.holdLabels]).toEqual(['HIGH OR LOW?', ['', 'LOW', '', 'HIGH', '']]);
    const hl = v.highLow;
    expect(hl?.active).toBe(true);
    expect([hl?.roundsWon, hl?.roundsTotal, hl?.currentAmount, hl?.nextAmount]).toEqual([0, 4, 4, 8]);
    expect(hl?.bonusRows[0]?.label).toBe('ROYAL FLUSH');
    expect(hl?.bonusRows[0]?.amount).toBe(4 * 1000);
    expect(hl?.bonusRows.map((r) => r.label)).not.toContain('NONE');
  });

  it('collect before the first guess', () => {
    const s = sessionIn('HIGH_LOW_GUESS', DECK);
    expect(send(s, 'COLLECT')).toBe(true);
    expect([s.view().credits, s.phase]).toEqual([1000, 'BETTING']);
  });

  it('a loss', () => {
    const s = sessionIn('HIGH_LOW_GUESS', DECK);
    expect(hold(s, 2)).toBe(true); // LOW: 9H is higher -> lose
    const v = s.view();
    expect([v.phase, v.credits, v.win, v.message]).toEqual(['BETTING', 996, 0, 'YOU LOSE']);
    expect(v.cards[1]).toEqual(card('9H'));
    expect(v.highLow?.outcome).toBe('LOSE');
    expect(ledgerOk(s, 1000)).toBe(true);
  });

  it('a win, continue, then collect', () => {
    const s = sessionIn('HIGH_LOW_GUESS', DECK);
    expect(hold(s, 4)).toBe(true); // HIGH: 9H > 8S
    const v = s.view();
    expect([v.phase, v.win, v.highLow?.roundsWon]).toEqual(['HIGH_LOW_GUESS', 8, 1]);
    expect(v.cards.slice(0, 2)).toEqual([card('8S'), card('9H')]);
    expect(v.faceUp).toEqual([true, true, false, false, false]);
    expect(v.highlight).toBe(1);
    expect(s.send({ type: 'GUESS', guess: 'LOW' })).toBe(true); // 3D < 9H: win
    expect(s.view().win).toBe(16);
    expect(send(s, 'COLLECT')).toBe(true);
    expect([s.view().credits, s.phase]).toEqual([996 + 16, 'BETTING']);
    expect(ledgerOk(s, 1000)).toBe(true);
  });

  it('four wins pay 16x plus the bonus automatically', () => {
    const s = sessionIn('HIGH_LOW_GUESS', '8S 9H 10D JC QS'); // straight (mixed suits): x50
    for (let i = 0; i < 4; i++) expect(hold(s, 4)).toBe(true);
    const v = s.view();
    expect([v.phase, v.credits]).toEqual(['BETTING', 996 + 64 + 4 * 50]);
    expect([v.highLow?.bonusHand, v.highLow?.bonusAmount, v.highLow?.outcome, v.lastPayout]).toEqual(['STRAIGHT', 200, 'COMPLETED', 264]);
    const ev = s.drainEvents();
    expect(ev.some((e) => e.kind === 'HIGH_LOW_BONUS' && e.amount === 200)).toBe(true);
    expect(ev.some((e) => e.kind === 'AUTO_SETTLED' && e.amount === 264)).toBe(true);
    expect(ledgerOk(s, 1000)).toBe(true);
  });

  it('a joker ends the game with a win', () => {
    const s = sessionIn('HIGH_LOW_GUESS', '8S JKR 3D QC 2S');
    expect(hold(s, 2)).toBe(true); // LOW; a joker always wins
    const v = s.view();
    expect([v.phase, v.credits, v.message]).toEqual(['BETTING', 996 + 8, 'JOKER!']);
    expect(kinds(s)).toContain('JOKER');
    expect(ledgerOk(s, 1000)).toBe(true);
  });

  it('a win above 5000 settles automatically', () => {
    const s = makeSession([FIVE_KIND, DECK], { config: makeConfig({ fiveProgressive: 3000 }) });
    send(s, 'MAX_BET');
    expect(s.view().win).toBe(3001);
    hold(s, 3);
    hold(s, 4);
    const v = s.view();
    expect([v.phase, v.credits, v.highLow?.outcome]).toEqual(['BETTING', 995 + 6002, 'AUTO_SETTLED']);
    expect(ledgerOk(s, 1000)).toBe(true);
  });

  it('unused HOLD buttons are rejected', () => {
    const s = sessionIn('HIGH_LOW_GUESS');
    for (const n of [1, 3, 5]) expect(hold(s, n)).toBe(false);
    expect(s.phase).toBe('HIGH_LOW_GUESS');
  });

  it('bonus rows use the main game bet', () => {
    const s = makeSession([TWO_PAIR, DECK]);
    playToWin(s, 2); // win 4
    hold(s, 3);
    const rows = Object.fromEntries((s.view().highLow?.bonusRows ?? []).map((r) => [r.label, r]));
    expect(rows['FULL HOUSE']?.amount).toBe(200);
  });

  it('a new deal clears the previous HIGH & LOW result', () => {
    const s = sessionIn('HIGH_LOW_GUESS', DECK);
    hold(s, 2);
    expect(s.view().highLow).not.toBeNull();
    send(s, 'DEAL');
    expect(s.view().highLow).toBeNull();
  });
});

// --------------------------------------------------------------------------
// rejection of invalid commands (never throws, state unchanged)
// --------------------------------------------------------------------------

type S = ReturnType<typeof makeSession>;
const ALL_COMMANDS: Record<string, (s: S) => boolean> = {
  bet_one: (s) => send(s, 'BET_ONE'),
  max_bet: (s) => send(s, 'MAX_BET'),
  deal: (s) => send(s, 'DEAL'),
  advance: (s) => send(s, 'ADVANCE'),
  double: (s) => send(s, 'DOUBLE'),
  collect: (s) => send(s, 'COLLECT'),
  guess_high: (s) => s.send({ type: 'GUESS', guess: 'HIGH' }),
  guess_junk: (s) => s.send({ type: 'GUESS', guess: 'MIDDLE' as never }),
  add_medals: (s) => send(s, 'ADD_MEDALS'),
  hold0: (s) => hold(s, 0),
  hold6: (s) => hold(s, 6),
  'hold-1': (s) => hold(s, -1),
  hold_none: (s) => hold(s, undefined as never),
  hold_float: (s) => hold(s, 2.5),
  hold_nan: (s) => hold(s, Number.NaN),
  hold_true: (s) => hold(s, true as never),
  hold_string: (s) => hold(s, '2' as never),
  unknown: (s) => s.send({ type: 'EXPLODE' } as never),
  hold1: (s) => hold(s, 1),
  hold2: (s) => hold(s, 2),
  hold3: (s) => hold(s, 3),
  hold4: (s) => hold(s, 4),
  hold5: (s) => hold(s, 5),
};

// deal is rejected in BETTING: no bet and no history
const ACCEPTED: Record<SessionPhase, string[]> = {
  BETTING: ['bet_one', 'max_bet', 'add_medals'],
  FREE_GAME: ['advance'],
  DOUBLE_SELECT: ['double', 'collect', 'hold1', 'hold2', 'hold3', 'hold4', 'hold5'],
  STANDARD_PICK: ['collect', 'hold2', 'hold3', 'hold4', 'hold5'],
  RED_BLACK_PICK: ['collect', 'hold2', 'hold3', 'hold4', 'hold5'],
  HIGH_LOW_GUESS: ['collect', 'guess_high', 'hold2', 'hold4'],
};

describe('every command in every phase', () => {
  const phases = Object.keys(ACCEPTED) as SessionPhase[];
  for (const phase of phases) {
    for (const [name, run] of Object.entries(ALL_COMMANDS)) {
      it(`${phase} / ${name}`, () => {
        const s = sessionIn(phase);
        const before = s.view();
        s.drainEvents();
        const result = run(s); // must never throw
        const ev = s.drainEvents();
        if (ACCEPTED[phase].includes(name)) {
          expect(result).toBe(true);
          expect(ev.map((e) => e.kind)).not.toContain('REJECTED');
        } else {
          expect(result).toBe(false);
          expect(ev.map((e) => e.kind)).toEqual(['REJECTED']);
          expect(s.view()).toEqual(before);
        }
      });
    }
  }
});

describe('rejection details', () => {
  it('has a reason that names the command', () => {
    const s = makeSession();
    send(s, 'COLLECT');
    const [e, ...rest] = s.drainEvents();
    expect(rest).toEqual([]);
    expect(e?.kind).toBe('REJECTED');
    expect(e?.detail).toContain('COLLECT');
  });

  it('adds the configured medals', () => {
    const s = makeSession();
    expect(send(s, 'ADD_MEDALS')).toBe(true);
    expect(s.view().credits).toBe(1100);
    expect(kinds(s)).toEqual(['CREDITS_ADDED']);
    expect(ledgerOk(s, 1000, 100)).toBe(true);
  });

  it('betting during free game and double is rejected and costs nothing', () => {
    for (const phase of ['FREE_GAME', 'DOUBLE_SELECT', 'STANDARD_PICK'] as const) {
      const s = sessionIn(phase);
      const c = s.view().credits;
      expect([send(s, 'BET_ONE'), send(s, 'MAX_BET'), send(s, 'DEAL')]).toEqual([false, false, false]);
      expect(s.view().credits).toBe(c);
    }
  });

  it('the event queue is bounded and drain clears it', () => {
    const s = makeSession();
    for (let i = 0; i < 2000; i++) send(s, 'COLLECT');
    expect(s.drainEvents().length).toBeLessThanOrEqual(512);
    expect(s.drainEvents()).toEqual([]);
  });

  it('subscribe is called after every command and can unsubscribe', () => {
    const s = makeSession();
    const seen: number[] = [];
    const off = s.subscribe((v) => seen.push(v.credits));
    send(s, 'BET_ONE');
    send(s, 'COLLECT'); // rejected, still notifies
    off();
    send(s, 'BET_ONE');
    expect(seen).toEqual([999, 999]);
  });

  it('view() is stable between commands and a fresh object after one', () => {
    const s = makeSession();
    const a = s.view();
    expect(s.view()).toBe(a);
    send(s, 'BET_ONE');
    expect(s.view()).not.toBe(a);
  });
});

// --------------------------------------------------------------------------
// shutdown (D13)
// --------------------------------------------------------------------------

describe('shutdown', () => {
  it('collects a pending DOUBLE_SELECT win and saves', () => {
    const repo = new FakeRepository();
    const s = makeSession([TWO_PAIR], { repo });
    playToWin(s, 3); // win 6 pending
    s.shutdown();
    expect(repo.data?.credits).toBe(1003);
    expect(s.phase).toBe('BETTING');
  });

  it('settles the stake of a running double game, even after a standard draw', () => {
    const repo = new FakeRepository();
    const s = makeSession([JOKER_ANYTHING, STANDARD_WIN, '7S 2D 9C 8H 3C'], { repo });
    playToWin(s, 4);
    send(s, 'DOUBLE');
    hold(s, 4); // draw: cannot collect normally
    s.shutdown();
    expect(repo.data?.credits).toBe(1000);
  });

  it('plays out pending free games before settling', () => {
    const repo = new FakeRepository();
    const s = makeSession([THREE_BLACK_FACES], { repo, seed: 2 });
    playToWin(s, 1);
    s.shutdown();
    expect(s.phase).toBe('BETTING');
    expect(repo.data?.credits ?? 0).toBeGreaterThanOrEqual(1000 - 1 + 5);
    expect(ledgerOk(s, 1000)).toBe(true);
  });

  it('gives an undealt bet back when saving', () => {
    const repo = new FakeRepository();
    const s = makeSession([], { repo });
    send(s, 'BET_ONE');
    send(s, 'BET_ONE');
    s.shutdown();
    expect(repo.data?.credits).toBe(1000);
  });

  it('collects an active HIGH & LOW amount', () => {
    const repo = new FakeRepository();
    const s = makeSession([JOKER_ANYTHING, '8S 9H 3D QC 2S'], { repo, config: makeConfig() });
    playToWin(s, 4);
    hold(s, 3);
    hold(s, 4); // win 8
    s.shutdown();
    expect(repo.data?.credits).toBe(996 + 8);
  });
});
