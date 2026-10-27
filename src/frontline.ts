import { cellPoint } from "./navigation";
import type { Grid, Point } from "./types";

type Candidate = { point: Point; target: string };
function chooseBorder(candidates: Candidate[], target?: string, anchor?: Point) {
  const distance = (p: Point) => anchor ? Math.hypot(p[0] - anchor[0], p[1] - anchor[1]) : 0;
  let neighbor = target ?? null, best = 6;
  if (!neighbor) for (const c of candidates) {
    const d = distance(c.point); if (d <= best) { best = d; neighbor = c.target; }
  }
  const unique = new Map<string, Point>();
  for (const c of candidates)
    if (c.target === neighbor && distance(c.point) <= 24) unique.set(c.point.join(","), c.point);
  const points = [...unique.values()];
  if (points.length) {
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for (const p of points) {minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minZ=Math.min(minZ,p[1]);maxZ=Math.max(maxZ,p[1]);}
    const axis = maxX-minX > maxZ-minZ ? 0 : 1;
    points.sort((a,b)=>a[axis]-b[axis] || a[1-axis]-b[1-axis]);
  }
  return { points, target: neighbor };
}

/** One land scan per control revision, shared by simulation and rendering. */
export class BorderIndex {
 private revision=-1;
 private owners:(string|null)[];
 private borderCells=new Map<number,{nation:string;point:Point;neighbors:string[]}>();
 private candidates=new Map<string,Candidate[]>();
 constructor(readonly grid:Grid,readonly controllerAt:(i:number)=>string|null){this.owners=new Array(grid.owners.length).fill(null);}
 query(revision:number,nation:string,target?:string,anchor?:Point){
  if(revision!==this.revision){
   this.revision=revision;const g=this.grid,dirty=new Set<number>();
   for(let i=0;i<g.owners.length;i++){const owner=this.controllerAt(i);if(owner===this.owners[i])continue;this.owners[i]=owner;const x=i%g.width;for(const j of [i,x?i-1:-1,x<g.width-1?i+1:-1,i-g.width,i+g.width])if(j>=0&&j<g.owners.length)dirty.add(j);}
   for(const i of dirty){this.borderCells.delete(i);const own=this.owners[i];if(!own||!g.walkable[i])continue;const x=i%g.width,neighbors=new Set<string>();
    for(const j of [x?i-1:-1,x<g.width-1?i+1:-1,i-g.width,i+g.width]){const other=this.owners[j];if(other&&other!==own)neighbors.add(other);}
    if(neighbors.size)this.borderCells.set(i,{nation:own,point:cellPoint(g,i),neighbors:[...neighbors]});
   }
   this.candidates.clear();
   for(const c of this.borderCells.values()){const list=this.candidates.get(c.nation)??[];for(const other of c.neighbors)list.push({point:c.point,target:other});this.candidates.set(c.nation,list);}
  }
  return chooseBorder(this.candidates.get(nation)??[],target,anchor);
 }
}
export function borderPositions(grid:Grid,controllerAt:(i:number)=>string|null,nation:string,target?:string,anchor?:Point) {
  return new BorderIndex(grid,controllerAt).query(0,nation,target,anchor);
}
