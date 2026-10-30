import {buildingsOverlap} from "./building-placement";
import {techLevel,techCombat,selectResearch,advanceResearch,upgradeMine,advanceMineUpgrades} from "./technology";
import {trafficCells} from "./traffic-route";
import {fragmentationDue,restoreBreakaways,breakawayCountry,stateBounds} from "./fragmentation";
import {landStrengths,canAiAdvance} from "./ai-offense";
import {Logistics} from "./logistics";
import {initializeStrategy,recoverUnit,activeTruce,objectiveProgress} from "./strategic-systems";
import {UnitPositions,unitStacks,personnel,lockNearbyStacks,expandStacks,MAX_STACK_UNITS,compatible} from "./unit-stacks";
import {initializePolitics,ideologyOf,stabilityEffect,changeIdeology,changeCivicPolicy,politicsDay} from "./politics";
import {formationProgress,formedName} from "./formables";
import {chooseAiAlly} from "./ai-alliances";
import {neighboringThreat} from "./ai-defense";
import {constructionPlans} from "./construction";
import {
  blockedGrid,
  connectedCells,
  cellAt,
  cellPoint,
  footprintCells,
  nationSpawn,
  nearestOpen,
  pointInPolygon,
  routeCellsClear,
} from "./navigation";
import {
  advanceProduction,
  productionBuildings,
  productionQueueLimit,
  productionRate,
} from "./production";
import {initializeClock,SECONDS_PER_TICK} from "./game-clock";
import {IndustryEconomy,mineralFor} from "./economy";
import type {PreparedDeployment} from "./deployment";
import {initializePorts} from "./ports";
import { populationCapacity } from "./manpower";
import { campaignSnapshot } from "./snapshot";
import { MilitaryCommand } from "./leaders";
import { WorldAffairs } from "./world-affairs";
import { allied, militaryAccess, relationScore, pairKey, spending, combatFunding } from "./relations";
import { BorderIndex } from "./frontline";
import { doctrines } from "./doctrines";
import { isShip, militaryPower } from "./geopolitics";
import { Visibility } from "./visibility";
import { Naval, oceanNavigation } from "./naval";
import { Territory,type OwnershipChange } from "./territory";
import { landComponents, warReadiness } from "./strategy";
import { SpatialIndex } from "./spatial";
import type {
  Building,
  Campaign,
  ContinentData,
  DoctrineId,
  Grid,
  GameCommand,
  LeaderStance,
  LegacyCampaign,
  NationState,
  Point,
  PeaceTerms,
  Unit,
} from "./types";

export const unitSpecs = {
  frigate: {
    label: "Frigate",
    credits: 240,
    supplies: 40,
    time: 10,
    hp: 280,
    speed: 28,
    range: 8,
    damage: 24,
  },
  transport: {
    label: "Troop transport",
    credits: 160,
    supplies: 25,
    time: 8,
    hp: 180,
    speed: 22,
    range: 0,
    damage: 0,
  },
  infantry: {
    label: "Infantry squad",
    credits: 75,
    supplies: 10,
    time: 4,
    hp: 90,
    speed: 4,
    range: 3.8,
    damage: 9,
  },
  armor: {
    label: "Armored vehicle",
    credits: 180,
    supplies: 30,
    time: 8,
    hp: 210,
    speed: 12,
    range: 5,
    damage: 22,
  },
};
export const buildingSpecs = {
  depot:{label:"Supply depot",credits:180,supplies:20,hp:280},
  factory: { label: "Factory", credits: 320, supplies: 35, hp: 420 },
  dock: { label: "Dock", credits: 180, supplies: 30, hp: 350 },
  barracks: { label: "Barracks", credits: 200, supplies: 35, hp: 400 },
  mine: { label: "Resource extractor", credits: 150, supplies: 20, hp: 250 },
};
const tickingCampaigns=new WeakSet<Campaign>(),deferredSaves=new WeakSet<Campaign>();
const SAVE_KEY = "worldrts.campaigns.v2";
const LEGACY_KEY = "worldrts.campaigns.v1";
export type SavedCampaign = Campaign | LegacyCampaign;
const seed = (id: string) =>
  [...id].reduce((n, c) => n * 31 + c.charCodeAt(0), 0) >>> 0;
const teamFor = (state: Campaign, nation: string) =>
  nation === state.nation ? ("player" as const) : ("enemy" as const);

export function savedCampaigns(): Record<string, SavedCampaign> {
  const result: Record<string, SavedCampaign> = {};
  for (const key of [LEGACY_KEY, SAVE_KEY]) {
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? "{}");
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      for (const [region, value] of Object.entries(raw)) {
        const s = value as SavedCampaign;
        if (
          !s ||
          typeof s.nation !== "string" ||
          !Number.isFinite(s.elapsed) ||
          !Array.isArray(s.units) ||
          !Array.isArray(s.buildings) ||
          !Array.isArray(s.nodes)
        )
          continue;
        if (
          s.version === 1 &&
          Number.isFinite(s.credits) &&
          Array.isArray(s.queue)
        )
          result[region] = s;
        if (
          s.version === 2 &&
          s.nations?.[s.nation] &&
          Array.isArray(s.wars) &&
          Object.values(s.nations).every(
            (n) =>
              n &&
              Number.isFinite(n.credits) &&
              Number.isFinite(n.supplies) &&
              doctrines[n.doctrine] &&
              Array.isArray(n.queue),
          )
        )
          result[region] = s;
      }
    } catch {
      /* Preserve other valid slots if an entry is unavailable. */
    }
  }
  return result;
}

export function saveCampaign(campaign: Campaign): boolean {
  if(tickingCampaigns.has(campaign)){deferredSaves.add(campaign);return true;}
  try {
    const existing = Object.fromEntries(
      Object.entries(savedCampaigns()).filter(([, s]) => s.version === 2),
    );
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify(Object.fromEntries(Object.entries({ ...existing, [campaign.region]: campaign }).map(([id, state]) => [id, state.version === 2 ? campaignSnapshot(state) : state]))),
    );
    return true;
  } catch {
    return false;
  }
}

function addUnit(
  state: Campaign,
  data: ContinentData,
  grid: Grid,
  walkable: Uint8Array,
  nation: string,
  type: Unit["type"],
  position: Point,
  water?: Uint8Array,
): boolean {
  const owner = data.countries.findIndex((c) => c.id === nation);
  const own = isShip(type)
    ? (water ?? oceanNavigation(grid)).slice()
    : walkable.map((v, i) =>
        v &&
        (state.occupation?.[i]?.controller ??
          data.countries[grid.owners[i]]?.id) === nation
          ? 1
          : 0,
      );
  if(!isShip(type)){
    const origin=nearestOpen(grid,own,...position,14);
    if(origin<0)return false;
    const reachable=connectedCells({...grid,walkable:own},origin);own.fill(0);
    for(const i of reachable)own[i]=1;
  }
  for (const u of state.units)
    if (u.hp > 0 && !u.embarkedOn && isShip(u.type) === isShip(type)) {
      const i = cellAt(grid, u.x, u.z);
      if (i >= 0) own[i] = 0;
    }
  const open = nearestOpen(grid, own, position[0] + 2, position[1] + 1, 14);
  if (open < 0) return false;
  const [x, z] = cellPoint(grid, open),
    spec = unitSpecs[type];
  state.units.push({
    id: state.nextId++,
    nation,
    team: teamFor(state, nation),
    type,
    x,
    z,
    hp: spec.hp,
    maxHp: spec.hp,
    path: [],
    cooldown: 0,
    order: 0,
    leaderId: nation !== state.nation ? state.leaders?.find((l) => l.nation === nation && l.branch === (isShip(type) ? "navy" : "army"))?.id : undefined,
  });
  return true;
}

export function createCampaign(
  data: ContinentData,
  grid: Grid,
  nation: string,
): Campaign {
  const home = nationSpawn(
    grid,
    data.countries.findIndex((c) => c.id === nation),
  );
  if (home < 0)
    throw new Error(
      "This nation is too small for a capital on the current map. Choose a larger nation.",
    );
  const s: Campaign = {
    version: 2,
    region: data.id,
    nation,
    nations: {},
    wars: [],
    elapsed: 0,
    nextId: 1,
    units: [],
    buildings: [],
    nodes: [],
    result: "playing",
  };
  const ordered = [...data.countries].sort(
    (a, b) => Number(b.id === nation) - Number(a.id === nation),
  );
  for (const country of ordered) {
    const owner = data.countries.indexOf(country),
      capitalCell = country.id === nation ? home : nationSpawn(grid, owner);
    const capital = capitalCell >= 0 ? cellPoint(grid, capitalCell) : null;
    const doctrine =
      country.id === nation
        ? "balanced"
        : (["balanced", "defensive", "maneuver", "firepower"] as DoctrineId[])[
            seed(country.id) % 4
          ];
    s.nations[country.id] = {
      id: country.id,
      credits: 650,
      supplies: 160,
      industry: 0,
      reserves: 0,
      capital,
      doctrine,
      doctrineChangedAt: -60,
      nextActionAt: 8 + (seed(country.id) % 9),
      queue: [],
      defeated: false,
    };
    if (capital)
      s.buildings.push({
        id: s.nextId++,
        nation: country.id,
        team: teamFor(s, country.id),
        type: "hq",
        x: capital[0],
        z: capital[1],
        hp: 1100,
        maxHp: 1100,
      });
  }
  const walkable = blockedGrid(grid, s.buildings);
  for (const n of Object.values(s.nations)) {
    for (let i = 0; i < (n.id === nation ? 6 : 2); i++)
      if (
        !n.capital ||
        !addUnit(s, data, grid, walkable, n.id, "infantry", n.capital)
      )
        n.reserves++;
    if (!n.capital) continue;
    const owner = data.countries.findIndex((c) => c.id === n.id);
    const candidates: { index: number; distance: number }[] = [];
    for (let i = 0; i < grid.owners.length; i++)
      if (grid.owners[i] === owner && grid.walkable[i]) {
        const p = cellPoint(grid, i),
          distance = Math.hypot(p[0] - n.capital[0], p[1] - n.capital[1]);
        if (distance > 4.5 && distance < 30)
          candidates.push({ index: i, distance });
      }
    candidates.sort((a, b) => a.distance - b.distance);
    let deposits = 0;
    for (const { index } of candidates) {
      const p = cellPoint(grid, index),
        footprint = footprintCells(grid, ...p);
      if (
        !footprint.length ||
        !footprint.every((i) => grid.owners[i] === owner)
      )
        continue;
      if (
        s.nodes.some((node) => Math.hypot(node.x - p[0], node.z - p[1]) < 6) ||
        s.units.some((u) => Math.hypot(u.x - p[0], u.z - p[1]) < 2)
      )
        continue;
      s.nodes.push({ nation: n.id, x: p[0], z: p[1], claimed: false, mineral: mineralFor(n.id,deposits) });
      if (++deposits >= (n.id === nation ? 4 : 2)) break;
    }
  }
  return s;
}

export function restoreCampaign(
  data: ContinentData,
  grid: Grid,
  saved: SavedCampaign,
): Campaign {
  if (saved.version === 2) return structuredClone(saved);
  const s = createCampaign(data, grid, saved.nation),
    n = s.nations[saved.nation];
  n.credits = saved.credits;
  n.supplies = saved.supplies;
  n.queue = structuredClone(saved.queue);
  s.elapsed = saved.elapsed;
  const hq = saved.buildings.find(
    (b) => b.team === "player" && b.type === "hq" && b.hp > 0,
  );
  if (!hq) return s;
  s.units = s.units.filter((u) => u.nation !== saved.nation);
  s.buildings = s.buildings.filter((b) => b.nation !== saved.nation);
  for (const u of saved.units.filter((u) => u.team === "player" && u.hp > 0))
    s.units.push({
      ...structuredClone(u),
      id: s.nextId++,
      nation: saved.nation,
      path: [],
      order: 0,
    });
  for (const b of saved.buildings.filter(
    (b) => b.team === "player" && b.hp > 0,
  ))
    s.buildings.push({ ...b, id: s.nextId++, nation: saved.nation });
  n.capital = [hq.x, hq.z];
  s.nodes = s.nodes.filter((n) => n.nation !== saved.nation);
  for (const node of saved.nodes) {
    const i = cellAt(grid, node.x, node.z);
    if (i >= 0 && data.countries[grid.owners[i]]?.id === saved.nation)
      s.nodes.push({ ...node, nation: saved.nation });
  }
  return s;
}

