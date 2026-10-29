import { describe, expect, it } from 'vitest';
import { FixedStep } from '../src/loop';

describe('FixedStep', () => {
  it('runs one step per 1/60 s whatever the frame length', () => {
    const steps = new FixedStep(60);
    let count = 0;
    for (let i = 0; i < 144; i++) steps.advance(1000 / 144, () => count++);
    expect(count).toBe(60);
  });

  it('returns the interpolation factor', () => {
    const steps = new FixedStep(50);
    expect(steps.advance(30, () => {})).toBeCloseTo(0.5);
  });

  it('caps catch-up after a stall', () => {
    const steps = new FixedStep(60, 5);
    let count = 0;
    steps.advance(10_000, () => count++);
    expect(count).toBe(5);
    count = 0;
    steps.advance(1000 / 60, () => count++);
    expect(count).toBe(1);
  });

  it('ignores negative time and resets', () => {
    const steps = new FixedStep(60);
    let count = 0;
    steps.advance(-50, () => count++);
    steps.advance(10, () => count++);
    steps.reset();
    steps.advance(10, () => count++);
    expect(count).toBe(0);
  });

  it('rejects a non-positive rate', () => {
    expect(() => new FixedStep(0)).toThrow(RangeError);
  });
});
