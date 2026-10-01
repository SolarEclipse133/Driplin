import { describe, expect, it } from "vitest";
import { canProcessAnother, mustTryFirst, type BudgetState } from "./budget";

/**
 * Knowing when to stop.
 *
 * The failure being fixed: the nightly run processed every organization in
 * one invocation with no sense of its deadline, got killed partway, and
 * silently never checked whoever came after the cut -- the same customers
 * every night, because the ordering was stable.
 */

const LIMIT = 60_000;
const RESERVE = 10_000;
const state: BudgetState = { startedAt: 0, limitMs: LIMIT, reserveMs: RESERVE };

describe("while there is plenty of time", () => {
  it("carries on", () => {
    const v = canProcessAnother(state, 5_000, 1);
    expect(v.proceed).toBe(true);
  });

  it("uses what this run has actually measured, not a guess", () => {
    // Two organizations took 4s between them, so about 2s each. With 45s
    // of budget left that is plainly fine.
    expect(canProcessAnother(state, 4_000, 2).proceed).toBe(true);
    // The same elapsed time for ONE organization means 4s each, still fine.
    expect(canProcessAnother(state, 4_000, 1).proceed).toBe(true);
  });
});

describe("as the deadline approaches", () => {
  it("stops while there is still time to tidy up", () => {
    // 48s gone of a 60s limit, holding 10s back: only 2s usable, and each
    // organization has been taking 16s.
    const v = canProcessAnother(state, 48_000, 3);
    expect(v.proceed).toBe(false);
    expect(v.reason).toContain("not enough time");
  });

  it("never eats into the reserve", () => {
    // Past the point where the reserve begins, nothing more is attempted.
    const v = canProcessAnother(state, LIMIT - RESERVE + 1, 5);
    expect(v.proceed).toBe(false);
    expect(v.reason).toBe("out of time");
    expect(v.msRemaining).toBe(0);
  });

  it("says how long it needed and how long it had", () => {
    const v = canProcessAnother(state, 40_000, 2);
    if (v.proceed) throw new Error("expected a stop");
    expect(v.reason).toMatch(/\d+s needed/);
    expect(v.reason).toMatch(/\d+s left/);
  });
});

describe("the first organization", () => {
  it("is always attempted", () => {
    // A run that checks nobody, night after night, looks exactly like a
    // working system. An overrun at least trips the heartbeat.
    expect(mustTryFirst(0)).toBe(true);
    expect(mustTryFirst(1)).toBe(false);
  });

  it("is judged on the first guess before anything is measured", () => {
    // Nothing measured yet, 50s usable, a 5s guess: go.
    expect(canProcessAnother(state, 0, 0).proceed).toBe(true);
    // A guess larger than the whole budget: do not pretend it fits.
    expect(canProcessAnother(state, 0, 0, 120_000).proceed).toBe(false);
  });
});

describe("a slow night", () => {
  it("stops after fewer organizations when vendors are slow", () => {
    // 20s each: two fit in the usable 50s, a third does not.
    expect(canProcessAnother(state, 20_000, 1).proceed).toBe(true);
    expect(canProcessAnother(state, 40_000, 2).proceed).toBe(false);
  });

  it("gets through more when they are fast", () => {
    // 1s each: still going at forty organizations.
    expect(canProcessAnother(state, 40_000, 40).proceed).toBe(true);
  });
});
