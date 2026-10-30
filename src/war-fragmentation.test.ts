import {it,expect} from 'vitest';
import {createCampaign,Simulation} from './campaign';
import {createGrid,findPath,nearestOpen,cellAt} from './navigation';
import {canAiAdvance,landStrengths} from './ai-offense';
import {fragmentationDue,FRAGMENTATION_TICKS} from './fragmentation';
import {campaignSnapshot} from './snapshot';
import {lockNearbyStacks} from './unit-stacks';
import {personnel} from './unit-stacks';
import type {ContinentData,Unit} from './types';
const data:ContinentData={id:'test',kmPerUnit:45,bounds:[-44,-24,44,24],lakes:[],countries:[{id:'AAA',name:'Alpha',population:20e6,bounds:[-40,-20,0,20],polygons:[[[[-40,-20],[0,-20],[0,20],[-40,20]]]]},{id:'BBB',name:'Beta',population:20e6,bounds:[0,-20,40,20],polygons:[[[[0,-20],[40,-20],[40,20],[0,20]]]]}]};
const grid=createGrid(data,80);
function fresh(){const sim=new Simulation(data,grid,createCampaign(data,grid,'AAA'));for(const n of Object.values(sim.state.nations)){n.credits=5000;n.supplies=500;n.nextActionAt=1e9;n.reserves=0;}sim.state.affairs!.nextNewsAt=1e9;return sim;}
function unit(sim:Simulation,nation:string,x:number,z=0,hp=90):Unit{const u:Unit={id:sim.state.nextId++,nation,team:nation==='AAA'?'player':'enemy',type:'infantry',x,z,hp,maxHp:90,path:[],cooldown:0,order:0,organization:100};sim.state.units.push(u);if(nation!=='AAA')sim.command.assignAI(u);return u;}
function routes(sim:Simulation){sim.requestPath=(u,to)=>{const mask=sim.landMask(u.nation);u.path=findPath(grid,mask,cellAt(grid,u.x,u.z),nearestOpen(grid,mask,...to));};}
it('allows a funded strong AI to cross the declared enemy border despite defensive readiness',()=>{
 const sim=fresh();sim.state.units=[];unit(sim,'AAA',-30);for(let i=0;i<4;i++)unit(sim,'BBB',2,(-1.5+i)*2);routes(sim);sim.state.nations.BBB.nextActionAt=0;expect(sim.canEnter('BBB',cellAt(grid,-2,0))).toBe(false);sim.declareWar('AAA','BBB');expect(sim.canEnter('BBB',cellAt(grid,-2,0))).toBe(true);
 for(let i=0;i<28;i++)sim.step(1);expect(sim.state.nations.BBB.defenseReadiness).toBeTruthy();expect(sim.state.leaders!.filter(l=>l.nation==='BBB'&&l.branch==='army').every(l=>l.stance==='attack')).toBe(true);expect(sim.state.units.some(u=>u.nation==='BBB'&&u.x<0)).toBe(true);
});
it('keeps weaker, unfunded or exhausted AI armies on defence and never attacks neutrals',()=>{
 const sim=fresh();sim.state.units=[];for(let i=0;i<5;i++)unit(sim,'AAA',-10,i*2);const ai=unit(sim,'BBB',2);sim.declareWar('AAA','BBB');expect(canAiAdvance(sim.state,'BBB','AAA',landStrengths(sim.state))).toBe(false);sim.state.units=sim.state.units.filter(u=>u.nation==='BBB');sim.state.nations.BBB.credits=0;expect(canAiAdvance(sim.state,'BBB','AAA',landStrengths(sim.state))).toBe(false);sim.state.nations.BBB.credits=5000;ai.organization=10;expect(canAiAdvance(sim.state,'BBB','AAA',landStrengths(sim.state))).toBe(false);ai.organization=100;sim.makePeace('AAA','BBB');expect(canAiAdvance(sim.state,'BBB','AAA',landStrengths(sim.state))).toBe(false);
});
it('scales 2500 soldiers to exactly 2.5 full formations worth of attack and health',()=>{
 const damage=(health:number[])=>{const sim=fresh();sim.state.units=[];sim.state.buildings=[];for(const hp of health)unit(sim,'AAA',-1,0,hp);const target=unit(sim,'BBB',1);target.hp=10000;target.maxHp=10000;target.cooldown=100;target.organization=100;sim.declareWar('BBB');lockNearbyStacks(sim.state.units);sim.step(1);return {damage:10000-target.hp,health:sim.state.units.filter(u=>u.nation==='AAA').reduce((sum,u)=>sum+u.hp,0),soldiers:sim.state.units.filter(u=>u.nation==='AAA').reduce((sum,u)=>sum+personnel(u),0)};};
 const full=damage([90]),stack=damage([90,90,45]);expect(stack.soldiers).toBe(2500);expect(stack.damage/full.damage).toBeCloseTo(2.5,5);expect(stack.health/full.health).toBeCloseTo(2.5);
});
it('requires unrest plus 30 continuous days below 50% and resets on recovery',()=>{
 const sim=fresh(),n=sim.playerNation;n.stability=40;sim.state.elapsed=1000;expect(fragmentationDue(sim.state,n)).toBe(false);sim.affairs.publish('AAA','unrest');expect(fragmentationDue(sim.state,n)).toBe(false);sim.state.elapsed+=FRAGMENTATION_TICKS-1;expect(fragmentationDue(sim.state,n)).toBe(false);sim.state.elapsed++;expect(fragmentationDue(sim.state,n)).toBe(true);n.stability=50;expect(fragmentationDue(sim.state,n)).toBe(false);expect(n.instabilitySince).toBeUndefined();
});
it('creates independent states with conserved resources, legal borders, functioning armies and persisted governments',()=>{
 const sim=fresh(),n=sim.state.nations.BBB;n.stability=0;sim.affairs.publish('BBB','unrest');n.instabilitySince=-FRAGMENTATION_TICKS;const owned=sim.territory.states.filter(p=>sim.territory.stateController(p)==='BBB'),site=owned.find(p=>p!==sim.territory.stateAt(cellAt(grid,sim.state.cities!.find(c=>c.nation==='BBB'&&c.capital)!.x,sim.state.cities!.find(c=>c.nation==='BBB'&&c.capital)!.z)))!;const u=unit(sim,'BBB',...site.center);const population=sim.territory.population('BBB'),credits=n.credits,supplies=n.supplies,steel=n.stockpile!.steel;
 // Trigger the daily breakup before economy/AI mutations complicate conservation assertions.
 (sim as any).fragmentNation(n);const children=Object.values(sim.state.nations).filter(c=>c.breakaway?.parent==='BBB');expect(children.length).toBe(owned.length-1);expect(n.defeated).toBe(false);expect(u.nation).not.toBe('BBB');expect(children.some(c=>c.id===u.nation)).toBe(true);expect(sim.canEnter('AAA',cellAt(grid,u.x,u.z))).toBe(false);expect(sim.canEnter(u.nation,cellAt(grid,u.x,u.z))).toBe(true);
 expect([n,...children].reduce((sum,c)=>sum+c.credits,0)).toBeCloseTo(credits);expect([n,...children].reduce((sum,c)=>sum+c.supplies,0)).toBeCloseTo(supplies);expect([n,...children].reduce((sum,c)=>sum+c.stockpile!.steel,0)).toBeCloseTo(steel);expect([n,...children].reduce((sum,c)=>sum+sim.territory.population(c.id),0)).toBeCloseTo(population,-1);
 const child=sim.state.nations[u.nation],access=sim.accessSnapshot();expect(access.access[child.id]).toBeTruthy();expect(sim.data.countries.some(c=>c.id===child.id)).toBe(true);sim.logistics.refresh(true);expect(sim.unitSupply(u)).toBeGreaterThan(.15);
 const loaded=new Simulation(data,grid,campaignSnapshot(sim.state));expect(loaded.state.nations[child.id].breakaway).toEqual(child.breakaway);expect(loaded.data.countries.some(c=>c.id===child.id)).toBe(true);expect(loaded.territory.controllerAt(cellAt(grid,u.x,u.z))).toBe(child.id);expect(loaded.canEnter(child.id,cellAt(grid,u.x,u.z))).toBe(true);
 // Annexing the rump government must not annex its now-independent states.
 loaded.territory.annex('BBB','AAA');expect(loaded.territory.controllerAt(cellAt(grid,u.x,u.z))).toBe(child.id);
});
it('does not override a manual move with a low-organization trip back to the capital',()=>{
 const sim=fresh();sim.state.units=[];const u=unit(sim,'AAA',-3);u.organization=5;u.lastCombatAt=sim.state.elapsed;routes(sim);expect(sim.tactical([u.id],[-8,0],'move')).toBeNull();sim.step(1);expect(u.retreating).toBe(false);expect(u.tacticalOrder).toBe('move');expect(u.destination).not.toEqual(sim.playerNation.capital);
});
it('occupies nearby enemy states rather than waiting to reach a distant capital',()=>{
 const sim=fresh();sim.state.units=[];sim.state.buildings=[];for(let i=0;i<3;i++)unit(sim,'BBB',2,i*2);routes(sim);sim.declareWar('AAA','BBB');
 for(let i=0;i<85;i++){for(const n of Object.values(sim.state.nations))n.stability=70;sim.step(1);}
 expect(sim.territory.states.some(p=>p.original==='AAA'&&sim.territory.stateController(p)==='BBB')).toBe(true);
});
it('uses only a short local withdrawal while under fire, with no capital route',()=>{
 const sim=fresh();sim.state.units=[];sim.state.buildings=[];const u=unit(sim,'AAA',-3),enemy=unit(sim,'BBB',-1);sim.declareWar('BBB');u.organization=5;u.lastCombatAt=0;u.underFireUntil=10;u.lastAttackerId=enemy.id;
 sim.step(1);expect(u.retreating).toBe(true);expect(u.destination).toBeTruthy();expect(Math.hypot(u.destination![0]+3,u.destination![1])).toBeLessThanOrEqual(3.01);expect(u.destination![0]).toBeLessThan(-3);expect(u.x).toBeLessThan(-3);expect(u.destination).not.toEqual(sim.playerNation.capital);
});
it('cancels a legacy long retreat and recovers in place',()=>{
 const sim=fresh();sim.state.units=[];const u=unit(sim,'AAA',-3);u.organization=20;u.retreating=true;u.path=[[-30,0]];u.destination=[-30,0];const x=u.x;sim.step(1);expect(u.destination).toBeNull();expect(u.path).toEqual([]);expect(u.x).toBe(x);expect(u.organization).toBeGreaterThan(20);
});
