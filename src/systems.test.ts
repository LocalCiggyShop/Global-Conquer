import { describe, expect, it } from "vitest";
import { createCampaign, restoreCampaign, Simulation } from "./campaign";
import {
  cellAt,
  cellPoint,
  createGrid,
  findPath,
  nearestOpen,
} from "./navigation";
import { countryRankings, isShip, nationColor } from "./geopolitics";
import { warReadiness } from "./strategy";
import type { ContinentData, Point, Unit } from "./types";

const rectangle = (a: number, b: number, c: number, d: number): Point[] => [
  [a, b],
  [c, b],
  [c, d],
  [a, d],
];
const data: ContinentData = {
  id: "islands",
  bounds: [-20, -12, 20, 12],
  lakes: [],
  countries: [
    {
      id: "AAA",
      name: "Alpha",
      bounds: [-16, -8, -4, 8],
      polygons: [[rectangle(-16, -8, -4, 8)]],
    },
    {
      id: "BBB",
      name: "Beta",
      bounds: [4, -8, 16, 8],
      polygons: [[rectangle(4, -8, 16, 8)]],
    },
  ],
  cities: [
    {
      name: "Alpha City",
      nation: "AAA",
      x: -10,
      z: 0,
      population: 200000,
      capital: true,
    },
    {
      name: "Beta City",
      nation: "BBB",
      x: 10,
      z: 0,
      population: 200000,
      capital: true,
    },
    { name: "North Beta", nation: "BBB", x: 10, z: -6, population: 50000, capital: false },
    { name: "South Beta", nation: "BBB", x: 10, z: 6, population: 50000, capital: false },
  ],
};
const grid = createGrid(data, 44);
const fresh = () =>
  new Simulation(data, grid, createCampaign(data, grid, "AAA"));
function advance(sim: Simulation, seconds: number) {
  for (let i = 0; i < seconds - 0.0001; i += 0.05) sim.step(0.05);
}
function unit(
  sim: Simulation,
  type: Unit["type"],
  nation: string,
  x: number,
  z: number,
) {
  const u: Unit = {
    id: sim.state.nextId++,
    nation,
    team: nation === "AAA" ? "player" : "enemy",
    type,
    x,
    z,
    hp: type === "frigate" ? 280 : type === "transport" ? 180 : 90,
    maxHp: type === "frigate" ? 280 : type === "transport" ? 180 : 90,
    path: [],
    cooldown: 0,
    order: 0,
  };
  sim.state.units.push(u);
  return u;
}
function wirePaths(sim: Simulation) {
  sim.requestPath = (u, p) => {
    const mask = isShip(u.type) ? sim.naval.water : sim.walkable;
    u.path = findPath(
      grid,
      mask,
      nearestOpen(grid, mask, u.x, u.z),
      nearestOpen(grid, mask, ...p, 12),
    );
  };
}