export type PathRequest = (unit: Unit, to: Point) => void;
export class Simulation {
  readonly logistics:Logistics;
  readonly economy: IndustryEconomy;
  readonly command: MilitaryCommand;
  readonly visibility: Visibility;
  readonly naval: Naval;
  readonly territory: Territory;
  readonly components: Int32Array;
  private readonly combatIndex = new SpatialIndex<Unit | Building>();
  private conquestCheckAt = 0;
  accessRevision = 0;
  obstacleRevision = 0;
  private buildingRevision = 0;
  private readonly accessMasks = new Map<string, Uint8Array>();
  private frontlineAt = 0;
  private aiAdvanceTargets=new Map<string,string>();
  private landRevision = 0;
  private mineKey = "";
  private mineCounts = new Map<string,number>();
  private readonly borders: BorderIndex;
  readonly state: Campaign;
  walkable: Uint8Array;
  paused = false;
  private raidAt: number;
  private saveAt: number;
  onEvent: (message: string) => void = () => {};
  onCommandError:(message:string)=>void=()=>{};
  onShot: (
    from: Point,
    to: Point,
    team: Unit["team"],
    nation?: string,
  ) => void = () => {};
  onObstacles: (walkable: Uint8Array) => void = () => {};
  requestTrafficPath:(u:Unit,to:Point,blocked:number[])=>void=()=>{};
  requestPath: PathRequest = () => {};
  private route(u:Unit,to:Point){if(u.stackId!==undefined&&this.state.units.find(v=>v.hp>0&&!v.embarkedOn&&v.nation===u.nation&&v.stackId===u.stackId)?.id!==u.id)return;this.requestPath(u,to);}
  expandSelection(ids:Iterable<number>){return expandStacks(this.state.units,ids);}
  private commandUnits(ids:Iterable<number>){const expanded=this.expandSelection(ids);return this.playerUnits.filter(u=>expanded.has(u.id));}
  private synchronizeStack(group:Unit[]){const head=group[0];for(const u of group.slice(1)){u.x=head.x;u.z=head.z;u.path=head.path;u.destination=head.destination;u.order=head.order;u.orderMode=head.orderMode;u.tacticalOrder=head.tacticalOrder;u.waypoints=head.waypoints;u.frontline=head.frontline;u.retreating=head.retreating;u.landing=head.landing;u.blockedTicks=head.blockedTicks;u.routeFailed=head.routeFailed;}}
  mergeUnits(ids:number[]):string|null{
    const units=this.commandUnits(ids);if(units.length<2)return "Select at least two formations to merge.";if(units.length>MAX_STACK_UNITS)return "A stack holds at most five formations.";
    const head=units[0];if(units.some(u=>!compatible(head,u)))return "Merge the same unit type under the same commander.";
    if(units.some(u=>Math.hypot(u.x-head.x,u.z-head.z)>3))return "Move formations within three map units before merging.";
    for(const u of units){u.stackId=head.id;u.stackSeparated=false;}this.synchronizeStack(units);this.stackCacheTick=-1;return null;
  }
  splitUnits(ids:number[]):string|null{
    const selected=this.expandSelection(ids),groups=[...unitStacks(this.state.units).groups.values()].filter(g=>g.length>1&&g.some(u=>selected.has(u.id)&&u.nation===this.state.nation));if(!groups.length)return "Select a merged stack to split.";
    // Find legal neighbouring positions before committing any membership change.
    const clones=this.state.units.map(u=>({...u})),byId=new Map(clones.map(u=>[u.id,u]));for(const g of groups)for(const u of g){const c=byId.get(u.id)!;delete c.stackId;c.stackSeparated=true;}
    const positions=new UnitPositions(clones);
    for(const g of groups)for(const u of g){const c=byId.get(u.id)!;if(!positions.place(c,[c.x,c.z],p=>{const i=cellAt(this.grid,...p);return i>=0&&(isShip(c.type)?!!this.naval.water[i]:!!this.walkable[i]&&this.canEnter(c.nation,i));}))return "Move this stack to open ground before splitting.";}
    for(const g of groups)for(const u of g){const c=byId.get(u.id)!;delete u.stackId;u.stackSeparated=true;u.x=c.x;u.z=c.z;u.order++;u.path=[];u.destination=null;u.waypoints=[];delete u.frontline;u.tacticalOrder="hold";}
    this.stackCacheTick=-1;return null;
  }
  onDiplomacy: () => void = () => {};
  onTerritory: () => void = () => {};
  onAccess: (patch?:{cells:Int32Array;owners:Int16Array;invalidate:string[];revision:number}) => void = () => {};
  readonly affairs: WorldAffairs;
  private stackCache?:ReturnType<typeof unitStacks>;
  private stackCacheTick=-1;
  visibleStacks(){if(this.stackCacheTick!==this.state.elapsed||!this.stackCache){this.stackCacheTick=this.state.elapsed;this.stackCache=unitStacks(this.state.units.filter(u=>this.visibility.canSee(this.state.nation,u)));}return this.stackCache;}
  nationPersonnel(id:string){return this.state.units.reduce((sum,u)=>sum+(u.nation===id?personnel(u):0),0)+this.state.nations[id].reserves*1000;}
  private forceCounts=new Map<string,number>();
  private relationKey="";
  private demilitarizedStates=new Set<string>();

  constructor(
    readonly data: ContinentData,
    readonly grid: Grid,
    state: Campaign,
    prepared?: Pick<PreparedDeployment,"territory"|"naval"|"components">,
  ) {
    this.state = structuredClone(state);
    this.data={...data,countries:[...data.countries]};restoreBreakaways(this.data,this.state);
    data=this.data;
    initializeClock(this.state);
    initializePolitics(this.state);
    initializeStrategy(this.state);
    this.affairs=new WorldAffairs(this.state,data);
    this.state.alliances ??= [];
    this.command = new MilitaryCommand(this.state);
    this.walkable = blockedGrid(grid, this.state.buildings);
    this.territory = new Territory(
      this.state,
      data,
      grid,
      (a, b) => this.atWar(a, b),
      () => {
        this.visibility.refresh(true);
        if (this.landRevision !== this.territory.landRevision) {
          this.landRevision = this.territory.landRevision;
          this.refreshAccess(this.territory.controlChanges);
        }
        this.onTerritory();
      },
      prepared?.territory,
    );
    this.updateZones();
    this.borders = new BorderIndex(grid, (i) => this.territory.controllerAt(i));
    this.visibility = new Visibility(this.state);
    this.naval = new Naval(
      this.state,
      grid,
      () => this.walkable,
      (u, p) => this.route(u, p),
      (nation, index) => this.canEnter(nation, index),
      prepared?.naval,
    );
    initializePorts(this.state,data,grid,this.naval,this.territory);
    this.logistics=new Logistics(this.state,grid,this.territory,this.naval.water);
    this.logistics.refresh();
    this.economy=new IndustryEconomy(this.state);
    this.economy.onRecurringSettlement=()=>{saveCampaign(this.state);};
    this.walkable=blockedGrid(grid,this.state.buildings);
    this.components = prepared?.components ?? landComponents(grid);
    this.raidAt = state.elapsed + 6;
    this.saveAt = state.elapsed + 10;
    this.repatriate();
    lockNearbyStacks(this.state.units);
    this.relationKey=this.treatyKey();
  }
  get playerNation() {
    return this.state.nations[this.state.nation];
  }
  get headquarters() {
    return this.state.buildings.find(
      (b) => b.nation === this.state.nation && b.type === "hq" && b.hp > 0,
    );
  }
  get playerUnits() {
    return this.state.units.filter(
      (u) => u.nation === this.state.nation && u.hp > 0 && !u.embarkedOn,
    );
  }
  get income() {
    return this.nationIncome(this.state.nation);
  }
  private mines(id: string) {
    const key=`${this.state.buildings.length}:${this.buildingRevision}:${this.territory.landRevision}:${this.state.elapsed}`;
    if(key!==this.mineKey){this.mineKey=key;this.mineCounts.clear();for(const b of this.state.buildings)if(b.hp>0&&!b.construction&&b.type==="mine")this.mineCounts.set(b.nation,(this.mineCounts.get(b.nation)??0)+1);}
    return this.mineCounts.get(id)??0;
  }
  private baseIncome(id:string) { return (3+this.territory.cityIncome(id)+this.state.nations[id].industry*2+this.mines(id)*7)*ideologyOf(this.state.nations[id]).income*stabilityEffect(this.state.nations[id])*(1+.05*techLevel(this.state.nations[id],"economy")); }
  militaryUpkeep(id:string){return (0.5+((this.forceCounts.get(id)??0)+this.state.nations[id].reserves)*0.3)*spending(this.state.nations[id]);}
  supplyUpkeep(id:string){return ((this.forceCounts.get(id)??0)+this.state.nations[id].reserves)*0.04*spending(this.state.nations[id]);}
  nationIncome(id: string) { return this.baseIncome(id)+this.economy.income(id)-this.militaryUpkeep(id); }
  supplyIncome(id: string) { return 3+this.state.nations[id].industry*0.5+this.territory.cityIncome(id)*0.1+this.mines(id); }
  allied(a: string, b: string) { return allied(this.state, a, b); }
  canEnter(nation: string, index: number) {
    return !this.demilitarized(index) && militaryAccess(this.state, nation, this.territory.controllerAt(index));
  }
  private updateZones(){this.demilitarizedStates=new Set(this.state.treaties!.filter(t=>t.until>this.state.elapsed).flatMap(t=>t.zones));}
  private demilitarized(index:number){if(!this.demilitarizedStates.size)return false;const id=this.territory.stateAt(index)?.id;return !!id&&this.demilitarizedStates.has(id);}
  landMask(nation: string): Uint8Array {
    let mask = this.accessMasks.get(nation);
    if (!mask) {
      const allowed = new Set(this.data.countries.filter((c) => militaryAccess(this.state, nation, c.id)).map((c) => c.id));
      mask = this.walkable.map((open, i) => open && !this.demilitarized(i) && allowed.has(this.territory.controllerAt(i) ?? "") ? 1 : 0);
      this.accessMasks.set(nation, mask);
    }
    return mask;
  }
  accessSnapshot() {
    const ids = this.data.countries.map((c) => c.id),
      controllers = new Int16Array(this.grid.owners.length).fill(-1),
      indices = new Map(ids.map((id, i) => [id, i]));
    for (let i = 0; i < controllers.length; i++)
      controllers[i] = this.demilitarized(i)?-1:indices.get(this.territory.controllerAt(i) ?? "") ?? -1;
    const access: Record<string, number[]> = {};
    for (const id of ids) access[id] = ids.flatMap((owner, i) => militaryAccess(this.state, id, owner) ? [i] : []);
    return { controllers, access, revision: this.accessRevision };
  }
  private repatriate(affected?:Set<string>) {
    // Treaty expiry and old saves withdraw stranded troops to accessible land.
    // This one-time diplomatic withdrawal is not available as a movement command.
    const destinations = new Map<string, number[]>();
    for (const u of this.state.units) {
      if ((affected&&!affected.has(u.nation)) || u.hp <= 0 || u.embarkedOn || isShip(u.type) || this.canEnter(u.nation, cellAt(this.grid, u.x, u.z))) continue;
      let cells = destinations.get(u.nation);
      if (!cells) {
        cells = [];
        for (let i = 0; i < this.walkable.length; i++)
          if (this.walkable[i] && this.canEnter(u.nation,i) && this.territory.controllerAt(i) === u.nation) cells.push(i);
        destinations.set(u.nation, cells);
      }
      let best = -1, distance = Infinity;
      for (const i of cells) {
        const p = cellPoint(this.grid, i), d = Math.hypot(p[0] - u.x, p[1] - u.z);
        if (d < distance) { best = i; distance = d; }
      }
      if (best >= 0) [u.x, u.z] = cellPoint(this.grid, best);
      else u.hp = 0;
      u.order++; u.path = []; u.destination = null; delete u.frontline;
    }
  }
  private treatyKey(){return this.state.wars.map((w)=>w.a+"/"+w.b).join(",")+"|"+(this.state.alliances??[]).map((w)=>w.a+"/"+w.b).join(",");}
  private refreshAccess(changes?:OwnershipChange[]) {
    this.updateZones();
    this.accessRevision++;
    const relationKey=this.treatyKey(),incremental=!!changes&&relationKey===this.relationKey;
    this.relationKey=relationKey;
    let affected:Set<string>|undefined;
    if(incremental){
      affected=new Set<string>();
      for(const nation of Object.keys(this.state.nations))for(const c of changes!)if(militaryAccess(this.state,nation,c.previous)!==militaryAccess(this.state,nation,c.next)){affected.add(nation);break;}
      for(const nation of affected){const mask=this.accessMasks.get(nation);if(mask)for(const c of changes!)for(const index of c.cells)mask[index]=this.walkable[index]&&!this.demilitarized(index)&&militaryAccess(this.state,nation,c.next)?1:0;}
      const count=changes!.reduce((n,c)=>n+c.cells.length,0),cells=new Int32Array(count),owners=new Int16Array(count);let n=0;
      for(const c of changes!){const owner=this.data.countries.findIndex((country)=>country.id===c.next);for(const i of c.cells){cells[n]=i;owners[n++]=owner;}}
      this.onAccess({cells,owners,invalidate:[...affected],revision:this.accessRevision});
    }else{this.accessMasks.clear();this.onAccess();}
    this.repatriate(affected);
    for (const u of this.state.units) {
      if ((affected&&!affected.has(u.nation)) || u.hp <= 0 || u.embarkedOn || isShip(u.type)) continue;
      const destination = u.destination ?? u.path.at(-1);
      if (destination && !this.canEnter(u.nation, cellAt(this.grid, ...destination))) {
        u.order++; u.path = []; u.destination = null;
      } else if (!routeCellsClear(this.grid,[u.x,u.z],u.path,(i)=>this.canEnter(u.nation,i))) {
        u.order++; u.path = [];
        if (destination) { u.destination = destination; this.route(u, destination); }
      }
    }
    this.frontlineAt = 0;
  }
  setAlliance(target: string, enabled: boolean, actor = this.state.nation): string | null {
    const a = this.state.nations[actor], b = this.state.nations[target];
    if (this.state.result !== "playing") return "This battle has ended.";
    if (!a || !b || actor === target || a.defeated || b.defeated) return "Choose an active foreign nation.";
    if(enabled && relationScore(this.state,actor,target)<20)return "An alliance requires relations of +20. Establish an embassy and cooperate first.";
    if (enabled && this.atWar(actor, target)) return "Make peace before forming an alliance.";
    this.state.alliances = this.state.alliances!.filter((p) => !((p.a === actor && p.b === target) || (p.a === target && p.b === actor)));
    if (enabled) this.state.alliances.push({ a: actor, b: target, since: this.state.elapsed });
    this.refreshAccess();
    this.onEvent(this.nationName(actor) + (enabled ? " allied with " : " ended its alliance with ") + this.nationName(target) + ".");
    this.onDiplomacy(); saveCampaign(this.state);
    return null;
  }
  unitSupply(u:Unit){return isShip(u.type)?(this.state.nations[u.nation].supplies>0?1:.2):this.logistics.level(u.nation,cellAt(this.grid,u.x,u.z));}
  unitSpeedKmh(u:Unit){
    const kmh=unitSpecs[u.type].speed;
    return kmh*doctrines[this.state.nations[u.nation].doctrine].speed*this.command.bonuses(u).speed*(0.6+0.4*u.hp/u.maxHp)*(this.state.nations[u.nation].supplies>0?1:0.5);
  }
  nationCapacity(id: string) { return this.state.nations[id]?.defeated ? 0 : populationCapacity(this.territory.population(id)); }
  nationArmy(id: string) {
    return (
      this.state.units.filter((u) => u.nation === id && u.hp > 0).length +
      this.state.nations[id].reserves
    );
  }
  nationName(id: string) {
    return formedName(this.state,id,this.data.countries.find((c) => c.id === id)?.name ?? id);
  }
  atWar(a: string, b: string) {
    return (
      a !== b &&
      this.state.wars.some(
        (w) => (w.a === a && w.b === b) || (w.a === b && w.b === a),
      )
    );
  }
  enemiesOf(id: string) {
    return this.state.wars
      .filter((w) => w.a === id || w.b === id)
      .map((w) => (w.a === id ? w.b : w.a));
  }

