import type { Campaign } from "./types";

/** Occupation cells are derived from strategic states; paths are rebuilt in the worker on resume. */
export function campaignSnapshot(state: Campaign): Campaign {
  const keys=state.states ? Object.keys(state.states) : null;
  const stateOccupation=state.stateOccupation ?? (keys && keys.every((id)=>state.occupation?.[id])
    ? Object.fromEntries(keys.map((id)=>[id,state.occupation![id]])) : undefined);
  return {
    ...state,
    stateOccupation,
    occupation: stateOccupation ? undefined : state.occupation,
    units: state.units.map((u) => ({ ...u, path: [], destination: u.destination ?? u.path.at(-1) ?? null })),
  };
}
