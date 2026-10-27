import type { DoctrineId } from "./types";

export const doctrines: Record<
  DoctrineId,
  {
    name: string;
    description: string;
    speed: number;
    damage: number;
    received: number;
  }
> = {
  balanced: {
    name: "Balanced",
    description: "Flexible forces. Standard speed, firepower, and protection.",
    speed: 1,
    damage: 1,
    received: 1,
  },
  defensive: {
    name: "Defensive",
    description: "Take 20% less damage. Units move 15% slower.",
    speed: 0.85,
    damage: 1,
    received: 0.8,
  },
  maneuver: {
    name: "Maneuver",
    description: "Units move 30% faster. Deal 15% less damage.",
    speed: 1.3,
    damage: 0.85,
    received: 1,
  },
  firepower: {
    name: "Firepower",
    description: "Deal 25% more damage. Units move 15% slower.",
    speed: 0.85,
    damage: 1.25,
    received: 1,
  },
};
