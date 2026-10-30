import {it,expect} from 'vitest';
import * as THREE from 'three';
import {attachConstructionSite,updateConstructionSite} from './construction-visual';
import {advanceConstruction} from './construction';
import {createGrid,cellAt,routeCellsClear} from './navigation';
import {Simulation,createCampaign} from './campaign';
import {PathClient} from './path-client';
import {lockNearbyStacks} from './unit-stacks';
import type {ContinentData,Unit,Building} from './types';
const data:ContinentData={id:'test',lakes:[],bounds:[-24,-16,24,16],countries:[{id:'AAA',name:'Alpha',population:20e6,bounds:[-20,-12,0,12],polygons:[[[[-20,-12],[0,-12],[0,12],[-20,12]]]]},{id:'BBB',name:'Beta',population:20e6,bounds:[0,-12,20,12],polygons:[[[[0,-12],[20,-12],[20,12],[0,12]]]]}]};
function fresh(){const grid=createGrid(data,80),sim=new Simulation(data,grid,createCampaign(data,grid,'AAA'));sim.state.units=[];sim.state.buildings=[];for(const n of Object.values(sim.state.nations)){n.nextActionAt=1e9;n.credits=10000;n.supplies=1000;n.reserves=0;}sim.state.affairs!.nextNewsAt=1e9;return sim;}
function unit(sim:Simulation,nation:string,x:number,type:Unit['type']='infantry'):Unit{const u:Unit={id:sim.state.nextId++,nation,team:nation==='AAA'?'player':'enemy',type,x,z:0,hp:210,maxHp:210,path:[],cooldown:0,order:1,organization:100};sim.state.units.push(u);return u;}
it('shows excavation, framework and walls per funded day; holds progress during a shortage; finishes cleanly',()=>{
 const sim=fresh(),building:Building={id:100,nation:'AAA',team:'player',type:'barracks',x:-5,z:0,hp:100,maxHp:100,construction:{completedDays:0,totalDays:3,nextTick:5}};
 sim.state.buildings=[building];sim.playerNation.stockpile!.steel=0;sim.playerNation.stockpile!.iron=10;
 const model=new THREE.Group(),base=new THREE.Mesh(),body=new THREE.Mesh(),roof=new THREE.Mesh(),detail=new THREE.Mesh(),flag=new THREE.Mesh();model.add(base,body,roof,detail,flag);
 attachConstructionSite(model,{base,body,roof,details:[detail],finishing:[flag]},building);
 expect(model.getObjectByName('construction-site')).toBeTruthy();expect(body.visible).toBe(false);
 sim.state.elapsed=5;advanceConstruction(sim.state);updateConstructionSite(model,building);expect(body.visible).toBe(false);
 sim.playerNation.stockpile!.steel=6;sim.state.elapsed=10;advanceConstruction(sim.state);updateConstructionSite(model,building);expect(body.visible).toBe(true);expect(body.scale.y).toBe(.5);expect(roof.visible).toBe(false);
 sim.state.elapsed=15;advanceConstruction(sim.state);updateConstructionSite(model,building);expect(body.scale.y).toBe(1);expect(detail.visible).toBe(true);expect(roof.visible).toBe(false);
 sim.state.elapsed=20;advanceConstruction(sim.state);updateConstructionSite(model,building);expect(building.construction).toBeUndefined();expect(roof.visible).toBe(true);expect(flag.visible).toBe(true);expect(model.getObjectByName('construction-site')).toBeUndefined();
});
it('does not send a moving unit backwards when a delayed path reply arrives',()=>{
 const sim=fresh(),u=unit(sim,'AAA',-10),messages:any[]=[];u.destination=[-2,0];
 const client=new PathClient(sim,{postMessage:m=>messages.push(m)},()=>{});client.request(u,u.destination);client.flush();
 u.x=-6;const path=[[-9,0],[-8,0],[-7,0],[-6,0],[-5,0],[-4,0],[-3,0],[-2,0]] as [number,number][];
 client.receive({...messages[0],path});expect(u.path[0][0]).toBeGreaterThan(u.x);expect(u.destination).toEqual([-2,0]);
});
it('checks the cells between sparse waypoints and does not shortcut through neutral land',()=>{
 const sim=fresh(),start:[number,number]=[-8,0],end:[number,number]=[8,0];
 expect(routeCellsClear(sim.grid,start,[end],i=>sim.canEnter('AAA',i))).toBe(false);
 const mask=sim.grid.walkable.slice();mask[cellAt(sim.grid,-3,0)]=0;
 expect(routeCellsClear(sim.grid,start,[[-1,0]],i=>!!mask[i])).toBe(false);
});
it('assigns a stacked frontline once rather than letting its followers overwrite the shared position',()=>{
 const sim=fresh(),troops=Array.from({length:5},()=>unit(sim,'AAA',-5));lockNearbyStacks(troops);
 const border=sim.frontlineBorder('AAA','BBB'),anchor=border.points[Math.floor(border.points.length/2)];expect(anchor).toBeTruthy();
 const shared={target:'BBB',anchor:[...anchor] as [number,number],position:[-5,0] as [number,number]};for(const u of troops){u.frontline=shared;u.leaderId=sim.state.leaders!.find(l=>l.nation==='AAA'&&l.branch==='army')!.id;}
 let requests=0;sim.requestPath=(u,to)=>{requests++;u.path=[to];};
 (sim as any).updateFrontlines();const orders=troops[0].order;(sim as any).updateFrontlines();
 expect(requests).toBe(1);expect(troops[0].order).toBe(orders);
});
it('lets a tank explicitly ordered to attack move shoot despite its generals defensive stance',()=>{
 const sim=fresh(),tank=unit(sim,'AAA',-1,'armor'),enemy=unit(sim,'BBB',1);enemy.cooldown=100;
 tank.leaderId=sim.state.leaders!.find(l=>l.nation==='AAA'&&l.branch==='army')!.id;expect(sim.command.stance(tank)).toBe('defend');
 sim.declareWar('BBB');tank.tacticalOrder='attackMove';tank.orderMode='manual';let shots=0;sim.onShot=()=>shots++;
 sim.step(1);expect(enemy.hp).toBeLessThan(enemy.maxHp);expect(tank.lastFiredAt).toBe(sim.state.elapsed);expect(tank.lastShotTarget).toEqual([enemy.x,enemy.z]);expect(shots).toBeGreaterThan(0);
});
it('keeps a defending tank from starting combat against an unengaged enemy',()=>{
 const sim=fresh(),tank=unit(sim,'AAA',-1,'armor'),enemy=unit(sim,'BBB',1);enemy.cooldown=100;
 tank.leaderId=sim.state.leaders!.find(l=>l.nation==='AAA'&&l.branch==='army')!.id;sim.declareWar('BBB');sim.step(1);expect(enemy.hp).toBe(enemy.maxHp);expect(tank.lastFiredAt).toBeUndefined();
});
