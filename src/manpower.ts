/** Gameplay formation cap: six starting slots plus one per two million residents. */
export function populationCapacity(population: number): number {
  return Math.min(240, 6 + Math.floor(Math.max(0, population) / 2_000_000));
}
