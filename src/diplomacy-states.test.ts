import { describe, expect, it } from "vitest";
import { Simulation, createCampaign } from "./campaign";
import { createGrid, cellAt, cellPoint, findPath, nearestOpen } from "./navigation";
import { warReadiness } from "./strategy";
import type { Building, ContinentData, Point, Unit } from "./types";

const rectangle = (x: number, end: number): Point[] => [[x,-18],[end,-18],[end,18],[x,18]];
const data: ContinentData = {
  id: "treaties", bounds: [-54,-24,54,24], lakes: [],
  countries: [
    { id: "AAA", name: "Alpha", bounds: [-48,-18,-18,18], polygons: [[rectangle(-48,-18)]] },
    { id: "BBB", name: "Beta", bounds: [-18,-18,18,18], polygons: [[rectangle(-18,18)]] },
    { id: "CCC", name: "Gamma", bounds: [18,-18,48,18], polygons: [[rectangle(18,48)]] },
  ],
  cities: [
    { name: "Alpha City", nation: "AAA", x: -35, z: 0, population: 100000, capital: true },
    { name: "Beta Capital", nation: "BBB", x: -10, z: -10, population: 100000, capital: true },
    { name: "Beta South", nation: "BBB", x: -10, z: 10, population: 100000, capital: false },
    { name: "Beta East", nation: "BBB", x: 10, z: 0, population: 100000, capital: false },
    { name: "Gamma City", nation: "CCC", x: 35, z: 0, population: 100000, capital: true },
  ],
};
const grid = createGrid(data, 112);
function fresh() {
  const sim = new Simulation(data, grid, createCampaign(data, grid, "AAA"));
  sim.state.units = []; sim.state.buildings = []; sim.walkable = grid.walkable.slice();
  for (const n of Object.values(sim.state.nations)) n.nextActionAt = Infinity;
  sim.requestPath = (u, p) => {
    const mask = sim.landMask(u.nation);
    u.path = findPath(grid, mask, nearestOpen(grid, mask, u.x, u.z), nearestOpen(grid, mask, ...p, 3));
    if (!u.path.length) u.destination = null;
  };
  return sim;
}
function troop(sim: Simulation, nation: string, x: number, z = 0) {
  const u: Unit = { id: sim.state.nextId++, nation, team: nation === "AAA" ? "player" : "enemy", type: "infantry",
    x, z, hp: 90, maxHp: 90, cooldown: 0, order: 0, path: [] };
  sim.state.units.push(u); return u;
}
function building(sim: Simulation, nation: string, x: number, z: number) {
  const b: Building = { id: sim.state.nextId++, nation, team: nation === "AAA" ? "player" : "enemy", type: "barracks", x, z, hp: 400, maxHp: 400 };
  sim.state.buildings.push(b); return b;
}
function advance(sim: Simulation, seconds: number) {
  for (let t = 0; t < seconds; t += 0.05) sim.step(0.05);
}

