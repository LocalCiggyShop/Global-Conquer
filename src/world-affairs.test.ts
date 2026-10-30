import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createCampaign,Simulation,unitSpecs} from './campaign';
import {createGrid,cellAt} from './navigation';
import {adjustRelation,relationScore,combatFunding} from './relations';
import {campaignSnapshot} from './snapshot';
import {regions} from './regions';
import type {ContinentData,Unit} from './types';
const data:ContinentData={id:'test',kmPerUnit:45,bounds:[-44,-24,44,24],lakes:[],countries:[
{id:'RUS',name:'Russia',population:20e6,bounds:[-40,-20,0,20],polygons:[[[[-40,-20],[0,-20],[0,20],[-40,20]]]]},
{id:'USA',name:'United States',population:20e6,bounds:[0,-20,40,20],polygons:[[[[0,-20],[40,-20],[40,20],[0,20]]]]}]};
const grid=createGrid(data,80);
function fresh(){const sim=new Simulation(data,grid,createCampaign(data,grid,'RUS'));for(const n of Object.values(sim.state.nations)){n.nextActionAt=1e9;n.credits=5000;n.supplies=500;}sim.state.affairs!.nextNewsAt=1e9;return sim;}
it('starts peaceful and neutral; embassies improve both economies and unlock alliances',()=>{
 const sim=fresh(),s=sim.state;expect(s.wars).toEqual([]);expect(s.alliances).toEqual([]);expect(relationScore(s,'RUS','USA')).toBe(0);
 expect(sim.setAlliance('USA',true)).toMatch(/relations/);expect(sim.affairs.embassy('USA')).toBeNull();
 const before=s.nations.USA.credits;for(let t=5;t<=50;t+=5){s.elapsed=t;sim.affairs.tick();}
 expect(s.nations.USA.credits).toBe(before+20);expect(sim.setAlliance('USA',true)).toBeNull();
 expect(sim.affairs.embassy('USA')).toMatch(/already/);
});
it('gates bilateral trade by relations and applies symmetric stock shocks to war participants',()=>{
 const sim=fresh(),s=sim.state;adjustRelation(s,'RUS','USA',-30);
 expect(sim.economy.quote('RUS','iron','buy',1,'USA').error).toMatch(/strained/);
 expect(sim.declareWar('USA')).toBeNull();expect(s.nations.RUS.stockIndex).toBe(88);expect(s.nations.USA.stockIndex).toBe(88);
 expect(s.affairs!.news.at(-1)?.kind).toBe('war');sim.makePeace('USA');expect(s.affairs!.news.at(-1)?.kind).toBe('peace');
});
it('escalates unresolved nuclear-power tensions once and permits affected governments to mediate',()=>{
 const sim=fresh(),e=sim.affairs.publish('RUS','tension','USA')!;sim.state.elapsed=60;sim.affairs.tick();sim.affairs.tick();
 expect(sim.state.affairs!.news.filter(e=>e.kind==='nuclear')).toHaveLength(1);
 expect(sim.affairs.resolve(e.id)).toBeNull();expect(e.resolved).toBe(true);
 const other=fresh(),resolved=other.affairs.publish('RUS','tension','USA')!;other.affairs.resolve(resolved.id);other.state.elapsed=60;other.affairs.tick();expect(other.state.affairs!.news.some(e=>e.kind==='nuclear')).toBe(false);
});
it('charges supply and spending-adjusted recruitment costs; queues budget decisions on ticks',()=>{
 const sim=fresh(),n=sim.playerNation;sim.enqueue({kind:'spending',value:150});expect(n.militarySpending).toBe(100);sim.step(1);expect(n.militarySpending).toBe(150);
 const credits=n.credits,supply=n.supplies;expect(sim.train('infantry')).toBeNull();expect(credits-n.credits).toBe(Math.ceil(unitSpecs.infantry.credits*1.5));expect(supply-n.supplies).toBe(15);
 expect(combatFunding(n)).toBe(1.25);n.supplies=0;expect(sim.train('infantry')).toMatch(/Insufficient/);expect(combatFunding(n)).toBeLessThan(1);
});
it('charges stock spreads, bounds history, and persists affairs and holdings',()=>{
 const sim=fresh(),n=sim.playerNation,before=n.credits;expect(sim.affairs.shares('buy',1)).toBeNull();expect(sim.affairs.shares('sell',1)).toBeNull();expect(n.credits).toBe(before-2);
 for(let i=0;i<60;i++)sim.affairs.publish('USA','election');expect(sim.state.affairs!.news).toHaveLength(32);
 const restored=new Simulation(data,grid,campaignSnapshot(sim.state));expect(restored.state.affairs).toEqual(sim.state.affairs);expect(restored.playerNation.stockIndex).toBe(n.stockIndex);
});
it('requires a stationary uncontested hold and pauses capture while enemy forces remain',()=>{
 const sim=fresh();sim.declareWar('USA');sim.state.units=[];const u:Unit={id:sim.state.nextId++,nation:'RUS',team:'player',type:'infantry',x:10,z:0,hp:100,maxHp:100,path:[],cooldown:0,order:0};sim.state.units.push(u);
 const i=cellAt(grid,10,0);for(let t=0;t<9;t++)sim.territory.tick(1);expect(sim.territory.controllerAt(i)).toBe('USA');
 const defender={...u,id:sim.state.nextId++,nation:'USA',team:'enemy' as const};sim.state.units.push(defender);sim.territory.tick(1);expect(sim.territory.controllerAt(i)).toBe('USA');sim.state.units.pop();
 for(let t=0;t<10;t++)sim.territory.tick(1);expect(sim.territory.controllerAt(i)).toBe('RUS');
});
it('exposes four theatres and generates complete combined maps with matching coordinate scales',()=>{
 expect(regions.map(r=>r.id)).toEqual(['europe','asia-pacific','africa','americas']);
 for(const [id,required] of [['asia-pacific',['CHN','AUS','NZL']],['americas',['USA','BRA','ARG']]] as const){const map:ContinentData=JSON.parse(readFileSync(`public/data/${id}.json`,'utf8'));expect(map.id).toBe(id);expect(map.kmPerUnit).toBeGreaterThan(1);for(const nation of required)expect(map.countries.some(c=>c.id===nation)).toBe(true);}
});

it('uses scaled km/h movement and charges ongoing treasury upkeep',()=>{
 const sim=fresh(),u=sim.playerUnits[0];u.x=-25;u.z=0;u.path=[[-20,0]];
 const start=u.x;expect(sim.unitSpeedKmh(u)).toBe(4);sim.step(1);expect(u.x-start).toBeCloseTo(4*2.4/45);
 expect(sim.militaryUpkeep('RUS')).toBeGreaterThan(0.5);expect(sim.supplyUpkeep('RUS')).toBeGreaterThan(0);
});