  declareWar(target: string, actor = this.state.nation): string | null {
    const a = this.state.nations[actor],
      b = this.state.nations[target];
    if (this.state.result !== "playing") return "This battle has ended.";
    if (!a || !b || actor === target) return "Choose another nation.";
    if (a.defeated || b.defeated)
      return "A surrendered nation cannot declare or receive a declaration of war.";
    if (this.atWar(actor, target)) return "These nations are already at war.";
    if (this.allied(actor, target)) return "End your alliance before declaring war.";
    if(activeTruce(this.state,actor,target))return "A peace treaty prevents war until the truce expires.";
    if(!["nationalism","fascism"].includes(a.ideology??"democracy"))a.stability=Math.max(0,(a.stability??70)-10);
    this.state.wars.push({ a: actor, b: target, since: this.state.elapsed });
    this.state.affairs!.embassies=this.state.affairs!.embassies.filter(key=>key!==pairKey(actor,target));
    this.affairs.publish(actor,"war",target);
    this.refreshAccess();
    this.raidAt = this.state.elapsed + 1;
    this.onEvent(
      this.nationName(actor) +
        " declared war on " +
        this.nationName(target) +
        ".",
    );
    this.onDiplomacy();
    saveCampaign(this.state);
    return null;
  }
  makePeace(target: string, actor = this.state.nation, terms?:PeaceTerms): string | null {
    if (!this.atWar(actor, target))
      return "These nations are already at peace.";
    this.state.wars = this.state.wars.filter(
      (w) =>
        !(
          (w.a === actor && w.b === target) ||
          (w.a === target && w.b === actor)
        ),
    );
    const kept=terms?.keepStates??[];
    this.territory.settlePeace(actor,target,new Set(kept));
    const payment=terms?.reparations??0;
    this.state.treaties!.push({a:actor,b:target,until:this.state.elapsed+150,payer:payment?target:undefined,recipient:payment?actor:undefined,payment,remaining:payment*10,zones:terms?.demilitarize?kept:[]});
    this.affairs.publish(actor,"peace",target);
    for (const tile of Object.values(this.state.occupation ?? {})) {
      const opponent = tile.opponent ?? tile.original;
      if ((tile.controller === actor && opponent === target) || (tile.controller === target && opponent === actor)) tile.settled = true;
    }
    for (const tile of Object.values(this.state.seaControl ?? {}))
      if (tile.controller === actor || tile.controller === target) tile.settled = true;
    this.refreshAccess();
    this.onEvent(
      this.nationName(actor) +
        " and " +
        this.nationName(target) +
        " signed peace.",
    );
    this.onDiplomacy();
    saveCampaign(this.state);
    return null;
  }
  setDoctrine(id: DoctrineId): string | null {
    if (!doctrines[id]) return "Choose a valid military doctrine.";
    if (this.state.result !== "playing") return "This battle has ended.";
    if (this.enemiesOf(this.state.nation).length)
      return "Change military doctrine during peacetime.";
    if (this.playerNation.doctrine === id) return null;
    const remaining =
      60 - (this.state.elapsed - this.playerNation.doctrineChangedAt);
    if (remaining > 0)
      return "Doctrine can be changed again in " + Math.ceil(remaining) + "s.";
    this.playerNation.doctrine = id;
    this.playerNation.doctrineChangedAt = this.state.elapsed;
    this.onEvent("Military doctrine: " + doctrines[id].name + ".");
    saveCampaign(this.state);
    return null;
  }
  investIndustry(id = this.state.nation): string | null {
    const n = this.state.nations[id],
      cost = 160 * (n.industry + 1);
    if (this.state.result !== "playing" || n.defeated)
      return "This nation is no longer active.";
    if (n.industry >= 8) return "Infrastructure is fully developed.";
    if (n.credits < cost) return "Infrastructure needs " + cost + " credits.";
    n.credits -= cost;
    n.industry++;
    if (id === this.state.nation)
      this.onEvent("Infrastructure upgraded. Income +2/s.");
    return null;
  }
  train(type: Unit["type"], id = this.state.nation): string | null {
    const spec = unitSpecs[type],
      n = this.state.nations[id];
    if (this.state.result !== "playing" || n.defeated)
      return "This battle has ended.";
    if (!productionBuildings(this.state, id, type).length)
      return isShip(type)
        ? this.data.ports ? "Control an operational real port before training ships." : "Build a dock on your coast before training ships."
        : type === "armor"
          ? "Build a barracks to train armored vehicles."
          : "A capital or barracks is needed to train infantry.";
    if (this.nationArmy(id) + n.queue.length >= this.nationCapacity(id))
      return "Population-based force capacity reached (" + this.nationCapacity(id) + ").";
    if (n.queue.length >= productionQueueLimit(this.state, id))
      return "Training queue is full. Add production buildings to expand it.";
    const cost=spending(n);
    if (n.credits < Math.ceil(spec.credits*cost) || n.supplies < Math.ceil(spec.supplies*cost))
      return "Insufficient credits or supplies.";
    n.credits -= Math.ceil(spec.credits*cost);
    n.supplies -= Math.ceil(spec.supplies*cost);
    n.queue.push({ type, remaining: spec.time, total: spec.time });
    if (id === this.state.nation)
      this.onEvent(spec.label + " added to training queue.");
    return null;
  }
  placementPoint(type:Building['type'],x:number,z:number,id=this.state.nation):Point{
    if(type!=="mine")return [x,z];const nodes=this.state.nodes.filter(n=>n.nation===id&&!n.claimed&&Math.hypot(n.x-x,n.z-z)<2.5).sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z));return nodes[0]?[nodes[0].x,nodes[0].z]:[x,z];
  }
  placementError(
    type: Exclude<Building["type"], "hq">,
    x: number,
    z: number,
    id = this.state.nation,
  ): string | null {
    [x,z]=this.placementPoint(type,x,z,id);
    if(type==="dock"&&this.data.ports)return "Docks already exist at mapped real-world ports; use the Ports menu.";
    const n = this.state.nations[id],
      spec = buildingSpecs[type];
    if (this.state.result !== "playing" || n.defeated)
      return "This battle has ended.";
    if (n.credits < spec.credits || n.supplies < spec.supplies)
      return "Insufficient credits or supplies.";
    const index = cellAt(this.grid, x, z),
      footprint = footprintCells(this.grid, x, z,0.336);
    if(index<0||!footprint.length)return "Place buildings entirely on open land.";
    if(footprint.every(i=>this.grid.owners[i]>=0)){
      if(!this.territory.ownsFootprint(id,footprint))return "Place the entire building inside your nation's borders.";
    }else{
      // At shorelines the coarse navigation cells can include water even when
      // the visible building footprint is wholly on vector land.
      for(const [dx,dz] of [[0,0],[-.336,-.336],[.336,-.336],[-.336,.336],[.336,.336]]){
        const px=x+dx,pz=z+dz,country=this.data.countries.find(c=>px>=c.bounds[0]&&px<=c.bounds[2]&&pz>=c.bounds[1]&&pz<=c.bounds[3]&&c.polygons.some(p=>pointInPolygon(px,pz,p)));
        if(!country||this.data.lakes.some(p=>pointInPolygon(px,pz,p)))return "Place buildings entirely on open land.";
        const owner=this.data.countries.indexOf(country),at=cellAt(this.grid,px,pz),col=at%this.grid.width,row=Math.floor(at/this.grid.width);let nearest=-1,best=Infinity;
        for(let rz=-2;rz<=2;rz++)for(let rx=-2;rx<=2;rx++){const cx=col+rx,cz=row+rz;if(cx<0||cz<0||cx>=this.grid.width||cz>=this.grid.height)continue;const cell=cz*this.grid.width+cx;if(this.grid.owners[cell]!==owner)continue;const p=cellPoint(this.grid,cell),distance=Math.hypot(px-p[0],pz-p[1]);if(distance<best){best=distance;nearest=cell;}}
        if(nearest<0||this.territory.controllerAt(nearest)!==id)return "Place the entire building inside your nation's borders.";
      }
    }
    if (
      this.state.buildings.some(
        (b) => {
          return b.hp > 0 && buildingsOverlap(type,x,z,b);
        },
      )
    )
      return "Too close to another building.";
    if (type !== "mine" && this.state.nodes.some(node =>
      Math.abs(node.x - x) < 0.52 && Math.abs(node.z - z) < 0.52
    )) return "Mineral deposits are reserved for extractors. Place this building beside the deposit.";
    if (type === "dock" && !this.naval.isCoast(x, z))
      return "Place docks on owned land within three tiles of open ocean.";
    if (
      type === "mine" &&
      !this.state.nodes.some(
        (n) =>
          n.nation === id && !n.claimed && Math.hypot(n.x - x, n.z - z) < 2.5,
      )
    )
      return "Place an extractor next to an unclaimed mineral deposit.";
    return null;
  }
  build(
    type: Exclude<Building["type"], "hq">,
    x: number,
    z: number,
    id = this.state.nation,
  ): string | null {
    [x,z]=this.placementPoint(type,x,z,id);
    const error = this.placementError(type, x, z, id);
    if (error) return error;
    const spec = buildingSpecs[type],
      n = this.state.nations[id];
    n.credits -= spec.credits;
    n.supplies -= spec.supplies;
    this.state.buildings.push({
      id: this.state.nextId++,
      nation: id,
      team: teamFor(this.state, id),
      type,
      construction:{completedDays:0,totalDays:constructionPlans[type].days,nextTick:this.state.elapsed+5},
      ...(type === "factory" ? {recipe:"steel" as const,progress:0,enabled:true} : {}),
      ...(type === "mine" ? {mineral:this.state.nodes.find(node=>node.nation===id&&!node.claimed&&Math.hypot(node.x-x,node.z-z)<2.5)?.mineral??"gold"} : {}),
      x,
      z,
      hp: spec.hp,
      maxHp: spec.hp,
    });
    if (type === "mine") {
      const node = this.state.nodes.find(
        (n) =>
          n.nation === id && !n.claimed && Math.hypot(n.x - x, n.z - z) < 2.5,
      );
      if (node) node.claimed = true;
    }
    this.updateObstacles();
    if (id === this.state.nation) this.onEvent(spec.label + " construction started. Materials are consumed every day.");
    return null;
  }
  tactical(ids:number[],target:Point|undefined,mode:NonNullable<Unit["tacticalOrder"]>,append=false):string|null{
    const own=this.commandUnits(ids);if(!own.length)return "Select units first.";
    if(mode==="hold"){this.stop(ids);for(const u of own)u.tacticalOrder="hold";return null;}
    if(!target||!target.every(Number.isFinite))return "Choose a destination.";
    if(append){for(const u of [...unitStacks(own).groups.values()].map(g=>g[0])){if((u.waypoints?.length??0)>=16)continue;if(u.destination||u.path.length){(u.waypoints??=[]).push([...target]);}else{const error=this.move([u.id],target);if(error)return error;u.tacticalOrder=mode;}}return null;}
    const error=this.move(ids,target);if(!error)for(const u of own){u.tacticalOrder=mode;u.waypoints=[];}return error;
  }
  move(ids: number[], target: Point): string | null {
    if (this.state.result !== "playing") return "This battle has ended.";
    const port=this.data.ports?.find((p)=>Math.hypot(p.x-target[0],p.z-target[1])<this.grid.cell);
    const dock=port&&this.state.buildings.find((b)=>b.portId===port.id);
    if(dock)target=[dock.x,dock.z];
    const index = cellAt(this.grid, ...target);
    if (index < 0) return "Choose a destination inside the continent map.";
    const selected = this.commandUnits(ids);
    if (!selected.length) return "Select units first.";
    const stackLeaders=this.visibleStacks().representatives,slots=new Map<number,number>();
    for(const u of selected){const rep=stackLeaders.get(u.id)??u.id;if(!slots.has(rep))slots.set(rep,slots.size);}
    let ordered = 0;
    for (let i = 0; i < selected.length; i++) {
      const u = selected[i],
        mask = isShip(u.type) ? this.naval.water : this.landMask(u.nation);
      if (this.grid.owners[index] >= 0 && !this.canEnter(u.nation, index)) continue;
      let goal = target;
      if (isShip(u.type) && this.grid.owners[index] >= 0) {
        const coast = this.naval.landingDestination(u, target);
        if (!coast) continue;
        goal = coast;
      } else {
        if (!mask[index]) {
          if (isShip(u.type)) continue;
          if(this.grid.owners[index]<0){
            const land=this.data.countries.find(c=>c.polygons.some(p=>pointInPolygon(...target,p)));
            if(!land||!militaryAccess(this.state,u.nation,land.id))continue;
          }
          const nearby=nearestOpen(this.grid,mask,...target,2);
          if(nearby<0)continue;
          goal=cellPoint(this.grid,nearby);
        }
        delete u.landing;
      }
      const slot=slots.get(stackLeaders.get(u.id)??u.id)!;
      const offset: Point = [
        goal[0] + (slot===0?0:((slot % 3) - 1) * this.grid.cell),
        goal[1] + Math.floor(slot / 3) * this.grid.cell,
      ];
      const end = nearestOpen(this.grid, mask, ...offset, 4);
      if (end < 0) continue;
      delete u.frontline;
      u.tacticalOrder="move";u.routeFailed=false;u.retreating=false;u.waypoints=[];u.blockedTicks=0;
      u.orderMode = "manual";
      u.order++;
      u.path = [];
      u.destination = cellPoint(this.grid, end);
      this.route(u, u.destination);
      ordered++;
    }
    return ordered
      ? null
      : "Land access requires ownership, an alliance, or declared war. Ships need ocean or a permitted landing coast.";
  }

  stop(ids: number[]) {
    ids=[...this.expandSelection(ids)];
    for (const u of this.playerUnits)
      if (ids.includes(u.id)) {
        u.order++;
        u.path = [];
        u.destination = null;
        delete u.landing;
        delete u.frontline;u.waypoints=[];u.routeFailed=false;u.tacticalOrder="hold";u.retreating=false;
      }
  }
  frontline(ids: number[], anchor: Point): string | null {
    if (this.state.result !== "playing") return "This battle has ended.";
    const troops = this.commandUnits(ids).filter(u=>u.type==="infantry");
    if (!troops.length) return "Select infantry squads to assign a frontline.";
    const border = this.frontlineBorder(this.state.nation, undefined, anchor);
    if (!border.points.length || !border.target) return "Choose a land border beside your controlled territory.";
    for (const [i, u] of troops.entries()) {
      const p = border.points[Math.min(border.points.length - 1, Math.floor((i + 0.5) * border.points.length / troops.length))];
      u.tacticalOrder=undefined;u.waypoints=[];
      u.frontline = { target: border.target, anchor, position: p };
      this.orderFrontline(u, p);
    }
    this.frontlineAt = 0;
    return null;
  }
  frontlineBorder(nation: string, target?: string, anchor?: Point) {
    return this.borders.query(this.territory.landRevision, nation, target, anchor);
  }
  setLeaderStance(id: number, stance: LeaderStance): string | null {
    const error = this.command.setStance(id, stance); if (error) return error;
    for (const u of this.command.force(id)) if (u.frontline) {
      delete u.frontline.objective; delete u.frontline.retryAt;
      u.order++; u.path=[]; u.destination=null;
      if (stance === "defend") this.orderFrontline(u,u.frontline.position);
    }
    this.frontlineAt = 0;
    this.onEvent(this.command.get(id)!.name + (stance === "attack" ? " ordered to attack hostile fronts." : " ordered to defend and return fire only."));
    saveCampaign(this.state); return null;
  }
  private orderFrontline(u: Unit, p: Point) {
    let end = nearestOpen(this.grid, this.landMask(u.nation), ...p, 3);
    if (end >= 0 && this.territory.controllerAt(end) !== u.nation) {
      const own = this.landMask(u.nation).map((open, i) => open && this.territory.controllerAt(i) === u.nation ? 1 : 0);
      end = nearestOpen(this.grid, own, ...p, 3);
    }
    if (end < 0) return;
    const position = cellPoint(this.grid, end);
    // Frontlines defend our own side; never place positions over the border.
    if (this.territory.controllerAt(end) !== u.nation) return;
    if (u.frontline) u.frontline.position = position;
    u.order++; u.path = []; delete u.landing;
    u.orderMode = "frontline";
    u.destination = position;
    this.route(u, position);
  }
  private attackFrontline(u: Unit, border: Point) {
    const f=u.frontline!;
    if ((f.retryAt??0)>this.state.elapsed) return;
    if (f.objective && this.territory.controllerAt(cellAt(this.grid,...f.objective)) === f.target) {
      if (u.path.length || u.destination) return;
      // Continue fighting visible defenders before waiting to occupy the state.
      let opponent: Unit | Building | undefined, best=Infinity;
      const province=this.territory.stateAt(cellAt(this.grid,...f.objective));
      for(const candidate of this.combatIndex.near(u.x,u.z,10)) {
        if(candidate.hp<=0 || candidate.nation!==f.target || isShip(candidate.type) ||
          this.territory.stateAt(cellAt(this.grid,candidate.x,candidate.z))!==province ||
          ("path" in candidate ? !this.visibility.canSee(u.nation,candidate) : !this.visibility.canSeeBuilding(u.nation,candidate)))continue;
        const distance=Math.hypot(candidate.x-u.x,candidate.z-u.z);
        if(distance<best){opponent=candidate;best=distance;}
      }
      if (!opponent || best <= unitSpecs[u.type].range*0.9) return;
      const mask=this.landMask(u.nation), end=nearestOpen(this.grid,mask,opponent.x,opponent.z,5);
      if(end<0)return;
      f.objective=cellPoint(this.grid,end);
    } else {
      const center=cellAt(this.grid,...border), radius=4;
      let province: ReturnType<Territory["stateAt"]>, distance=Infinity;
      for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++) {
        const col=center%this.grid.width+dx,row=Math.floor(center/this.grid.width)+dz;
        if(col<0||col>=this.grid.width||row<0||row>=this.grid.height)continue;
        const index=row*this.grid.width+col;
        if(!this.grid.walkable[index]||this.territory.controllerAt(index)!==f.target)continue;
        const d=dx*dx+dz*dz;
        if(d<distance){province=this.territory.stateAt(index);distance=d;}
      }
      if(!province)return;
      const city=this.state.cities?.find((c)=>this.territory.stateAt(cellAt(this.grid,c.x,c.z))===province);
      const site:Point=city?[city.x,city.z]:province.center, mask=this.landMask(u.nation);
      let end=-1, best=Infinity;
      for(const index of province.cells)if(mask[index]) {
        const p=cellPoint(this.grid,index), d=(p[0]-site[0])**2+(p[1]-site[1])**2;
        if(d<best){best=d;end=index;}
      }
      if(end<0)return;
      f.objective=cellPoint(this.grid,end);
    }
    u.order++; u.path=[]; u.orderMode="frontline"; u.destination=f.objective;
    this.route(u,u.destination);
  }
  private updateFrontlines() {
    const groups = new Map<string, Unit[]>(), stacks=unitStacks(this.state.units);
    for (const u of this.state.units)
      if (u.hp > 0 && !u.retreating && !u.embarkedOn && u.frontline && stacks.representatives.get(u.id)===u.id) {
        const key = `${u.nation}:${u.frontline.target}:${u.frontline.anchor.join(",")}`;
        const group = groups.get(key) ?? []; group.push(u); groups.set(key, group);
      }
    for (const troops of groups.values()) {
      const first=troops[0], f=first.frontline!;
      let border=this.frontlineBorder(first.nation,f.target,f.anchor);
      if (!border.points.length) {
        const all=this.frontlineBorder(first.nation,f.target);
        if(all.points.length) {
          const x=troops.reduce((n,u)=>n+u.x,0)/troops.length,z=troops.reduce((n,u)=>n+u.z,0)/troops.length;
          const anchor=all.points.reduce((a,b)=>Math.hypot(a[0]-x,a[1]-z)<Math.hypot(b[0]-x,b[1]-z)?a:b);
          for(const u of troops)u.frontline!.anchor=[...anchor];
          border=this.frontlineBorder(first.nation,f.target,anchor);
        }
      }
      if (!border.points.length) { for (const u of troops) { delete u.frontline; if(u.orderMode==="frontline"){u.order++;u.path=[];u.destination=null;} } continue; }
      troops.forEach((u,i)=>{
        const p=border.points[Math.min(border.points.length-1,Math.floor((i+0.5)*border.points.length/troops.length))];
        const old=u.frontline!.position, changed=Math.hypot(old[0]-p[0],old[1]-p[1])>this.grid.cell;
        u.frontline!.position=p;
        if(this.command.stance(u)==="attack" && this.atWar(u.nation,u.frontline!.target) && (u.nation===this.state.nation||this.aiAdvanceTargets.get(u.nation)===u.frontline!.target)) this.attackFrontline(u,p);
        else {
          const wasAttacking=!!u.frontline!.objective;
          delete u.frontline!.objective;
          if(wasAttacking || changed || (!u.path.length&&!u.destination&&Math.hypot(u.x-p[0],u.z-p[1])>this.grid.cell*1.5)) this.orderFrontline(u,p);
        }
      });
    }
  }
  private updateObstacles() {
    // Building changes affect economic summaries, but never invalidate land routes.
    this.buildingRevision++;
  }
  private defensiveBuild(n:NationState,type:"barracks"|"factory"){
    if(!n.capital)return false;
    const center=cellAt(this.grid,...n.capital);
    for(let radius=2;radius<=7;radius++)for(let offset=-radius;offset<=radius;offset++)for(const [dx,dz] of [[offset,-radius],[offset,radius],[-radius,offset],[radius,offset]]){
      const col=center%this.grid.width+dx,row=Math.floor(center/this.grid.width)+dz;if(col<0||col>=this.grid.width||row<0||row>=this.grid.height)continue;
      const p=cellPoint(this.grid,row*this.grid.width+col);if(!this.placementError(type,...p,n.id))return !this.build(type,...p,n.id);
    }
    return false;
  }
  private deployDefenders(n:NationState){
    const advance=this.aiAdvanceTargets.get(n.id);
    const target=advance&&this.frontlineBorder(n.id,advance).points.length?advance:n.defenseReadiness?.neighbor;if(!target)return;
    const leaders=this.state.leaders!.filter(l=>l.nation===n.id&&l.branch==="army");
    const previous=n.defenseReadiness!.previousStances??={};
    for(const leader of leaders){previous[leader.id]??=leader.stance??"attack";leader.stance=advance?"attack":"defend";}
    const border=this.frontlineBorder(n.id,target);if(!border.points.length)return;
    const pointsByLandmass=new Map<number,Point[]>();
    for(const p of border.points){const component=this.components[cellAt(this.grid,...p)],points=pointsByLandmass.get(component)??[];points.push(p);pointsByLandmass.set(component,points);}
    const stacks=unitStacks(this.state.units);
    const troops=this.state.units.filter(u=>u.nation===n.id&&u.hp>0&&!u.retreating&&!u.embarkedOn&&!isShip(u.type)&&stacks.representatives.get(u.id)===u.id);
    for(const [i,u] of troops.entries()){
      const points=pointsByLandmass.get(this.components[cellAt(this.grid,u.x,u.z)]);if(!points?.length)continue;
      if(u.frontline?.target===target)continue;
      u.leaderId??=leaders[0]?.id;
      const p=points[Math.min(points.length-1,Math.floor((i+0.5)*points.length/Math.max(1,troops.length)))];
      u.frontline={target,anchor:[...p],position:[...p]};this.orderFrontline(u,p);
    }
    this.frontlineAt=0;
  }
  private prioritizeDefense(n:NationState){
    const threat=neighboringThreat(this.state,n.id,this.borders.neighbors(this.territory.landRevision,n.id));
    if(threat.level){
      n.defenseReadiness??={level:threat.level,until:0,previousSpending:n.militarySpending??100,previousPriority:n.industryPolicy??"balanced"};
      Object.assign(n.defenseReadiness,{level:threat.level,neighbor:threat.target,until:this.state.elapsed+30});
    }else if(n.defenseReadiness&&this.state.elapsed>=n.defenseReadiness.until){
      for(const leader of this.state.leaders??[])if(leader.nation===n.id&&n.defenseReadiness.previousStances?.[leader.id])leader.stance=n.defenseReadiness.previousStances[leader.id];
      for(const u of this.state.units)if(u.nation===n.id&&u.frontline?.target===n.defenseReadiness.neighbor){delete u.frontline;u.order++;u.path=[];u.destination=null;}
      n.militarySpending=n.defenseReadiness.previousSpending;n.industryPolicy=n.defenseReadiness.previousPriority;delete n.defenseReadiness;
    }
    const readiness=n.defenseReadiness;if(!readiness)return false;
    n.militarySpending=n.credits>=400?(readiness.level>=2?175:150):n.credits>=150?125:100;
    n.industryPolicy="mobilized";
    this.deployDefenders(n);
    const reserve=150,target=Math.min(this.nationCapacity(n.id),Math.max(6,Math.ceil(this.nationCapacity(n.id)*0.5),Math.ceil(threat.formations*1.25)));
    const factories=this.economy.factories(n.id);
    if(n.supplies<80&&!factories.some(b=>b.recipe==="arms")){
      const candidate=factories.find(b=>!b.construction&&(b.recipe==="consumer"||b.recipe==="jewelry"));if(candidate){candidate.recipe="arms";candidate.progress=0;}
    }
    if(this.nationArmy(n.id)+n.queue.length<target){
      // Keep enough runway for upkeep; do not exhaust the treasury in a panic.
      const runway=Math.max(reserve,(this.militaryUpkeep(n.id)-this.baseIncome(n.id))*30);
      if(n.credits>runway){
        if(!n.capital){const cost=spending(n);if(n.credits-Math.ceil(75*cost)>=runway&&n.supplies>=Math.ceil(10*cost)){n.credits-=Math.ceil(75*cost);n.supplies-=Math.ceil(10*cost);n.reserves++;return true;}}
        else {let recruited=false;const type=productionBuildings(this.state,n.id,"armor").length&&n.supplies>=60?"armor":"infantry";
          for(let i=0;i<productionBuildings(this.state,n.id,type).length&&this.nationArmy(n.id)+n.queue.length<target;i++){
            if(n.credits-Math.ceil(unitSpecs[type].credits*spending(n))<runway||this.train(type,n.id))break;recruited=true;
          }
          if(recruited)return true;
        }
      }
      if(n.capital&&n.credits>reserve+buildingSpecs.barracks.credits&&!this.state.buildings.some(b=>b.nation===n.id&&b.hp>0&&b.type==="barracks")&&this.defensiveBuild(n,"barracks"))return true;
    }
    if(n.supplies<80&&n.capital&&n.credits>reserve+buildingSpecs.factory.credits&&!factories.some(b=>b.recipe==="arms")){
      if(this.defensiveBuild(n,"factory")){this.state.buildings.at(-1)!.recipe=factories.some(b=>b.recipe==="steel")?"arms":"steel";return true;}
    }
    // Once defensive needs are funded, economic investment can support the army.
    return false;
  }
  private developNation(n: NationState) {
    n.nextActionAt = this.state.elapsed + 9 + (seed(n.id) % 7);
    if(this.state.elapsed>=(n.nextAllianceAt??0)){
      n.nextAllianceAt=this.state.elapsed+25;
      const partner=chooseAiAlly(this.state,n.id,this.borders.neighbors(this.territory.landRevision,n.id));
      if(partner)this.setAlliance(partner,true,n.id);
      if(n.personality==="diplomat"&&n.credits>900){const candidate=this.borders.neighbors(this.territory.landRevision,n.id).find(id=>id!==this.state.nation&&!this.state.nations[id]?.defeated&&!this.atWar(n.id,id)&&relationScore(this.state,n.id,id)>=0&&!this.state.affairs!.embassies.includes(pairKey(n.id,id)));if(candidate){n.credits-=150;this.state.affairs!.embassies.push(pairKey(n.id,candidate));const key=pairKey(n.id,candidate);this.state.affairs!.relations[key]=(this.state.affairs!.relations[key]??0)+15;}}
      for(const w of this.state.wars.filter(w=>(w.a===n.id||w.b===n.id)&&this.state.elapsed-w.since>=150)){
        const other=w.a===n.id?w.b:w.a;if(other===this.state.nation)continue;
        if(n.supplies<25||n.credits<150||militaryPower(this.state,n.id)<militaryPower(this.state,other)*.65){this.makePeace(other,n.id);break;}
      }
    }
    if(this.prioritizeDefense(n))return;
    if(this.enemiesOf(n.id).length&&n.credits>1200&&this.state.buildings.filter(b=>b.nation===n.id&&b.hp>0&&b.type==="depot").length<4){
      const isolated=this.state.units.find(u=>u.nation===n.id&&u.hp>0&&!isShip(u.type)&&this.unitSupply(u)<.6);
      if(isolated)for(const [dx,dz] of [[2,0],[-2,0],[0,2],[0,-2]]){const x=isolated.x+dx*this.grid.cell,z=isolated.z+dz*this.grid.cell;if(!this.placementError("depot",x,z,n.id)){this.build("depot",x,z,n.id);return;}}
    }
    if((n.stability??70)<50&&(n.politicalPower??0)>=40&&n.civicPolicy!=="welfare"&&n.credits>=500){n.politicalPower!-=40;n.civicPolicy="welfare";}
    if (this.enemiesOf(n.id).length && this.developFleet(n)) return;
    if (n.credits > 450) {
      const deposit = this.state.nodes.find(
        (node) =>
          node.nation === n.id &&
          !node.claimed &&
          !this.placementError("mine", node.x, node.z, n.id),
      );
      if (deposit) {
        this.build("mine", deposit.x, deposit.z, n.id);
        return;
      }
    }
    if (n.capital && n.industry>=1 && n.credits>1000 && n.supplies>70) {
      const factories=this.economy.factories(n.id);
      if(factories.length<Math.min(4,1+Math.floor(n.industry/2))) {
        const center=cellAt(this.grid,...n.capital);
        for(let radius=2;radius<=7;radius++) for(let offset=-radius;offset<=radius;offset++) {
          for(const [dx,dz] of [[offset,-radius],[offset,radius],[-radius,offset],[radius,offset]]) {
            const col=center%this.grid.width+dx,row=Math.floor(center/this.grid.width)+dz;
            if(col<0||col>=this.grid.width||row<0||row>=this.grid.height)continue;
            const p=cellPoint(this.grid,row*this.grid.width+col);
            if(!this.placementError("factory",...p,n.id)) {
              this.build("factory",...p,n.id);
              const factory=this.state.buildings.at(-1)!;
              factory.recipe=(["steel","electronics","consumer","arms"] as const)[factories.length];
              return;
            }
          }
        }
      }
    }
    const cost = 160 * (n.industry + 1);
    if (n.industry < 8 && n.credits >= cost + 300) {
      this.investIndustry(n.id);
      return;
    }
    if (
      n.capital &&
      n.industry >= 1 &&
      n.credits > 650 &&
      !this.state.buildings.some(
        (b) => b.nation === n.id && b.type === "barracks" && b.hp > 0,
      )
    ) {
      const center = cellAt(this.grid, ...n.capital),
        owner = n.id;
      for (let dz = -7; dz <= 7; dz++)
        for (let dx = -7; dx <= 7; dx++) {
          const i = center + dz * this.grid.width + dx;
          if (
            i < 0 ||
            i >= this.grid.owners.length ||
            this.territory.controllerAt(i) !== owner
          )
            continue;
          const p = cellPoint(this.grid, i);
          if (!this.placementError("barracks", ...p, n.id)) {
            this.build("barracks", ...p, n.id);
            return;
          }
        }
    }
    const atWar = this.enemiesOf(n.id).length > 0,
      limit = Math.min(this.nationCapacity(n.id), atWar ? Math.max(12, Math.ceil(this.nationCapacity(n.id) * 0.5)) : Math.max(6, Math.ceil(this.nationCapacity(n.id) * 0.2)));
    if (
      this.nationArmy(n.id) + n.queue.length < limit &&
      n.credits > (atWar ? 180 : 850)
    ) {
      if (!n.capital) {
        const cost=spending(n);if(n.supplies<Math.ceil(10*cost)||n.credits<Math.ceil(75*cost))return;
        n.credits -= Math.ceil(75*cost);
        n.supplies -= Math.ceil(10*cost);
        n.reserves++;
      } else {
        const type =
          atWar &&
          n.industry > 2 &&
          productionBuildings(this.state, n.id, "armor").length
            ? "armor"
            : "infantry";
        const slots = productionBuildings(this.state, n.id, type).length;
        for (
          let i = 0;
          i < slots && this.nationArmy(n.id) + n.queue.length < limit;
          i++
        ) {
          if (
            n.credits - unitSpecs[type].credits < (atWar ? 80 : 500) ||
            this.train(type, n.id)
          )
            break;
        }
      }
    }

    this.developFleet(n);
    if (this.state.elapsed >= 180 && !n.defenseReadiness) {
      const targets = Object.values(this.state.nations).filter(
        (other) =>
          other.id !== n.id &&
          warReadiness(
            this.state,
            this.grid,
            this.components,
            n.id,
            other.id,
            this.naval.coastalOwners,
            (i) => this.territory.controllerAt(i),
          ).ready,
      );
      if (targets.length)
        this.declareWar(
          targets.sort((a, b) => b.credits - a.credits)[0].id,
          n.id,
        );
    }
  }

  neighbors(id:string){return this.borders.neighbors(this.territory.landRevision,id);}
  private fragmentNation(n:NationState){
    const owned=this.territory.states.filter(p=>this.territory.stateController(p)===n.id);if(owned.length<2)return;
    const capital=this.state.cities?.find(c=>c.nation===n.id&&c.capital&&c.controller===n.id),home=capital?this.territory.stateAt(cellAt(this.grid,capital.x,capital.z)):n.capital?this.territory.stateAt(cellAt(this.grid,...n.capital)):owned[0];
    const keep=home&&owned.includes(home)?home:owned[0],total=owned.reduce((sum,p)=>sum+p.cells.length,0),population=this.territory.population(n.id);
    const initial={credits:n.credits,supplies:n.supplies,industry:n.industry,reserves:n.reserves,power:n.politicalPower??0,stockpile:{...n.stockpile!},manpower:n.manpowerUsed??0};
    const transfers=new Map<string,string>();
    for(const p of owned)if(p!==keep){
      const id=`STATE-${n.id}-${p.id}`;if(this.state.nations[id])continue;
      const share=p.cells.length/total,site=this.state.cities?.find(c=>c.controller===n.id&&this.territory.stateAt(cellAt(this.grid,c.x,c.z))===p),stockpile=Object.fromEntries(Object.entries(initial.stockpile).map(([good,value])=>[good,value*share])) as NonNullable<NationState['stockpile']>;
      const child:NationState={id,credits:initial.credits*share,supplies:initial.supplies*share,industry:Math.floor(initial.industry*share),reserves:Math.floor(initial.reserves*share),capital:site?[site.x,site.z]:[...p.center],doctrine:n.doctrine,doctrineChangedAt:this.state.elapsed,nextActionAt:this.state.elapsed+10,queue:[],defeated:false,stockpile,domesticSales:true,tradePolicy:'balanced',industryPolicy:'balanced',militarySpending:100,ideology:n.ideology,stability:60,politicalPower:initial.power*share,personality:n.personality,stockIndex:n.stockIndex??100,stockHistory:[{tick:this.state.elapsed,value:n.stockIndex??100}],shares:0,consumerServed:0,manpowerUsed:Math.floor(initial.manpower*share),breakaway:{parent:n.id,province:p.id,name:p.name,population:Math.round(population*share),bounds:stateBounds(this.grid,p.cells)}};
      this.state.nations[id]=child;this.data.countries.push(breakawayCountry(child,this.data));transfers.set(p.id,id);
      n.credits-=child.credits;n.supplies-=child.supplies;n.industry-=child.industry;n.reserves-=child.reserves;n.politicalPower!-=child.politicalPower!;n.manpowerUsed=(n.manpowerUsed??0)-child.manpowerUsed!;
      for(const [good,value] of Object.entries(stockpile))n.stockpile![good as keyof typeof stockpile]-=value;
      this.command.create('army',id);this.command.create('navy',id);
    }
    if(!transfers.size)return;
    n.fracturedAt=this.state.elapsed;n.stability=Math.max(50,n.stability??0);delete n.instabilitySince;
    this.relationKey=''; // New governments require a full access table, not an ownership-only patch.
    if(capital)n.capital=[capital.x,capital.z];
    for(const u of this.state.units)if(u.nation===n.id&&!u.embarkedOn&&!isShip(u.type)){
      const owner=transfers.get(this.territory.stateAt(cellAt(this.grid,u.x,u.z))?.id??'');if(owner){u.nation=owner;u.team='enemy';delete u.leaderId;delete u.frontline;u.order++;u.path=[];u.destination=null;u.waypoints=[];this.command.assignAI(u);}
    }
    this.territory.secedeStates(transfers);
    const remaining:typeof n.queue=[];for(const order of n.queue){const owner=order.producer?this.state.buildings.find(b=>b.id===order.producer)?.nation:n.id;if(owner&&owner!==n.id)this.state.nations[owner].queue.push(order);else remaining.push(order);}n.queue=remaining;
    this.aiAdvanceTargets.delete(n.id);this.stackCacheTick=-1;
    const report=this.affairs.publish(n.id,'unrest');if(report){report.title=this.nationName(n.id)+' fragments into states';report.story=`After prolonged instability and demonstrations, ${transfers.size} states have declared independence. The central government retains its capital state; local governments now control their own economies and forces.`;report.severity=3;}
    this.onEvent(`${this.nationName(n.id)} fragmented: ${transfers.size} states became independent after 30 days of instability.`);this.onDiplomacy();saveCampaign(this.state);
  }
  enqueue(command:GameCommand):string|null {
    if(this.state.result!=="playing"||this.playerNation.defeated)return "This nation is no longer active.";
    if(this.state.pendingCommands!.length>=64)return "The next tick already has 64 orders queued.";
    this.state.pendingCommands!.push(structuredClone(command));saveCampaign(this.state);return null;
  }
  private executeCommand(command:GameCommand):string|null {
    switch(command.kind){
      case "research":return selectResearch(this.state,command.branch);
      case "upgradeMine":return upgradeMine(this.state,command.id);
      case "mergeUnits":return this.mergeUnits(command.ids);
      case "splitUnits":return this.splitUnits(command.ids);
      case "fallbackLine":{const units=this.commandUnits(command.ids);if(!units.length)return "Select formations first.";const heads=[...unitStacks(units).groups.values()].map(g=>g[0]);let error:string|null=null;heads.forEach((u,i)=>{const t=(i+.5)/heads.length;error=this.tactical([u.id],[command.start[0]+(command.end[0]-command.start[0])*t,command.start[1]+(command.end[1]-command.start[1])*t],"fallback")??error;});return error;}
      case "tactical":return this.tactical(command.ids,command.target,command.mode,command.append);
      case "rally":{const b=this.state.buildings.find(b=>b.id===command.id&&b.nation===this.state.nation&&b.hp>0);if(!b||!["hq","barracks","dock"].includes(b.type))return "Select a production building.";const mask=b.type==="dock"?this.naval.water:this.landMask(b.nation),end=nearestOpen(this.grid,mask,...command.target,3);if(end<0)return "Choose a valid rally point.";b.rally=cellPoint(this.grid,end);return null;}
      case "peaceTerms":return this.negotiatePeace(command.terms);
      case "objective":{if(!["economy","regional","formable"].includes(command.objective))return "Choose a valid campaign objective.";this.state.objective={kind:command.objective};return null;}
      case "ideology":return changeIdeology(this.state,command.ideology);
      case "civicPolicy":return changeCivicPolicy(this.state,command.policy);
      case "formNation":return this.formNation(command.id);
      case "tradePolicy":if(!["free","balanced","closed"].includes(command.policy))return "Invalid trade policy.";this.playerNation.tradePolicy=command.policy;return null;
      case "industryPolicy":if(!["balanced","civilian","industrial","mobilized"].includes(command.policy))return "Invalid industry policy.";this.playerNation.industryPolicy=command.policy;return null;
      case "spending":if(!Number.isFinite(command.value))return "Invalid budget.";this.playerNation.militarySpending=Math.round(Math.max(50,Math.min(200,command.value)));return null;
      case "embassy":return this.affairs.embassy(command.target);
      case "resolveNews":return this.affairs.resolve(command.id);
      case "shares":return this.affairs.shares(command.side,command.quantity);
      case "build":return this.build(command.type,command.x,command.z);
      case "train":return this.train(command.type);
      case "trade":return this.economy.trade(this.state.nation,command.commodity,command.side,command.quantity,command.partner);
      case "factoryRecipe":return this.economy.setRecipe(command.id,command.recipe);
      case "factoryToggle":return this.economy.toggleFactory(command.id);
      case "domesticSales":this.playerNation.domesticSales=command.enabled;return null;
      case "invest":return this.investIndustry();
      case "doctrine":return this.setDoctrine(command.doctrine);
      case "war":return this.declareWar(command.target);
      case "peace":return this.makePeace(command.target);
      case "alliance":return this.setAlliance(command.target,command.enabled);
      case "intelligence":return this.visibility.launch(command.target,command.mission);
      case "counterIntelligence":return this.visibility.counter();
      case "repairPort":return this.repairPort(command.id);
      case "embark":return this.naval.embark(command.ids);
      case "disembark":return this.naval.disembark(command.ids);
    }
  }
  /** Frame time accumulates here; authoritative state only advances in whole ticks. */
  step(dt:number){
    if(this.paused||this.state.result!=="playing"||!Number.isFinite(dt)||dt<=0)return;
    this.state.tickPhase!+=dt;tickingCampaigns.add(this.state);
    try {
      while(this.state.tickPhase!>=SECONDS_PER_TICK-1e-9){
        this.state.tickPhase=Math.max(0,this.state.tickPhase!-SECONDS_PER_TICK);
        this.simulateTick();
        if(this.paused||this.state.result!=="playing")break;
      }
    } finally {
      tickingCampaigns.delete(this.state);
      if(deferredSaves.delete(this.state))saveCampaign(this.state);
    }
  }
  private simulateTick() {
    const dt=SECONDS_PER_TICK;
    const s = this.state;
    if (this.paused || s.result !== "playing") return;
    s.elapsed += dt;
    const commands=s.pendingCommands!.splice(0);
    for(const command of commands){const error=this.executeCommand(command);if(error){this.onEvent(`Order skipped: ${error}`);this.onCommandError(error);}}
    if(commands.length)saveCampaign(s);
    this.treatyTick();
    this.logistics.refresh();
    this.affairs.tick();
    this.visibility.tick();
    this.forceCounts.clear();
    for(const u of s.units)if(u.hp>0)this.forceCounts.set(u.nation,(this.forceCounts.get(u.nation)??0)+1);
    for (const n of Object.values(s.nations))
      if (!n.defeated) {
        n.credits = Math.max(0,n.credits+(this.baseIncome(n.id)-this.militaryUpkeep(n.id))*dt);
        n.supplies = Math.min(9999, Math.max(0,n.supplies + (this.supplyIncome(n.id)-this.supplyUpkeep(n.id))*dt));
        const ready = advanceProduction(
          s,
          n.id,
          dt,
          this.nationIncome(n.id),
          (type, producer) => {
            const built=!this.demilitarized(cellAt(this.grid,producer.x,producer.z))&&this.nationArmy(n.id) < this.nationCapacity(n.id) && addUnit(
              s,
              this.data,
              this.grid,
              this.walkable,
              n.id,
              type,
              [producer.x, producer.z],
              this.naval.water,
            );
            if(built&&producer.rally){const u=s.units.at(-1)!;u.organization=100;u.orderMode=n.id===s.nation?"manual":"ai";u.destination=[...producer.rally];this.route(u,u.destination);}
            return built;
          },
        );
        if (n.id === s.nation)
          for (const type of ready)
            this.onEvent(unitSpecs[type].label + " ready.");
        if (n.id !== s.nation && s.elapsed >= n.nextActionAt)
          this.developNation(n);
      }
    this.economy.tick(dt);
    advanceResearch(s);advanceMineUpgrades(s);
    politicsDay(s);
    if(s.elapsed%5===0)for(const n of Object.values(s.nations))if(fragmentationDue(s,n))this.fragmentNation(n);
    if (s.elapsed >= this.raidAt) {
      this.raidAt = s.elapsed + 7;
      this.commandAI();
    }
    if (s.elapsed >= this.frontlineAt) {
      this.frontlineAt = s.elapsed + 2;
      this.updateFrontlines();
    }
    this.combatIndex.rebuild([
      ...s.units.filter((u) => u.hp > 0 && !u.embarkedOn),
      ...s.buildings.filter((b) => b.hp > 0),
    ]);
    const formations=lockNearbyStacks(s.units);
    for(const group of formations.groups.values())if(group.length>1){if(group.some(u=>this.needsRetreat(u))&&!group[0].retreating)this.retreat(group[0]);this.synchronizeStack(group);}
    const positions=new UnitPositions(s.units);
    let trafficBudget=2;
    for (const u of s.units) {
      if (u.hp <= 0 || u.embarkedOn) continue;
      const allowed=(p:Point)=>{const i=cellAt(this.grid,...p);return i>=0&&(isShip(u.type)?!!this.naval.water[i]:!!this.grid.walkable[i]&&this.canEnter(u.nation,i));};
      const head=formations.representatives.get(u.id)===u.id;
      if(head&&u.retreating&&u.destination&&Math.hypot(u.destination[0]-u.x,u.destination[1]-u.z)>3.01){u.order++;u.path=[];u.destination=null;}
      if(head&&!u.path.length&&!u.destination)positions.place(u,[u.x,u.z],allowed);
      const supply=this.unitSupply(u);
      recoverUnit(s,u,supply,(s.nations[u.nation].manpowerUsed??0)<this.territory.population(u.nation)*.01);
      if(head&&this.needsRetreat(u))this.retreat(u);
      const spec = unitSpecs[u.type],
        doctrine = doctrines[s.nations[u.nation].doctrine];
      u.cooldown -= dt;
      let closest: Unit | Building | null = null,
        distance = spec.range;
      if (s.wars.length && spec.damage > 0)
        for (const target of this.combatIndex.near(u.x, u.z, spec.range)) {
          if (
            target.hp <= 0 ||
            !this.atWar(u.nation, target.nation) ||
            isShip(u.type) !== isShip(target.type)
          )
            continue;
          if ("path" in target && !this.visibility.canSee(u.nation, target))
            continue;
          if (((this.command.stance(u) === "defend" && u.tacticalOrder!=="attackMove") || u.tacticalOrder==="hold" || u.tacticalOrder==="fallback" || u.retreating) && !((u.underFireUntil ?? 0) > s.elapsed && u.lastAttackerId === target.id)) continue;
          const d = Math.hypot(target.x - u.x, target.z - u.z);
          if (d < distance) {
            closest = target;
            distance = d;
          }
        }
      if (
        closest &&
        this.lineOfFire([u.x, u.z], [closest.x, closest.z], isShip(u.type))
      ) {
        while (u.cooldown <= 0 && closest.hp > 0) {
          const previousHp = closest.hp;
          closest.hp = Math.max(
            0,
            closest.hp -
              spec.damage * techCombat(s.nations[u.nation],u.type).attack * 0.4 * (0.4+0.6*(u.organization??100)/100) * (0.5+0.5*supply) *
                doctrine.damage * this.command.bonuses(u).damage * combatFunding(s.nations[u.nation]) * ideologyOf(s.nations[u.nation]).damage * stabilityEffect(s.nations[u.nation]) *
                (personnel(u)/1000) * (u.path.length?0.7:1) *
                ("path" in closest && !closest.path.length ? 0.65 : 1) *
                (u.type==="infantry" && closest.type==="armor"?0.45:1) *
                doctrines[s.nations[closest.nation].doctrine].received *
                ("path" in closest ? this.command.bonuses(closest).received*techCombat(s.nations[closest.nation],closest.type).received : 1),
          );
          u.lastShotTarget=[closest.x,closest.z];u.lastFiredAt=s.elapsed;u.lastCombatAt=s.elapsed;u.organization=Math.max(0,(u.organization??100)-1.2);
          if ("path" in closest) { closest.lastAttackerId=u.id; closest.underFireUntil=s.elapsed+4;closest.lastCombatAt=s.elapsed;closest.organization=Math.max(0,(closest.organization??100)-(previousHp-closest.hp)/closest.maxHp*160-2); }
          this.command.recordDamage(u, previousHp - closest.hp);
          u.cooldown += isShip(u.type) ? 1.25 : u.type === "armor" ? 1.1 : 0.75;
          this.onShot([u.x, u.z], [closest.x, closest.z], u.team, u.nation);
        }
        u.cooldown=Math.max(0,u.cooldown);
        if (!u.retreating && (u.tacticalOrder==="attackMove" || (u.orderMode !== "manual" && !(this.command.stance(u) === "defend" && u.destination)))) continue;
      }
      u.cooldown=Math.max(0,u.cooldown);
      if(!head)continue;
      const beforeX=u.x,beforeZ=u.z,firstPoint=u.path[0],hadPath=u.path.length>0;
      const group=formations.groups.get(u.id)??[u];
      let movement = (0.5+0.5*supply)*Math.min(...group.map(member=>this.unitSpeedKmh(member))) * 2.4 / (this.data.kmPerUnit??45) * dt;
      while (u.path.length && movement > 0) {
        const point = u.path[0];
        if (!isShip(u.type) && !this.canEnter(u.nation, cellAt(this.grid, ...point))) {
          u.order++; u.path = []; u.destination = null; break;
        }
        const d = Math.hypot(point[0] - u.x, point[1] - u.z);
        const step=Math.min(d,movement),target:Point=d<=movement?point:[u.x+(point[0]-u.x)/d*movement,u.z+(point[1]-u.z)/d*movement];
        const placed=positions.place(u,target,p=>allowed(p)&&routeCellsClear(this.grid,[u.x,u.z],[p],i=>isShip(u.type)?!!this.naval.water[i]:!!this.grid.walkable[i]&&this.canEnter(u.nation,i)),step);
        if(!placed)break;
        if(Math.hypot(u.x-point[0],u.z-point[1])<0.001){u.path.shift();movement-=step;}else{if(u.path.length===1&&d<=movement&&Math.hypot(u.x-point[0],u.z-point[1])<(isShip(u.type)?1.3:0.75)){u.path.shift();u.destination=null;}movement=0;}

      }
      if (
        !u.path.length &&
        u.destination &&
        Math.hypot(u.x - u.destination[0], u.z - u.destination[1]) <
          this.grid.cell
      )
        u.destination = null;
      if(hadPath){const moved=Math.hypot(u.x-beforeX,u.z-beforeZ)>.00001,progress=u.path[0]!==firstPoint||Math.hypot(firstPoint[0]-beforeX,firstPoint[1]-beforeZ)-Math.hypot(firstPoint[0]-u.x,firstPoint[1]-u.z)>.00001;u.blockedTicks=progress?0:(u.blockedTicks??0)+1;if(moved)u.lastMovedAt=s.elapsed;}
      if(trafficBudget>0&&(u.blockedTicks??0)>=4&&u.destination&&(u.trafficRetryAt??0)<=s.elapsed){
        u.trafficRetryAt=s.elapsed+10;
        const blockers=positions.traffic(u).filter(b=>isShip(b.type)===isShip(u.type)&&!this.atWar(u.nation,b.nation)&&this.visibility.canSee(u.nation,b));
        if(blockers.length){const cells=trafficCells(this.grid,u,blockers);if(cells.length){trafficBudget--;this.requestTrafficPath(u,u.destination,cells);}}
      }
      if(!u.path.length&&!u.destination&&u.waypoints?.length){const next=u.waypoints.shift()!;u.order++;u.destination=next;this.route(u,next);}
    }
    for(const group of formations.groups.values())if(group.length>1){for(const u of group.slice(1))positions.follow(u,group[0]);this.synchronizeStack(group);}
    lockNearbyStacks(s.units);
    this.stackCacheTick=-1;
    this.visibility.refresh(true);
    this.naval.tick();
    for(const group of unitStacks(s.units).groups.values())if(group.length>1)this.synchronizeStack(group);
    let destroyed = false;
    for (const b of s.buildings)
      if (b.hp <= 0 && b.maxHp > 0) {
        b.maxHp = 0;
        destroyed = true;
        if (b.type === "mine") {
          const node = s.nodes.find(
            (n) => Math.hypot(n.x - b.x, n.z - b.z) < 2.5,
          );
          if (node) node.claimed = false;
        }
        if (b.nation === s.nation)
          this.onEvent(
            "Your " +
              (b.type === "hq" ? "headquarters" : b.type) +
              " was destroyed. Remaining territory is still yours.",
          );
      }
    s.units = s.units.filter((u) => u.hp > 0);
    for (const ship of s.units)
      if (ship.cargo)
        ship.cargo = ship.cargo.filter((id) =>
          s.units.some((u) => u.id === id),
        );
    if (destroyed) this.updateObstacles();
    this.territory.tick(dt);
    if (s.elapsed >= this.conquestCheckAt) {
      this.conquestCheckAt = s.elapsed + 1;
      this.checkCapitulations();
      const counts = this.territory.landCounts();
      for (const n of Object.values(s.nations))
        if (!n.defeated && !counts[n.id] && this.nationArmy(n.id) === 0) {
          n.defeated = true;
          n.queue = [];
          s.wars = s.wars.filter((w) => w.a !== n.id && w.b !== n.id);
          s.alliances = s.alliances!.filter((w) => w.a !== n.id && w.b !== n.id);
          this.refreshAccess();
          this.onEvent(
            this.nationName(n.id) + " has no territory or forces remaining.",
          );
          this.onDiplomacy();
        }
      if (this.playerNation.defeated) s.result = "defeat";
    }
    const counts=this.territory.landCounts(),total=Object.values(counts).reduce((a,b)=>a+b,0);
    if(s.objective&&s.objective.completedAt===undefined&&objectiveProgress(s,this.playerNation,(counts[s.nation]??0)/Math.max(1,total)).progress>=1){s.objective.completedAt=s.elapsed;this.onEvent("Campaign objective completed. You can continue playing or choose a new objective.");}
    if (s.elapsed >= this.saveAt || s.result !== "playing") {
      this.saveAt = s.elapsed + 10;
      saveCampaign(s);
    }
  }
  private needsRetreat(u:Unit){return (u.organization??100)<=15&&!u.retreating&&(u.lastCombatAt??-100)>=this.state.elapsed-5&&!(u.orderMode==="manual"&&(u.path.length||u.destination));}
  private retreat(u:Unit){
    // Exhaustion is a local recovery order, never a journey to a city/capital.
    const mask=isShip(u.type)?this.naval.water:this.landMask(u.nation),members=u.stackId===undefined?[u]:this.state.units.filter(v=>v.nation===u.nation&&v.stackId===u.stackId&&v.hp>0);
    const underFire=members.some(v=>(v.underFireUntil??0)>this.state.elapsed);
    const threats=underFire?[...this.combatIndex.near(u.x,u.z,10)].filter((v):v is Unit=>"path" in v&&v.hp>0&&this.atWar(u.nation,v.nation)&&unitSpecs[v.type].damage>0&&this.visibility.canSee(u.nation,v)&&Math.hypot(v.x-u.x,v.z-u.z)<=unitSpecs[v.type].range+1):[];
    u.retreating=true;u.order++;u.path=[];u.destination=null;u.waypoints=[];
    if(!threats.length)return;
    const clearance=(p:Point)=>Math.min(...threats.map(v=>Math.hypot(v.x-p[0],v.z-p[1])));
    let best=clearance([u.x,u.z])+.25,destination:Point|null=null;
    for(const radius of [1,2,3])for(let angle=0;angle<Math.PI*2;angle+=Math.PI/4){const p:Point=[u.x+Math.cos(angle)*radius,u.z+Math.sin(angle)*radius],cell=cellAt(this.grid,...p);if(cell<0||!mask[cell]||!routeCellsClear(this.grid,[u.x,u.z],[p],i=>!!mask[i]))continue;const score=clearance(p);if(score>best){best=score;destination=p;}}
    if(destination){u.destination=destination;u.path=[destination];}
  }
  peaceAssessment(terms:PeaceTerms){
    const target=this.state.nations[terms.target],actor=this.state.nation;
    if(!target||!this.atWar(actor,terms.target))return "Select a nation at war with you.";
    if(!Number.isFinite(terms.reparations)||terms.reparations<0||terms.reparations>100)return "Reparations must be 0–100 credits/day.";
    if(new Set(terms.keepStates).size!==terms.keepStates.length)return "Choose each state once.";
    for(const id of terms.keepStates){const p=this.territory.states.find(p=>p.id===id),occupation=this.state.stateOccupation?.[id];if(!p||this.territory.stateController(p)!==actor||occupation?.opponent!==terms.target)return "Only states occupied in this war may be demanded.";}
    const occupied=this.territory.states.filter(p=>this.territory.stateController(p)===actor&&this.state.stateOccupation?.[p.id]?.opponent===terms.target).length;
    const enemyPower=militaryPower(this.state,terms.target),power=militaryPower(this.state,actor);
    const leverage=occupied*2+(power>enemyPower*1.5?2:0)+(this.state.elapsed-(this.state.wars.find(w=>[w.a,w.b].includes(actor)&&[w.a,w.b].includes(terms.target))?.since??this.state.elapsed)>50?1:0);
    const demands=terms.keepStates.length*2+terms.reparations/25+(terms.demilitarize?1:0);
    return demands>leverage?"Terms rejected: demand less territory or reparations, or improve your position.":null;
  }
  negotiatePeace(terms:PeaceTerms){const error=this.peaceAssessment(terms);return error??this.makePeace(terms.target,this.state.nation,terms);}
  private treatyTick(){
    const s=this.state,expired=s.treaties!.some(t=>t.until<=s.elapsed);s.treaties=s.treaties!.filter(t=>t.until>s.elapsed);
    if(expired)this.refreshAccess();
    if(s.elapsed%5)return;
    for(const t of s.treaties!)if(t.payer&&t.recipient&&t.remaining>0){const a=s.nations[t.payer],b=s.nations[t.recipient];if(!a||!b||a.defeated||b.defeated)continue;const paid=Math.min(a.credits,t.payment,t.remaining);a.credits-=paid;b.credits+=paid;t.remaining-=paid;}
    const garrisons=new Set(s.units.filter(u=>u.hp>0&&!u.embarkedOn&&!isShip(u.type)).map(u=>u.nation+"|"+this.territory.stateAt(cellAt(this.grid,u.x,u.z))?.id));
    for(const [id,r] of Object.entries(s.resistance!)){const p=this.territory.states.find(p=>p.id===id);if(!p){delete s.resistance![id];continue;}const controller=this.territory.stateController(p);const garrison=garrisons.has(controller+"|"+id);r.level=Math.max(0,Math.min(100,r.level+(garrison?-4:1)));if(!r.level)delete s.resistance![id];else if(r.level>=50)s.nations[controller].credits=Math.max(0,s.nations[controller].credits-r.level*.05);}
  }
  repairPort(id:string):string|null {
    const b=this.state.buildings.find((b)=>b.portId===id);
    if(!b||this.territory.controllerAt(cellAt(this.grid,b.x,b.z))!==this.state.nation)return "Control this port to repair its dock.";
    if(b.hp>0)return "This port is already operational.";
    if(this.playerNation.credits<180||this.playerNation.supplies<30)return "Repair needs 180 credits and 30 supplies.";
    this.playerNation.credits-=180;this.playerNation.supplies-=30;b.nation=this.state.nation;b.team="player";b.hp=b.maxHp=350;this.updateObstacles();saveCampaign(this.state);return null;
  }
  private developFleet(n: NationState): boolean {
    if (!n.capital || n.credits < 500 || n.industry < 1) return false;
    let dock = this.state.buildings.find(
      (b) => b.nation === n.id && b.type === "dock" && b.hp > 0,
    );
    if (!dock && this.data.ports) return false;
    if (!dock) {
      const owner = this.data.countries.findIndex((c) => c.id === n.id);
      const sites: number[] = [];
      for (const i of this.naval.coasts)
        if (this.grid.walkable[i] && this.territory.controllerAt(i) === n.id)
          sites.push(i);
      sites.sort((a, b) => {
        const p = cellPoint(this.grid, a),
          q = cellPoint(this.grid, b);
        return (
          Math.hypot(p[0] - n.capital![0], p[1] - n.capital![1]) -
          Math.hypot(q[0] - n.capital![0], q[1] - n.capital![1])
        );
      });
      for (const i of sites) {
        const p = cellPoint(this.grid, i);
        if (!this.placementError("dock", ...p, n.id)) {
          this.build("dock", ...p, n.id);
          return true;
        }
      }
      return false;
    }
    if (
      n.queue.filter((q) => isShip(q.type)).length >=
        productionBuildings(this.state, n.id, "transport").length * 3 ||
      this.nationArmy(n.id) + n.queue.length >= this.nationCapacity(n.id)
    )
      return false;
    const fleet = this.state.units.filter(
        (u) => u.nation === n.id && isShip(u.type),
      ),
      atWar = this.enemiesOf(n.id).length > 0;
    if (
      (atWar || n.credits > 1300) &&
      !fleet.some((u) => u.type === "frigate") &&
      !n.queue.some((q) => q.type === "frigate")
    )
      return !this.train("frigate", n.id);
    if (
      (atWar || n.credits > 1500) &&
      !fleet.some((u) => u.type === "transport") &&
      !n.queue.some((q) => q.type === "transport")
    )
      return !this.train("transport", n.id);
    return false;
  }
  controlsNation(id:string,actor=this.state.nation){
    const provinces=this.territory.states.filter(p=>p.original===id),cities=this.state.cities!.filter(c=>c.nation===id);
    return provinces.length?provinces.every(p=>(this.state.states?.[p.id]??p.original)===actor)&&cities.every(c=>c.controller===actor):id===actor||this.state.nations[id]?.annexedBy===actor;
  }
  formNation(id:string):string|null{
    const result=formationProgress(this.state,this.data,this.state.nation,id,n=>this.controlsNation(n));if(result.error||!result.definition)return result.error;
    for(const nation of result.definition.required)if(nation!==this.state.nation&&this.state.nations[nation].annexedBy!==this.state.nation)this.absorbNation(nation,this.state.nation,true);
    this.territory.coreCountries(result.definition.required,this.state.nation);
    this.playerNation.formedNation=id;this.playerNation.stability=Math.min(100,this.playerNation.stability!+5);this.onDiplomacy();this.onEvent(result.definition.name+" proclaimed.");saveCampaign(this.state);return null;
  }
  private absorbNation(loser:string,victor:string,merge=false){
    const n=this.state.nations[loser];
    if(merge){this.state.nations[victor].reserves+=n.reserves;this.state.nations[victor].queue.push(...n.queue);}
    n.defeated = true; n.annexedBy = victor; n.reserves = 0; n.queue = [];
      const winner = this.state.nations[victor];
      this.economy.annex(n.id,victor);
      winner.credits += n.credits; winner.supplies = Math.min(9999, winner.supplies + n.supplies);
      winner.industry += n.industry; n.credits = 0; n.supplies = 0; n.industry = 0;
      for (const u of this.state.units) if (u.nation === n.id){if(merge){u.nation=victor;u.team=teamFor(this.state,victor);delete u.leaderId;delete u.frontline;u.order++;u.path=[];u.destination=null;}else u.hp=0;}
      this.state.wars = this.state.wars.filter((w) => w.a !== n.id && w.b !== n.id);
      this.state.alliances = this.state.alliances!.filter((w) => w.a !== n.id && w.b !== n.id);
      for (const nation of Object.values(this.state.nations))
        if (nation.annexedBy === n.id) nation.annexedBy = victor;
      // One territory notification updates access and withdraws stranded forces.
      this.territory.annex(n.id, victor);
  }
  private checkCapitulations() {
    for (const n of Object.values(this.state.nations)) {
      if (n.defeated) continue;
      const cities = (this.state.cities ?? []).filter((c) => c.nation === n.id),
        capital = cities.find((c) => c.capital) ?? cities[0];
      if (!capital || capital.controller === n.id || !this.atWar(n.id, capital.controller)) continue;
      const lost = cities.filter((c) => c.controller !== n.id).length;
      if (lost <= cities.length / 2) continue;
      const victor = capital.controller;
      this.absorbNation(n.id,victor);
      this.onEvent(this.nationName(n.id) + " capitulated and was annexed by " + this.nationName(victor) + ".");
      this.onDiplomacy();
    }
  }
  private commandAI() {
    const forces=landStrengths(this.state);
    for(const n of Object.values(this.state.nations))if(n.id!==this.state.nation&&!n.defeated){
      const previous=this.aiAdvanceTargets.get(n.id),enemies=this.enemiesOf(n.id);
      const target=previous&&canAiAdvance(this.state,n.id,previous,forces,true)?previous:enemies.filter(id=>canAiAdvance(this.state,n.id,id,forces)).sort((a,b)=>(forces.get(a)?.power??0)-(forces.get(b)?.power??0))[0];
      if(target)this.aiAdvanceTargets.set(n.id,target);else this.aiAdvanceTargets.delete(n.id);
      if(enemies.length)for(const leader of this.state.leaders??[])if(leader.nation===n.id&&leader.branch==="army")leader.stance=target?"attack":"defend";
      if(n.defenseReadiness&&(target!==previous||!target))this.deployDefenders(n);
    }
    for (const n of Object.values(this.state.nations))
      if (n.id !== this.state.nation && !n.defeated) {
        const allEnemies = this.enemiesOf(n.id),advance=this.aiAdvanceTargets.get(n.id);
        const enemies=advance?[advance]:allEnemies;
        if (!enemies.length) continue;
        const goals = (this.state.cities ?? []).filter((c) =>
          enemies.includes(c.controller),
        );
        const fallback = this.state.buildings.filter(
          (b) => b.hp > 0 && enemies.includes(b.nation) && this.visibility.canSeeBuilding(n.id, b),
        );
        const provinces=this.territory.states.filter(p=>enemies.includes(this.territory.stateController(p))).map(p=>({x:p.center[0],z:p.center[1],controller:this.territory.stateController(p)}));
        const targets = [...goals, ...fallback,...provinces];
        if (!targets.length) continue;
        const own = this.state.units.filter(
            (u) => u.nation === n.id && u.hp > 0 && !u.embarkedOn,
          ),
          troops = own.filter((u) => !isShip(u.type));
        for (const u of own) {
          if (u.retreating || u.embarkedOn || u.path.length || u.destination || u.frontline || (!isShip(u.type) && (!advance||this.command.stance(u)==="defend"))) continue;
          let target = targets.reduce((a, b) =>
            Math.hypot(a.x - u.x, a.z - u.z) < Math.hypot(b.x - u.x, b.z - u.z)
              ? a
              : b,
          );
          let goal: Point = [target.x, target.z];
          if (u.type === "frigate") {
            const rival = this.state.units.find(
              (v) =>
                isShip(v.type) &&
                enemies.includes(v.nation) &&
                this.visibility.canSee(n.id, v),
            );
            if (rival) goal = [rival.x, rival.z];
            const end = nearestOpen(this.grid, this.naval.water, ...goal, 16);
            if (end < 0) continue;
            goal = cellPoint(this.grid, end);
          } else if (u.type === "transport") {
            if (!u.cargo?.length) {
              const port = this.state.buildings.find(
                (b) => b.nation === n.id && b.type === "dock" && b.hp > 0,
              );
              if (!port) continue;
              this.naval.embark(
                troops.slice(2, 8).map((t) => t.id),
                n.id,
              );
              if (!u.cargo?.length) {
                const sea = nearestOpen(
                  this.grid,
                  this.naval.water,
                  port.x,
                  port.z,
                  4,
                );
                if (sea < 0) continue;
                goal = cellPoint(this.grid, sea);
                const land = nearestOpen(
                  this.grid,
                  this.walkable,
                  port.x + 1,
                  port.z + 1,
                  5,
                );
                if (land >= 0)
                  for (const t of troops.slice(2, 8))
                    if (!t.path.length) {
                      t.order++;
                      t.destination = cellPoint(this.grid, land);
                      this.route(t, t.destination);
                    }
              }
            }
            if (u.cargo?.length) {
              const end = this.naval.landingDestination(u, [
                target.x,
                target.z,
              ]);
              if (!end) {
                const owner = this.data.countries.findIndex(
                    (c) =>
                      c.id ===
                      ("controller" in target
                        ? target.controller
                        : target.nation),
                  ),
                  coasts: number[] = [];
                for (const i of this.naval.coasts)
                  if (this.grid.walkable[i] && this.territory.controllerAt(i) === this.data.countries[owner]?.id)
                    coasts.push(i);
                coasts.sort((a, b) => {
                  const p = cellPoint(this.grid, a),
                    q = cellPoint(this.grid, b);
                  return (
                    Math.hypot(p[0] - u.x, p[1] - u.z) -
                    Math.hypot(q[0] - u.x, q[1] - u.z)
                  );
                });
                if (!coasts.length) continue;
                const coast = cellPoint(this.grid, coasts[0]);
                const water = this.naval.landingDestination(u, coast);
                if (!water) continue;
                goal = water;
              } else goal = end;
            }
          } else {
            const end = nearestOpen(this.grid, this.landMask(n.id), ...goal, 8);
            if (end < 0) continue;
            const start = cellAt(this.grid, u.x, u.z);
            if (this.components[start] !== this.components[end]) continue;
            goal = cellPoint(this.grid, end);
            // A legal adjacent arrival already occupies the objective state. Let
            // combat/capture proceed instead of repeatedly targeting its crowded centre.
            if(Math.hypot(u.x-goal[0],u.z-goal[1])<0.75&&this.territory.stateAt(start)&&this.territory.stateAt(start)===this.territory.stateAt(end))continue;
          }
          u.order++;
          u.destination = goal;
          this.route(u, goal);
        }
      }
  }
  private lineOfFire(a: Point, b: Point, sea = false) {
    const steps = Math.ceil(
      Math.hypot(b[0] - a[0], b[1] - a[1]) / (this.grid.cell * 0.5),
    );
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0,
        index = cellAt(
          this.grid,
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
        );
      if (
        index < 0 ||
        (sea ? !this.naval.water[index] : this.grid.owners[index] < 0)
      )
        return false;
    }
    return true;
  }
}
