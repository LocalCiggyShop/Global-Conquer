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
    id: "asia-pacific",
    name: "Asia & Oceania",
    code: "AS",
    center: [115, 10],
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
  {id:"americas",name:"Americas",code:"AM",center:[-85,10],defaultNation:"USA",description:"A connected theatre from the Arctic to the southern tip of South America."},
];
export const getRegion = (id:string)=>regions.find(r=>r.id===id)??regions[0];
