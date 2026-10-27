import { cellAt, cellPoint } from "./navigation";
import type { City, ContinentData, Grid, Point } from "./types";

export interface StrategicState {
  id: string;
  original: string;
  name: string;
  cells: number[];
  center: Point;
}

/** Connected gameplay provinces, seeded by cities and spaced inland points.
 * These are strategic states, not real-world administrative boundary data. */
export function createStates(data: ContinentData, grid: Grid, cities: City[]) {
  const membership = new Int32Array(grid.owners.length).fill(-1);
  const states: StrategicState[] = [];
  const queue: number[] = [];
  const seed = (cell: number, name?: string) => {
    if (cell < 0 || grid.owners[cell] < 0 || membership[cell] >= 0) return;
    const original = data.countries[grid.owners[cell]].id;
    membership[cell] = states.length;
    states.push({ id: String(cell), original, name: name ?? "", cells: [], center: cellPoint(grid, cell) });
    queue.push(cell);
  };
  for (const city of cities) seed(cellAt(grid, city.x, city.z), city.name);
  const spacing = Math.max(4, Math.round(12 / grid.cell));
  const candidates = new Map<string, { cell: number; distance: number }>();
  for (let i = 0; i < membership.length; i++) {
    if (grid.owners[i] < 0) continue;
    const x = i % grid.width, z = Math.floor(i / grid.width),
      bx = Math.floor(x / spacing), bz = Math.floor(z / spacing),
      key = `${grid.owners[i]}:${bx}:${bz}`,
      distance = (x - (bx + 0.5) * spacing) ** 2 + (z - (bz + 0.5) * spacing) ** 2;
    if (distance < (candidates.get(key)?.distance ?? Infinity)) candidates.set(key, { cell: i, distance });
  }
  for (const { cell } of candidates.values()) {
    const p = cellPoint(grid, cell), id = data.countries[grid.owners[cell]].id;
    if (!states.some((s) => s.original === id && Math.hypot(s.center[0] - p[0], s.center[1] - p[1]) < 6)) seed(cell);
  }
  const flood = () => {
    for (let n = 0; n < queue.length; n++) {
      const i = queue[n], x = i % grid.width, group = membership[i];
      states[group].cells.push(i);
      for (const j of [x > 0 ? i - 1 : -1, x < grid.width - 1 ? i + 1 : -1, i - grid.width, i + grid.width]) {
        if (j < 0 || j >= membership.length || membership[j] >= 0 || grid.owners[j] !== grid.owners[i]) continue;
        membership[j] = group;
        queue.push(j);
      }
    }
    queue.length = 0;
  };
  flood();
  // Disconnected islands always receive their own state.
  for (let i = 0; i < membership.length; i++)
    if (grid.owners[i] >= 0 && membership[i] < 0) { seed(i); flood(); }
  const numbering = new Map<string, number>();
  for (const s of states) {
    const number = (numbering.get(s.original) ?? 0) + 1;
    numbering.set(s.original, number);
    if (!s.name) s.name = `${data.countries.find((c) => c.id === s.original)!.name} · State ${number}`;
  }
  return { states, membership };
}
