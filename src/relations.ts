import type { Campaign } from "./types";

export function allied(state: Campaign, a: string, b: string): boolean {
  return a === b || (state.alliances ?? []).some(
    (p) => (p.a === a && p.b === b) || (p.a === b && p.b === a),
  );
}
export function atWar(state: Campaign, a: string, b: string): boolean {
  return a !== b && state.wars.some(
    (p) => (p.a === a && p.b === b) || (p.a === b && p.b === a),
  );
}
export function militaryAccess(state: Campaign, nation: string, controller: string | null): boolean {
  return controller !== null && (allied(state, nation, controller) || atWar(state, nation, controller));
}
