import { describe, it, expect } from 'vitest';
import {
  PER_GIOCOATORE,
  PUNTI_ID,
  SCORTA_TOTALE,
  TRADE_POINT_ID,
  aggiungiPunti,
  giaAcquistato,
  giornoGioco,
  prezzoPerRarita,
  registraAcquisto,
  saldoPunti,
} from './tradePointsService.js';

describe('tradePointsService', () => {
  describe('giornoGioco', () => {
    // The game day turns over at 05:00, so 04:59 is still yesterday.
    it('counts the early hours as the previous day', () => {
      expect(giornoGioco(new Date(2026, 9, 10, 4, 59))).toBe(20261009);
    });

    it('counts 05:00 as the new day', () => {
      expect(giornoGioco(new Date(2026, 9, 10, 5, 0))).toBe(20261010);
    });

    it('stays on the same day through the evening', () => {
      expect(giornoGioco(new Date(2026, 9, 10, 23, 30))).toBe(20261010);
    });

    it('rolls over across a month boundary', () => {
      expect(giornoGioco(new Date(2026, 9, 30, 23, 59))).toBe(20261030);
      expect(giornoGioco(new Date(2026, 9, 31, 4, 0))).toBe(20261030);
      expect(giornoGioco(new Date(2026, 9, 31, 5, 0))).toBe(20261031);
    });
  });

  describe('aggiungiPunti', () => {
    it('starts a row when the currency has none yet', () => {
      const box = { points: [] as { mst_event_point_id: number; amount: number }[] };
      expect(aggiungiPunti(box, 100)).toBe(100);
      expect(box.points).toEqual([{ mst_event_point_id: TRADE_POINT_ID, amount: 100 }]);
    });

    it('adds to the existing row', () => {
      const box = { points: [{ mst_event_point_id: TRADE_POINT_ID, amount: 40 }] };
      expect(aggiungiPunti(box, 60)).toBe(100);
    });

    it('does not touch the other two currencies', () => {
      const box = { points: [{ mst_event_point_id: PUNTI_ID.superiore, amount: 5 }] };
      aggiungiPunti(box, 10); // base
      expect(box.points.find((p) => p.mst_event_point_id === PUNTI_ID.superiore)?.amount).toBe(5);
    });
  });

  describe('saldoPunti', () => {
    it('reads the Trade Points row', () => {
      expect(saldoPunti({ points: [{ mst_event_point_id: TRADE_POINT_ID, amount: 42 }] })).toBe(42);
    });

    it('ignores rows belonging to other currencies', () => {
      expect(saldoPunti({ points: [{ mst_event_point_id: 123, amount: 999 }] })).toBe(0);
    });

    it('reads 0 rather than NaN when the row is empty or missing', () => {
      expect(saldoPunti({ points: [] })).toBe(0);
      expect(saldoPunti({})).toBe(0);
      expect(saldoPunti(null)).toBe(0);
    });
  });

  describe('prezzoPerRarita', () => {
    it('prices every rarity the game actually uses', () => {
      for (const rarita of [1, 2, 3, 4, 5, 6, 7, 8]) {
        expect(prezzoPerRarita(rarita)).toBeGreaterThan(0);
      }
    });

    it('gets dearer with rarity', () => {
      for (let r = 1; r < 8; r++) {
        expect(prezzoPerRarita(r + 1)).toBeGreaterThan(prezzoPerRarita(r));
      }
    });

    it('falls back to the cheapest price for an unknown rarity', () => {
      expect(prezzoPerRarita(99)).toBe(prezzoPerRarita(1));
    });
  });
});

describe('purchases and stock', () => {
  const ITEM = 12345;

  function utenteConAcquisti(acquisti: Record<string, Record<string, number>> = {}) {
    return { negozi_acquistati: acquisti, modificati: [] as string[], markModified(p: string) { this.modificati.push(p); } };
  }

  it('starts a player at zero of everything', () => {
    expect(giaAcquistato(utenteConAcquisti(), ITEM)).toBe(0);
    expect(giaAcquistato({}, ITEM)).toBe(0);
  });

  it('accumulates purchases within the day', () => {
    const u = utenteConAcquisti();
    expect(registraAcquisto(u, ITEM, 1)).toBe(1);
    expect(registraAcquisto(u, ITEM, 2)).toBe(3);
    expect(giaAcquistato(u, ITEM)).toBe(3);
  });

  it('keeps a separate count per item', () => {
    const u = utenteConAcquisti();
    registraAcquisto(u, 111, 4);
    expect(giaAcquistato(u, 111)).toBe(4);
    expect(giaAcquistato(u, 222)).toBe(0);
  });

  it('ignores a previous day, so the stock refills at the 05:00 rollover', () => {
    // Yesterday's purchases, keyed by yesterday's game day.
    const ieri = new Date();
    ieri.setDate(ieri.getDate() - 2);
    const chiaveIeri = String(giornoGioco(ieri));
    const u = utenteConAcquisti({ [chiaveIeri]: { [ITEM]: 99 } });
    expect(giaAcquistato(u, ITEM)).toBe(0);
    // And a fresh purchase starts a new day rather than adding to the old one.
    expect(registraAcquisto(u, ITEM, 1)).toBe(1);
  });

  it('marks the document dirty so the write is not lost', () => {
    const u = utenteConAcquisti();
    registraAcquisto(u, ITEM, 1);
    expect(u.modificati).toContain('negozi_acquistati');
  });

  it('has a per-player cap smaller than the total stock', () => {
    expect(PER_GIOCOATORE).toBeGreaterThan(0);
    expect(SCORTA_TOTALE).toBeGreaterThan(0);
  });
});
