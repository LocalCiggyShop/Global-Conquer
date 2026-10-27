import { atWar } from "./relations";
import type { Campaign, OccupiedTile } from "./types";

/** Settlement changes presentation only. Ownership, income, and access remain intact. */
export function activeOccupation(state: Campaign, occupation: OccupiedTile): boolean {
  return !occupation.settled && atWar(state, occupation.controller, occupation.opponent ?? occupation.original);
}
export function activeSeaControl(state: Campaign, controller: string, tile?: OccupiedTile): boolean {
  return !tile?.settled && state.wars.some((w) => w.a === controller || w.b === controller);
}
