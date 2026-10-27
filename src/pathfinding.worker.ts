import { findPath, nearestOpen } from "./navigation";
import type { Grid } from "./types";

let grid:Grid|null=null,blocked:Uint8Array|null=null,water:Uint8Array|null=null,controllers:Int16Array|null=null;
let access:Record<string,number[]>={},revision=0,obstaclesRevision=0,scheduled=false;
const masks=new Map<string,Uint8Array>(), pending=new Map<number,any>();
function schedule() { if(!scheduled){scheduled=true;setTimeout(processNext,0);} }
function processNext() {
  scheduled=false;
  if(!grid||!blocked)return;
  let message:any;
  for(const candidate of pending.values())if(!message||candidate.priority<message.priority)message=candidate;
  if(!message)return;
  pending.delete(message.id);
  let mask=water;
  if(message.domain!=="sea"||!water) {
    mask=masks.get(message.nation)??null;
    if(!mask) {
      const allowed=new Set(access[message.nation]??[]);
      mask=blocked.map((open,i)=>open&&controllers&&allowed.has(controllers[i])?1:0);
      masks.set(message.nation,mask);
    }
  }
  if(mask) {
    const start=nearestOpen(grid,mask,...message.from as [number,number]),end=nearestOpen(grid,mask,...message.to as [number,number],12);
    self.postMessage({type:"path",id:message.id,serial:message.serial,order:message.order,revision,obstaclesRevision,path:findPath(grid,mask,start,end)});
  }
  if(pending.size)schedule();
}
self.onmessage=(event:MessageEvent)=>{
  const m=event.data;
  if(m.type==="init"){grid=m.grid;blocked=m.walkable;water=m.water;obstaclesRevision=m.obstaclesRevision??0;}
  if(m.type==="init"||m.type==="access"){controllers=m.controllers;access=m.access;revision=m.revision;masks.clear();return;}
  if(m.type==="access-patch"){
    if(controllers)for(let n=0;n<m.cells.length;n++)controllers[m.cells[n]]=m.owners[n];
    revision=m.revision;
    for(const nation of m.invalidate){const mask=masks.get(nation);if(mask){const allowed=new Set(access[nation]??[]);for(let n=0;n<m.cells.length;n++)mask[m.cells[n]]=blocked?.[m.cells[n]]&&allowed.has(m.owners[n])?1:0;}}
    return;
  }
  if(m.type==="obstacles"){blocked=m.walkable;obstaclesRevision=m.obstaclesRevision;masks.clear();return;}
  if(m.type==="path"){pending.set(m.id,m);schedule();}
};
