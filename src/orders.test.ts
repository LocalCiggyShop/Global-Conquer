import { describe, expect, it } from "vitest";
import { createCampaign, Simulation } from "./campaign";
import { cellAt, cellPoint, createGrid, findPath, nearestOpen } from "./navigation";
import { PathClient } from "./path-client";
import { campaignSnapshot } from "./snapshot";
import { populationCapacity } from "./manpower";
import { BorderIndex } from "./frontline";
import type { ContinentData, Point, Unit } from "./types";
const ring=(a:number,b:number):Point[]=>[[a,-14],[b,-14],[b,14],[a,14]];
const data:ContinentData={id:"orders",bounds:[-44,-20,44,20],lakes:[],countries:[
  {id:"AAA",name:"Alpha",population:4_000_000,bounds:[-40,-14,0,14],polygons:[[ring(-40,0)]]},
  {id:"BBB",name:"Beta",population:40_000_000,bounds:[0,-14,40,14],polygons:[[ring(0,40)]]},
],cities:[
  {name:"Alpha Capital",nation:"AAA",x:-24,z:-8,population:200000,capital:true},
  {name:"Beta Capital",nation:"BBB",x:26,z:-8,population:200000,capital:true},
  {name:"Beta South",nation:"BBB",x:26,z:8,population:200000,capital:false},
  {name:"Beta Front",nation:"BBB",x:7,z:0,population:200000,capital:false},
]};
const grid=createGrid(data,92);
function fresh() {
  const sim=new Simulation(data,grid,createCampaign(data,grid,"AAA"));
  sim.state.units=[];sim.state.buildings=[];sim.walkable=grid.walkable.slice();
  for(const n of Object.values(sim.state.nations)){n.nextActionAt=Infinity;n.doctrine="balanced";}
  sim.requestPath=(u,p)=>{const mask=sim.landMask(u.nation);u.path=findPath(grid,mask,nearestOpen(grid,mask,u.x,u.z),nearestOpen(grid,mask,...p,3));if(!u.path.length)u.destination=null;};
  return sim;
}
function troop(sim:Simulation,nation="AAA",x=-4,z=0) {
  const u:Unit={id:sim.state.nextId++,nation,team:nation==="AAA"?"player":"enemy",type:"infantry",x,z,hp:90,maxHp:90,path:[],cooldown:0,order:0};sim.state.units.push(u);return u;
}
function general(sim:Simulation,nation="AAA") {return sim.state.leaders!.find((l)=>l.nation===nation&&l.branch==="army")!;}
function advance(sim:Simulation,seconds:number) {for(let t=0;t<seconds-0.0001;t+=0.05)sim.step(0.05);}

describe("general attack and defensive orders",()=>{
  it("holds a neutral border, attacks only after war, captures states, then returns to defense",()=>{
    const sim=fresh(),u=troop(sim),g=general(sim);
    sim.command.assign([u.id],g.id);sim.setLeaderStance(g.id,"attack");
    expect(sim.frontline([u.id],[0,0])).toBeNull();advance(sim,4);
    expect(u.x).toBeLessThan(0);expect(u.frontline?.objective).toBeUndefined();
    sim.declareWar("BBB");advance(sim,10);
    expect(u.x).toBeGreaterThan(0);
    expect(Object.values(sim.state.states!).some((id)=>id==="AAA")).toBe(true);
    sim.setLeaderStance(g.id,"defend");advance(sim,4);
    expect(u.frontline?.objective).toBeUndefined();
    expect(sim.territory.controllerAt(cellAt(grid,u.x,u.z))).toBe("AAA");
    expect(Math.hypot(u.x-u.frontline!.position[0],u.z-u.frontline!.position[1])).toBeLessThan(2);
    const snapshot=campaignSnapshot(sim.state),restored=new Simulation(data,grid,JSON.parse(JSON.stringify(snapshot)));
    expect(restored.command.get(g.id)?.stance).toBe("defend");
    expect(restored.state.occupation).toEqual(sim.state.occupation);
  });
  it("defensive generals avoid opening fire, retaliate under attack, and do not engage a passive replacement",()=>{
    const sim=fresh(),a=troop(sim,"AAA",-1.5),b=troop(sim,"BBB",1.5),g=general(sim),enemy=general(sim,"BBB");
    sim.command.assign([a.id],g.id);b.leaderId=enemy.id;enemy.stance="defend";
    sim.declareWar("BBB");advance(sim,0.3);
    expect(a.hp).toBe(90);expect(b.hp).toBe(90);
    enemy.stance="attack";advance(sim,2);
    expect(a.hp).toBeLessThan(90);expect(b.hp).toBeLessThan(90);
    b.hp=0;
    const passive=troop(sim,"BBB",1.5);passive.leaderId=enemy.id;enemy.stance="defend";
    advance(sim,1);
    expect(passive.hp).toBe(90);
  });
  it("manual movement overrides frontlines and moves out of combat while returning fire",()=>{
    const sim=fresh(),a=troop(sim,"AAA",-2),b=troop(sim,"BBB",1),g=general(sim);
    sim.command.assign([a.id],g.id);sim.setLeaderStance(g.id,"attack");sim.frontline([a.id],[0,0]);sim.declareWar("BBB");
    expect(sim.move([a.id],[-12,0])).toBeNull();const before=a.x;
    sim.step(1);
    expect(a.frontline).toBeUndefined();expect(a.orderMode).toBe("manual");expect(a.x).toBeLessThan(before);expect(b.hp).toBeLessThan(90);
  });
  it("allows movement through buildings without invalidating cached land routes",()=>{
    const sim=fresh(),a=troop(sim,"AAA",-4);
    sim.playerNation.credits=1000;sim.playerNation.supplies=1000;
    const mask=sim.landMask("AAA"),revision=sim.obstacleRevision;
    expect(sim.build("barracks",-20,0)).toBeNull();
    expect(sim.walkable[cellAt(grid,-20,0)]).toBe(1);
    expect(sim.landMask("AAA")).toBe(mask);expect(sim.obstacleRevision).toBe(revision);
    expect(sim.move([a.id],[-20,0])).toBeNull();
    expect(sim.walkable[cellAt(grid,...a.destination!)]).toBe(1);
    expect(a.path.length).toBeGreaterThan(0);
  });
});

