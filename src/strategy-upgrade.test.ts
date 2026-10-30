import {it,expect} from 'vitest';
import {createCampaign,Simulation,unitSpecs} from './campaign';
import {createGrid,cellAt} from './navigation';
import {campaignSnapshot} from './snapshot';
import {recoverUnit,unitStatus,objectiveProgress,activeTruce} from './strategic-systems';
import type {ContinentData,Unit,Point} from './types';
const data:ContinentData={id:'test',kmPerUnit:45,bounds:[-44,-24,44,24],lakes:[],countries:[{id:'AAA',name:'Alpha',population:20e6,bounds:[-40,-20,0,20],polygons:[[[[-40,-20],[0,-20],[0,20],[-40,20]]]]},{id:'BBB',name:'Beta',population:20e6,bounds:[0,-20,40,20],polygons:[[[[0,-20],[40,-20],[40,20],[0,20]]]]}]};
const grid=createGrid(data,80);
function fresh(){const sim=new Simulation(data,grid,createCampaign(data,grid,'AAA'));sim.state.affairs!.nextNewsAt=1e9;for(const n of Object.values(sim.state.nations)){n.nextActionAt=1e9;n.credits=5000;n.supplies=500;}return sim;}
function troop(sim:Simulation,x=-20,z=0):Unit{const u:Unit={id:sim.state.nextId++,nation:'AAA',team:'player',type:'infantry',x,z,hp:90,maxHp:90,path:[],cooldown:0,order:0,organization:100};sim.state.units.push(u);return u;}
it('executes tactical orders on ticks, preserves queued waypoints in saves and clears them on Hold',()=>{
 const sim=fresh();sim.state.units=[];const u=troop(sim);const requests:Point[]=[];sim.requestPath=(_,p)=>requests.push(p);
 sim.enqueue({kind:'tactical',ids:[u.id],target:[-18,0],mode:'attackMove'});expect(u.destination).toBeUndefined();sim.step(1);expect(u.tacticalOrder).toBe('attackMove');expect(requests).toHaveLength(1);
 sim.enqueue({kind:'tactical',ids:[u.id],target:[-15,2],mode:'move',append:true});sim.step(1);expect(u.waypoints).toEqual([[-15,2]]);
 const loaded=new Simulation(data,grid,campaignSnapshot(sim.state));expect(loaded.state.units[0].waypoints).toEqual([[-15,2]]);
 sim.enqueue({kind:'tactical',ids:[u.id],mode:'hold'});sim.step(1);expect(u.path).toEqual([]);expect(u.destination).toBeNull();expect(u.waypoints).toEqual([]);expect(u.tacticalOrder).toBe('hold');
});
it('advances through waypoints without reissuing the completed destination',()=>{
 const sim=fresh();sim.state.units=[];const u=troop(sim),next:Point=[-12,0];u.path=[[u.x,u.z]];u.destination=[u.x,u.z];u.waypoints=[next];sim.requestPath=(unit,p)=>{unit.path=[p];};sim.step(1);expect(u.destination).toEqual(next);expect(u.waypoints).toEqual([]);
});
it('caps queues and identifies waiting for space separately from waiting for a route',()=>{
 const sim=fresh();sim.state.units=[];const u=troop(sim);u.destination=[-10,0];expect(unitStatus(u,0)).toBe('Awaiting route');u.path=[[-10,0]];u.blockedTicks=2;expect(unitStatus(u,0)).toBe('Waiting for space');
 u.waypoints=Array.from({length:16},()=>[-5,0] as Point);sim.tactical([u.id],[-4,0],'move',true);expect(u.waypoints).toHaveLength(16);
});
it('low organization rests locally after combat without travelling to the capital',()=>{
 const sim=fresh();sim.state.units=[];const u=troop(sim,-3);u.organization=5;u.lastCombatAt=sim.state.elapsed;sim.step(1);expect(u.retreating).toBe(true);expect(u.hp).toBe(90);expect(u.destination).toBeNull();expect(u.path).toEqual([]);expect(unitStatus(u,sim.state.elapsed)).toBe('Recovering organization');
});
it('paid reinforcements consume equipment, supplies, treasury and manpower; isolated units cannot reinforce',()=>{
 const sim=fresh(),u=troop(sim);u.hp=45;const n=sim.playerNation;n.stockpile!.steel=10;sim.state.elapsed=5;
 recoverUnit(sim.state,u,.15);expect(u.hp).toBe(45);
 const credits=n.credits,supplies=n.supplies;recoverUnit(sim.state,u,1);expect(u.hp).toBeGreaterThan(45);expect(n.credits).toBeLessThan(credits);expect(n.supplies).toBe(supplies-1);expect(n.stockpile!.steel).toBeLessThan(10);expect(n.manpowerUsed).toBeGreaterThan(0);
 const hp=u.hp;n.stockpile!.steel=0;recoverUnit(sim.state,u,1);expect(u.hp).toBe(hp);
});
it('uses a cached province graph and cuts supply when the capital route is severed',()=>{
 const sim=fresh(),own=sim.territory.states.filter(p=>p.original==='AAA'),capital=sim.state.cities!.find(c=>c.nation==='AAA'&&c.capital)!,source=sim.territory.stateAt(cellAt(grid,capital.x,capital.z))!;
 const remote=own.filter(p=>p!==source).sort((a,b)=>Math.hypot(b.center[0]-capital.x,b.center[1]-capital.z)-Math.hypot(a.center[0]-capital.x,a.center[1]-capital.z))[0];
 expect(sim.logistics.level('AAA',remote.cells[0])).toBeGreaterThan(.15);const rev=sim.logistics.revision;for(let i=0;i<50;i++)sim.logistics.level('AAA',remote.cells[0]);expect(sim.logistics.revision).toBe(rev);
 for(const p of own)if(p!==source&&p!==remote)sim.state.states![p.id]='BBB';const loaded=new Simulation(data,grid,campaignSnapshot(sim.state));expect(loaded.logistics.level('AAA',remote.cells[0])).toBeCloseTo(.15);
});
it('settles demanded states, returns the rest, pays reparations and enforces a truce',()=>{
 const sim=fresh();sim.declareWar('BBB');const foreign=sim.territory.states.filter(p=>p.original==='BBB');sim.territory.annex('BBB','AAA');const kept=foreign[0];const terms={target:'BBB',keepStates:[kept.id],reparations:25,demilitarize:true};
 expect(sim.negotiatePeace(terms)).toBeNull();expect(sim.atWar('AAA','BBB')).toBe(false);expect(sim.territory.stateController(kept)).toBe('AAA');expect(foreign.slice(1).every(p=>sim.territory.stateController(p)==='BBB')).toBe(true);expect(activeTruce(sim.state,'AAA','BBB')).toBeTruthy();expect(sim.canEnter('AAA',kept.cells[0])).toBe(false);expect(sim.declareWar('BBB')).toMatch(/treaty/);expect(sim.state.resistance![kept.id].level).toBe(25);
 sim.state.elapsed=4;sim.step(1);expect(sim.state.treaties![0].remaining).toBe(225);
 const restored=new Simulation(data,grid,campaignSnapshot(sim.state));expect(restored.state.treaties![0].zones).toEqual([kept.id]);expect(restored.state.resistance![kept.id]).toBeTruthy();
});
it('rejects unoccupied territorial demands and non-finite reparations',()=>{
 const sim=fresh();sim.declareWar('BBB');expect(sim.negotiatePeace({target:'BBB',keepStates:[sim.territory.states.find(p=>p.original==='BBB')!.id],reparations:0,demilitarize:false})).toMatch(/Only states/);
 expect(sim.negotiatePeace({target:'BBB',keepStates:[],reparations:NaN,demilitarize:false})).toMatch(/Reparations/);
});
it('attack-move fights before advancing while ordinary movement can continue',()=>{
 const sim=fresh();sim.state.units=[];sim.state.buildings=[];sim.declareWar('BBB');const u=troop(sim,-1),enemy=troop(sim,1);enemy.nation='BBB';enemy.team='enemy';u.tacticalOrder='attackMove';u.orderMode='manual';u.path=[[-.5,0]];u.destination=[-.5,0];const x=u.x;sim.step(1);expect(u.x).toBe(x);expect(enemy.hp).toBeLessThan(enemy.maxHp);expect(enemy.hp).toBeGreaterThan(enemy.maxHp-unitSpecs.infantry.damage*2);expect(enemy.organization).toBeLessThan(100);
});
it('completes objectives without ending the simulation and persists control groups',()=>{
 const sim=fresh();sim.playerNation.credits=11000;sim.playerNation.industry=8;sim.state.controlGroups!['1']=[sim.playerUnits[0].id];expect(objectiveProgress(sim.state,sim.playerNation,0).progress).toBe(1);sim.step(1);expect(sim.state.objective!.completedAt).toBe(1);expect(sim.state.result).toBe('playing');expect(campaignSnapshot(sim.state).controlGroups!['1']).toHaveLength(1);
});
it('builds supply depots with daily materials and preserves production rally points',()=>{
 const sim=fresh(),n=sim.playerNation;n.stockpile!.steel=20;n.stockpile!.iron=20;
 const site=sim.territory.states.filter(p=>p.original==='AAA').flatMap(p=>p.cells).map(i=>[grid.x+(i%grid.width+.5)*grid.cell,grid.z+(Math.floor(i/grid.width)+.5)*grid.cell] as Point).find(p=>!sim.placementError('depot',...p))!;
 expect(site).toBeTruthy();expect(sim.build('depot',...site)).toBeNull();const depot=sim.state.buildings.at(-1)!;expect(depot.construction!.totalDays).toBe(2);
 for(let i=0;i<10;i++)sim.step(1);expect(depot.construction).toBeUndefined();
 const hq=sim.headquarters!,target:Point=[hq.x,hq.z];sim.enqueue({kind:'rally',id:hq.id,target});sim.step(1);expect(hq.rally).toBeTruthy();
 const loaded=new Simulation(data,grid,campaignSnapshot(sim.state));expect(loaded.headquarters!.rally).toEqual(hq.rally);
});
it('queues a fallback line on a tick and returns fire without initiating an attack',()=>{
 const sim=fresh();sim.state.units=[];const a=troop(sim,-20,-2),b=troop(sim,-20,2);sim.enqueue({kind:'fallbackLine',ids:[a.id,b.id],start:[-25,-4],end:[-25,4]});sim.step(1);expect(a.tacticalOrder).toBe('fallback');expect(b.tacticalOrder).toBe('fallback');expect(a.destination).not.toEqual(b.destination);
});
