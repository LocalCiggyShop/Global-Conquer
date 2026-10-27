import { cellAt, cellPoint, nearestOpen } from "./navigation";
import { createStates, type StrategicState } from "./states";
import { isShip } from "./geopolitics";
import type { Campaign, ContinentData, Grid, Point } from "./types";

export interface OwnershipChange { previous:string; next:string; cells:readonly number[]; }
export class Territory {
  controlChanges:OwnershipChange[]=[];
  private pressure = new Map<number, { nation: string; progress: number }>();
  private timer = 0;
  revision = 0;
  landRevision = 0;
  seaRevision = 0;
  private summaryRevision = -1;
  private readonly counts: Record<string, number> = {};
  private readonly incomes: Record<string, number> = {};
  private readonly populations: Record<string, number> = {};
  private readonly originalCells = new Map<string, number>();
  private readonly originalPopulation = new Map<string, number>();
  readonly states: StrategicState[];
  readonly membership: Int32Array;
  constructor(
    readonly state: Campaign,
    readonly data: ContinentData,
    readonly grid: Grid,
    readonly atWar: (a: string, b: string) => boolean,
    readonly changed: () => void,
    prepared?:{states:StrategicState[];membership:Int32Array},
  ) {
    state.occupation ??= {};
    state.seaControl ??= {};
    if (!state.cities) {
      state.cities = [];
      for (const nation of Object.values(state.nations)) {
        const owner = data.countries.findIndex((c) => c.id === nation.id),
          own = grid.walkable.map((v, i) =>
            v && grid.owners[i] === owner ? 1 : 0,
          );
        const sites = (data.cities ?? []).filter((c) => c.nation === nation.id);
        if (!sites.length && nation.capital)
          sites.push({
            name: (data.countries[owner]?.name ?? nation.id) + " Capital",
            nation: nation.id,
            x: nation.capital[0],
            z: nation.capital[1],
            population: 100000,
            capital: true,
          });
        for (const site of sites) {
          const index = nearestOpen(grid, own, site.x, site.z, 6);
          if (index < 0) continue;
          const p = cellPoint(grid, index);
          if (
            state.cities.some(
              (c) =>
                c.nation === nation.id &&
                Math.hypot(c.x - p[0], c.z - p[1]) < 1.5,
            )
          )
            continue;
          state.cities.push({
            ...site,
            id: state.nextId++,
            x: p[0],
            z: p[1],
            controller: this.controllerAt(index) ?? nation.id,
          });
        }
      }
    }
    for (const nation of Object.values(state.nations)) {
      const cities = state.cities!.filter((c) => c.nation === nation.id);
      if (cities.length && !cities.some((c) => c.capital)) cities[0].capital = true;
    }
    const generated = prepared ?? createStates(data, grid, state.cities!);
    this.states = generated.states;
    this.membership = generated.membership;
    if (!state.states) {
      state.states = {};
      // Older saves migrate partial occupation by majority within each state.
      for (const province of this.states) {
        const votes = new Map<string, number>();
        for (const i of province.cells) {
          const owner = state.occupation![i]?.controller ?? province.original;
          votes.set(owner, (votes.get(owner) ?? 0) + 1);
        }
        const winner = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (winner && winner !== province.original) state.states[province.id] = winner;
      }
    }
    for (const c of data.countries) {
      this.originalPopulation.set(c.id, c.population ?? Math.max(1_000_000, state.cities!.filter((city) => city.nation === c.id).reduce((n, city) => n + city.population, 0)));
    }
    for (const province of this.states) this.originalCells.set(province.original, (this.originalCells.get(province.original) ?? 0) + province.cells.length);
    const previousOccupation = state.occupation, previousStates = state.stateOccupation ?? {};
    state.occupation = {};
    state.stateOccupation = {};
    for (const province of this.states) {
      const previous = previousStates[province.id] ?? previousOccupation[province.id];
      this.writeState(province, this.stateController(province), previous?.since ?? state.elapsed, previous?.opponent, previous?.settled, false);
    }
    this.syncAssets();
  }
  stateAt(index: number): StrategicState | undefined {
    return index >= 0 ? this.states[this.membership[index]] : undefined;
  }
  stateController(province: StrategicState): string {
    return this.state.states![province.id] ?? province.original;
  }
  private writeState(province: StrategicState, nation: string, since = this.state.elapsed, opponent?: string, settled = false, transferAssets = true) {
    const previous=this.stateController(province);
    if(previous!==nation)this.controlChanges.push({previous,next:nation,cells:province.cells});
    if (nation === province.original) delete this.state.states![province.id];
    else this.state.states![province.id] = nation;
    const record = { controller: nation, original: province.original, since, ...(opponent ? { opponent } : {}), ...(settled ? { settled: true } : {}) };
    if (nation === province.original) delete this.state.stateOccupation![province.id];
    else this.state.stateOccupation![province.id] = record;
    for (const i of province.cells) {
      if (nation === province.original) delete this.state.occupation![i];
      else this.state.occupation![i] = record;
    }
    if (transferAssets) this.syncAssets(province);
  }
  private syncAssets(province?: StrategicState) {
    for (const c of this.state.cities!)
      if (!province || this.stateAt(cellAt(this.grid, c.x, c.z)) === province) c.controller = this.controllerAt(cellAt(this.grid, c.x, c.z)) ?? c.controller;
    for (const b of this.state.buildings)
      if (b.hp > 0 && (!province || this.stateAt(cellAt(this.grid, b.x, b.z)) === province)) {
        b.nation = this.controllerAt(cellAt(this.grid, b.x, b.z)) ?? b.nation;
        b.team = b.nation === this.state.nation ? "player" : "enemy";
      }
    for (const node of this.state.nodes)
      if (!province || this.stateAt(cellAt(this.grid, node.x, node.z)) === province) node.nation = this.controllerAt(cellAt(this.grid, node.x, node.z)) ?? node.nation;
  }
  annex(loser: string, victor: string) {
    this.controlChanges=[];
    for (const province of this.states)
      if (province.original === loser || this.stateController(province) === loser) this.writeState(province, victor, this.state.elapsed, loser, true, false);
    this.syncAssets();
    for (const tile of Object.values(this.state.seaControl!))
      if (tile.controller === loser) { tile.controller = victor; tile.settled = true; this.seaRevision++; }
    this.pressure.clear();
    this.landRevision++;
    this.revision++;
    this.changed();
  }
  controllerAt(index: number): string | null {
    if (
      index < 0 ||
      index >= this.grid.owners.length ||
      this.grid.owners[index] < 0
    )
      return null;
    return (
      this.state.occupation![index]?.controller ??
      this.data.countries[this.grid.owners[index]].id
    );
  }
  ownsFootprint(id: string, indices: number[]) {
    return (
      indices.length > 0 && indices.every((i) => this.controllerAt(i) === id)
    );
  }
  private summarize() {
    if (this.summaryRevision === this.landRevision) return;
    this.summaryRevision = this.landRevision;
    for (const id of Object.keys(this.state.nations)) { this.counts[id] = 0; this.incomes[id] = 0; this.populations[id] = 0; }
    for (const province of this.states) {
      const id = this.stateController(province);
      this.counts[id] = (this.counts[id] ?? 0) + province.cells.length;
      this.populations[id] = (this.populations[id] ?? 0) + (this.originalPopulation.get(province.original) ?? 0) * province.cells.length / this.originalCells.get(province.original)!;
    }
    for (const [id, population] of this.originalPopulation)
      if (!this.originalCells.has(id) && !this.state.nations[id]?.defeated) this.populations[id] = population;
    for (const city of this.state.cities!) this.incomes[city.controller] = (this.incomes[city.controller] ?? 0) + Math.max(1, Math.min(4, Math.ceil(city.population / 2_000_000)));
  }
  cityIncome(id: string) { this.summarize(); return this.incomes[id] ?? 0; }
  population(id: string) { this.summarize(); return Math.round(this.populations[id] ?? 0); }
  landCounts() { this.summarize(); return this.counts; }
  tick(dt: number) {
    this.timer += dt;
    if (this.timer < 0.25) return;
    const elapsed = this.timer;
    this.timer = 0;
    this.controlChanges=[];
    const claims = new Map<number, Set<string>>(),
      ships = new Map<number, Set<string>>();
    for (const u of this.state.units)
      if (u.hp > 0 && !u.embarkedOn) {
        const center = cellAt(this.grid, u.x, u.z);
        if (center < 0) continue;
        if (isShip(u.type)) {
          if (this.grid.owners[center] >= 0) continue;
          const set = ships.get(center) ?? new Set<string>();
          set.add(u.nation);
          ships.set(center, set);
        } else {
          if (!this.grid.walkable[center]) continue;
          const province = this.membership[center];
          if (province < 0) continue;
          const set = claims.get(province) ?? new Set<string>();
          set.add(u.nation);
          claims.set(province, set);
        }
      }
    let changed = false;
    for (const [index, nations] of claims) {
      const province = this.states[index];
      const current = this.stateController(province);
      const candidates = [...nations].filter(
        (n) => n !== current && this.atWar(n, current),
      );
      if (
        candidates.length !== 1 ||
        [...nations].some((n) => this.atWar(n, candidates[0]))
      ) {
        this.pressure.delete(index);
        continue;
      }
      const nation = candidates[0],
        old = this.pressure.get(index),
        progress = (old?.nation === nation ? old.progress : 0) + elapsed;
      if (progress < 1) {
        this.pressure.set(index, { nation, progress });
        continue;
      }
      this.writeState(province, nation, this.state.elapsed, current);
      this.landRevision++;
      this.pressure.delete(index);
      changed = true;
    }
    for (const key of this.pressure.keys())
      if (!claims.has(key)) this.pressure.delete(key);
    for (const [index, nations] of ships) {
      const current = this.state.seaControl![index]?.controller;
      if (nations.size !== 1) continue;
      const nation = [...nations][0];
      if (current === nation || (current && !this.atWar(nation, current)))
        continue;
      this.state.seaControl![index] = {
        controller: nation,
        original: "",
        since: this.state.elapsed,
        ...(current ? { opponent: current } : {}),
        settled: !this.state.wars.some((w) => w.a === nation || w.b === nation),
      };
      this.seaRevision++;
      changed = true;
    }
    if (changed) {
      this.revision++;
      this.changed();
    }
  }
}
