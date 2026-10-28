import type { Building, ContinentData, Grid, Point, Polygon } from "./types";

export function pointInRing(x: number, z: number, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > z !== b[1] > z &&
      x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

export function pointInPolygon(
  x: number,
  z: number,
  polygon: Polygon,
): boolean {
  return (
    pointInRing(x, z, polygon[0]) &&
    !polygon.slice(1).some((r) => pointInRing(x, z, r))
  );
}

function rasterize(grid: Grid, polygons: Polygon[], value: number) {
  for (const polygon of polygons) {
    const minZ = Math.min(...polygon[0].map((p) => p[1]));
    const maxZ = Math.max(...polygon[0].map((p) => p[1]));
    const first = Math.max(0, Math.floor((minZ - grid.z) / grid.cell));
    const last = Math.min(
      grid.height - 1,
      Math.ceil((maxZ - grid.z) / grid.cell),
    );
    for (let row = first; row <= last; row++) {
      const z = grid.z + (row + 0.5) * grid.cell;
      const crossings: number[] = [];
      for (const ring of polygon) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[i],
            b = ring[j];
          if (a[1] > z !== b[1] > z)
            crossings.push(a[0] + ((z - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
        }
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        const start = Math.max(
          0,
          Math.ceil((crossings[i] - grid.x) / grid.cell - 0.5),
        );
        const end = Math.min(
          grid.width - 1,
          Math.floor((crossings[i + 1] - grid.x) / grid.cell - 0.5),
        );
        for (let col = start; col <= end; col++)
          grid.owners[row * grid.width + col] = value;
      }
    }
  }
}

export function createGrid(data: ContinentData, resolution = 256): Grid {
  const [minX, minZ, maxX, maxZ] = data.bounds;
  const cell = Math.max(maxX - minX, maxZ - minZ) / (resolution - 4);
  const width = Math.ceil((maxX - minX) / cell) + 4;
  const height = Math.ceil((maxZ - minZ) / cell) + 4;
  const grid: Grid = {
    width,
    height,
    cell,
    x: minX - 2 * cell,
    z: minZ - 2 * cell,
    owners: new Int16Array(width * height).fill(-1),
    walkable: new Uint8Array(width * height),
  };
  data.countries.forEach((c, i) => rasterize(grid, c.polygons, i));
  rasterize(grid, data.lakes, -1);
  // Cell centres already come from the land polygons. Eroding every coast by
  // another cell erased narrow peninsulas such as Jutland at continent scale.
  // A* still rejects water and prevents diagonal corner cutting.
  for(let i=0;i<grid.owners.length;i++)grid.walkable[i]=grid.owners[i]>=0?1:0;
  return grid;
}

export function cellAt(grid: Grid, x: number, z: number): number {
  const col = Math.floor((x - grid.x) / grid.cell),
    row = Math.floor((z - grid.z) / grid.cell);
  return col < 0 || row < 0 || col >= grid.width || row >= grid.height
    ? -1
    : row * grid.width + col;
}

export function cellPoint(grid: Grid, index: number): Point {
  return [
    grid.x + ((index % grid.width) + 0.5) * grid.cell,
    grid.z + (Math.floor(index / grid.width) + 0.5) * grid.cell,
  ];
}

export function footprintCells(
  grid: Grid,
  x: number,
  z: number,
  radius = 0.42,
): number[] {
  const minCol = Math.floor((x - radius - grid.x) / grid.cell),
    maxCol = Math.floor((x + radius - grid.x) / grid.cell);
  const minRow = Math.floor((z - radius - grid.z) / grid.cell),
    maxRow = Math.floor((z + radius - grid.z) / grid.cell);
  if (minCol < 0 || minRow < 0 || maxCol >= grid.width || maxRow >= grid.height)
    return [];
  const cells: number[] = [];
  for (let row = minRow; row <= maxRow; row++)
    for (let col = minCol; col <= maxCol; col++)
      cells.push(row * grid.width + col);
  return cells;
}

/** Structures are traversable; geography and diplomacy still constrain routes. */
export function blockedGrid(grid: Grid, _buildings: Building[]): Uint8Array {
  return grid.walkable.slice();
}

export function nearestOpen(
  grid: Grid,
  walkable: Uint8Array,
  x: number,
  z: number,
  maxRadius = 8,
): number {
  const center = cellAt(grid, x, z);
  if (center < 0) return -1;
  if (walkable[center]) return center;
  const cx = center % grid.width,
    cy = Math.floor(center / grid.width);
  for (let radius = 1; radius <= maxRadius; radius++) {
    let best = -1,
      distance = Infinity;
    for (let dz = -radius; dz <= radius; dz++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
        const col = cx + dx,
          row = cy + dz;
        if (col < 0 || row < 0 || col >= grid.width || row >= grid.height)
          continue;
        const i = row * grid.width + col;
        const p = cellPoint(grid, i),
          d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
        if (walkable[i] && d < distance) {
          best = i;
          distance = d;
        }
      }
    if (best >= 0) return best;
  }
  return -1;
}

export function findPath(
  grid: Grid,
  walkable: Uint8Array,
  start: number,
  end: number,
): Point[] {
  if (start < 0 || end < 0 || !walkable[start] || !walkable[end]) return [];
  if (start === end) return [cellPoint(grid, end)];
  const scores = new Float64Array(walkable.length).fill(Infinity);
  const previous = new Int32Array(walkable.length).fill(-1);
  const closed = new Uint8Array(walkable.length);
  const tx = end % grid.width,
    ty = Math.floor(end / grid.width);
  const heuristic = (i: number) => {
    const dx = Math.abs((i % grid.width) - tx),
      dy = Math.abs(Math.floor(i / grid.width) - ty);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  // Binary heap allows large continent grids without sorting the open set.
  const heap: { i: number; f: number }[] = [];
  const push = (item: { i: number; f: number }) => {
    heap.push(item);
    let n = heap.length - 1;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (heap[p].f <= item.f) break;
      heap[n] = heap[p];
      n = p;
    }
    heap[n] = item;
  };
  const pop = () => {
    const first = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      let n = 0;
      while (n * 2 + 1 < heap.length) {
        let child = n * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].f < heap[child].f)
          child++;
        if (last.f <= heap[child].f) break;
        heap[n] = heap[child];
        n = child;
      }
      heap[n] = last;
    }
    return first.i;
  };
  scores[start] = 0;
  push({ i: start, f: heuristic(start) });
  while (heap.length) {
    const current = pop();
    if (closed[current]) continue;
    if (current === end) {
      const path: Point[] = [];
      for (let i = end; i !== start; i = previous[i])
        path.push(cellPoint(grid, i));
      return path.reverse();
    }
    closed[current] = 1;
    const cx = current % grid.width,
      cy = Math.floor(current / grid.width);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const x = cx + dx,
          y = cy + dz;
        if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) continue;
        const next = y * grid.width + x;
        if (!walkable[next] || closed[next]) continue;
        if (
          dx &&
          dz &&
          (!walkable[current + dx] || !walkable[current + dz * grid.width])
        )
          continue;
        const cost = scores[current] + (dx && dz ? Math.SQRT2 : 1);
        if (cost < scores[next]) {
          scores[next] = cost;
          previous[next] = current;
          push({ i: next, f: cost + heuristic(next) });
        }
      }
  }
  return [];
}

