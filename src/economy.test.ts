import {calendar} from "./game-clock";
import {describe,it,expect} from "vitest";
import {createCampaign,Simulation} from "./campaign";
import {createGrid} from "./navigation";
import {campaignSnapshot} from "./snapshot";
import {commodities,commodityIds,stockpile,initializeEconomy} from "./economy";
import {productionBuildings} from "./production";
import type {Building,Commodity,ContinentData} from "./types";
const data:ContinentData={id:"test",bounds:[-44,-24,44,24],lakes:[],countries:[
 {id:"AAA",name:"Alpha",population:20_000_000,bounds:[-40,-20,0,20],polygons:[[[[-40,-20],[0,-20],[0,20],[-40,20]]]]},
 {id:"BBB",name:"Beta",population:20_000_000,bounds:[0,-20,40,20],polygons:[[[[0,-20],[40,-20],[40,20],[0,20]]]]},
],cities:[{name:"Alpha City",nation:"AAA",x:-25,z:0,population:100000,capital:true},{name:"Beta City",nation:"BBB",x:25,z:0,population:100000,capital:true}]};
const grid=createGrid(data,80);
function fresh(){const sim=new Simulation(data,grid,createCampaign(data,grid,"AAA"));sim.state.units=[];for(const n of Object.values(sim.state.nations)){n.nextActionAt=1e9;n.credits=5000;n.supplies=500;n.domesticSales=false;}return sim;}
function factory(sim:Simulation,nation="AAA",x=-10,z=-10):Building{expect(sim.build("factory",x,z,nation)).toBeNull();return sim.state.buildings.at(-1)!;}
function tick(sim:Simulation,seconds:number){for(let i=0;i<seconds;i++){sim.state.elapsed++;sim.economy.tick(1);}}

