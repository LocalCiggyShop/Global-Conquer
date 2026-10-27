import type { ContinentData,Grid } from "./types";
export interface PoliticalField { id:string; x:number; z:number; width:number; height:number; lookup:Int32Array; }
/** Country-local, coast-padded fields cannot sample another country's paint at a vector border. */
export function preparePoliticalFields(data:ContinentData,grid:Grid):PoliticalField[] {
 const cells=data.countries.map(()=>[] as number[]);
 for(let i=0;i<grid.owners.length;i++)if(grid.owners[i]>=0)cells[grid.owners[i]].push(i);
 return data.countries.map((country,owner)=>{
  let minX=grid.width,minZ=grid.height,maxX=0,maxZ=0;
  for(const i of cells[owner]){const x=i%grid.width,z=Math.floor(i/grid.width);minX=Math.min(minX,x);minZ=Math.min(minZ,z);maxX=Math.max(maxX,x);maxZ=Math.max(maxZ,z);}
  if(!cells[owner].length)return {id:country.id,x:0,z:0,width:1,height:1,lookup:new Int32Array([-1])};
  minX-=2;minZ-=2;maxX+=2;maxZ+=2;
  const width=maxX-minX+1,height=maxZ-minZ+1,lookup=new Int32Array(width*height).fill(-1),queue:number[]=[];
  for(const i of cells[owner]){const at=(Math.floor(i/grid.width)-minZ)*width+i%grid.width-minX;lookup[at]=i;queue.push(at);}
  for(let n=0;n<queue.length;n++){const i=queue[n],x=i%width;for(const j of [x?i-1:-1,x<width-1?i+1:-1,i-width,i+width])if(j>=0&&j<lookup.length&&lookup[j]<0){lookup[j]=lookup[i];queue.push(j);}}
  return {id:country.id,x:minX,z:minZ,width,height,lookup};
 });
}