describe("tactical visibility and intelligence", () => {
  it("hides distant units, reveals nearby ones, and hides embarked troops", () => {
    const sim = fresh(),
      foe = sim.state.units.find((u) => u.nation === "BBB")!;
    expect(sim.visibility.canSee("AAA", foe)).toBe(false);
    const scout = sim.playerUnits[0];
    scout.x = foe.x - 3;
    scout.z = foe.z;
    sim.visibility.refresh(true);
    expect(sim.visibility.canSee("AAA", foe)).toBe(true);
    foe.embarkedOn = 999;
    expect(sim.visibility.canSee("AAA", foe)).toBe(false);
  });
  it("charges intelligence once, waits for gathering, reveals live units, and expires", () => {
    const sim = fresh(),
      foe = sim.state.units.find((u) => u.nation === "BBB")!,
      credits = sim.playerNation.credits;
    expect(sim.visibility.launch("BBB", "recon")).toBeNull();
    expect(sim.playerNation.credits).toBe(credits - 120);
    expect(sim.visibility.launch("BBB", "recon")).toMatch(/already/);
    advance(sim, 7.8);
    expect(sim.visibility.canSee("AAA", foe)).toBe(false);
    advance(sim, 0.4);
    expect(sim.visibility.canSee("AAA", foe)).toBe(true);
    advance(sim, 30);
    expect(sim.visibility.canSee("AAA", foe)).toBe(false);
  });
  it("counterintelligence blocks remote missions without suppressing nearby scouts", () => {
    const sim = fresh();
    expect(sim.visibility.counter("BBB")).toBeNull();
    sim.visibility.launch("BBB", "network");
    advance(sim, 16);
    expect(sim.visibility.hasIntelligence("AAA", "BBB")).toBe(false);
    const foe = sim.state.units.find((u) => u.nation === "BBB")!,
      scout = sim.playerUnits[0];
    scout.x = foe.x - 2;
    scout.z = foe.z;
    sim.visibility.refresh(true);
    expect(sim.visibility.canSee("AAA", foe)).toBe(true);
  });
});
describe("naval warfare and transport", () => {
  it("routes ships through ocean and never through land or enclosed lakes", () => {
    const sim = fresh(),
      start = cellAt(grid, -2.5, 0.5),
      end = cellAt(grid, 2.5, 0.5),
      path = findPath(grid, sim.naval.water, start, end);
    expect(path.length).toBeGreaterThan(0);
    for (const p of path) expect(grid.owners[cellAt(grid, ...p)]).toBe(-1);
    const lakeData = { ...data, lakes: [[rectangle(-12, -3, -8, 3)]] };
    const lakeGrid = createGrid(lakeData, 44);
    const lakeSim = new Simulation(
      lakeData,
      lakeGrid,
      createCampaign(lakeData, lakeGrid, "BBB"),
    );
    expect(lakeSim.naval.water[cellAt(lakeGrid, -10, 0)]).toBe(0);
  });
  it("requires docks for ships and prevents inland dock placement", () => {
    const sim = fresh();
    expect(sim.train("frigate")).toMatch(/dock/);
    const hq = sim.headquarters!;
    expect(sim.placementError("dock", hq.x, hq.z)).not.toBeNull();
  });
  it("embarks within capacity, sails, lands on the other island, and occupies only the landed state", () => {
    const sim = fresh();
    sim.state.units = [];
    sim.state.buildings = [];
    sim.walkable = grid.walkable.slice();
    wirePaths(sim);
    const ship = unit(sim, "transport", "AAA", -2.5, 0.5),
      troops = Array.from({ length: 7 }, () =>
        unit(sim, "infantry", "AAA", -5.5, 0.5),
      );
    expect(sim.naval.embark(troops.map((u) => u.id))).toBeNull();
    expect(ship.cargo).toHaveLength(6);
    expect(troops.filter((u) => u.embarkedOn === ship.id)).toHaveLength(6);
    sim.declareWar("BBB");
    expect(sim.move([ship.id], [5.5, 0.5])).toBeNull();
    advance(sim, 12);
    expect(ship.cargo).toHaveLength(0);
    expect(troops.filter((u) => u.x > 4 && !u.embarkedOn)).toHaveLength(6);
    expect(
      Object.values(sim.state.occupation!).some(
        (t) => t.controller === "AAA" && t.original === "BBB",
      ),
    ).toBe(true);
    expect(sim.territory.controllerAt(cellAt(grid, 14, 5))).toBe("BBB");
  });
  it("ships fight ships only after war; sinking a transport also loses its cargo", () => {
    const sim = fresh();
    sim.state.units = [];
    const ship = unit(sim, "transport", "AAA", -0.5, 0.5),
      troop = unit(sim, "infantry", "AAA", -5.5, 0.5),
      foe = unit(sim, "frigate", "BBB", 1.5, 0.5);
    troop.embarkedOn = ship.id;
    ship.cargo = [troop.id];
    ship.hp = 1;
    advance(sim, 1);
    expect(ship.hp).toBe(1);
    sim.declareWar("BBB");
    sim.step(1);
    expect(
      sim.state.units.some((u) => u.id === ship.id || u.id === troop.id),
    ).toBe(false);
    expect(foe.hp).toBe(foe.maxHp);
  });
});
describe("territory, cities, national power and AI judgement", () => {
  it("leaves neutral territory alone, then captures a physically occupied state and its city during war", () => {
    const sim = fresh();
    sim.state.units = [];
    sim.state.buildings = [];
    sim.walkable = grid.walkable.slice();
    const city = sim.state.cities!.find((c) => c.nation === "BBB")!;
    unit(sim, "infantry", "AAA", city.x, city.z);
    advance(sim, 5.5);
    expect(city.controller).toBe("BBB");
    const income = sim.income;
    sim.declareWar("BBB");
    advance(sim, 5.5);
    expect(city.controller).toBe("AAA");
    expect(sim.income).toBeGreaterThan(income);
    expect(sim.territory.controllerAt(cellAt(grid, 14, 5))).toBe("BBB");
    expect(sim.state.nations.BBB.defeated).toBe(false);
    sim.makePeace("BBB");
    expect(city.controller).toBe("AAA");
  });
  it("tracks sea control independently of land ownership", () => {
    const sim = fresh();
    unit(sim, "frigate", "AAA", -0.5, 0.5);
    advance(sim, 0.3);
    const index = cellAt(grid, -0.5, 0.5);
    expect(sim.state.seaControl![index].controller).toBe("AAA");
    expect(sim.territory.controllerAt(index)).toBeNull();
  });
  it("keeps national colors unique and ranks resources, economic assets and military strength", () => {
    expect(
      new Set(data.countries.map((c) => nationColor(c.id, data))).size,
    ).toBe(2);
    const sim = fresh(),
      before = countryRankings(sim.state, data).find((r) => r.id === "BBB")!;
    unit(sim, "armor", "BBB", 10, 4);
    sim.state.nations.BBB.credits += 1000;
    const after = countryRankings(sim.state, data).find((r) => r.id === "BBB")!;
    expect(after.military).toBeGreaterThan(before.military);
    expect(after.resources).toBeGreaterThan(before.resources);
    expect(after.score).toBeGreaterThan(before.score);
  });
  it("requires economic reserves, military superiority and a viable naval route for an overseas war", () => {
    const sim = fresh();
    sim.state.elapsed = 181;
    sim.playerNation.credits = 5000;
    sim.playerNation.industry = 8;
    expect(
      warReadiness(
        sim.state,
        grid,
        sim.components,
        "AAA",
        "BBB",
        sim.naval.coastalOwners,
      ).ready,
    ).toBe(false);
    unit(sim, "frigate", "AAA", -1.5, 0.5);
    unit(sim, "transport", "AAA", -2.5, 1.5);
    expect(
      warReadiness(
        sim.state,
        grid,
        sim.components,
        "AAA",
        "BBB",
        sim.naval.coastalOwners,
      ).ready,
    ).toBe(true);
    sim.playerNation.supplies = 10;
    expect(
      warReadiness(
        sim.state,
        grid,
        sim.components,
        "AAA",
        "BBB",
        sim.naval.coastalOwners,
      ).ready,
    ).toBe(false);
  });
  it("preserves cargo, cities, occupied land, sea control and intelligence through a snapshot", () => {
    const sim = fresh();
    sim.visibility.launch("BBB", "network");
    const province = sim.territory.states.find((s) => s.original === "BBB")!;
    sim.state.states![province.id] = "AAA";
    for (const index of province.cells) sim.state.occupation![index] = {
      controller: "AAA", original: "BBB", since: sim.state.elapsed,
    };
    for (const city of sim.state.cities!)
      if (province.cells.includes(cellAt(grid, city.x, city.z))) city.controller = "AAA";
    unit(sim, "transport", "AAA", -0.5, 0.5).cargo = [];
    const snapshot = JSON.parse(JSON.stringify(sim.state));
    const restored = new Simulation(
      data,
      grid,
      restoreCampaign(data, grid, snapshot),
    );
    expect(restored.state.cities).toEqual(sim.state.cities);
    expect(restored.state.occupation).toEqual(sim.state.occupation);
    expect(restored.state.intelligence).toEqual(sim.state.intelligence);
    expect(restored.state.units.at(-1)?.cargo).toEqual([]);
  });
});
