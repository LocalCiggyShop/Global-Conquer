import {it,expect} from 'vitest';
import {createCampaign,Simulation} from './campaign';
import {createGrid} from './navigation';
import {productionBuildings} from './production';
import {campaignSnapshot} from './snapshot';
import {stockpile} from './economy';
import type {ContinentData} from './types';
const data:ContinentData={id:'test',bounds:[-44,-24,44,24],lakes:[],countries:[
{id:'AAA',name:'Alpha',population:20e6,bounds:[-40,-20,0,20],polygons:[[[[-40,-20],[0,-20],[0,20],[-40,20]]]]},
{id:'BBB',name:'Beta',population:20e6,bounds:[0,-20,40,20],polygons:[[[[0,-20],[40,-20],[40,20],[0,20]]]]}]};
const grid=createGrid(data,80);
function fresh(){const sim=new Simulation(data,grid,createCampaign(data,grid,'AAA'));sim.state.units=[];for(const n of Object.values(sim.state.nations)){n.nextActionAt=1e9;n.credits=5000;n.supplies=500;n.domesticSales=false;}sim.state.affairs!.nextNewsAt=1e9;return sim;}
function tick(sim:Simulation,n:number){for(let i=0;i<n;i++){sim.state.elapsed++;sim.economy.tick(1);}}
it('charges atomic daily construction instalments, stalls without materials, then resumes and persists',()=>{
 const sim=fresh(),n=sim.playerNation;expect(sim.build('barracks',-10,-10)).toBeNull();const b=sim.state.buildings.at(-1)!;
 const iron=n.stockpile!.iron;n.stockpile!.steel=0;tick(sim,5);expect(b.construction?.completedDays).toBe(0);expect(b.construction?.missing).toEqual(['steel']);expect(n.stockpile!.iron).toBe(iron);expect(productionBuildings(sim.state,n.id,'armor')).not.toContain(b);
 n.stockpile!.steel=6;tick(sim,5);expect(b.construction?.completedDays).toBe(1);expect(n.stockpile!.steel).toBe(4);
 const loaded=new Simulation(data,grid,campaignSnapshot(sim.state));expect(loaded.state.buildings.at(-1)?.construction).toEqual(b.construction);
 tick(sim,10);expect(b.construction).toBeUndefined();expect(n.stockpile!.steel).toBe(0);expect(productionBuildings(sim.state,n.id,'armor')).toContain(b);
});
it('does not manufacture in unfinished factories; balances include daily construction demand',()=>{
 const sim=fresh();sim.build('factory',-10,-10);const b=sim.state.buildings.at(-1)!,before=sim.playerNation.stockpile!.steel;
 expect(sim.economy.status(b)).toBe('Under construction');expect(sim.economy.balance('AAA').net.iron).toBe(-3);tick(sim,4);expect(sim.playerNation.stockpile!.steel).toBe(before);expect(b.progress).toBe(0);
});
it('requires real sellers and conserves national inventory and money on open-market settlement',()=>{
 const sim=fresh(),a=sim.playerNation,b=sim.state.nations.BBB;a.tradePolicy=b.tradePolicy='free';a.stockpile!.steel=0;b.stockpile!.steel=0;
 expect(sim.economy.trade('AAA','steel','buy',2)).toMatch(/supply/);b.stockpile!.steel=2;const credits=a.credits+b.credits;
 expect(sim.economy.trade('AAA','steel','buy',2)).toBeNull();expect(a.stockpile!.steel).toBe(2);expect(b.stockpile!.steel).toBe(0);expect(a.credits+b.credits).toBeCloseTo(credits);
});
it('respects free, balanced and closed policies and records foreign purchases from the player',()=>{
 const sim=fresh(),a=sim.playerNation,b=sim.state.nations.BBB;a.stockpile!.copper=10;
 expect(sim.economy.exportable('AAA','copper')).toBe(5);expect(sim.economy.trade('BBB','copper','buy',6,'AAA')).toMatch(/exportable/);
 a.tradePolicy='closed';expect(sim.economy.trade('BBB','copper','buy',1,'AAA')).toMatch(/closed/);
 a.tradePolicy='free';expect(sim.economy.trade('BBB','copper','buy',6,'AAA')).toBeNull();expect(a.stockpile!.copper).toBe(4);expect(sim.state.market!.trades.at(-1)).toMatchObject({nation:'AAA',side:'sell',quantity:6,partner:'BBB'});
 b.tradePolicy='closed';expect(sim.economy.trade('AAA','iron','buy',1)).toMatch(/supply/);
});
it('auto-buying AI can purchase player exports, but cannot import from a closed economy',()=>{
 const sim=fresh(),a=sim.playerNation,b=sim.state.nations.BBB;a.tradePolicy='free';a.stockpile!.iron=100;b.stockpile!.iron=0;
 const start=a.credits;tick(sim,15);expect(a.credits).toBeGreaterThan(start);expect(b.stockpile!.iron).toBeGreaterThan(0);
 const closed=fresh();closed.playerNation.tradePolicy='closed';closed.playerNation.stockpile!.iron=100;closed.state.nations.BBB.stockpile!.iron=0;tick(closed,15);expect(closed.state.nations.BBB.stockpile!.iron).toBe(0);
});
it('policy priorities affect output and stock history stays bounded',()=>{
 const sim=fresh();sim.playerNation.industryPolicy='industrial';expect(sim.economy.outputMultiplier('AAA','steel')).toBe(1.15);sim.playerNation.industryPolicy='mobilized';expect(sim.economy.outputMultiplier('AAA','arms')).toBe(1.25);expect(sim.economy.outputMultiplier('AAA','consumer')).toBe(0.9);
 for(let i=1;i<=130;i++){sim.state.elapsed=i*5;sim.affairs.tick();}expect(sim.playerNation.stockHistory).toHaveLength(120);
 const loaded=new Simulation(data,grid,campaignSnapshot(sim.state));expect(loaded.playerNation.stockHistory).toEqual(sim.playerNation.stockHistory);
});
