import {it,expect} from 'vitest';
import {createGrid,cellAt} from './navigation';
import {createCampaign,Simulation} from './campaign';
import {unitStacks,UnitPositions,personnel,MAX_STACK_UNITS} from './unit-stacks';
import {politicsDay,changeIdeology,changeCivicPolicy,consumerDemand} from './politics';
import {warReadiness} from './strategy';
import {campaignSnapshot} from './snapshot';
import type {ContinentData,Unit} from './types';
const data:ContinentData={id:'test',kmPerUnit:45,bounds:[-44,-24,44,24],lakes:[],countries:[{id:'DEU',name:'Germany',population:20e6,bounds:[-40,-20,0,20],polygons:[[[[-40,-20],[0,-20],[0,20],[-40,20]]]]},{id:'AUT',name:'Austria',population:20e6,bounds:[0,-20,40,20],polygons:[[[[0,-20],[40,-20],[40,20],[0,20]]]]}]};
const grid=createGrid(data,80);
function fresh(){const s=new Simulation(data,grid,createCampaign(data,grid,'DEU'));for(const n of Object.values(s.state.nations)){n.nextActionAt=1e9;n.credits=5000;n.supplies=500;}s.state.affairs!.nextNewsAt=1e9;return s;}
function unit(id:number,x=0):Unit{return{id,nation:'DEU',team:'player',type:'infantry',x,z:0,hp:90,maxHp:90,path:[],cooldown:0,order:0};}
it('caps each visual stack at five formations and personnel at 1000 per full unit',()=>{
 const forces=Array.from({length:6},(_,i)=>unit(i));const groups=unitStacks(forces);expect([...groups.groups.values()].map(g=>g.length)).toEqual([5,1]);expect(personnel(forces[0])).toBe(1000);forces[0].hp=45;expect(personnel(forces[0])).toBe(500);expect(MAX_STACK_UNITS).toBe(5);
});
it('spaces excess and incompatible formations, retaining separate health and orders',()=>{
 const forces=Array.from({length:6},(_,i)=>unit(i)),positions=new UnitPositions(forces);positions.place(forces[0],[0,0],()=>true);expect(Math.hypot(forces[0].x,forces[0].z)).toBeGreaterThan(0.65);
 const enemy=unit(99);enemy.nation='AUT';const others=new UnitPositions([unit(10),enemy]);others.place(enemy,[0,0],()=>true);expect(Math.hypot(enemy.x,enemy.z)).toBeGreaterThan(0.65);expect(forces[1].hp).toBe(90);
});
it('never places a blocked or oversized stack on invalid land',()=>{
 const forces=Array.from({length:6},(_,i)=>unit(i)),positions=new UnitPositions(forces);expect(positions.place(forces[0],[0,0],p=>p[0]===0&&p[1]===0)).toBeNull();expect(forces[0].x).toBe(0);
});
it('applies daily stability from civilian supply, wars, unrest and funded civic policy',()=>{
 const sim=fresh(),s=sim.state,n=sim.playerNation;n.consumerServed=consumerDemand(n)*5;s.elapsed=5;politicsDay(s);expect(n.stability).toBe(72);
 expect(changeCivicPolicy(s,'rights')).toBeNull();s.wars.push({a:'DEU',b:'AUT',since:5});sim.affairs.publish('DEU','unrest');n.consumerServed=consumerDemand(n)*5;s.elapsed=10;politicsDay(s);expect(n.stability).toBe(71); // +2 −3 −1 +1
 n.consumerServed=0;s.elapsed=15;politicsDay(s);expect(n.stability).toBe(66); // −2 −3 −1 +1
});
it('requires political power for ideology changes, enforces cooldown and changes war costs',()=>{
 const sim=fresh(),n=sim.playerNation;expect(changeIdeology(sim.state,'nationalism')).toMatch(/100/);n.politicalPower=200;expect(changeIdeology(sim.state,'nationalism')).toBeNull();expect(n.stability).toBe(60);expect(changeIdeology(sim.state,'democracy')).toMatch(/five days/);sim.declareWar('AUT');expect(n.stability).toBe(60);
 const democratic=fresh();democratic.declareWar('AUT');expect(democratic.playerNation.stability).toBe(60);
});
it('requires all expanded German Reich territories rather than Austria alone',()=>{
 const sim=fresh();expect(sim.formNation('german-reich')).toMatch(/Control/);sim.territory.annex('AUT','DEU');expect(sim.controlsNation('AUT')).toBe(true);expect(sim.formNation('german-reich')).toMatch(/Control/);
});
it('allows a confident, funded neutral AI campaign and rejects poor, unstable or weak forces',()=>{
 const sim=fresh(),s=sim.state,n=s.nations.DEU;s.elapsed=200;n.industry=3;s.units=s.units.filter(u=>u.nation!=='DEU');for(let i=0;i<12;i++){const u=unit(s.nextId++,-20);s.units.push(u);}const assess=()=>warReadiness(s,grid,sim.components,'DEU','AUT',sim.naval.coastalOwners,i=>sim.territory.controllerAt(i));
 expect(assess().ready).toBe(true);n.stability=20;expect(assess().ready).toBe(false);n.stability=70;n.credits=500;expect(assess().ready).toBe(false);
});
