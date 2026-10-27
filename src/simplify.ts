import type {Point,Polygon} from "./types";
export function simplifyRing(points:Point[],tolerance:number):Point[]{
 if(points.length<8)return points;
 const keep=new Uint8Array(points.length),stack=[[0,points.length-1]],limit=tolerance*tolerance;keep[0]=keep[points.length-1]=1;
 while(stack.length){const [a,b]=stack.pop()!,p=points[a],q=points[b],dx=q[0]-p[0],dz=q[1]-p[1],length=dx*dx+dz*dz;let best=limit,at=-1;
  for(let i=a+1;i<b;i++){const r=points[i],t=length?Math.max(0,Math.min(1,((r[0]-p[0])*dx+(r[1]-p[1])*dz)/length)):0,d=(r[0]-p[0]-t*dx)**2+(r[1]-p[1]-t*dz)**2;if(d>best){best=d;at=i;}}
  if(at>=0){keep[at]=1;stack.push([a,at],[at,b]);}
 }
 const result=points.filter((_,i)=>keep[i]);return result.length>=4?result:points;
}
export function simplifyPolygons(polygons:Polygon[],tolerance:number):Polygon[]{return polygons.map((p)=>p.map((r)=>simplifyRing(r,tolerance)));}
