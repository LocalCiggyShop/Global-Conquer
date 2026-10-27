import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCampaign,
  restoreCampaign,
  savedCampaigns,
  saveCampaign,
  Simulation,
  unitSpecs,
} from "./campaign";
import {
  cellPoint,
  createGrid,
  footprintCells,
  nationSpawn,
} from "./navigation";
import { regions } from "./regions";
import type { ContinentData, DoctrineId, LegacyCampaign } from "./types";

const load = (id: string): ContinentData =>
  JSON.parse(
    readFileSync(
      new URL("../public/data/" + id + ".json", import.meta.url),
      "utf8",
    ),
  );
const europe = load("europe"),
  grid = createGrid(europe);
const initial = createCampaign(europe, grid, "FRA");
const fresh = () => new Simulation(europe, grid, initial);
function advance(sim: Simulation, seconds: number) {
  for (let t = 0; t < seconds - 0.0001; t += 0.05) sim.step(0.05);
}
function duel() {
  const sim = fresh(),
    a = sim.playerUnits[0],
    b = sim.state.units.find((u) => u.nation === "DEU")!;
  b.x = a.x + 0.4;
  b.z = a.z;
  sim.state.units = [a, b];
  // These duels isolate national doctrine from leader bonuses.
  delete a.leaderId;
  delete b.leaderId;
  sim.playerNation.doctrine = "balanced";
  sim.state.nations.DEU.doctrine = "balanced";
  return { sim, a, b };
}
afterEach(() => vi.unstubAllGlobals());