describe("population-based manpower",()=>{
  it("uses national population, grows with controlled land, and bounds extremely large armies",()=>{
    const sim=fresh();expect(sim.nationCapacity("AAA")).toBe(8);expect(sim.nationCapacity("BBB")).toBe(26);
    sim.territory.annex("BBB","AAA");
    expect(sim.territory.population("AAA")).toBe(44_000_000);expect(sim.nationCapacity("AAA")).toBe(28);
    expect(populationCapacity(2_000_000_000)).toBe(240);
  });
  it("holds queued recruitment without deleting existing troops when over capacity",()=>{
    const sim=fresh();for(let i=0;i<9;i++)troop(sim,"AAA",-4-i,-8);
    sim.playerNation.credits=1000;sim.playerNation.supplies=1000;
    sim.build("barracks",-20,0);
    expect(sim.train("infantry")).toMatch(/capacity/);
    sim.playerNation.queue.push({type:"infantry",remaining:0,total:4});
    sim.step(0.1);
    expect(sim.playerUnits).toHaveLength(9);expect(sim.playerNation.queue).toHaveLength(1);
  });
});

describe("route scheduling and border cache",()=>{
  it("accepts a still-valid path after unrelated territory revisions instead of losing the move order",()=>{
    const sim=fresh(),u=troop(sim,"AAA",-10,-4),messages:any[]=[],client=new PathClient(sim,{postMessage:(m:any)=>messages.push(m)},()=>{});
    u.orderMode="manual";u.destination=[-4,-4];client.request(u,u.destination);client.flush();
    const request=messages[0],path=findPath(grid,sim.walkable,cellAt(grid,u.x,u.z),cellAt(grid,...u.destination));
    client.receive({...request,revision:-1,obstaclesRevision:0,path});
    expect(u.path).toEqual(path);expect(u.destination).not.toBeNull();expect(client.queued).toBe(0);
  });
  it("retries stale invalid results, deduplicates requests and sends manual player orders first",()=>{
    const sim=fresh(),u=troop(sim),ai=troop(sim,"BBB",20),messages:any[]=[],client=new PathClient(sim,{postMessage:(m:any)=>messages.push(m)},()=>{});
    ai.destination=[22,0];client.request(ai,ai.destination);
    u.orderMode="manual";u.destination=[-15,0];client.request(u,[-12,0]);client.request(u,u.destination);
    client.flush(1);expect(messages).toHaveLength(1);expect(messages[0].id).toBe(u.id);expect(messages[0].to).toEqual([-15,0]);
    client.receive({...messages[0],revision:-1,obstaclesRevision:0,path:[[4,0],[-15,0]]});
    expect(u.path).toHaveLength(0);expect(client.queued).toBe(2);
  });
  it("reuses the land-border scan for different queries until control changes",()=>{
    let queries=0;const sim=fresh(),index=new BorderIndex(grid,(i)=>{queries++;return sim.territory.controllerAt(i);});
    expect(index.query(0,"AAA","BBB",[0,0]).points.length).toBeGreaterThan(0);
    const first=queries;index.query(0,"BBB","AAA",[0,1]);expect(queries).toBe(first);
    index.query(1,"AAA","BBB",[0,0]);expect(queries).toBeGreaterThan(first);
  });
});
