import {it,expect} from 'vitest';
import {findPath,cellAt,routeCellsClear} from './navigation';
import {trafficCells,trafficMask} from './traffic-route';
import {PathClient} from './path-client';
import {Simulation,createCampaign} from './campaign';
import {createGrid} from './navigation';
import type {Grid,Unit,ContinentData} from './types';
const unit=(id:number,x:number,z:number):Unit=>({id,nation:'AAA',team:'player',type:'frigate',x,z,hp:100,maxHp:100,path:[],order:1,cooldown:0});
const grid:Grid={width:20,height:12,cell:1,x:0,z:0,owners:new Int16Array(240).fill(-1),walkable:new Uint8Array(240).fill(1)};
it('routes around neutral ships in open water without changing the base navigation mask',()=>{
 const mover=unit(1,2.5,5.5),blocker=unit(2,8.5,5.5);blocker.nation='BBB';const base=grid.walkable.slice(),start=cellAt(grid,mover.x,mover.z),end=cellAt(grid,15.5,5.5),cells=trafficCells(grid,mover,[blocker]),mask=trafficMask(base,cells,start),path=findPath(grid,mask,start,end);
 expect(path.length).toBeGreaterThan(0);expect(routeCellsClear(grid,[mover.x,mover.z],path,i=>!!mask[i])).toBe(true);expect(path.some(p=>Math.abs(p[1]-blocker.z)>=2)).toBe(true);expect(base.every(v=>v===1)).toBe(true);
});
it('waits when a narrow channel has no detour, then routes once the ship clears it',()=>{
 const base=new Uint8Array(240);for(let x=0;x<20;x++)base[5*20+x]=1;const mover=unit(1,2.5,5.5),blocker=unit(2,8.5,5.5),start=cellAt(grid,2.5,5.5),end=cellAt(grid,15.5,5.5);
 expect(findPath(grid,trafficMask(base,trafficCells(grid,mover,[blocker]),start),start,end)).toEqual([]);expect(findPath(grid,trafficMask(base,[],start),start,end).length).toBeGreaterThan(0);
});
it('retains the destination and current route when the traffic worker cannot find a detour',()=>{
 const data:ContinentData={id:'test',bounds:[-12,-12,12,12],lakes:[],countries:[{id:'AAA',name:'Alpha',bounds:[-10,-10,10,10],polygons:[[[[-10,-10],[10,-10],[10,10],[-10,10]]]]}]};const nav=createGrid(data,32),sim=new Simulation(data,nav,createCampaign(data,nav,'AAA')),u=sim.playerUnits[0],messages:any[]=[];u.path=[[u.x+1,u.z]];u.destination=[u.x+3,u.z];const previous=u.path,destination=u.destination;
 const client=new PathClient(sim,{postMessage:m=>messages.push(m)},()=>{});client.request(u,u.destination,[1,2]);client.flush();expect(messages[0].traffic).toEqual([1,2]);client.receive({...messages[0],traffic:true,path:[]});expect(u.path).toBe(previous);expect(u.destination).toEqual(destination);expect(u.routeFailed).not.toBe(true);
});