describe("mineral extraction and factory chains",()=>{
 it("produces a batch atomically, pauses on shortages, and stays separate from military queues",()=>{
  const sim=fresh(),b=factory(sim),n=sim.playerNation,before={...n.stockpile!},credits=n.credits;
  tick(sim,4);expect(n.stockpile).toEqual(before);expect(n.credits).toBe(credits);expect(b.progress).toBe(4);
  tick(sim,1);expect(n.stockpile!.steel).toBe(3);expect(n.stockpile!.iron).toBe(before.iron-3);expect(n.stockpile!.coal).toBe(before.coal-2);expect(n.credits).toBe(credits-2);
  n.stockpile!.iron=0;const progress=b.progress;tick(sim,4);expect(b.progress).toBe(progress);expect(sim.economy.status(b)).toContain("Iron");
  expect(productionBuildings(sim.state,"AAA").some(producer=>producer.id===b.id)).toBe(false);
 });
 it("chains minerals into steel, electronics, consumer goods and army supplies",()=>{
  const sim=fresh(),b=factory(sim),n=sim.playerNation;
  tick(sim,10);expect(n.stockpile!.steel).toBe(6);
  sim.economy.setRecipe(b.id,"electronics");tick(sim,6);expect(n.stockpile!.electronics).toBe(2);
  sim.economy.setRecipe(b.id,"consumer");tick(sim,6);expect(n.stockpile!.consumerGoods).toBe(3);expect(n.stockpile!.steel).toBe(5);
  const supplies=n.supplies;sim.economy.setRecipe(b.id,"arms");tick(sim,6);expect(n.supplies).toBe(supplies+8);
  expect(commodityIds.every(id=>n.stockpile![id]>=0)).toBe(true);
 });
 it("collects the deposit's mineral, scales extraction with infrastructure, and supports jewellery",()=>{
  const sim=fresh(),node=sim.state.nodes.find(n=>n.nation==="AAA"&&!sim.placementError("mine",n.x,n.z))!;
  expect(sim.build("mine",node.x,node.z)).toBeNull();const b=sim.state.buildings.at(-1)!;
  expect(b.mineral).toBe(node.mineral);const id=b.mineral!,before=sim.playerNation.stockpile![id];
  sim.playerNation.industry=2;tick(sim,2);expect(sim.playerNation.stockpile![id]-before).toBeCloseTo(commodities[id].extraction*1.16*2);
  sim.playerNation.industry=0;const f=factory(sim);sim.economy.setRecipe(f.id,"jewelry");tick(sim,8);expect(sim.playerNation.stockpile!.consumerGoods).toBe(3);
 });
 it("can pause a line, blocks full output storage, and credits only goods actually consumed",()=>{
  const sim=fresh(),b=factory(sim),n=sim.playerNation;
  sim.economy.toggleFactory(b.id);tick(sim,2);expect(b.progress).toBe(0);sim.economy.toggleFactory(b.id);
  n.stockpile!.steel=9999;tick(sim,5);expect(b.progress).toBe(0);expect(sim.economy.status(b)).toContain("storage full");
  n.stockpile!.consumerGoods=0.1;n.domesticSales=true;const credits=n.credits;tick(sim,1);expect(n.credits).toBeCloseTo(credits+1.2);expect(n.stockpile!.consumerGoods).toBe(0);tick(sim,1);expect(n.credits).toBeCloseTo(credits+1.2);expect(sim.economy.income(n.id)).toBe(0);
 });
});
describe("world and bilateral trade",()=>{
 it("conserves both nations' credits and stock, rewards allies, and blocks enemies",()=>{
  const sim=fresh(),a=sim.playerNation,b=sim.state.nations.BBB;
  const credits=a.credits+b.credits,stock=a.stockpile!.copper+b.stockpile!.copper;
  const normal=sim.economy.quote("AAA","copper","buy",5,"BBB").total;
  sim.setAlliance("BBB",true);expect(sim.economy.quote("AAA","copper","buy",5,"BBB").total).toBeLessThan(normal);
  expect(sim.economy.trade("AAA","copper","buy",5,"BBB")).toBeNull();expect(a.credits+b.credits).toBeCloseTo(credits);expect(a.stockpile!.copper+b.stockpile!.copper).toBe(stock);
  sim.setAlliance("BBB",false);sim.declareWar("BBB");const before=structuredClone(a);
  expect(sim.economy.trade("AAA","copper","sell",1,"BBB")).toMatch(/peaceful/);expect(a).toEqual(before);
 });
 it("moves world stock, adjusts scarcity prices, and prevents instant buy/sell profit",()=>{
  const sim=fresh(),n=sim.playerNation;n.credits=1e6;
  const credits=n.credits,market=sim.state.market!.stock.iron,quote=sim.economy.quote(n.id,"iron","buy",500).unitPrice;
  expect(sim.economy.trade(n.id,"iron","buy",500)).toBeNull();expect(sim.state.market!.stock.iron).toBe(market-500);expect(sim.economy.quote(n.id,"iron","buy",500).unitPrice).toBeGreaterThan(quote);
  expect(sim.economy.trade(n.id,"iron","sell",500)).toBeNull();expect(sim.state.market!.stock.iron).toBe(market);expect(n.credits).toBeLessThan(credits);
 });
 it("rejects invalid batches, insufficient stock/funds, self trade, and overflow atomically",()=>{
  const sim=fresh(),s=sim.state;
  for(const quantity of [0,-1,NaN,Infinity,1.5,501])expect(sim.economy.trade("AAA","iron","buy",quantity)).toBeTruthy();
  expect(sim.economy.trade("AAA","invalid" as Commodity,"buy",1)).toBeTruthy();
  expect(sim.economy.trade("AAA","iron","buy",1,"AAA")).toBeTruthy();
  sim.playerNation.credits=0;const before=structuredClone(s.market);
  expect(sim.economy.trade("AAA","iron","buy",1)).toMatch(/credits/);expect(s.market).toEqual(before);
  sim.playerNation.stockpile!.steel=0;expect(sim.economy.trade("AAA","steel","sell",1)).toMatch(/stock/);
  sim.playerNation.credits=5000;sim.playerNation.stockpile!.steel=10000;expect(sim.economy.trade("AAA","steel","buy",1)).toMatch(/full/);
  s.nations.BBB.credits=0;expect(sim.economy.trade("AAA","iron","sell",1,"BBB")).toMatch(/credits/);
 });
});
describe("saved economies and AI",()=>{
 it("migrates legacy gold mines once and preserves empty inventories, progress and market records on reload",()=>{
  const sim=fresh(),node=sim.state.nodes.find(n=>n.nation==="AAA")!;delete node.mineral;node.claimed=true;
  delete sim.playerNation.stockpile;delete sim.state.market;initializeEconomy(sim.state);expect(node.mineral).toBe("gold");
  sim.playerNation.stockpile=stockpile();sim.playerNation.stockpile.iron=10;sim.playerNation.stockpile.coal=10;
  const b=factory(sim);sim.step(2.5);sim.economy.trade("AAA","zinc","buy",2);
  const restored=new Simulation(data,grid,campaignSnapshot(sim.state)),copy=restored.state.buildings.find(f=>f.id===b.id)!;
  expect(restored.playerNation.stockpile).toEqual(sim.playerNation.stockpile);expect(copy.progress).toBe(b.progress);expect(restored.state.tickPhase).toBeCloseTo(0.5);expect(restored.state.market).toEqual(sim.state.market);
  restored.paused=true;restored.step(5);expect(copy.progress).toBe(b.progress);restored.paused=false;restored.step(0.5);expect(copy.progress).toBe(3);
 });
 it("AI imports missing factory inputs without spending its treasury reserve",()=>{
  const sim=fresh(),b=factory(sim,"BBB",10,-10),n=sim.state.nations.BBB;b.recipe="electronics";n.stockpile=stockpile();n.credits=1000;
  tick(sim,15);expect(n.stockpile.copper).toBeGreaterThanOrEqual(6);expect(n.credits).toBeGreaterThanOrEqual(500);
  tick(sim,6);expect(n.stockpile.electronics).toBe(2);
 });
 it("AI builds civilian factories as its economy develops",()=>{
  const sim=fresh(),n=sim.state.nations.BBB;sim.state.nodes=sim.state.nodes.filter(node=>node.nation!=="BBB");n.industry=1;n.credits=3000;n.nextActionAt=0;sim.step(1);
  expect(sim.economy.factories("BBB")).toHaveLength(1);
 });
 it("capitulation transfers stockpiles and factories to the victor",()=>{
  const sim=fresh(),factoryB=factory(sim,"BBB",10,-10),city=sim.state.cities!.find(c=>c.nation==="BBB")!;
  const donor=new Simulation(data,grid,createCampaign(data,grid,"AAA")).playerUnits[0];donor.x=city.x;donor.z=city.z;donor.hp=10000;donor.id=sim.state.nextId++;sim.state.units=[donor];
  const iron=sim.playerNation.stockpile!.iron+sim.state.nations.BBB.stockpile!.iron;
  sim.declareWar("BBB");for(let t=0;t<2;t+=0.05)sim.step(0.05);
  expect(sim.state.nations.BBB.annexedBy).toBe("AAA");expect(factoryB.nation).toBe("AAA");expect(sim.playerNation.stockpile!.iron).toBe(iron);expect(sim.state.nations.BBB.stockpile!.iron).toBe(0);
 });
});