export function connectedCells(grid: Grid, start: number): number[] {
  const seen = new Uint8Array(grid.walkable.length),
    queue = [start];
  seen[start] = 1;
  for (let n = 0; n < queue.length; n++) {
    const i = queue[n],
      col = i % grid.width;
    for (const j of [
      col > 0 ? i - 1 : -1,
      col < grid.width - 1 ? i + 1 : -1,
      i - grid.width,
      i + grid.width,
    ]) {
      if (j >= 0 && j < seen.length && grid.walkable[j] && !seen[j]) {
        seen[j] = 1;
        queue.push(j);
      }
    }
  }
  return queue;
}

export function hasClearance(grid: Grid, cell: number, radius = 2): boolean {
  const col = cell % grid.width,
    row = Math.floor(cell / grid.width);
  if (
    col < radius ||
    row < radius ||
    col >= grid.width - radius ||
    row >= grid.height - radius
  )
    return false;
  for (let dz = -radius; dz <= radius; dz++)
    for (let dx = -radius; dx <= radius; dx++)
      if (grid.owners[cell + dz * grid.width + dx] < 0) return false;
  return true;
}

export function nationSpawn(
  grid: Grid,
  owner: number,
  requireOpponent = false,
): number {
  let best = -1,
    bestScore = -Infinity;
  const candidates: number[] = [];
  for (let i = 0; i < grid.owners.length; i++)
    if (grid.owners[i] === owner && grid.walkable[i]) {
      const p = cellPoint(grid, i),
        footprint = footprintCells(grid, ...p);
      if (
        footprint.length &&
        footprint.every((cell) => grid.owners[cell] === owner)
      )
        candidates.push(i);
    }
  if (!candidates.length) return -1;
  const seen = new Set<number>(),
    candidateSet = new Set(candidates);
  let largest: number[] = [],
    component: number[] = [];
  for (const i of candidates) {
    if (seen.has(i)) continue;
    const cells = connectedCells(grid, i);
    cells.forEach((c) => seen.add(c));
    const eligible = cells.filter((c) => candidateSet.has(c));
    if (eligible.length > largest.length) {
      largest = eligible;
      component = cells;
    }
  }
  const cx = largest.reduce((s, i) => s + (i % grid.width), 0) / largest.length;
  const cy =
    largest.reduce((s, i) => s + Math.floor(i / grid.width), 0) /
    largest.length;
  for (const i of largest) {
    const score = -(
      ((i % grid.width) - cx) ** 2 +
      (Math.floor(i / grid.width) - cy) ** 2
    );
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  if (requireOpponent && best >= 0) {
    const home = cellPoint(grid, best);
    if (
      !component.some((i) => {
        const p = cellPoint(grid, i);
        const footprint = footprintCells(grid, ...p);
        return (
          Math.hypot(p[0] - home[0], p[1] - home[1]) > 6 &&
          footprint.length > 0 &&
          footprint.every((cell) => grid.owners[cell] >= 0)
        );
      })
    )
      return -1;
  }
  return best;
}

/** Validate existing routes after control or obstacles change, including diagonal corner clearance. */
export function routeCellsClear(grid:Grid,from:Point,path:Point[],allowed:(index:number)=>boolean):boolean {
  let previous=cellAt(grid,...from);
  for(const point of path) {
    const index=cellAt(grid,...point);
    if(index<0||!allowed(index))return false;
    const dx=index%grid.width-previous%grid.width,dz=Math.floor(index/grid.width)-Math.floor(previous/grid.width);
    if(Math.abs(dx)===1&&Math.abs(dz)===1&&(!allowed(previous+dx)||!allowed(previous+dz*grid.width)))return false;
    previous=index;
  }
  return true;
}
