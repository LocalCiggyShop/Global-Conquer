import {cellAt,cellPoint,blockedGrid} from "./navigation";
import type {Campaign,ContinentData,Grid} from "./types";
import type {Naval} from "./naval";
import type {Territory} from "./territory";
/** Real named ports are infrastructure, not freely placed military buildings. */
export function initializePorts(state:Campaign,data:ContinentData,grid:Grid,naval:Naval,territory:Territory){
 if(!data.ports||state.portsInitialized)return;
 const legacy=state.buildings.filter((b)=>b.type==="dock"&&!b.portId);
 state.buildings=state.buildings.filter((b)=>b.type!=="dock"||!!b.portId);
 const mask=blockedGrid(grid,state.buildings),claimed=new Set<number>();
 for(const port of data.ports){
  const existing=state.buildings.find((b)=>b.portId===port.id);if(existing)continue;
  let best=-1,distance=7;
  for(const index of naval.coasts){
   if(!mask[index]||claimed.has(index)||data.countries[grid.owners[index]]?.id!==port.nation)continue;
   const p=cellPoint(grid,index),d=Math.hypot(p[0]-port.x,p[1]-port.z);
   if(d<distance){best=index;distance=d;}
  }
  if(best<0)continue;
  claimed.add(best);const p=cellPoint(grid,best),nation=territory.controllerAt(best)??port.nation;
  const old=legacy.find((b)=>b.nation===nation&&!b.portId);if(old)old.portId=port.id;
  state.buildings.push({id:old?.id??state.nextId++,nation,team:nation===state.nation?"player":"enemy",type:"dock",portId:port.id,x:p[0],z:p[1],hp:old?.hp??350,maxHp:old?.maxHp??350});
 }
 state.portsInitialized=true;
}