describe("shared tick clock and recurring trade",()=>{
 it("holds all production, movement, construction, and trading until a full second completes",()=>{
  const sim=fresh(),n=sim.playerNation,u=createCampaign(data,grid,"AAA").units[0];sim.state.units=[u];
  const x=u.x;u.path=[[x+4,u.z]];u.orderMode="manual";
  const credits=n.credits,stock=n.stockpile!.iron;
  sim.enqueue({kind:"build",type:"factory",x:-10,z:-10});
  sim.enqueue({kind:"trade",commodity:"iron",side:"buy",quantity:2,partner:"world"});
  sim.enqueue({kind:"train",type:"infantry"});
  sim.step(0.99);expect(sim.state.elapsed).toBe(0);expect(u.x).toBe(x);expect(n.credits).toBe(credits);expect(n.stockpile!.iron).toBe(stock);expect(sim.economy.factories("AAA")).toHaveLength(0);expect(n.queue).toHaveLength(0);
  sim.step(0.01);expect(sim.state.elapsed).toBe(1);expect(sim.state.tickPhase).toBeCloseTo(0);expect(u.x).toBeGreaterThan(x);expect(sim.economy.factories("AAA")).toHaveLength(1);expect(n.stockpile!.iron).toBe(stock+2);expect(n.queue).toHaveLength(1);expect(sim.state.pendingCommands).toHaveLength(0);
 });
 it("rolls the calendar every five ticks and freezes the unfinished tick while paused",()=>{
  const sim=fresh();expect(calendar(0,0.5)).toMatchObject({day:1,tick:1,progress:0.1});
  sim.step(4.5);expect(calendar(sim.state.elapsed,sim.state.tickPhase)).toMatchObject({day:1,tick:5});
  const phase=sim.state.tickPhase;sim.paused=true;sim.step(10);expect(sim.state.elapsed).toBe(4);expect(sim.state.tickPhase).toBe(phase);
  sim.paused=false;sim.step(0.5);expect(calendar(sim.state.elapsed,sim.state.tickPhase)).toMatchObject({day:2,tick:1,progress:0});
 });
 it("executes recurring imports and exports on tick 25, 50, and each later five-day interval",()=>{
  const sim=fresh(),n=sim.playerNation;sim.economy.schedule(n.id,"copper","buy",2);sim.economy.schedule(n.id,"gold","sell",1);
  const copper=n.stockpile!.copper,gold=n.stockpile!.gold;
  sim.step(24);expect(n.stockpile!.copper).toBe(copper);expect(n.stockpile!.gold).toBe(gold);expect(sim.state.market!.trades).toHaveLength(0);
  sim.step(1);expect(n.stockpile!.copper).toBe(copper+2);expect(n.stockpile!.gold).toBe(gold-1);expect(sim.state.market!.trades).toHaveLength(2);
  sim.step(25);expect(n.stockpile!.copper).toBe(copper+4);expect(n.stockpile!.gold).toBe(gold-2);expect(sim.state.market!.trades).toHaveLength(4);expect(sim.state.market!.recurring!.every(o=>o.nextTick===75)).toBe(true);
 });
 it("schedules future exports without current stock and skips shortages and wartime partners",()=>{
  const sim=fresh(),s=sim.state;sim.playerNation.stockpile!.consumerGoods=0;
  expect(sim.economy.schedule("AAA","consumerGoods","sell",5)).toBeNull();expect(sim.economy.schedule("AAA","copper","buy",2,"BBB")).toBeNull();
  sim.declareWar("BBB");sim.step(25);
  expect(s.market!.recurring![0].lastStatus).toMatch(/Skipped.*stock/);expect(s.market!.recurring![1].lastStatus).toMatch(/Skipped.*peaceful/);expect(s.market!.trades).toHaveLength(0);
  sim.makePeace("BBB");sim.playerNation.stockpile!.consumerGoods=10;sim.step(25);expect(s.market!.recurring!.every(o=>o.lastStatus==="Completed")).toBe(true);
 });
 it("pauses, resumes and cancels recurring orders without catch-up bursts",()=>{
  const sim=fresh();sim.economy.schedule("AAA","iron","buy",1);const order=sim.state.market!.recurring![0];
  sim.economy.toggleRecurring(order.id);sim.step(40);expect(sim.state.market!.trades).toHaveLength(0);
  sim.economy.toggleRecurring(order.id);expect(order.nextTick).toBe(65);sim.step(25);expect(sim.state.market!.trades).toHaveLength(1);
  sim.economy.cancelRecurring(order.id);sim.step(25);expect(sim.state.market!.trades).toHaveLength(1);
 });
 it("retains pending commands, recurring due dates and partial ticks through reload",()=>{
  const sim=fresh();sim.economy.schedule("AAA","iron","buy",1);sim.step(24.5);
  sim.enqueue({kind:"trade",commodity:"zinc",side:"buy",quantity:2,partner:"world"});
  const restored=new Simulation(data,grid,campaignSnapshot(sim.state)),iron=sim.playerNation.stockpile!.iron;
  expect(restored.state.pendingCommands).toHaveLength(1);expect(restored.state.tickPhase).toBeCloseTo(0.5);restored.step(0.5);
  expect(restored.playerNation.stockpile!.iron).toBe(iron+1);expect(restored.state.market!.trades).toHaveLength(2);expect(restored.state.market!.recurring![0].nextTick).toBe(50);
  const again=new Simulation(data,grid,campaignSnapshot(restored.state));again.step(1);expect(again.state.market!.trades).toHaveLength(2);
 });
 it("rejects invalid and duplicate recurring configurations",()=>{
  const sim=fresh();expect(sim.economy.schedule("AAA","iron","buy",0)).toBeTruthy();expect(sim.economy.schedule("AAA","iron","buy",1)).toBeNull();expect(sim.economy.schedule("AAA","iron","buy",1)).toMatch(/already exists/);
  expect(sim.economy.schedule("AAA","iron","buy",1,"AAA")).toBeTruthy();expect(sim.state.market!.recurring).toHaveLength(1);
 });
});
