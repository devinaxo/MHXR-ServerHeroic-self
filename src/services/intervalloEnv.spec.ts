import { describe, it, expect, afterEach } from 'vitest';
import { intervalloEnv, interoCasuale } from './intervalloEnv.js';

describe('intervalloEnv', () => {
  const prev = process.env.TEST_INTERVALLO;
  afterEach(() => {
    if (prev === undefined) delete process.env.TEST_INTERVALLO;
    else process.env.TEST_INTERVALLO = prev;
  });

  it('reads a fixed value as a zero-width range', () => {
    process.env.TEST_INTERVALLO = '500';
    expect(intervalloEnv('TEST_INTERVALLO', 1, 2)).toEqual([500, 500]);
  });

  it('reads a min-max range and normalizes the order', () => {
    process.env.TEST_INTERVALLO = '300-900';
    expect(intervalloEnv('TEST_INTERVALLO', 1, 2)).toEqual([300, 900]);
    process.env.TEST_INTERVALLO = '900-300';
    expect(intervalloEnv('TEST_INTERVALLO', 1, 2)).toEqual([300, 900]);
  });

  it('falls back to the default when unset or malformed', () => {
    delete process.env.TEST_INTERVALLO;
    expect(intervalloEnv('TEST_INTERVALLO', 7, 9)).toEqual([7, 9]);
    process.env.TEST_INTERVALLO = 'not-a-range';
    expect(intervalloEnv('TEST_INTERVALLO', 7, 9)).toEqual([7, 9]);
  });
});

describe('interoCasuale', () => {
  it('returns the minimum when the range is empty', () => {
    expect(interoCasuale(5, 5)).toBe(5);
    expect(interoCasuale(9, 5)).toBe(9);
  });

  it('stays within the inclusive range', () => {
    for (let i = 0; i < 200; i++) {
      const n = interoCasuale(100, 200);
      expect(n).toBeGreaterThanOrEqual(100);
      expect(n).toBeLessThanOrEqual(200);
    }
  });
});
