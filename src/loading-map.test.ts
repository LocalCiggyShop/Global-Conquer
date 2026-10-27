import {describe,it,expect} from "vitest";
import {createCampaign,Simulation} from "./campaign";
import {createGrid,cellAt,cellPoint} from "./navigation";
import {PoliticalTerrain} from "./political-terrain";
import {preparePoliticalFields} from "./political-fields";
import {campaignSnapshot} from "./snapshot";
import {nationLabelLayouts} from "./map-labels";
import type {ContinentData,Point,Unit} from "./types";
const ring=(a:number,b:number):Point[]=>[[a,-14],[b,-14],[b,14],[a,14]];
const data:ContinentData={id:"maps",bounds:[-44,-20,44,20],lakes:[],countries:[
 {id:"AAA",name:"Alpha",population:40_000_000,bounds:[-40,-14,0,14],polygons:[[ring(-40,0)]]},
 {id:"BBB",name:"Beta",population:40_000_000,bounds:[0,-14,40,14],polygons:[[ring(0,40)]]},
],cities:[
 {name:"Alpha Capital",nation:"AAA",x:-24,z:-8,population:200000,capital:true},
 {name:"Beta Capital",nation:"BBB",x:26,z:-8,population:200000,capital:true},
 {name:"Beta South",nation:"BBB",x:26,z:8,population:200000,capital:false},
 {name:"Beta Front",nation:"BBB",x:7,z:0,population:200000,capital:false},
]};
const grid=createGrid(data,92);
function fresh(map=data){const sim=new Simulation(map,grid,createCampaign(map,grid,"AAA"));sim.state.units=[];for(const n of Object.values(sim.state.nations))n.nextActionAt=Infinity;return sim;}
function unit(sim:Simulation,nation:string,x:number,z:number){const u:Unit={id:sim.state.nextId++,nation,team:nation==="AAA"?"player":"enemy",type:"infantry",x,z,hp:10000,maxHp:10000,path:[],order:0,cooldown:999};sim.state.units.push(u);return u;}
function advance(sim:Simulation,seconds:number){for(let n=0;n<seconds-0.0001;n+=0.05)sim.step(0.05);}

describe("occupation and map presentation",()=>{
 it("captures on one occupation tick, blocks defended states, and patches only changed access cells",()=>{
  const sim=fresh(),city=sim.state.cities!.find((c)=>c.name==="Beta Front")!;unit(sim,"AAA",city.x,city.z);sim.declareWar("BBB");
  const mask=sim.landMask("AAA"),patches:any[]=[];sim.onAccess=(p)=>patches.push(p);
  advance(sim,0.7);expect(city.controller).toBe("BBB");advance(sim,0.6);expect(city.controller).toBe("AAA");
  expect(sim.landMask("AAA")).toBe(mask);expect(patches).toHaveLength(1);expect(patches[0].cells.length).toBeLessThan(grid.owners.length);expect(patches[0].invalidate).toEqual([]);
  const next=sim.state.cities!.find((c)=>c.name==="Beta South")!;
  sim.state.units[0].x=next.x;sim.state.units[0].z=next.z;
  const defender=unit(sim,"BBB",next.x,next.z);advance(sim,1.5);expect(next.controller).toBe("BBB");
  defender.hp=0;advance(sim,1.3);expect(next.controller).toBe("AAA");
 });
 it("extends only a country's own paint to its vector border and smoothly filters internal ownership",()=>{
  const sim=fresh(),fields=preparePoliticalFields(data,grid),terrain=new PoliticalTerrain(grid,data,fields);
  sim.territory.annex("BBB","AAA");terrain.update(sim.state);
  const pixels=terrain.countryTexture("BBB").image.data!;
  for(let i=0;i<pixels.length;i+=4)expect(Array.from(pixels.slice(i,i+4))).toEqual(Array.from(pixels.slice(0,4)));
  expect(fields.find((f)=>f.id==="BBB")!.lookup.every((i)=>i<0||grid.owners[i]===1)).toBe(true);
  terrain.dispose();
 });
 it("prefers upright names when the country is wide enough",()=>{
  const layouts=nationLabelLayouts(data,grid);expect(layouts.length).toBe(2);expect(layouts.every((l)=>l.angle===0)).toBe(true);
 });
});
describe("real ports and prepared deployment",()=>{
 it("creates a real named coastal dock, prohibits free placement, and retains it through prepared reload",()=>{
  const map={...data,ports:[{id:"real-port",name:"Beta Harbour",city:"Beta",nation:"BBB",x:20,z:-14}]};
  const sim=fresh(map),dock=sim.state.buildings.find((b)=>b.portId==="real-port")!;
  expect(dock).toBeDefined();expect(sim.naval.isCoast(dock.x,dock.z)).toBe(true);expect(dock.nation).toBe("BBB");
  expect(sim.build("dock",-20,-12)).toMatch(/mapped real-world ports/);
  expect(sim.train("frigate","BBB")).toBeNull();
  const prepared={territory:{states:sim.territory.states,membership:sim.territory.membership},naval:sim.naval.prepared(),components:sim.components};
  const restored=new Simulation(map,grid,JSON.parse(JSON.stringify(campaignSnapshot(sim.state))),prepared);
  expect(restored.territory.membership).toBe(prepared.territory.membership);
  expect(restored.state.buildings.filter((b)=>b.portId==="real-port")).toHaveLength(1);
  expect(restored.state.nations.BBB.queue).toHaveLength(1);
 });
});
