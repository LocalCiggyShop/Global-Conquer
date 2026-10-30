import type { Building, Campaign, TrainingOrder, Unit } from "./types";

export function canProduce(building: Building, type: Unit["type"]): boolean {
  return type === "frigate" || type === "transport"
    ? building.type === "dock"
    : type === "armor"
      ? building.type === "barracks"
      : building.type === "hq" || building.type === "barracks";
}

export function productionBuildings(
  state: Campaign,
  nation: string,
  type?: Unit["type"],
) {
  return state.buildings.filter(
    (b) =>
      b.nation === nation &&
      b.hp > 0 && !b.construction &&
      (type
        ? canProduce(b, type)
        : ["hq", "barracks", "dock"].includes(b.type)),
  );
}

/** Productive economy improves throughput; a large idle treasury alone does not. */
export function productionRate(
  state: Campaign,
  nation: string,
  income: number,
): number {
  return Math.min(
    2.5,
    1 + state.nations[nation].industry * 0.08 + Math.max(0, income - 3) * 0.015,
  );
}

export function productionQueueLimit(state: Campaign, nation: string): number {
  return Math.min(
    30,
    Math.max(5, productionBuildings(state, nation).length * 3),
  );
}

/** Each live building owns one slot; ship types share docks, land types share barracks. */
export function advanceProduction(
  state: Campaign,
  nation: string,
  dt: number,
  income: number,
  spawn: (type: Unit["type"], building: Building) => boolean,
): Unit["type"][] {
  const n = state.nations[nation];
  if (!n.queue.length) return [];
  const factories = productionBuildings(state, nation);
  const byId = new Map(factories.map((b) => [b.id, b])),
    busy = new Set<number>();
  for (const order of n.queue) {
    const b =
      order.producer === undefined ? undefined : byId.get(order.producer);
    if (!b || !canProduce(b, order.type) || busy.has(b.id))
      delete order.producer;
    else busy.add(b.id);
  }
  for (const order of n.queue)
    if (order.producer === undefined) {
      // Prefer headquarters for infantry, preserving specialized barracks for armor.
      const choices = factories
        .filter((b) => !busy.has(b.id) && canProduce(b, order.type))
        .sort(
          (a, b) =>
            Number(b.type === "hq") - Number(a.type === "hq") || a.id - b.id,
        );
      if (choices[0]) {
        order.producer = choices[0].id;
        busy.add(choices[0].id);
      }
    }
  const completed = new Set<TrainingOrder>(),
    ready: Unit["type"][] = [],
    rate = productionRate(state, nation, income);
  for (const order of n.queue) {
    const b =
      order.producer === undefined ? undefined : byId.get(order.producer);
    if (!b) continue;
    order.remaining = Math.max(0, order.remaining - dt * rate);
    if (order.remaining === 0 && spawn(order.type, b)) {
      completed.add(order);
      ready.push(order.type);
    }
  }
  n.queue = n.queue.filter((q) => !completed.has(q));
  return ready;
}
