import {it,expect} from 'vitest';
import {Simulation,createCampaign} from './campaign';
import {createGrid,cellPoint} from './navigation';
import {buildingsOverlap} from './building-placement';
import {selectResearch,advanceResearch,technology,techLevel,upgradeMine,advanceMineUpgrades,mineMultiplier} from './technology';
import {campaignSnapshot} from './snapshot';
import type {ContinentData,Building} from './types';
const data:ContinentData={id:'test',bounds:[-24,-24,24,24],lakes:[],countries:[{id:'AAA',name:'Alpha',population:10e6,bounds:[-20,-20,20,20],polygons:[[[[-20,-20],[20,-20],[20,20],[-20,20]]]]}]};
const grid=createGrid(data,64);
function fresh(){const sim=new Simulation(data,grid,createCampaign(data,grid,'AAA'));sim.playerNation.credits=10000;sim.playerNation.supplies=1000;sim.playerNation.stockpile!.steel=100;sim.playerNation.nextActionAt=1e9;sim.state.affairs!.nextNewsAt=1e9;sim.state.buildings=[];sim.state.nodes=[{nation:'AAA',x:5,z:5,claimed:false,mineral:'iron'}];return sim;}
it('snaps mine placement and reserves the deposit against other building types',()=>{
 const sim=fresh();expect(sim.build('factory',5,5)).toMatch(/reserved/);expect(sim.build('mine',6,5)).toBeNull();const mine=sim.state.buildings.at(-1)!;expect([mine.x,mine.z]).toEqual([5,5]);expect(sim.state.nodes[0].claimed).toBe(true);expect(sim.build('mine',10,10)).toMatch(/deposit/);
});
it('uses visible dock bounds instead of a wide symmetric exclusion area',()=>{
 const dock={type:'dock',x:0,z:0} as Building;expect(buildingsOverlap('factory',.8,0,dock)).toBe(false);expect(buildingsOverlap('factory',0,-.8,dock)).toBe(true);expect(buildingsOverlap('factory',0,.8,dock)).toBe(false);
});
it('keeps actual land placement and rejects water',()=>{
 const sim=fresh();expect(sim.placementError('factory',21,0)).toMatch(/land/);expect(sim.placementError('factory',0,0)).toBeNull();expect(sim.placementError('factory',19.64,0)).toBeNull();
});
it('charges mine upgrades once, progresses on ticks and preserves them on reload',()=>{
 const sim=fresh();sim.build('mine',5,5);const b=sim.state.buildings[0];delete b.construction;const credits=sim.playerNation.credits;expect(upgradeMine(sim.state,b.id)).toBeNull();expect(sim.playerNation.credits).toBe(credits-150);expect(upgradeMine(sim.state,b.id)).toMatch(/already/);for(let i=0;i<15;i++)advanceMineUpgrades(sim.state);expect(b.mineLevel).toBe(2);expect(mineMultiplier(b)).toBe(1.5);expect(new Simulation(data,grid,campaignSnapshot(sim.state)).state.buildings[0].mineLevel).toBe(2);
});
it('research accumulates, can switch without losing progress, grants levels and persists',()=>{
 const sim=fresh(),n=sim.playerNation;expect(selectResearch(sim.state,'infantry')).toBeNull();for(let i=0;i<10;i++)advanceResearch(sim.state);expect(technology(n).projects.infantry!.progress).toBe(10);selectResearch(sim.state,'economy');advanceResearch(sim.state);const before=n.credits;selectResearch(sim.state,'infantry');expect(n.credits).toBe(before);for(let i=0;i<40;i++)advanceResearch(sim.state);expect(techLevel(n,'infantry')).toBe(1);expect(new Simulation(data,grid,campaignSnapshot(sim.state)).playerNation.technology!.levels.infantry).toBe(1);
});
