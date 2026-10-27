import { allied, militaryAccess } from "./relations";
import { militaryPower, isShip } from "./geopolitics";
import { cellAt } from "./navigation";
import type { Campaign, Grid } from "./types";

export function landComponents(grid: Grid): Int32Array {
  const groups = new Int32Array(grid.walkable.length).fill(-1);
  let next = 0;
  for (let start = 0; start < groups.length; start++)
    if (grid.walkable[start] && groups[start] < 0) {
      const queue = [start];
      groups[start] = next;
      for (let q = 0; q < queue.length; q++) {
        const i = queue[q],
          x = i % grid.width;
        for (const j of [
          x > 0 ? i - 1 : -1,
          x < grid.width - 1 ? i + 1 : -1,
          i - grid.width,
          i + grid.width,
        ])
          if (
            j >= 0 &&
            j < groups.length &&
            grid.walkable[j] &&
            groups[j] < 0
          ) {
            groups[j] = next;
            queue.push(j);
          }
      }
      next++;
    }
  return groups;
}
export function warReadiness(
  state: Campaign,
  grid: Grid,
  components: Int32Array,
  actor: string,
  target: string,
  coastalOwners?: ReadonlySet<number>,
  controllerAt?: (i: number) => string | null,
) {
  const a = state.nations[actor],
    b = state.nations[target],
    power = a ? militaryPower(state, actor) : 0,
    enemyPower = b ? militaryPower(state, target) : 0;
  if (!a || !b || actor === target || a.defeated || b.defeated || allied(state, actor, target))
    return { ready: false, reason: "No active opponent", power, enemyPower };
  if (state.wars.some((w) => w.a === actor || w.b === actor))
    return {
      ready: false,
      reason: "Already committed to a war",
      power,
      enemyPower,
    };
  if (
    state.elapsed < 180 ||
    a.industry < 2 ||
    a.credits < 1200 ||
    a.supplies < 80
  )
    return {
      ready: false,
      reason: "Building economic reserves",
      power,
      enemyPower,
    };
  const ground = state.units.filter(
      (u) => u.nation === actor && !isShip(u.type) && u.hp > 0,
    ),
    fleet = state.units.filter(
      (u) => u.nation === actor && isShip(u.type) && u.hp > 0,
    );
  const start = a.capital ? cellAt(grid, ...a.capital) : -1,
    end = b.capital ? cellAt(grid, ...b.capital) : -1;
  let connected =
    start >= 0 &&
    end >= 0 &&
    components[start] >= 0 &&
    components[start] === components[end];
  const naval =
    fleet.some((u) => u.type === "transport") &&
    fleet.some((u) => u.type === "frigate") &&
    ground.length >= 4 &&
    (!coastalOwners || (end >= 0 && coastalOwners.has(grid.owners[end])));
  if (connected && controllerAt && ground.length >= 4 && power >= Math.max(400, enemyPower * 1.6)) {
    const visited = new Uint8Array(grid.owners.length), queue = [start];
    visited[start] = 1;
    for (let q = 0; q < queue.length && !visited[end]; q++) {
      const i = queue[q], x = i % grid.width;
      for (const j of [x > 0 ? i - 1 : -1, x < grid.width - 1 ? i + 1 : -1, i - grid.width, i + grid.width]) {
        if (j < 0 || j >= visited.length || visited[j] || !grid.walkable[j]) continue;
        const owner = controllerAt(j);
        if (owner !== target && !militaryAccess(state, actor, owner)) continue;
        visited[j] = 1; queue.push(j);
      }
    }
    connected = visited[end] === 1;
  }
  if (!connected && !naval)
    return {
      ready: false,
      reason: "No viable land or sea invasion route",
      power,
      enemyPower,
    };
  if (ground.length < 4 || power < Math.max(400, enemyPower * 1.6))
    return {
      ready: false,
      reason: "Insufficient military advantage",
      power,
      enemyPower,
    };
  return {
    ready: true,
    reason: connected
      ? "Funded land campaign with a military advantage"
      : "Fleet and troops ready for an overseas campaign",
    power,
    enemyPower,
  };
}
