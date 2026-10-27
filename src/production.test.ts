import { describe, expect, it } from "vitest";
import {
  advanceProduction,
  productionQueueLimit,
  productionRate,
} from "./production";
import type { Building, Campaign, TrainingOrder, Unit } from "./types";

function world(types: Building["type"][]): Campaign {
  return {
    version: 2,
    region: "test",
    nation: "FRA",
    nations: {
      FRA: {
        id: "FRA",
        credits: 5000,
        supplies: 500,
        industry: 0,
        reserves: 0,
        capital: [0, 0],
        doctrine: "balanced",
        doctrineChangedAt: -60,
        nextActionAt: 999,
        queue: [],
        defeated: false,
      },
    },
    wars: [],
    elapsed: 0,
    nextId: 100,
    units: [],
    nodes: [],
    result: "playing",
    buildings: types.map((type, i) => ({
      id: i + 1,
      nation: "FRA",
      team: "player",
      type,
      x: i * 5,
      z: 0,
      hp: 100,
      maxHp: 100,
    })),
  };
}
const job = (type: Unit["type"], time = 4): TrainingOrder => ({
  type,
  remaining: time,
  total: time,
});
describe("parallel production", () => {
  it("runs one order per building, not one order for the entire nation", () => {
    const state = world(["hq", "barracks", "barracks"]);
    state.nations.FRA.queue = [
      job("infantry"),
      job("infantry"),
      job("infantry"),
      job("infantry"),
    ];
    advanceProduction(state, "FRA", 2, 3, () => true);
    expect(state.nations.FRA.queue.map((q) => q.remaining)).toEqual([
      2, 2, 2, 4,
    ]);
    expect(
      new Set(state.nations.FRA.queue.slice(0, 3).map((q) => q.producer)).size,
    ).toBe(3);
  });
  it("shares docks between ship types while headquarters trains independently", () => {
    const state = world(["hq", "dock", "dock"]);
    state.nations.FRA.queue = [
      job("frigate", 10),
      job("transport", 8),
      job("infantry"),
      job("transport", 8),
    ];
    advanceProduction(state, "FRA", 2, 3, () => true);
    expect(state.nations.FRA.queue.map((q) => q.remaining)).toEqual([
      8, 6, 2, 8,
    ]);
    expect(state.nations.FRA.queue[2].producer).toBe(1);
  });
  it("reserves specialized barracks for armor when infantry can use a capital", () => {
    const state = world(["barracks", "hq"]);
    state.nations.FRA.queue = [job("infantry"), job("armor", 8)];
    advanceProduction(state, "FRA", 1, 3, () => true);
    expect(state.nations.FRA.queue.map((q) => q.producer)).toEqual([2, 1]);
    expect(state.nations.FRA.queue.map((q) => q.remaining)).toEqual([3, 7]);
  });
  it("reassigns captured or destroyed factories without losing completed work", () => {
    const state = world(["barracks", "barracks"]);
    state.nations.FRA.queue = [job("armor", 8)];
    advanceProduction(state, "FRA", 2, 3, () => true);
    state.buildings[0].nation = "DEU";
    advanceProduction(state, "FRA", 1, 3, () => true);
    expect(state.nations.FRA.queue[0].producer).toBe(2);
    expect(state.nations.FRA.queue[0].remaining).toBe(5);
    state.buildings[1].hp = 0;
    advanceProduction(state, "FRA", 1, 3, () => true);
    expect(state.nations.FRA.queue[0].producer).toBeUndefined();
    expect(state.nations.FRA.queue[0].remaining).toBe(5);
  });
  it("keeps a blocked launch on its own line while other buildings finish", () => {
    const state = world(["dock", "hq"]);
    state.nations.FRA.queue = [job("transport", 1), job("infantry", 1)];
    const ready = advanceProduction(
      state,
      "FRA",
      1,
      3,
      (_type, b) => b.type !== "dock",
    );
    expect(ready).toEqual(["infantry"]);
    expect(state.nations.FRA.queue).toHaveLength(1);
    expect(state.nations.FRA.queue[0].remaining).toBe(0);
    expect(state.nations.FRA.queue[0].producer).toBe(1);
  });
  it("improves speed with productive income and industry, with a bounded bonus", () => {
    const state = world(["hq"]);
    const base = productionRate(state, "FRA", 3);
    state.nations.FRA.industry = 4;
    const rich = productionRate(state, "FRA", 19);
    expect(rich).toBeGreaterThan(base);
    expect(productionRate(state, "FRA", 9999)).toBe(2.5);
    state.nations.FRA.queue = [job("infantry")];
    advanceProduction(state, "FRA", 2, 19, () => true);
    expect(state.nations.FRA.queue[0].remaining).toBeCloseTo(4 - 2 * rich);
  });
  it("grows queue space with real production buildings and does not double-book restored slots", () => {
    const state = world(["hq", "barracks", "dock", "mine"]);
    expect(productionQueueLimit(state, "FRA")).toBe(9);
    state.nations.FRA.queue = [
      { ...job("infantry"), producer: 1 },
      { ...job("infantry"), producer: 1 },
    ];
    advanceProduction(state, "FRA", 1, 3, () => true);
    expect(state.nations.FRA.queue.map((q) => q.producer)).toEqual([1, 2]);
  });
});