describe("peacetime continent simulation", () => {
  for (const region of regions)
    it("starts every nation at peace in " + region.name, () => {
      const data = region.id === "europe" ? europe : load(region.id),
        nav = region.id === "europe" ? grid : createGrid(data);
      const state =
        region.id === "europe"
          ? initial
          : createCampaign(data, nav, region.defaultNation);
      expect(Object.keys(state.nations)).toHaveLength(data.countries.length);
      expect(state.wars).toEqual([]);
      expect(
        state.units.filter((u) => u.nation === region.defaultNation),
      ).toHaveLength(6);
      for (const hq of state.buildings.filter((b) => b.type === "hq")) {
        const owner = data.countries.findIndex((c) => c.id === hq.nation);
        expect(
          footprintCells(nav, hq.x, hq.z).every((i) => nav.owners[i] === owner),
        ).toBe(true);
      }
      for (const nation of Object.values(state.nations))
        expect(nation.credits).toBe(650);
    });

  it("develops all AI economies, including tiny territories, without starting an early war", () => {
    const sim = fresh();
    advance(sim, 120);
    for (const n of Object.values(sim.state.nations).filter(
      (n) => n.id !== "FRA",
    )) {
      expect(n.industry, n.id).toBeGreaterThanOrEqual(1);
      expect(sim.nationIncome(n.id), n.id).toBeGreaterThan(3);
      expect(n.credits, n.id).toBeGreaterThan(200);
    }
    expect(
      sim.state.buildings.some((b) => b.nation !== "FRA" && b.type === "mine"),
    ).toBe(true);
    expect(sim.state.nations.LUX.capital).toBeNull();
    expect(sim.state.nations.LUX.reserves).toBeGreaterThan(0);
    expect(sim.state.wars).toEqual([]);
    expect(sim.state.result).toBe("playing");
  });

  it("never attacks neutral nations, even when their units overlap", () => {
    const { sim, a, b } = duel();
    advance(sim, 2);
    expect(a.hp).toBe(a.maxHp);
    expect(b.hp).toBe(b.maxHp);
  });
  it("requires a bilateral declaration, ignores third parties, and ends damage immediately after peace", () => {
    const { sim, a, b } = duel();
    const neutral = {
      ...structuredClone(b),
      nation: "ITA",
      id: 99999,
      x: a.x + 0.1,
    };
    sim.state.units.push(neutral);
    expect(sim.declareWar("DEU")).toBeNull();
    expect(sim.atWar("DEU", "FRA")).toBe(true);
    expect(sim.atWar("FRA", "ITA")).toBe(false);
    sim.step(1);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(neutral.hp).toBe(neutral.maxHp);
    expect(sim.makePeace("DEU")).toBeNull();
    const hp = [a.hp, b.hp];
    advance(sim, 2);
    expect([a.hp, b.hp]).toEqual(hp);
    expect(sim.state.wars).toEqual([]);
    expect(sim.state.result).toBe("playing");
  });
  it("handles AI-versus-AI declarations without making every foreign country hostile to the player", () => {
    const sim = fresh();
    expect(sim.declareWar("ITA", "DEU")).toBeNull();
    expect(sim.atWar("DEU", "ITA")).toBe(true);
    expect(sim.atWar("FRA", "ITA")).toBe(false);
    expect(sim.enemiesOf("FRA")).toEqual([]);
    expect(sim.declareWar("FRA")).toMatch(/another/);
    expect(sim.declareWar("MISSING")).toMatch(/another/);
    expect(sim.declareWar("ITA", "DEU")).toMatch(/already/);
  });
  it("lets a developed, wealthy AI choose a war after the initial peace", () => {
    const sim = fresh(),
      nation = sim.state.nations.POL;
    nation.credits = 5000;
    nation.industry = 8;
    const site = sim.state.nodes.find(
      (n) =>
        n.nation === "POL" && !sim.placementError("barracks", n.x, n.z, "POL"),
    )!;
    expect(site).toBeTruthy();
    expect(sim.build("barracks", site.x, site.z, "POL")).toBeNull();
    sim.state.nodes
      .filter((n) => n.nation === "POL")
      .forEach((n) => (n.claimed = true));
    const soldier = sim.state.units.find((u) => u.nation === "POL")!;
    while (sim.nationArmy("POL") < 6)
      sim.state.units.push({
        ...structuredClone(soldier),
        id: sim.state.nextId++,
      });
    Object.values(sim.state.nations).forEach((n) => (n.nextActionAt = 10000));
    nation.nextActionAt = 0;
    sim.state.elapsed = 181;
    expect(sim.state.wars).toEqual([]);
    sim.step(1);
    expect(sim.state.wars.some((w) => w.a === "POL")).toBe(true);
    expect(sim.enemiesOf("FRA")).toEqual([]);
  });
  it("allows peaceful infrastructure investment and charges recruitment only once", () => {
    const sim = fresh(),
      original = sim.playerNation.credits,
      originalIncome = sim.income;
    expect(sim.investIndustry()).toBeNull();
    expect(sim.playerNation.credits).toBe(original - 160);
    expect(sim.income).toBe(originalIncome + 2);
    expect(sim.train("infantry")).toBeNull();
    expect(sim.playerNation.credits).toBe(original - 235);
    sim.paused = true;
    advance(sim, 4);
    expect(sim.playerNation.queue[0].remaining).toBe(4);
    expect(sim.playerNation.credits).toBe(original - 235);
    sim.paused = false;
    advance(sim, 4.1);
    expect(sim.playerUnits).toHaveLength(7);
    expect(sim.playerNation.queue).toHaveLength(0);
    expect(sim.train("armor")).toMatch(/barracks/);
  });
  it("blocks water orders and foreign construction, and mines only local resource nodes", () => {
    const sim = fresh();
    expect(sim.move([sim.playerUnits[0].id], [-1000, -1000])).toMatch(/map/);
    expect(sim.build("barracks", -1000, -1000)).toMatch(/land/);
    const german = cellPoint(
      grid,
      nationSpawn(
        grid,
        europe.countries.findIndex((c) => c.id === "DEU"),
      ),
    );
    expect(sim.build("barracks", ...german)).toMatch(/borders/);
    const node = sim.state.nodes.find((n) => n.nation === "FRA")!;
    const originalIncome = sim.income;
    expect(sim.build("mine", node.x, node.z)).toBeNull();
    expect(sim.income).toBe(originalIncome + 7);
    expect(node.claimed).toBe(true);
  });
  it("destroying an HQ alone does not capitulate a nation before its capital city and most cities are occupied", () => {
    const sim = fresh();
    sim.declareWar("DEU");
    sim.state.buildings.find((b) => b.nation === "DEU" && b.type === "hq")!.hp =
      0;
    const before = sim.state.units.filter((u) => u.nation === "DEU").length;
    sim.step(1);
    expect(sim.state.nations.DEU.defeated).toBe(false);
    expect(sim.state.units.filter((u) => u.nation === "DEU")).toHaveLength(
      before,
    );
    expect(sim.state.result).toBe("playing");
    expect(sim.territory.landCounts().DEU).toBeGreaterThan(0);
  });
  it("preserves pending worker orders during unrelated construction", () => {
    const sim = fresh(),
      unit = sim.playerUnits[0],
      home = sim.headquarters!;
    const requests = vi.fn();
    sim.requestPath = requests;
    expect(sim.move([unit.id], [home.x + 3, home.z])).toBeNull();
    const destination = unit.destination,
      order = unit.order;
    expect(destination).toBeTruthy();
    expect(unit.path).toHaveLength(0);
    const node = sim.state.nodes.find(
      (n) => n.nation === "FRA" && !sim.placementError("mine", n.x, n.z),
    )!;
    expect(node).toBeTruthy();
    expect(sim.build("mine", node.x, node.z)).toBeNull();
    expect(unit.order).toBe(order);
    expect(requests).toHaveBeenCalledTimes(1);
    expect(requests).toHaveBeenLastCalledWith(unit, destination);
    sim.stop([unit.id]);
    expect(unit.destination).toBeNull();
  });
});

