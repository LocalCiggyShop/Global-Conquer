import {it,expect} from 'vitest';
import {createGrid} from './navigation';
import {Simulation,createCampaign} from './campaign';
import {lockNearbyStacks,unitStacks,MAX_STACK_UNITS} from './unit-stacks';
import {campaignSnapshot} from './snapshot';
import {politicalGrowth,politicsDay,ideologies} from './politics';
import {validHotkey,defaults,hotkeyActions} from './hotkeys';
import type {ContinentData,Unit} from './types';
export const ids=['DEU','AUT','POL','FRA','NLD','BEL','LUX'];
const data:ContinentData={id:'test',kmPerUnit:45,bounds:[-52,-22,52,22],lakes:[],countries:ids.map((id,i)=>({id,name:id,population:20e6,bounds:[-49+i*14,-18,-35+i*14,18],polygons:[[[[-49+i*14,-18],[-35+i*14,-18],[-35+i*14,18],[-49+i*14,18]]]]}))};
const grid=createGrid(data,100);
function fresh(){const s=new Simulation(data,grid,createCampaign(data,grid,'DEU'));for(const n of Object.values(s.state.nations)){n.nextActionAt=1e9;n.credits=5000;n.supplies=500;}s.state.affairs!.nextNewsAt=1e9;return s;}
function forces(sim:Simulation,count=5,type:Unit['type']='infantry'){sim.state.units=Array.from({length:count},()=>({id:sim.state.nextId++,nation:'DEU',team:'player',type,x:-42,z:0,hp:90,maxHp:90,path:[],cooldown:0,order:0,organization:100}));lockNearbyStacks(sim.state.units);return sim.state.units;}
it('locks proximity stacks and preserves membership across movement, partial selections and saves',()=>{
 const sim=fresh(),units=forces(sim),requests:number[]=[];sim.requestPath=(u,p)=>{requests.push(u.id);u.path=[p];};expect(new Set(units.map(u=>u.stackId)).size).toBe(1);
 expect(sim.tactical([units[3].id],[-39,0],'move')).toBeNull();sim.step(1);expect(requests).toHaveLength(1);expect(new Set(units.map(u=>u.x+':'+u.z)).size).toBe(1);
 units[4].hp=45;for(let i=0;i<4;i++)sim.step(1);expect(new Set(units.map(u=>u.x+':'+u.z)).size).toBe(1);const loaded=new Simulation(data,grid,campaignSnapshot(sim.state));expect([...unitStacks(loaded.state.units).groups.values()][0]).toHaveLength(5);
});
it('only manual Split separates the group and prevents automatic remerging',()=>{
 const sim=fresh(),units=forces(sim);expect(sim.splitUnits([units[0].id])).toBeNull();expect(units.every(u=>u.stackId===undefined&&u.stackSeparated)).toBe(true);expect(unitStacks(units).groups.size).toBe(5);
 for(let i=0;i<3;i++)sim.step(1);expect(unitStacks(units).groups.size).toBe(5);expect(sim.mergeUnits(units.map(u=>u.id))).toBeNull();expect(unitStacks(units).groups.size).toBe(1);expect(units.every(u=>u.stackSeparated===false)).toBe(true);
});
it('rejects split in a place without adjacent legal positions without changing the stack',()=>{
 const sim=fresh(),units=forces(sim);sim.walkable.fill(0);expect(sim.splitUnits([units[0].id])).toMatch(/open ground/);expect(new Set(units.map(u=>u.stackId)).size).toBe(1);expect(unitStacks(units).groups.size).toBe(1);
});
it('keeps leader assignments and fallback orders applied to complete stacks',()=>{
 const sim=fresh(),units=forces(sim);const leader=sim.state.leaders!.find(l=>l.nation==='DEU'&&l.branch==='army')!;expect(sim.command.assign([units[2].id],leader.id).ids).toHaveLength(5);expect(units.every(u=>u.leaderId===leader.id)).toBe(true);
 sim.enqueue({kind:'fallbackLine',ids:[units[1].id],start:[-45,-5],end:[-45,5]});sim.step(1);expect(new Set(units.map(u=>JSON.stringify(u.destination))).size).toBe(1);expect(units.every(u=>u.tacticalOrder==='fallback')).toBe(true);
});
it('refuses to partially embark a merged armor stack that cannot fit on one transport',()=>{
 const sim=fresh(),units=forces(sim,5,'armor');const ship:Unit={...units[0],id:sim.state.nextId++,stackId:undefined,type:'transport',x:-42,z:1,cargo:[]};sim.state.units.push(ship);expect(sim.naval.embark([units[0].id])).toMatch(/Split/);expect(units.filter(u=>u.type==='armor').every(u=>!u.embarkedOn)).toBe(true);
});
it('keeps automatic groups within the five-formation cap',()=>{
 const sim=fresh(),units=forces(sim,6);expect([...unitStacks(units).groups.values()].map(g=>g.length)).toEqual([MAX_STACK_UNITS,1]);expect(sim.mergeUnits(units.map(u=>u.id))).toMatch(/at most five/);
});
it('requires every requested German Reich country, then integrates every state and city as cores',()=>{
 const sim=fresh();sim.territory.annex('AUT','DEU');expect(sim.formNation('german-reich')).toMatch(/Control/);
 for(const id of ids.slice(2))sim.territory.annex(id,'DEU');const foreign=sim.territory.states.find(p=>p.original==='FRA')!;sim.state.resistance![foreign.id]={level:75,since:0};
 expect(sim.formNation('german-reich')).toBeNull();expect(sim.state.nations.FRA.annexedBy).toBe('DEU');expect(sim.state.resistance![foreign.id]).toBeUndefined();expect(sim.territory.states.every(p=>sim.territory.coreNation(p)==='DEU')).toBe(true);expect(sim.state.cities!.every(c=>c.nation==='DEU')).toBe(true);expect(sim.state.cities!.filter(c=>c.capital)).toHaveLength(1);
 const loaded=new Simulation(data,grid,campaignSnapshot(sim.state));expect(loaded.territory.states.every(p=>loaded.territory.coreNation(p)==='DEU'&&loaded.territory.stateController(p)==='DEU')).toBe(true);expect(loaded.state.occupation![foreign.cells[0]].original).toBe('DEU');expect(loaded.state.occupation![foreign.cells[0]].settled).toBe(true);
});
it('uses the same signed political rate calculation in the UI and daily simulation',()=>{
 const sim=fresh(),n=sim.playerNation;sim.state.elapsed=5;n.consumerServed=999;n.civicPolicy='rights';sim.state.wars.push({a:'DEU',b:'AUT',since:0});sim.affairs.publish('DEU','unrest');const rate=politicalGrowth(sim.state,n,true),stability=n.stability!,power=n.politicalPower!;expect(rate.stability).toBe(-1);expect(rate.stabilityDetails).toContain('War -3.0');expect(rate.stabilityDetails).toContain('Unrest -1.0');politicsDay(sim.state);expect(n.stability).toBe(stability+rate.stability);expect(n.politicalPower).toBe(power+rate.power);
 n.ideology='nonAligned';expect(ideologies.nonAligned.power).toBe(1);expect(politicalGrowth(sim.state,n).powerDetails).toContain('Non aligned');
});
it('provides distinct shortcut defaults with V for Split and reserves camera/group keys',()=>{
 const bindings=defaults(),codes=Object.values(bindings).filter(Boolean);expect(bindings.split).toBe('KeyV');expect(new Set(codes).size).toBe(codes.length);expect(validHotkey('KeyW')).toBe(false);expect(validHotkey('Digit1')).toBe(false);expect(validHotkey('Escape')).toBe(false);expect(validHotkey('KeyK')).toBe(true);expect(hotkeyActions.some(a=>a.id==='settings')).toBe(true);
});
