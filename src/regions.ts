import type { Region } from "./types";

export const regions: Region[] = [
  {
    id: "europe",
    name: "Europe",
    code: "EU",
    center: [18, 53],
    defaultNation: "FRA",
    description:
      "Close borders. Countless possibilities. Establish a foothold at the crossroads of the old world.",
  },
  {
    id: "asia",
    name: "Asia",
    code: "AS",
    center: [100, 38],
    defaultNation: "CHN",
    description:
      "Vast frontiers and ambitious neighbors. Build an empire across the world’s largest continent.",
  },
  {
    id: "africa",
    name: "Africa",
    code: "AF",
    center: [20, 2],
    defaultNation: "ZAF",
    description:
      "Rich resources and wide-open horizons. Connect your territories and command a rising continent.",
  },
  {
    id: "north-america",
    name: "North America",
    code: "NA",
    center: [-103, 44],
    defaultNation: "USA",
    description:
      "From northern wilderness to southern coasts. Secure your heartland and expand your influence.",
  },
  {
    id: "south-america",
    name: "South America",
    code: "SA",
    center: [-62, -21],
    defaultNation: "BRA",
    description:
      "A continent of natural abundance. Control the interior and forge a path to the coast.",
  },
  {
    id: "oceania",
    name: "Oceania",
    code: "OC",
    center: [144, -24],
    defaultNation: "AUS",
    description:
      "An ocean of opportunity. Establish your command on land and protect your island strongholds.",
  },
  {
    id: "antarctica",
    name: "Antarctica",
    code: "AN",
    center: [0, -85],
    defaultNation: "ATA",
    description:
      "The final frontier. A fictional expedition sandbox on the frozen southern continent.",
  },
];
export const getRegion = (id: string) =>
  regions.find((r) => r.id === id) ?? regions[0];
