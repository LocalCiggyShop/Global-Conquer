export type Point = [number, number];
export type Ring = Point[];
export type Polygon = Ring[];
export interface Country {
  id: string;
  name: string;
  population?: number;
  populationYear?: number;
  flagCode?: string;
  polygons: Polygon[];
  bounds: [number, number, number, number];
}
export interface ContinentData {
  id: string;
  kmPerUnit?: number;
  countries: Country[];
  lakes: Polygon[];
  bounds: [number, number, number, number];
  cities?: CitySite[];
  places?: CitySite[];
  ports?: PortSite[];
}
export interface PortSite { id:string; name:string; nation:string; city:string; x:number; z:number; }
export interface CitySite {
  name: string;
  nation: string;
  x: number;
  z: number;
  population: number;
  capital: boolean;
}
export interface City extends CitySite {
  id: number;
  controller: string;
}
export interface IntelligenceMission {
  id: number;
  observer: string;
  target: string;
  kind: "recon" | "network";
  readyAt: number;
  expiresAt: number;
  failed?: boolean;
}
export interface OccupiedTile {
  controller: string;
  original: string;
  since: number;
  /** Nation this occupation was won from; may differ from historical borders. */
  opponent?: string;
  settled?: boolean;
}
export interface Region {
  id: string;
  name: string;
  code: string;
  center: Point;
  description: string;
  defaultNation: string;
}
export interface Grid {
  width: number;
  height: number;
  cell: number;
  x: number;
  z: number;
  owners: Int16Array;
  walkable: Uint8Array;
}
export interface Unit {
  id: number;
  nation: string;
  team: "player" | "enemy";
  type: "infantry" | "armor" | "frigate" | "transport";
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  path: Point[];
  destination?: Point | null;
  cooldown: number;
  order: number;
  embarkedOn?: number;
  cargo?: number[];
  landing?: Point;
  boarding?: number;
  leaderId?: number;
  orderMode?: "manual" | "frontline" | "ai";
  stackId?:number;
  stackSeparated?:boolean;
  routeFailed?:boolean;
  organization?: number;
  retreating?: boolean;
  tacticalOrder?: "move" | "attackMove" | "hold" | "fallback";
  waypoints?: Point[];
  trafficRetryAt?:number;
  blockedTicks?: number;
  lastMovedAt?: number;
  lastCombatAt?: number;
  lastFiredAt?: number;
  lastShotTarget?: Point;
  lastAttackerId?: number;
  underFireUntil?: number;
  frontline?: { target: string; anchor: Point; position: Point; objective?: Point; retryAt?: number };
}
export interface Building {
  mineLevel?:number;
  mineUpgrade?:{remaining:number;total:number};
  construction?:{completedDays:number;totalDays:number;nextTick:number;missing?:Commodity[]};
  recipe?: FactoryRecipeId;
  progress?: number;
  enabled?: boolean;
  mineral?: Mineral;
  rally?:Point;
  portId?: string;
  id: number;
  nation: string;
  team: "player" | "enemy";
  type: "hq" | "barracks" | "mine" | "dock" | "factory" | "depot";
  x: number;
  z: number;
  hp: number;
  maxHp: number;
}
export interface ResourceNode {
  mineral?: Mineral;
  nation: string;
  x: number;
  z: number;
  claimed: boolean;
}
export type Mineral = "iron" | "coal" | "copper" | "zinc" | "gold" | "diamonds";
export type Commodity = Mineral | "steel" | "electronics" | "consumerGoods";
export type FactoryRecipeId = "steel" | "electronics" | "consumer" | "jewelry" | "arms";
export type Stockpile = Record<Commodity, number>;
export interface TradeRecord {
  recurringId?: number;
  time: number; nation: string; partner: string; commodity: Commodity;
  side: "buy" | "sell"; quantity: number; total: number;
}
export interface RecurringTrade {
  id:number; nation:string; partner:string; commodity:Commodity; side:"buy"|"sell";
  quantity:number; nextTick:number; enabled:boolean; lastTick?:number; lastStatus?:string;
}
export interface WorldMarket { stock: Stockpile; trades: TradeRecord[]; recurring?:RecurringTrade[]; }
/** Player intent is saved immediately and applied at the next simulation tick. */
export type IdeologyId="nonAligned"|"democracy"|"liberalism"|"nationalism"|"fascism"|"socialism"|"communism";
export interface PeaceTerms { target:string; keepStates:string[]; reparations:number; demilitarize:boolean; }
export interface Treaty {a:string;b:string;until:number;payer?:string;recipient?:string;payment:number;remaining:number;zones:string[];}
export type GameCommand =
 | {kind:"research";branch:import("./technology").TechBranch}
 | {kind:"upgradeMine";id:number}
 | {kind:"mergeUnits"|"splitUnits";ids:number[]}
 | {kind:"fallbackLine";ids:number[];start:Point;end:Point}
 | {kind:"tactical";ids:number[];target?:Point;mode:"move"|"attackMove"|"hold"|"fallback";append?:boolean}
 | {kind:"rally";id:number;target:Point}
 | {kind:"peaceTerms";terms:PeaceTerms}
 | {kind:"objective";objective:"economy"|"regional"|"formable"}
 | {kind:"ideology";ideology:IdeologyId}
 | {kind:"civicPolicy";policy:"none"|"rights"|"welfare"}
 | {kind:"formNation";id:string}
 | {kind:"tradePolicy";policy:"free"|"balanced"|"closed"}
 | {kind:"industryPolicy";policy:"balanced"|"civilian"|"industrial"|"mobilized"}
 | {kind:"spending";value:number}
 | {kind:"embassy";target:string}
 | {kind:"resolveNews";id:number}
 | {kind:"shares";side:"buy"|"sell";quantity:number}
 | {kind:"build";type:Exclude<Building["type"],"hq">;x:number;z:number}
 | {kind:"train";type:Unit["type"]}
 | {kind:"trade";commodity:Commodity;side:"buy"|"sell";quantity:number;partner:string}
 | {kind:"factoryRecipe";id:number;recipe:FactoryRecipeId}
 | {kind:"factoryToggle";id:number}
 | {kind:"domesticSales";enabled:boolean}
 | {kind:"invest"}
 | {kind:"doctrine";doctrine:DoctrineId}
 | {kind:"war"|"peace";target:string}
 | {kind:"alliance";target:string;enabled:boolean}
 | {kind:"intelligence";target:string;mission:"recon"|"network"}
 | {kind:"counterIntelligence"}
 | {kind:"repairPort";id:string}
 | {kind:"embark"|"disembark";ids:number[]};
