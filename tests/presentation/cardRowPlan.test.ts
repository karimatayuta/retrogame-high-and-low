import { describe, expect, it } from 'vitest';
import { FAST, NORMAL, planRow } from '@/presentation/cardRowPlan';
import { EMPTY_SLOT, maskView, type SlotVis } from '@/presentation/stages';
import { createGameSession } from '@/application/gameSession';
import { seededRandomizer } from '@/domain/random';
import { MemorySaveRepository } from '@/infrastructure/localStorageSaveRepository';

const up = (rank: number): SlotVis => ({ card: { kind: 'normal', rank: rank as 2, suit: 'S' }, up: true, present: true });
const down: SlotVis = { card: null, up: false, present: true };

describe('planRow', () => {
  it('deals one by one then flips in order', () => {
    const e = Array.from({ length: 5 }, () => EMPTY_SLOT);
    const p = planRow(e, [2, 3, 4, 5, 6].map(up), 0, NORMAL);
    const appears = p.anims.map((a) => a?.appearAt ?? -1);
    expect(appears).toEqual([0, 0.085, 0.17, 0.255, 0.34]);
    const flips = p.anims.map((a) => a?.flipAt ?? -1);
    expect([...flips].sort((a, b) => a - b)).toEqual(flips);
    expect(flips[0]).toBeGreaterThan(appears[4] as number);
    expect(p.end).toBeGreaterThan(flips[4] as number);
    expect(p.sounds.filter((s) => s.sfx === 'deal')).toHaveLength(5);
    expect(p.sounds.filter((s) => s.sfx === 'flip')).toHaveLength(5);
  });

  it('turns face-down cards over without sliding', () => {
    const p = planRow([up(2), down, down, down, down], [up(2), up(5), up(6), up(7), up(8)], 0, FAST);
    expect(p.anims[0]).toBeNull();
    expect(p.anims[1]?.reveal).toBe(true);
  });

  it('no change means no animation', () => {
    const row = [up(2), up(3), EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT];
    expect(planRow(row, row, 0, NORMAL).anims.every((a) => a === null)).toBe(true);
  });

  it('removes vanished cards at once', () => {
    const p = planRow([up(2), up(3), up(4), up(5), up(6)], [up(2), EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT], 0, NORMAL);
    expect(p.anims[1]?.target.present).toBe(false);
    expect(p.sounds).toHaveLength(0);
  });
});

describe('maskView', () => {
  it('hides results until revealed', () => {
    const s = createGameSession({ rng: seededRandomizer(1), saveRepository: new MemorySaveRepository() });
    s.send({ type: 'MAX_BET' });
    const m = maskView(s.view(), 0);
    expect(m.handRank).toBeNull();
    expect(m.message).toBe('');
    expect(m.menu).toEqual([]);
    expect(m.win).toBe(0);
    expect(m.paytable.some((r) => r.hit)).toBe(false);
  });
});
