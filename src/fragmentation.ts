import type {Campaign,ContinentData,Grid,NationState,Country} from './types';
export const FRAGMENTATION_TICKS=150; // 30 days below 50%, after unrest.
export function fragmentationDue(state:Campaign,n:NationState){
 if(n.defeated||n.breakaway||n.stability!>=50){delete n.instabilitySince;return false;}
 const recent=n.lastUnrestAt??state.affairs?.news.filter(e=>e.nation===n.id&&e.kind==='unrest').at(-1)?.time;
 if(recent===undefined||(n.fracturedAt!==undefined&&recent<=n.fracturedAt))return false;
 n.instabilitySince??=state.elapsed;
 return state.elapsed-n.instabilitySince>=FRAGMENTATION_TICKS;
}
export function breakawayCountry(n:NationState,data:ContinentData):Country{
 const b=n.breakaway!,parent=data.countries.find(c=>c.id===b.parent);
 return {id:n.id,name:b.name,flagCode:parent?.flagCode,population:b.population,bounds:b.bounds,polygons:[]};
}
/** Append-only IDs preserve original grid ownership indices and prepared meshes. */
export function restoreBreakaways(data:ContinentData,state:Campaign){for(const n of Object.values(state.nations))if(n.breakaway&&!data.countries.some(c=>c.id===n.id))data.countries.push(breakawayCountry(n,data));}
export function stateBounds(grid:Grid,cells:readonly number[]):[number,number,number,number]{let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;for(const i of cells){const x=grid.x+i%grid.width*grid.cell,z=grid.z+Math.floor(i/grid.width)*grid.cell;minX=Math.min(minX,x);minZ=Math.min(minZ,z);maxX=Math.max(maxX,x+grid.cell);maxZ=Math.max(maxZ,z+grid.cell);}return[minX,minZ,maxX,maxZ];}