export type DoctrineId = "balanced" | "defensive" | "maneuver" | "firepower";
export interface TrainingOrder {
  type: Unit["type"];
  remaining: number;
  total: number;
  producer?: number;
}
export interface NationState {
  technology?:{levels:Partial<Record<import("./technology").TechBranch,number>>;active?:import("./technology").TechBranch;projects:Partial<Record<import("./technology").TechBranch,{progress:number;total:number}>>};
  instabilitySince?:number;
  lastUnrestAt?:number;
  fracturedAt?:number;
  breakaway?:{parent:string;province:string;name:string;population:number;bounds:[number,number,number,number]};
  lastConsumerSatisfied?:boolean;
  personality?:"builder"|"diplomat"|"expansionist"|"guardian";
  manpowerUsed?:number;
  formedNation?:string;
  ideology?:IdeologyId;stability?:number;politicalPower?:number;ideologyChangedAt?:number;civicPolicy?:"none"|"rights"|"welfare";consumerServed?:number;
  nextAllianceAt?:number;
  defenseReadiness?:{level:number;neighbor?:string;until:number;previousStances?:Record<number,LeaderStance>;previousSpending:number;previousPriority:NonNullable<NationState["industryPolicy"]>};
  tradePolicy?: "free"|"balanced"|"closed";
  industryPolicy?: "balanced"|"civilian"|"industrial"|"mobilized";
  stockHistory?:{tick:number;value:number}[];
  militarySpending?: number;
  stockIndex?: number;
  shares?: number;
  stockpile?: Stockpile;
  domesticSales?: boolean;
  commerceIncome?: number;
  id: string;
  credits: number;
  supplies: number;
  industry: number;
  reserves: number;
  capital: Point | null;
  doctrine: DoctrineId;
  doctrineChangedAt: number;
  nextActionAt: number;
  queue: TrainingOrder[];
  defeated: boolean;
  counterIntelUntil?: number;
  annexedBy?: string;
}
export type LeaderStance = "attack" | "defend";
export type LeaderBranch = "army" | "navy";
export interface MilitaryLeader {
  id: number;
  nation: string;
  branch: LeaderBranch;
  name: string;
  color: string;
  attack: number;
  defense: number;
  maneuver: number;
  experience: number;
  stance?: LeaderStance;
}
export interface War {
  a: string;
  b: string;
  since: number;
}
export interface Campaign {
  coreStates?:Record<string,string>;
  treaties?:Treaty[];
  resistance?:Record<string,{level:number;since:number}>;
  controlGroups?:Record<string,number[]>;
  objective?:{kind:"economy"|"regional"|"formable";completedAt?:number};
  affairs?: {relations:Record<string,number>;embassies:string[];news:NewsEvent[];nextNewsAt:number};
  clockVersion?:1;
  tickPhase?:number;
  pendingCommands?:GameCommand[];
  economyVersion?: 1;
  economyClock?: number;
  market?: WorldMarket;
  version: 2;
  portsInitialized?: boolean;
  region: string;
  nation: string;
  nations: Record<string, NationState>;
  wars: War[];
  alliances?: War[];
  leaders?: MilitaryLeader[];
  /** Strategic province controllers, keyed by stable navigation seed. */
  states?: Record<string, string>;
  stateOccupation?: Record<string, OccupiedTile>;
  elapsed: number;
  nextId: number;
  units: Unit[];
  buildings: Building[];
  nodes: ResourceNode[];
  result: "playing" | "victory" | "defeat";
  cities?: City[];
  occupation?: Record<string, OccupiedTile>;
  seaControl?: Record<string, OccupiedTile>;
  intelligence?: IntelligenceMission[];
}
export interface LegacyCampaign {
  version: 1;
  region: string;
  nation: string;
  credits: number;
  supplies: number;
  elapsed: number;
  nextId: number;
  units: Omit<Unit, "nation">[];
  buildings: Omit<Building, "nation">[];
  nodes: Omit<ResourceNode, "nation">[];
  queue: TrainingOrder[];
  result: Campaign["result"];
}

export interface NewsEvent {id:number;nation:string;target?:string;kind:"tension"|"nuclear"|"unrest"|"election"|"war"|"peace";title:string;story:string;severity:number;time:number;resolved?:boolean;escalated?:boolean;dismissed?:boolean;}
