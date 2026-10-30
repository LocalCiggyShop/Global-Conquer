import {cellAt,cellPoint} from './navigation';
import type {Grid,Point,Unit} from './types';
/** Small local traffic snapshot; never changes the persistent geography/access mask. */
export function trafficCells(grid:Grid,u:Unit,blockers:readonly Unit[]){
 const cells=new Set<number>(),start=cellAt(grid,u.x,u.z),clearance=(u.type==='frigate'||u.type==='transport')?1.25:.7,radius=Math.ceil((clearance+grid.cell*.55)/grid.cell);
 for(const b of blockers){const center=cellAt(grid,b.x,b.z);if(center<0)continue;const col=center%grid.width,row=Math.floor(center/grid.width);
  for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){const x=col+dx,z=row+dz;if(x<0||z<0||x>=grid.width||z>=grid.height)continue;const i=z*grid.width+x,p=cellPoint(grid,i);if(i!==start&&Math.hypot(p[0]-b.x,p[1]-b.z)<clearance+grid.cell*.55)cells.add(i);}
 }return [...cells];
}
export function trafficMask(base:Uint8Array,cells:readonly number[],start:number){const mask=base.slice();for(const i of cells)if(i>=0&&i<mask.length&&i!==start)mask[i]=0;return mask;}
