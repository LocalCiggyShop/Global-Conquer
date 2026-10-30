import {it,expect} from 'vitest';
import {UnitPositions} from './unit-stacks';
import {createGrid,cellAt,nearestOpen,findPath} from './navigation';
import {createCampaign,Simulation} from './campaign';
import type {ContinentData,Unit} from './types';
function unit(id:number,x:number):Unit{return {id,nation:'AAA',team:'player',type:'infantry',x,z:0,hp:90,maxHp:90,path:[],cooldown:0,order:0};}
it('waits instead of walking backwards when a narrow route is occupied',()=>{
 const moving=unit(1,0),blocker=unit(2,1),positions=[moving,blocker],trace:number[]=[];blocker.type="armor";
 for(let i=0;i<12;i++){new UnitPositions(positions).place(moving,[moving.x+0.2,0],p=>Math.abs(p[1])<0.001,0.2);trace.push(moving.x);}
 expect(trace.every((x,i)=>i===0||x>=trace[i-1]-1e-8)).toBe(true);
 const held=moving.x;blocker.x=2;new UnitPositions(positions).place(moving,[moving.x+0.2,0],p=>Math.abs(p[1])<0.001,0.2);expect(moving.x).toBeGreaterThan(held);
});
it('does not reverse toward a compatible stack behind a moving unit',()=>{
 const moving=unit(1,0),behind=unit(2,-0.1),wall=unit(3,0.8);wall.type='armor';
 new UnitPositions([moving,behind,wall]).place(moving,[0.2,0],p=>Math.abs(p[1])<0.001,0.2);expect(moving.x).toBeGreaterThanOrEqual(0);
});
it('keeps making forward progress while passing an obstacle in open terrain',()=>{
 const moving=unit(1,0),wall=unit(2,1);wall.type='armor';let previous=0;
 for(let i=0;i<25;i++){const distance=Math.hypot(3-moving.x,moving.z),step=Math.min(0.2,distance);if(!step)break;new UnitPositions([moving,wall]).place(moving,[moving.x+(3-moving.x)/distance*step,moving.z-moving.z/distance*step],()=>true,step);expect(moving.x).toBeGreaterThanOrEqual(previous-1e-8);previous=moving.x;}
 expect(moving.x).toBeGreaterThan(2);
});
const data:ContinentData={id:'test',bounds:[-44,-24,44,24],lakes:[],countries:[{id:'AAA',name:'Alpha',population:20e6,bounds:[-40,-20,0,20],polygons:[[[[-40,-20],[0,-20],[0,20],[-40,20]]]]},{id:'BBB',name:'Beta',population:20e6,bounds:[0,-20,40,20],polygons:[[[[0,-20],[40,-20],[40,20],[0,20]]]]}]};
it('holds an AI capture position beside an occupied goal instead of repeatedly ordering the same route',()=>{
 const grid=createGrid(data,80),sim=new Simulation(data,grid,createCampaign(data,grid,'AAA'));
 for(const n of Object.values(sim.state.nations))n.nextActionAt=1e9;sim.state.affairs!.nextNewsAt=1e9;
 const city=sim.state.cities!.find(c=>c.nation==='AAA')!,u=unit(sim.state.nextId++,city.x+0.7);u.z=city.z;u.nation='BBB';u.team='enemy';u.orderMode='ai';u.leaderId=sim.state.leaders!.find(l=>l.nation==='BBB'&&l.branch==='army')!.id;sim.command.get(u.leaderId)!.stance='attack';
 sim.state.units=[u];sim.declareWar('AAA','BBB');const requests:number[]=[];
 sim.requestPath=(troop,p)=>{requests.push(troop.id);troop.path=findPath(grid,sim.landMask(troop.nation),cellAt(grid,troop.x,troop.z),nearestOpen(grid,sim.landMask(troop.nation),...p));};
 sim.step(1);expect(sim.territory.stateAt(cellAt(grid,u.x,u.z))).toBe(sim.territory.stateAt(cellAt(grid,city.x,city.z)));expect(requests).toHaveLength(0);expect(u.destination??null).toBeNull();
});

it('lets all five formations in a full compatible stack move forward together',()=>{
 const troops=Array.from({length:5},(_,i)=>unit(i+1,0));
 for(let tick=0;tick<10;tick++){const positions=new UnitPositions(troops);for(const u of troops)positions.place(u,[u.x+0.2,0],p=>Math.abs(p[1])<0.001,0.2);}
 for(const u of troops)expect(u.x).toBeCloseTo(2);
});
it('waits beside a full five-formation stack and approaches after a slot opens',()=>{
 const troops=Array.from({length:5},(_,i)=>unit(i+1,1)),moving=unit(99,0),all=[...troops,moving];let previous=0;
 for(let tick=0;tick<10;tick++){new UnitPositions(all).place(moving,[moving.x+0.2,0],p=>Math.abs(p[1])<0.001,0.2);expect(moving.x).toBeGreaterThanOrEqual(previous);previous=moving.x;}
 expect(moving.x).toBeLessThan(0.4);troops[0].hp=0;
 for(let tick=0;tick<5;tick++){const step=Math.min(0.2,1-moving.x);new UnitPositions(all).place(moving,[moving.x+step,0],p=>Math.abs(p[1])<0.001,step);}
 expect(moving.x).toBeCloseTo(1);
});
