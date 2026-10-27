import { isShip } from "./geopolitics";
import type { Campaign, LeaderBranch, LeaderStance, MilitaryLeader, Unit } from "./types";

const colors = ["#65d5b5", "#edb46b", "#73b8f1", "#c49bf1", "#f2849c", "#d2d779", "#66cfde", "#ed9470"];
const callsigns = { army: ["Atlas", "Sentinel", "Vanguard", "Orion"], navy: ["Mariner", "Horizon", "Triton", "Beacon"] };
export const branchOf = (unit: Pick<Unit, "type">): LeaderBranch => isShip(unit.type) ? "navy" : "army";

/** Foreign, dead, duplicate, and embarked IDs cannot influence selection voting. Ties favor army. */
export function majoritySelection(state: Campaign, ids: Iterable<number>, nation = state.nation) {
  const selected = new Set(ids);
  const units = state.units.filter((u) => selected.has(u.id) && u.nation === nation && u.hp > 0 && !u.embarkedOn);
  const army = units.filter((u) => branchOf(u) === "army");
  const navy = units.filter((u) => branchOf(u) === "navy");
  const branch: LeaderBranch = navy.length > army.length ? "navy" : "army";
  return { branch, army: army.length, navy: navy.length, units: branch === "army" ? army : navy, total: units.length };
}
export function leaderLevel(leader: MilitaryLeader): number {
  return Math.min(5, 1 + Math.floor(leader.experience / 250));
}
export function leaderBonuses(leader?: MilitaryLeader) {
  if (!leader) return { damage: 1, received: 1, speed: 1 };
  const growth = (leaderLevel(leader) - 1) * 0.01;
  return { damage: 1 + leader.attack * 0.02 + growth, received: 1 - leader.defense * 0.02 - growth, speed: 1 + leader.maneuver * 0.02 + growth };
}

export class MilitaryCommand {
  private readonly byId = new Map<number, MilitaryLeader>();
  constructor(readonly state: Campaign) {
    state.leaders ??= [];
    for (const leader of state.leaders) { leader.stance ??= leader.nation === state.nation && leader.branch === "army" ? "defend" : "attack"; this.byId.set(leader.id, leader); }
    for (const nation of Object.values(state.nations)) {
      if (nation.defeated) continue;
      for (const branch of ["army", "navy"] as const)
        if (!state.leaders.some((l) => l.nation === nation.id && l.branch === branch)) {
          this.create(branch, nation.id);
          this.create(branch, nation.id);
        }
    }
    for (const u of state.units) {
      if (u.leaderId !== undefined && !this.forUnit(u)) delete u.leaderId;
      if (u.nation !== state.nation && u.leaderId === undefined) this.assignAI(u);
    }
  }
  get(id: number | undefined) { return id === undefined ? undefined : this.byId.get(id); }
  forUnit(unit: Unit) {
    const leader = this.get(unit.leaderId);
    return leader?.nation === unit.nation && leader.branch === branchOf(unit) ? leader : undefined;
  }
  create(branch: LeaderBranch, nation = this.state.nation): MilitaryLeader | null {
    if (!this.state.nations[nation] || this.state.nations[nation].defeated) return null;
    const existing = this.state.leaders!.filter((l) => l.nation === nation && l.branch === branch);
    if (existing.length >= 8) return null;
    const index = existing.length, name = callsigns[branch][index % callsigns[branch].length];
    const leader: MilitaryLeader = {
      id: this.state.nextId++, nation, branch,
      name: `${branch === "army" ? "General" : "Admiral"} ${name}${index >= 4 ? " II" : ""}`,
      color: colors[(index + (branch === "navy" ? 2 : 0)) % colors.length],
      stance: nation === this.state.nation && branch === "army" ? "defend" : "attack",
      attack: index % 2 ? 2 : 4, defense: index % 2 ? 4 : 2, maneuver: 3, experience: 0,
    };
    this.state.leaders!.push(leader); this.byId.set(leader.id, leader);
    return leader;
  }
  assignAI(unit: Unit) {
    const leader = this.state.leaders!.find((l) => l.nation === unit.nation && l.branch === branchOf(unit));
    if (leader) unit.leaderId = leader.id;
  }
  assign(ids: Iterable<number>, leaderId: number): { error: string | null; ids: number[]; branch: LeaderBranch } {
    const selection = majoritySelection(this.state, ids), leader = this.get(leaderId);
    const fail = (error: string) => ({ error, ids: [], branch: selection.branch });
    if (this.state.result !== "playing") return fail("This campaign has ended.");
    if (!selection.total) return fail("Select your units first.");
    if (!leader || leader.nation !== this.state.nation) return fail("Choose one of your military leaders.");
    if (leader.branch !== selection.branch) return fail(`The majority selection requires an ${selection.branch === "army" ? "army general" : "admiral"}.`);
    for (const u of selection.units) u.leaderId = leader.id;
    return { error: null, ids: selection.units.map((u) => u.id), branch: selection.branch };
  }
  stance(unit: Unit): LeaderStance {
    const leader = this.forUnit(unit);
    return leader?.branch === "army" ? leader.stance ?? "defend" : unit.frontline ? "defend" : "attack";
  }
  setStance(id: number, stance: LeaderStance): string | null {
    const leader = this.get(id);
    if (!leader || leader.nation !== this.state.nation || leader.branch !== "army") return "Choose one of your army generals.";
    if (stance !== "attack" && stance !== "defend") return "Choose Attack or Defend.";
    if (this.state.result !== "playing") return "This campaign has ended.";
    leader.stance = stance; return null;
  }
  setColor(id: number, color: string): string | null {
    const leader = this.get(id);
    if (!leader || leader.nation !== this.state.nation) return "Choose one of your military leaders.";
    if (!/^#[0-9a-f]{6}$/i.test(color)) return "Choose a valid colour.";
    leader.color = color.toLowerCase();
    return null;
  }
  force(id: number) { return this.state.units.filter((u) => u.leaderId === id && u.hp > 0 && this.forUnit(u)?.id === id); }
  bonuses(unit: Unit) { return leaderBonuses(this.forUnit(unit)); }
  recordDamage(unit: Unit, damage: number) {
    const leader = this.forUnit(unit);
    if (leader && damage > 0) leader.experience += damage;
  }
}