describe("military doctrines", () => {
  it.each([
    ["balanced", 9],
    ["firepower", 11.25],
    ["maneuver", 7.65],
  ] as [DoctrineId, number][])(
    "%s applies real firepower modifiers",
    (doctrine, damage) => {
      const { sim, b } = duel();
      expect(sim.setDoctrine(doctrine)).toBeNull();
      sim.declareWar("DEU");
      sim.step(1);
      expect(b.maxHp - b.hp).toBeCloseTo(damage*2);
    },
  );
  it("reduces incoming damage under defensive doctrine", () => {
    const { sim, a } = duel();
    sim.setDoctrine("defensive");
    sim.declareWar("DEU");
    sim.step(1);
    expect(a.maxHp - a.hp).toBeCloseTo(7.2*2);
  });
  it("changes movement speed, locks doctrine during war, and enforces its cooldown", () => {
    const sim = fresh(),
      unit = sim.playerUnits[0],
      x = unit.x;
    expect(sim.setDoctrine("maneuver")).toBeNull();
    unit.path = [[x + 8, unit.z]];
    sim.step(1);
    expect(unit.x - x).toBeCloseTo(unitSpecs.infantry.speed * 1.3);
    expect(sim.setDoctrine("balanced")).toMatch(/60s/);
    advance(sim, 60);
    expect(sim.setDoctrine("defensive")).toBeNull();
    sim.declareWar("DEU");
    expect(sim.setDoctrine("firepower")).toMatch(/peacetime/);
  });
});

describe("persistence and legacy migration", () => {
  it("round-trips all national economies, wars, doctrine, and recruitment", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
    });
    const sim = fresh();
    sim.setDoctrine("defensive");
    sim.declareWar("DEU");
    sim.playerNation.credits = 431;
    sim.train("infantry");
    expect(saveCampaign(sim.state)).toBe(true);
    expect(savedCampaigns().europe).toEqual(sim.state);
    expect(restoreCampaign(europe, grid, savedCampaigns().europe)).toEqual(
      sim.state,
    );
    storage.set("worldrts.campaigns.v2", "bad json");
    expect(savedCampaigns()).toEqual({});
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(saveCampaign(sim.state)).toBe(false);
  });
  it("preserves old player progress while replacing the old hostile outpost with peaceful nations", () => {
    const old: LegacyCampaign = {
      version: 1,
      region: "europe",
      nation: "FRA",
      elapsed: 90,
      nextId: 999,
      credits: 431,
      supplies: 120,
      queue: [{ type: "infantry", remaining: 2, total: 4 }],
      result: "playing",
      units: initial.units
        .filter((u) => u.nation === "FRA")
        .map(({ nation, ...u }) => ({ ...u, hp: 55 })),
      buildings: initial.buildings
        .filter((b) => b.nation === "FRA")
        .map(({ nation, ...b }) => b),
      nodes: initial.nodes
        .filter((n) => n.nation === "FRA")
        .map(({ nation, ...n }) => n),
    };
    const state = restoreCampaign(europe, grid, old);
    expect(state.version).toBe(2);
    expect(state.elapsed).toBe(90);
    expect(state.nations.FRA.credits).toBe(431);
    expect(state.nations.FRA.queue[0].remaining).toBe(2);
    expect(
      state.units.filter((u) => u.nation === "FRA").every((u) => u.hp === 55),
    ).toBe(true);
    expect(Object.keys(state.nations)).toHaveLength(europe.countries.length);
    expect(state.wars).toEqual([]);
  });
});
