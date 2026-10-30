import { describe, expect, it } from "vitest";
import { MilitaryCommand, leaderBonuses, leaderLevel, majoritySelection } from "./leaders";
import { activeOccupation, activeSeaControl } from "./territory-style";
import {preparePoliticalFields} from "./political-fields";
import { PoliticalTerrain } from "./political-terrain";
import { createCampaign, Simulation } from "./campaign";
import { createGrid, cellAt } from "./navigation";
import type { Campaign, ContinentData, LeaderBranch, Point, Unit } from "./types";

const ring = (a: number, b: number): Point[] => [[a,-10],[b,-10],[b,10],[a,10]];
const data: ContinentData = { id:"leadership", bounds:[-30,-12,30,12], lakes:[], countries:[
  {id:"AAA",name:"Alpha",bounds:[-28,-10,0,10],polygons:[[ring(-28,0)]]},
  {id:"BBB",name:"Beta",bounds:[0,-10,28,10],polygons:[[ring(0,28)]]},
] };
const grid = createGrid(data,64);
function setup() {
  const sim = new Simulation(data,grid,createCampaign(data,grid,"AAA"));
  sim.state.units = []; sim.state.buildings = []; sim.walkable = grid.walkable.slice();
  for (const n of Object.values(sim.state.nations)) { n.nextActionAt = Infinity; n.doctrine = "balanced"; }
  return sim;
}
function troop(state: Campaign, type: Unit["type"], nation="AAA") {
  const unit: Unit = { id:state.nextId++,nation,team:nation === "AAA" ? "player" : "enemy",type,x:-15,z:0,hp:90,maxHp:90,path:[],order:0,cooldown:0 };
  state.units.push(unit); return unit;
}
function leader(sim: Simulation, branch: LeaderBranch) { return sim.state.leaders!.find((l)=>l.nation === "AAA" && l.branch === branch)!; }

describe("separate army and naval commands",()=>{
  it("adds leaders to older saves, keeps restored leaders and colours, and removes invalid cross-branch assignments",()=>{
    const sim=setup(), ground=troop(sim.state,"infantry");
    const general=leader(sim,"army"), admiral=leader(sim,"navy");
    expect(sim.state.leaders!.filter((l)=>l.nation === "AAA")).toHaveLength(4);
    expect(sim.command.setColor(general.id,"#c455ff")).toBeNull();
    ground.leaderId=admiral.id;
    const restored=new Simulation(data,grid,JSON.parse(JSON.stringify(sim.state)));
    expect(restored.command.get(general.id)?.color).toBe("#c455ff");
    expect(restored.state.leaders).toHaveLength(sim.state.leaders!.length);
    expect(restored.state.units[0].leaderId).toBeUndefined();
  });
  it("assigns and retains only the army majority without changing the navy's current commander",()=>{
    const sim=setup(), a=troop(sim.state,"infantry"), b=troop(sim.state,"armor"), ship=troop(sim.state,"frigate"),
      general=leader(sim,"army"), admiral=leader(sim,"navy");
    ship.leaderId=admiral.id;
    const result=sim.command.assign([a.id,b.id,ship.id],general.id);
    expect(result.error).toBeNull(); expect(result.ids).toEqual([a.id,b.id]);
    expect(a.leaderId).toBe(general.id); expect(b.leaderId).toBe(general.id); expect(ship.leaderId).toBe(admiral.id);
    expect(sim.command.assign([a.id,b.id,ship.id],admiral.id).error).toMatch(/majority/);
  });
  it("uses naval majorities, army ties, and ignores duplicate, foreign, dead, and embarked IDs",()=>{
    const sim=setup(), a=troop(sim.state,"infantry"), ship=troop(sim.state,"frigate"), transport=troop(sim.state,"transport"),
      foreign=troop(sim.state,"frigate","BBB"), dead=troop(sim.state,"armor"), embarked=troop(sim.state,"armor");
    dead.hp=0; embarked.embarkedOn=transport.id;
    expect(majoritySelection(sim.state,[a.id,ship.id]).branch).toBe("army");
    const ids=[a.id,ship.id,transport.id,foreign.id,dead.id,embarked.id,a.id];
    const result=sim.command.assign(ids,leader(sim,"navy").id);
    expect(result.error).toBeNull(); expect(result.ids).toEqual([ship.id,transport.id]); expect(a.leaderId).toBeUndefined();
  });
  it("validates command ownership and colour input, while embarked infantry retain their general",()=>{
    const sim=setup(), a=troop(sim.state,"infantry"), general=leader(sim,"army"), foreign=sim.state.leaders!.find((l)=>l.nation === "BBB")!;
    expect(sim.command.assign([a.id],foreign.id).error).toMatch(/your military/);
    expect(sim.command.setColor(general.id,"red")).toMatch(/valid/);
    expect(sim.command.setColor(foreign.id,"#ffffff")).toMatch(/your military/);
    expect(sim.command.assign([a.id],general.id).error).toBeNull();
    a.embarkedOn=999;
    expect(sim.command.forUnit(a)?.branch).toBe("army"); expect(sim.command.force(general.id)).toHaveLength(1);
    const next=sim.command.create("army")!;
    expect(next.id).not.toBe(general.id); expect(next.branch).toBe("army");
  });
  it("applies command combat and movement bonuses, awards actual damage XP, and caps level growth",()=>{
    const sim=setup(), a=troop(sim.state,"infantry"), enemy=troop(sim.state,"infantry","BBB"), general=leader(sim,"army");
    a.x=-1.5; enemy.x=1.5;
    sim.command.assign([a.id],general.id); sim.setLeaderStance(general.id,"attack"); sim.declareWar("BBB");
    const baseline=setup(),plain=troop(baseline.state,"infantry"),rival=troop(baseline.state,"infantry","BBB");plain.x=-1.5;rival.x=1.5;baseline.declareWar("BBB");
    const before=enemy.hp; sim.step(1);baseline.step(1);
    expect(before-enemy.hp).toBeCloseTo((90-rival.hp)*leaderBonuses(general).damage);
    expect(general.experience).toBeCloseTo(before-enemy.hp);
    enemy.hp=0;rival.hp=0;a.hp=90;plain.hp=90;a.x=-15;plain.x=-15;a.path=[[-10,0]];plain.path=[[-10,0]];const x=a.x;
    sim.step(1);baseline.step(1);
    expect(a.x-x).toBeGreaterThan(0);expect((a.x-x)/(plain.x+15)).toBeCloseTo(leaderBonuses(general).speed);
    general.experience=20000;
    expect(leaderLevel(general)).toBe(5); expect(leaderBonuses(general).damage).toBeCloseTo(1.12);
  });
});

