import {expandStacks,unitStacks} from "./unit-stacks";
import { cellAt, cellPoint, nearestOpen } from "./navigation";
import { isShip, troopSpace } from "./geopolitics";
import type { Campaign, Grid, Point, Unit } from "./types";

/** Boundary flood excludes lakes; ships use open ocean and connected coastal water. */
export function oceanNavigation(grid: Grid): Uint8Array {
  const mask = new Uint8Array(grid.owners.length),
    queue: number[] = [];
  const add = (i: number) => {
    if (i >= 0 && i < mask.length && grid.owners[i] < 0 && !mask[i]) {
      mask[i] = 1;
      queue.push(i);
    }
  };
  for (let x = 0; x < grid.width; x++) {
    add(x);
    add((grid.height - 1) * grid.width + x);
  }
  for (let z = 0; z < grid.height; z++) {
    add(z * grid.width);
    add(z * grid.width + grid.width - 1);
  }
  for (let n = 0; n < queue.length; n++) {
    const i = queue[n],
      x = i % grid.width;
    if (x > 0) add(i - 1);
    if (x < grid.width - 1) add(i + 1);
    add(i - grid.width);
    add(i + grid.width);
  }
  return mask;
}
export class Naval {
  readonly water: Uint8Array;
  readonly coasts: number[] = [];
  readonly coastalOwners = new Set<number>();
  private coastMask: Uint8Array;
  constructor(
    readonly state: Campaign,
    readonly grid: Grid,
    readonly land: () => Uint8Array,
    readonly request: (u: Unit, p: Point) => void,
    readonly canEnter: (nation: string, index: number) => boolean = () => true,
    prepared?:{water:Uint8Array;coastMask:Uint8Array;coasts:number[];coastalOwners:number[]},
  ) {
    if(prepared){this.water=prepared.water;this.coastMask=prepared.coastMask;this.coasts.push(...prepared.coasts);for(const i of prepared.coastalOwners)this.coastalOwners.add(i);return;}
    this.water = oceanNavigation(grid);
    this.coastMask = new Uint8Array(grid.owners.length);
    for (let i = 0; i < grid.owners.length; i++)
      if (grid.owners[i] >= 0) {
        const p = cellPoint(grid, i);
        if (nearestOpen(grid, this.water, ...p, 3) >= 0) {
          this.coastMask[i] = 1;
          this.coasts.push(i);
          this.coastalOwners.add(grid.owners[i]);
        }
      }
  }
  prepared(){return {water:this.water,coastMask:this.coastMask,coasts:this.coasts,coastalOwners:[...this.coastalOwners]};}
  isCoast(x: number, z: number) {
    const i = cellAt(this.grid, x, z);
    return i >= 0 && this.coastMask[i] === 1;
  }
  embark(ids: number[], nation = this.state.nation): string | null {
    ids=[...expandStacks(this.state.units,ids)];
    const troops = this.state.units.filter(
      (u) =>
        ids.includes(u.id) &&
        u.nation === nation &&
        u.hp > 0 &&
        !isShip(u.type) &&
        !u.embarkedOn,
    );
    if (!troops.length)
      return "Select ground troops near a friendly transport.";
    let count = 0;
    for (const group of unitStacks(troops).groups.values()) {
      const u=group[0],required=group.reduce((n,t)=>n+troopSpace(t.type),0);
      const ships = this.state.units
        .filter(
          (s) =>
            s.type === "transport" &&
            s.nation === nation &&
            s.hp > 0 &&
            Math.hypot(s.x - u.x, s.z - u.z) <= 4,
        )
        .sort(
          (a, b) =>
            Math.hypot(a.x - u.x, a.z - u.z) - Math.hypot(b.x - u.x, b.z - u.z),
        );
      for (const ship of ships) {
        ship.cargo ??= [];
        const used = ship.cargo.reduce(
          (s, id) =>
            s +
            troopSpace(
              this.state.units.find((t) => t.id === id)?.type ?? "infantry",
            ),
          0,
        );
        if (used + required > 6) continue;
        for(const u of group){
        delete u.frontline;
        u.embarkedOn = ship.id;
        u.order++;
        u.path = [];
        u.destination = null;
        ship.cargo.push(u.id);
        u.x = ship.x;
        u.z = ship.z;
        count++;
        }
        break;
      }
    }
    return count
      ? null
      : "Move troops within 4 map units of a friendly transport with free capacity (6 infantry / 3 armor). Split a stack manually if it cannot fit in one transport.";
  }
  disembark(
    ids: number[],
    target?: Point,
    nation = this.state.nation,
  ): string | null {
    if (target && !this.canEnter(nation, cellAt(this.grid, ...target))) return "Landings require ownership, an alliance, or declared war.";
    ids=[...expandStacks(this.state.units,ids)];
    let unloaded = 0;const landed=new Map<number,number>();
    const available = this.land().slice();
    for (const u of this.state.units)
      if (u.hp > 0 && !u.embarkedOn && !isShip(u.type)) {
        const i = cellAt(this.grid, u.x, u.z);
        if (i >= 0) available[i] = 0;
      }
    for (const ship of this.state.units.filter(
      (s) =>
        ids.includes(s.id) &&
        s.type === "transport" &&
        s.nation === nation &&
        s.hp > 0,
    )) {
      for (const id of [...(ship.cargo ?? [])]) {
        const troop = this.state.units.find((u) => u.id === id);
        if (!troop) continue;
        let index = troop.stackId!==undefined?(landed.get(troop.stackId)??-1):-1,
          best = Infinity;
        const center = cellAt(this.grid, ship.x, ship.z),
          radius = Math.ceil(4 / this.grid.cell);
        if(index<0)for (let dz = -radius; dz <= radius; dz++)
          for (let dx = -radius; dx <= radius; dx++) {
            const row = Math.floor(center / this.grid.width) + dz,
              col = (center % this.grid.width) + dx;
            if (
              row < 0 ||
              col < 0 ||
              row >= this.grid.height ||
              col >= this.grid.width
            )
              continue;
            const i = row * this.grid.width + col;
            if (!available[i] || !this.canEnter(nation, i)) continue;
            const p = cellPoint(this.grid, i);
            if (Math.hypot(p[0] - ship.x, p[1] - ship.z) > 4) continue;
            const d = Math.hypot(
              p[0] - (target?.[0] ?? ship.x),
              p[1] - (target?.[1] ?? ship.z),
            );
            if (d < best) {
              best = d;
              index = i;
            }
          }
        if (index < 0) continue;
        const p = cellPoint(this.grid, index);
        available[index] = 0;if(troop.stackId!==undefined)landed.set(troop.stackId,index);
        troop.x = p[0];
        troop.z = p[1];
        delete troop.embarkedOn;
        troop.path = [];
        troop.destination = null;
        ship.cargo = ship.cargo!.filter((c) => c !== id);
        unloaded++;
        if (target) {
          const end = nearestOpen(this.grid, this.land(), ...target, 5);
          if (end >= 0 && this.canEnter(nation, end)) {
            troop.destination = cellPoint(this.grid, end);
            troop.order++;
            this.request(troop, troop.destination);
          }
        }
      }
      if (!ship.cargo?.length) delete ship.landing;
    }
    return unloaded
      ? null
      : "Select a loaded transport within 4 map units of owned, allied, or hostile coast.";
  }
  landingDestination(ship: Unit, target: Point): Point | null {
    const center = cellAt(this.grid, ...target);
    if (center < 0 || !this.canEnter(ship.nation, center)) return null;
    const end = nearestOpen(
      this.grid,
      this.water,
      ...target,
      Math.ceil(4 / this.grid.cell),
    );
    if (end < 0) return null;
    ship.landing = target;
    return cellPoint(this.grid, end);
  }
  tick() {
    for (const ship of this.state.units.filter((u) => u.type === "transport")) {
      if (ship.landing && !this.canEnter(ship.nation, cellAt(this.grid, ...ship.landing))) delete ship.landing;
      for (const id of ship.cargo ?? []) {
        const troop = this.state.units.find((u) => u.id === id);
        if (troop) {
          troop.x = ship.x;
          troop.z = ship.z;
          if (ship.hp <= 0) troop.hp = 0;
        }
      }
      if (
        ship.hp > 0 &&
        ship.landing &&
        !ship.path.length &&
        (!ship.destination ||
          Math.hypot(
            ship.x - ship.destination[0],
            ship.z - ship.destination[1],
          ) < this.grid.cell)
      )
        this.disembark([ship.id], ship.landing, ship.nation);
    }
  }
}