describe("alliances, visibility, frontlines and strategic states", () => {
  it("accelerates supplies with infrastructure and extractors", () => {
    const sim = fresh(), baseline = sim.supplyIncome("AAA"), before = sim.playerNation.supplies;
    expect(baseline).toBeGreaterThanOrEqual(3);
    advance(sim, 1);
    expect(sim.playerNation.supplies).toBeGreaterThanOrEqual(before + 3);
    sim.playerNation.industry = 2;
    const mine = building(sim, "AAA", -35, 5); mine.type = "mine";
    expect(sim.supplyIncome("AAA")).toBe(baseline + 2);
  });
  it("closes neutral borders, grants mutual alliance access, rejects allied war, and withdraws stranded troops", () => {
    const sim = fresh(), u = troop(sim, "AAA", -25);
    expect(sim.move([u.id], [0,0])).toMatch(/access/);
    expect(sim.setAlliance("BBB", true)).toBeNull();
    expect(sim.canEnter("BBB", cellAt(grid, -25,0))).toBe(true);
    expect(sim.declareWar("BBB")).toMatch(/alliance/);
    expect(sim.move([u.id], [-10,0])).toBeNull();
    advance(sim, 6);
    expect(sim.territory.controllerAt(cellAt(grid,u.x,u.z))).toBe("BBB");
    expect(sim.setAlliance("BBB", false)).toBeNull();
    expect(sim.territory.controllerAt(cellAt(grid,u.x,u.z))).toBe("AAA");
    expect(u.path).toHaveLength(0);
  });
  it("routes around closed borders and blocks old paths and neutral landings", () => {
    const sim = fresh(), u = troop(sim, "AAA", -19.5);
    sim.declareWar("CCC");
    expect(sim.move([u.id], [30,0])).toBeNull();
    expect(u.path).toHaveLength(0); // Beta separates Alpha from Gamma.
    u.path = [[-17.5,0]];
    advance(sim, 1);
    expect(u.x).toBe(-19.5);
    const ship = troop(sim,"AAA",-20,-20); ship.type = "transport";
    expect(sim.naval.landingDestination(ship, [0,0])).toBeNull();
    expect(sim.naval.disembark([ship.id], [0,0])).toMatch(/Landings/);
    sim.makePeace("CCC");
    expect(sim.canEnter("AAA", cellAt(grid,30,0))).toBe(false);
  });
  it("hides buildings unless own sensors or sufficient intelligence reveal them", () => {
    const sim = fresh(), target = building(sim,"BBB",0,0);
    expect(sim.visibility.canSeeBuilding("AAA", target)).toBe(false);
    const sensor = building(sim,"AAA",-6,0);
    sim.visibility.refresh(true);
    expect(sim.visibility.canSeeBuilding("AAA",target)).toBe(true);
    sensor.hp = 0; sim.visibility.refresh(true);
    expect(sim.visibility.canSeeBuilding("AAA",target)).toBe(false);
    const scout = troop(sim,"AAA",-6);
    sim.visibility.refresh(true);
    expect(sim.visibility.canSeeBuilding("AAA",target)).toBe(true);
    scout.embarkedOn = 999; sim.visibility.refresh(true);
    expect(sim.visibility.canSeeBuilding("AAA",target)).toBe(false);
    expect(sim.visibility.launch("BBB","recon")).toBeNull();
    sim.state.elapsed += 8;
    expect(sim.visibility.canSeeBuilding("AAA",target)).toBe(true);
    sim.state.elapsed += 31;
    expect(sim.visibility.canSeeBuilding("AAA",target)).toBe(false);
  });
  it("spreads infantry along the selected border without invading, and cancels with Stop", () => {
    const sim = fresh(), units = [troop(sim,"AAA",-25,-5),troop(sim,"AAA",-25,5)];
    expect(sim.frontline(units.map((u)=>u.id),[-18,0])).toBeNull();
    expect(units[0].frontline!.position).not.toEqual(units[1].frontline!.position);
    for (const u of units) {
      expect(u.frontline!.target).toBe("BBB");
      expect(sim.territory.controllerAt(cellAt(grid,...u.frontline!.position))).toBe("AAA");
    }
    advance(sim, 9);
    expect(units.every((u)=>sim.territory.controllerAt(cellAt(grid,u.x,u.z)) === "AAA")).toBe(true);
    sim.stop(units.map((u)=>u.id));
    expect(units.every((u)=>!u.frontline)).toBe(true);
  });
  it("captures only a physically occupied state, pauses for defenders, and resets interrupted occupation", () => {
    const sim = fresh(); sim.declareWar("BBB");
    const city = sim.state.cities!.find((c)=>c.name === "Beta East")!,
      province = sim.territory.stateAt(cellAt(grid,city.x,city.z))!;
    const attacker = troop(sim,"AAA",city.x,city.z), defender = troop(sim,"BBB",city.x+5,city.z);
    advance(sim, 5.5);
    expect(city.controller).toBe("BBB");
    defender.hp = 0; attacker.hp = 90;
    advance(sim, 0.5);
    attacker.embarkedOn = 999;
    advance(sim, 0.5);
    delete attacker.embarkedOn;
    advance(sim, 0.5);
    expect(city.controller).toBe("BBB");
    advance(sim, 0.8);
    expect(city.controller).toBe("AAA");
    expect(province.cells.every((i)=>sim.territory.controllerAt(i) === "AAA")).toBe(true);
    const untouched = sim.territory.states.find((s)=>s.original === "BBB" && s !== province)!;
    expect(sim.territory.controllerAt(untouched.cells[0])).toBe("BBB");
    expect(sim.state.nations.BBB.defeated).toBe(false);
  });
  it("requires the capital AND a majority of cities, then annexes land and infrastructure and surrenders the army", () => {
    const sim = fresh(); sim.declareWar("BBB");
    const cities = sim.state.cities!.filter((c)=>c.nation === "BBB"), capital = cities.find((c)=>c.capital)!;
    troop(sim,"AAA",capital.x,capital.z);
    const army = troop(sim,"BBB",15,15), factory = building(sim,"BBB",14,12);
    sim.requestPath = () => {}; // Keep the defending army in its unoccupied eastern state.
    advance(sim, 5.5);
    expect(capital.controller).toBe("AAA");
    expect(sim.state.nations.BBB.defeated).toBe(false);
    const other = cities.find((c)=>!c.capital)!;
    troop(sim,"AAA",other.x,other.z);
    advance(sim, 6);
    expect(sim.state.nations.BBB.annexedBy).toBe("AAA");
    expect(sim.state.nations.BBB.defeated).toBe(true);
    expect(cities.every((c)=>c.controller === "AAA")).toBe(true);
    expect(sim.territory.landCounts().BBB ?? 0).toBe(0);
    expect(factory.nation).toBe("AAA");
    expect(army.hp).toBe(0);
    expect(sim.state.wars.some((w)=>w.a === "BBB" || w.b === "BBB")).toBe(false);
    const restored = new Simulation(data,grid,sim.state);
    expect(restored.state.states).toEqual(sim.state.states);
    expect(restored.state.occupation).toEqual(sim.state.occupation);
    expect(restored.state.nations.BBB.annexedBy).toBe("AAA");
    expect(restored.territory.landCounts()).toEqual(sim.territory.landCounts());
  });
  it("does not capitulate from a city majority while the capital is held, and applies capitulation to the player", () => {
    const sim = fresh(); sim.declareWar("BBB");
    for (const c of sim.state.cities!.filter((c)=>c.nation === "BBB" && !c.capital)) troop(sim,"AAA",c.x,c.z);
    advance(sim, 6);
    expect(sim.state.nations.BBB.defeated).toBe(false);
    sim.state.units = [];
    const home = sim.state.cities!.find((c)=>c.nation === "AAA")!;
    troop(sim,"BBB",home.x,home.z);
    sim.requestPath = () => {};
    advance(sim, 6);
    expect(sim.state.nations.AAA.annexedBy).toBe("BBB");
    expect(sim.state.result).toBe("defeat");
  });
  it("unloads only onto accessible shores and cancels access when an alliance ends", () => {
    const sim = fresh(), ship = troop(sim,"AAA",-10,-20), cargo = troop(sim,"AAA",-10,-20);
    ship.type = "transport"; ship.cargo = [cargo.id]; cargo.embarkedOn = ship.id;
    const coast: Point = [-10,-16];
    expect(sim.naval.disembark([ship.id],coast)).toMatch(/Landings/);
    expect(ship.cargo).toHaveLength(1);
    sim.setAlliance("BBB",true);
    expect(sim.naval.disembark([ship.id],coast)).toBeNull();
    expect(cargo.embarkedOn).toBeUndefined();
    expect(sim.territory.controllerAt(cellAt(grid,cargo.x,cargo.z))).toBe("BBB");
    sim.setAlliance("BBB",false);
    expect(sim.territory.controllerAt(cellAt(grid,cargo.x,cargo.z))).toBe("AAA");
  });
  it("AI leaders reject allied opponents and wars separated by inaccessible neutral territory", () => {
    const sim = fresh(); sim.state.elapsed = 181;
    sim.playerNation.industry = 3; sim.playerNation.credits = 3000;
    for(let i=0;i<10;i++) troop(sim,"AAA",-35,i);
    const judge = (target: string) => warReadiness(sim.state,grid,sim.components,"AAA",target,sim.naval.coastalOwners,(i)=>sim.territory.controllerAt(i));
    expect(judge("CCC").ready).toBe(false);
    sim.setAlliance("BBB",true);
    expect(judge("BBB").ready).toBe(false);
    expect(judge("CCC").ready).toBe(true);
  });
});
