import { isShip } from "./geopolitics";
import type { Building, Campaign, Point, Unit } from "./types";

export class Visibility {
  private buckets = new Map<
    string,
    { nation: string; x: number; z: number; range: number }[]
  >();
  private refreshedAt = -Infinity;
  constructor(readonly state: Campaign) {
    state.intelligence ??= [];
  }
  refresh(force = false) {
    if (!force && this.state.elapsed - this.refreshedAt < 0.15) return;
    this.refreshedAt = this.state.elapsed;
    this.buckets.clear();
    const add = (nation: string, x: number, z: number, range: number) => {
      const key = Math.floor(x / 12) + "," + Math.floor(z / 12);
      const bucket = this.buckets.get(key) ?? [];
      bucket.push({ nation, x, z, range });
      this.buckets.set(key, bucket);
    };
    for (const b of this.state.buildings)
      if (b.hp > 0) add(b.nation, b.x, b.z, b.type === "hq" ? 10 : 7);
    for (const u of this.state.units)
      if (u.hp > 0 && !u.embarkedOn)
        add(u.nation, u.x, u.z, isShip(u.type) ? 12 : 8);
  }
  hasIntelligence(observer: string, target: string) {
    return (
      observer === target ||
      (this.state.intelligence ?? []).some(
        (m) =>
          m.observer === observer &&
          m.target === target &&
          !m.failed &&
          m.readyAt <= this.state.elapsed &&
          m.expiresAt > this.state.elapsed &&
          (this.state.nations[target]?.counterIntelUntil ?? 0) <=
            this.state.elapsed,
      )
    );
  }
  seesPoint(observer: string, point: Point): boolean {
    this.refresh();
    const bx = Math.floor(point[0] / 12),
      bz = Math.floor(point[1] / 12);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++)
        for (const sensor of this.buckets.get(bx + dx + "," + (bz + dz)) ?? [])
          if (
            sensor.nation === observer &&
            Math.hypot(sensor.x - point[0], sensor.z - point[1]) <= sensor.range
          )
            return true;
    return false;
  }
  canSee(observer: string, unit: Unit): boolean {
    if (unit.hp <= 0 || unit.embarkedOn) return false;
    return (
      unit.nation === observer ||
      this.hasIntelligence(observer, unit.nation) ||
      this.seesPoint(observer, [unit.x, unit.z])
    );
  }
  canSeeBuilding(observer: string, building: Building): boolean {
    return building.hp > 0 && (building.nation === observer ||
      this.hasIntelligence(observer, building.nation) ||
      this.seesPoint(observer, [building.x, building.z]));
  }
  launch(
    target: string,
    kind: "recon" | "network",
    observer = this.state.nation,
  ): string | null {
    const nation = this.state.nations[observer],
      opponent = this.state.nations[target],
      cost = kind === "recon" ? 120 : 250;
    if (!nation || !opponent || target === observer || opponent.defeated)
      return "Choose an active foreign nation.";
    if (this.state.result !== "playing") return "This battle has ended.";
    if (
      this.state.intelligence!.some(
        (m) =>
          m.observer === observer &&
          m.target === target &&
          !m.failed &&
          m.expiresAt > this.state.elapsed,
      )
    )
      return "An intelligence operation is already running for this nation.";
    if (nation.credits < cost)
      return "Not enough credits for this intelligence operation.";
    nation.credits -= cost;
    const readyAt = this.state.elapsed + (kind === "recon" ? 8 : 15);
    this.state.intelligence!.push({
      id: this.state.nextId++,
      observer,
      target,
      kind,
      readyAt,
      expiresAt: readyAt + (kind === "recon" ? 30 : 90),
    });
    return null;
  }
  counter(observer = this.state.nation): string | null {
    const n = this.state.nations[observer];
    if ((n.counterIntelUntil ?? 0) > this.state.elapsed)
      return "Counterintelligence is already active.";
    if (n.credits < 150) return "Counterintelligence needs 150 credits.";
    n.credits -= 150;
    n.counterIntelUntil = this.state.elapsed + 45;
    return null;
  }
  tick() {
    for (const m of this.state.intelligence!)
      if (
        !m.failed &&
        m.readyAt <= this.state.elapsed &&
        (this.state.nations[m.target]?.counterIntelUntil ?? 0) >
          this.state.elapsed
      )
        m.failed = true;
    this.state.intelligence = this.state.intelligence!.filter(
      (m) =>
        m.expiresAt > this.state.elapsed ||
        (m.failed && m.readyAt + 10 > this.state.elapsed),
    );
    this.refresh();
  }
}