describe("settled territory presentation",()=>{
  it("removes occupation overlays on peace without resetting ownership and resumes overlays only for the relevant war",()=>{
    const sim=setup(), index=cellAt(grid,10,0), record={controller:"AAA",original:"BBB",since:0};
    sim.state.occupation![index]=record;
    sim.declareWar("BBB"); expect(activeOccupation(sim.state,record)).toBe(true);
    expect(activeSeaControl(sim.state,"AAA")).toBe(true);
    sim.makePeace("BBB");
    expect(activeOccupation(sim.state,record)).toBe(false); expect(activeSeaControl(sim.state,"AAA")).toBe(false);
    expect(sim.territory.controllerAt(index)).toBe("AAA");
    // Historical borders may belong to a third nation; the actual war opponent controls overlay status.
    const third={controller:"AAA",original:"CCC",opponent:"BBB",since:0};
    sim.state.elapsed=151; // The peace truce must expire before a new declaration.
    sim.declareWar("BBB");
    expect(activeOccupation(sim.state,record)).toBe(false); // Settled borders stay normal in a later war.
    expect(activeOccupation(sim.state,third)).toBe(true);
    sim.makePeace("BBB"); expect(activeOccupation(sim.state,third)).toBe(false);
  });
  it("paints occupation on coast-clipped country fields, with no cross-border sampling",()=>{
    const sim=setup(),index=cellAt(grid,10,0),fields=preparePoliticalFields(data,grid),terrain=new PoliticalTerrain(grid,data,fields);
    terrain.update(sim.state);
    const field=fields.find((f)=>f.id==="BBB")!,offset=field.lookup.indexOf(index)*4,pixels=terrain.countryTexture("BBB").image.data!;
    const original=[pixels[offset],pixels[offset+1],pixels[offset+2]];
    sim.state.occupation![index]={controller:"AAA",original:"BBB",since:0};terrain.update(sim.state);
    expect([pixels[offset],pixels[offset+1],pixels[offset+2]]).not.toEqual(original);
    expect(pixels[offset+3]).toBe(255);
    expect([...field.lookup].every((i)=>i<0||grid.owners[i]===1)).toBe(true);
    sim.declareWar("BBB");terrain.update(sim.state);expect(pixels[offset+3]).toBe(255);
    terrain.dispose();
  });
});
