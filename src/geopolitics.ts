import {commodities,commodityIds} from "./economy";
import { doctrines } from "./doctrines";
import type { Campaign, ContinentData } from "./types";

/** Muted reference-map colors; current national identities and borders are retained. */
const referenceColors: Record<string, string> = {
  FRA: "#566d91",
  DEU: "#59605c",
  GBR: "#aa737d",
  RUS: "#756b80",
  ESP: "#c7b37d",
  PRT: "#6b876e",
  ITA: "#587153",
  POL: "#b88f8e",
  CZE: "#8094a3",
  SVK: "#8a9daa",
  HUN: "#a39a88",
  ROU: "#c4b36e",
  BGR: "#838d67",
  GRC: "#91a4bd",
  SRB: "#6c7d90",
  HRV: "#798b98",
  BIH: "#657c89",
  SVN: "#87979f",
  MNE: "#728296",
  MKD: "#77869c",
  ALB: "#a06861",
  KOS: "#7d8792",
  IRL: "#8b9f75",
  NLD: "#c0a774",
  BEL: "#d0c185",
  LUX: "#b3a08b",
  CHE: "#b28b83",
  AUT: "#aaa397",
  DNK: "#a67479",
  NOR: "#a397a6",
  SWE: "#8d9fae",
  FIN: "#c3c9c4",
  ISL: "#a2b2bb",
  EST: "#aaa79f",
  LVA: "#a18e91",
  LTU: "#c2b581",
  UKR: "#b7a16e",
  BLR: "#8b7b86",
  MDA: "#9c9783",
  TUR: "#9e9179",
  GEO: "#9b8a7d",
  ARM: "#a68b80",
  AZE: "#8e9483",
  USA: "#8292a7",
  CAN: "#99939e",
  MEX: "#758b71",
  CUB: "#a79d83",
  GTM: "#8a9c87",
  PAN: "#a5977d",
  BRA: "#5f7757",
  ARG: "#a0a5b8",
  CHL: "#9a9dad",
  URY: "#96aab5",
  PRY: "#b4a381",
  BOL: "#a5a07b",
  PER: "#b5b38b",
  ECU: "#849578",
  COL: "#bbb38c",
  VEN: "#98a47c",
  CHN: "#c8b47d",
  JPN: "#b48b86",
  KOR: "#b79a91",
  PRK: "#9b8b8c",
  MNG: "#8f858b",
  IND: "#b18b83",
  PAK: "#a68b82",
  BGD: "#b09282",
  AUS: "#a7a18a",
  NZL: "#a4a79a",
  IDN: "#aa9980",
  MYS: "#a98c80",
  PHL: "#929eac",
  THA: "#9b9e8b",
  VNM: "#8394a0",
  IRN: "#a5a68e",
  IRQ: "#b49d8e",
  SAU: "#9aa48a",
  ZAF: "#b8ad80",
  EGY: "#b39b89",
  ETH: "#b6b285",
  COD: "#c4b67d",
  KEN: "#aa897f",
  NGA: "#a5817b",
  GHA: "#a4897c",
  DZA: "#7c90a4",
  MAR: "#8798a7",
  TUN: "#92a0ac",
  MLI: "#8296a9",
  SEN: "#8ba1b0",
  NER: "#879bae",
  TCD: "#91a1ae",
  CAF: "#8397a3",
  MDG: "#7e909f",
  ATA: "#bdc7cc",
};
const palettes = new WeakMap<ContinentData, Map<string, string>>();
export function nationColor(id: string, data: ContinentData): string {
  if (referenceColors[id]) return referenceColors[id];
  const existing = palettes.get(data);
  if (existing?.has(id)) return existing.get(id)!;
  const index = [...id].reduce((n, c) => n * 31 + c.charCodeAt(0), 0);
  const hue = (index * 137.508 + 18) % 360,
    s = 0.18,
    l = 0.57;
  const a = s * Math.min(l, 1 - l),
    f = (n: number) => {
      const k = (n + hue / 30) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
  const color =
    "#" +
    [f(0), f(8), f(4)]
      .map((v) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");
  const palette = existing ?? new Map<string, string>();
  palette.set(id, color);
  palettes.set(data, palette);
  return color;
}
export const isShip = (type: string) =>
  type === "frigate" || type === "transport";
export const troopSpace = (type: string) => (type === "armor" ? 2 : 1);
export function militaryPower(state: Campaign, id: string): number {
  const doctrine = doctrines[state.nations[id].doctrine];
  return Math.round(
    (state.units
      .filter((u) => u.nation === id && u.hp > 0)
      .reduce(
        (s, u) =>
          s +
          u.hp *
            (u.type === "armor"
              ? 1.4
              : u.type === "frigate"
                ? 1.6
                : u.type === "transport"
                  ? 0.2
                  : 1),
        0,
      ) *
      doctrine.damage) /
      doctrine.received +
      state.nations[id].reserves * 45,
  );
}
export function countryRankings(state: Campaign, data: ContinentData) {
  return Object.values(state.nations)
    .map((n) => {
      const cities =
        state.cities?.filter((c) => c.controller === n.id).length ?? 0;
      const resources = Math.round(n.credits + n.supplies * 2 + commodityIds.reduce((sum,id)=>sum+(n.stockpile?.[id]??0)*commodities[id].price,0));
      const economy =
        n.industry * 180 +
        cities * 120 +
        state.buildings
          .filter((b) => b.nation === n.id && b.hp > 0)
          .reduce(
            (v, b) =>
              v + (b.type === "factory" ? 420 : b.type === "mine" ? 230 : b.type === "dock" ? 190 : 100),
            0,
          );
      const military = militaryPower(state, n.id);
      return {
        id: n.id,
        name: data.countries.find((c) => c.id === n.id)?.name ?? n.id,
        resources,
        economy,
        military,
        score: n.defeated
          ? 0
          : Math.round(resources * 0.25 + economy + military * 1.5),
        defeated: n.defeated,
      };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
