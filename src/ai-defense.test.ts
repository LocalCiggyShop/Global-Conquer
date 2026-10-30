import {it,expect} from 'vitest';
import {createGrid,findPath,cellAt,nearestOpen} from './navigation';
import {createCampaign,Simulation} from './campaign';
import {neighboringThreat} from './ai-defense';
import {adjustRelation} from './relations';
import {BorderIndex} from './frontline';
import type {ContinentData} from './types';
const data:ContinentData={id:'test',bounds:[-44,-24,44,24],lakes:[],countries:[{id:'AAA',name:'Alpha',population:20e6,bounds:[-40,-20,0,20],polygons:[[[[-40,-20],[0,-20],[0,20],[-40,20]]]]},{id:'BBB',name:'Beta',population:20e6,bounds:[0,-20,40,20],polygons:[[[[0,-20],[40,-20],[40,20],[0,20]]]]}]};
const grid=createGrid(data,80);
function fresh(){const sim=new Simulation(data,grid,createCampaign(data,grid,'AAA'));for(const n of Object.values(sim.state.nations)){n.credits=5000;n.supplies=500;n.nextActionAt=1e9;}sim.state.affairs!.nextNewsAt=1e9;return sim;}
it('distinguishes targeted threats from neutral strength, allies and distant news',()=>{
 const sim=fresh(),s=sim.state;expect(neighboringThreat(s,'BBB',['AAA']).level).toBe(0);
 const report=sim.affairs.publish('AAA','tension','BBB')!;expect(neighboringThreat(s,'BBB',[]).level).toBe(0);expect(neighboringThreat(s,'BBB',['AAA']).level).toBe(1);
 report.resolved=true;adjustRelation(s,'AAA','BBB',100);expect(sim.setAlliance('BBB',true)).toBeNull();sim.affairs.publish('AAA','nuclear','BBB');expect(neighboringThreat(s,'BBB',['AAA']).level).toBe(0);
});
it('raises military priority and recruits before civilian projects when a neighbor threatens',()=>{
 const sim=fresh(),n=sim.state.nations.BBB,before=n.industry;sim.affairs.publish('AAA','tension','BBB');n.nextActionAt=0;sim.step(1);
 expect(n.defenseReadiness?.neighbor).toBe('AAA');expect(n.militarySpending).toBe(150);expect(n.industryPolicy).toBe('mobilized');expect(n.queue.length).toBeGreaterThan(0);expect(n.industry).toBe(before);
});
it('deploys real ground troops to their side of the threatened border under defensive leaders',()=>{
 const sim=fresh();sim.requestPath=(u,p)=>{const mask=sim.landMask(u.nation),end=nearestOpen(grid,mask,...p);u.path=findPath(grid,mask,cellAt(grid,u.x,u.z),end);};
 const n=sim.state.nations.BBB;sim.affairs.publish('AAA','nuclear','BBB');n.nextActionAt=0;
 const unit=sim.state.units.find(u=>u.nation==='BBB'&&u.type==='infantry')!,from=[unit.x,unit.z];sim.step(1);
 expect(n.militarySpending).toBe(175);expect(unit.frontline?.target).toBe('AAA');expect(sim.command.stance(unit)).toBe('defend');expect(sim.territory.controllerAt(cellAt(grid,...unit.frontline!.position))).toBe('BBB');
 for(let i=0;i<4;i++)sim.step(1);expect(Math.hypot(unit.x-from[0],unit.z-from[1])).toBeGreaterThan(0);expect(sim.territory.controllerAt(cellAt(grid,unit.x,unit.z))).toBe('BBB');expect(sim.state.wars).toEqual([]);
});
it('de-escalates after a cooling-off period and leaves player controls untouched',()=>{
 const sim=fresh(),n=sim.state.nations.BBB,player=sim.playerNation,report=sim.affairs.publish('AAA','tension','BBB')!;player.militarySpending=75;n.nextActionAt=0;sim.step(1);report.resolved=true;adjustRelation(sim.state,'AAA','BBB',40);
 sim.state.elapsed=40;n.nextActionAt=0;sim.step(1);expect(n.defenseReadiness).toBeUndefined();expect(n.militarySpending).toBe(100);expect(n.industryPolicy).toBe('balanced');expect(player.militarySpending).toBe(75);expect(sim.state.units.filter(u=>u.nation==='BBB').every(u=>!u.frontline)).toBe(true);
});
it('uses current cached borders after ownership changes',()=>{
 let transferred=false;const index=new BorderIndex(grid,i=>grid.owners[i]<0?null:transferred?'AAA':data.countries[grid.owners[i]].id);
 expect(index.neighbors(0,'BBB')).toEqual(['AAA']);transferred=true;expect(index.neighbors(1,'BBB')).toEqual([]);
});
