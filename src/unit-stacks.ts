import type {Unit,Point} from './types';
export const SOLDIERS_PER_UNIT=1000,MAX_STACK_UNITS=5,STACK_RADIUS=0.18;
export const personnel=(u:Unit)=>Math.max(0,Math.min(SOLDIERS_PER_UNIT,Math.ceil(SOLDIERS_PER_UNIT*u.hp/u.maxHp)));
export const compatible=(a:Unit,b:Unit)=>a.nation===b.nation&&a.type===b.type&&a.leaderId===b.leaderId;
const spacing=(u:Unit)=>u.type==='frigate'||u.type==='transport'?1.2:0.65;
const key=(x:number,z:number)=>Math.floor(x/2)+':'+Math.floor(z/2);
export function unitStacks(units:readonly Unit[]){
 const groups=new Map<number,Unit[]>(),representatives=new Map<number,number>(),buckets=new Map<string,Unit[]>(),locked=new Map<string,number>();
 const living=units.filter(u=>u.hp>0&&!u.embarkedOn);
 const add=(u:Unit)=>{groups.set(u.id,[u]);representatives.set(u.id,u.id);const cell=key(u.x,u.z),bucket=buckets.get(cell)??[];bucket.push(u);buckets.set(cell,bucket);};
 // Persisted membership takes precedence over proximity, orders and commanders.
 for(const u of living)if(u.stackId!==undefined){const id=u.nation+':'+u.stackId,rep=locked.get(id);if(rep!==undefined){groups.get(rep)!.push(u);representatives.set(u.id,rep);}else{locked.set(id,u.id);add(u);}}
 for(const u of living){if(u.stackId!==undefined)continue;let rep:Unit|undefined;
  if(!u.stackSeparated)for(let dz=-1;dz<=1&&!rep;dz++)for(let dx=-1;dx<=1&&!rep;dx++)for(const candidate of buckets.get(key(u.x+dx*2,u.z+dz*2))??[])if(!candidate.stackSeparated&&compatible(u,candidate)&&Math.hypot(u.x-candidate.x,u.z-candidate.z)<=STACK_RADIUS&&groups.get(candidate.id)!.length<MAX_STACK_UNITS){rep=candidate;break;}
  if(rep){groups.get(rep.id)!.push(u);representatives.set(u.id,rep.id);}else add(u);
 }
 return {groups,representatives};
}
export function lockNearbyStacks(units:readonly Unit[]){const stacks=unitStacks(units);for(const group of stacks.groups.values())if(group.length>1){const id=group.find(u=>u.stackId!==undefined)?.stackId??group[0].id;for(const u of group){u.stackId=id;u.stackSeparated=false;}}return stacks;}
export function expandStacks(units:readonly Unit[],ids:Iterable<number>){const selected=new Set(ids),stacks=new Set<string>();for(const u of units)if(selected.has(u.id)&&u.stackId!==undefined)stacks.add(u.nation+':'+u.stackId);for(const u of units)if(u.stackId!==undefined&&stacks.has(u.nation+':'+u.stackId))selected.add(u.id);return selected;}
const canShare=(a:Unit,b:Unit)=>a.nation===b.nation&&((a.stackId!==undefined&&a.stackId===b.stackId)||(!a.stackSeparated&&!b.stackSeparated&&compatible(a,b)));
/** Local spatial buckets replace pairwise collision checks; capped stacks share a position. */
export class UnitPositions{
 private buckets=new Map<string,Set<Unit>>();
 constructor(units:readonly Unit[]){for(const u of units)if(u.hp>0&&!u.embarkedOn)this.add(u);}
 private add(u:Unit){const k=key(u.x,u.z),bucket=this.buckets.get(k)??new Set<Unit>();bucket.add(u);this.buckets.set(k,bucket);}
 follow(u:Unit,leader:Unit){this.buckets.get(key(u.x,u.z))?.delete(u);u.x=leader.x;u.z=leader.z;this.add(u);}
 private nearby(p:Point){const out:Unit[]=[];for(let z=-1;z<=1;z++)for(let x=-1;x<=1;x++)for(const u of this.buckets.get(key(p[0]+x*2,p[1]+z*2))??[])if(u.hp>0&&!u.embarkedOn)out.push(u);return out;}
 traffic(u:Unit,radius=8){const out:Unit[]=[];const minX=Math.floor((u.x-radius)/2),maxX=Math.floor((u.x+radius)/2),minZ=Math.floor((u.z-radius)/2),maxZ=Math.floor((u.z+radius)/2);for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++)for(const b of this.buckets.get(x+':'+z)??[])if(b.id!==u.id&&b.hp>0&&!(b.nation===u.nation&&b.stackId!==undefined&&b.stackId===u.stackId)&&Math.hypot(b.x-u.x,b.z-u.z)<=radius)out.push(b);return out;}
 private fits(u:Unit,p:Point){let stack=0;for(const other of this.nearby(p)){if(other.id===u.id)continue;const d=Math.hypot(p[0]-other.x,p[1]-other.z);if(d>=Math.max(spacing(u),spacing(other)))continue;if(!canShare(u,other))return false;if(++stack>=MAX_STACK_UNITS)return false;}return true;}
 place(u:Unit,p:Point,valid:(p:Point)=>boolean,maxStep=Infinity):Point|null{
  const candidates:Point[]=[p];
  for(const other of this.nearby(p))if(other.id!==u.id&&canShare(u,other)&&Math.hypot(other.x-p[0],other.z-p[1])<spacing(u))candidates.push([other.x,other.z]);
  const radius=Number.isFinite(maxStep)?maxStep:spacing(u)*1.1,angle=Math.atan2(p[1]-u.z,p[0]-u.x);
  const turns=Number.isFinite(maxStep)?[Math.PI/6,-Math.PI/6,Math.PI/3,-Math.PI/3]:[Math.PI/3,-Math.PI/3,Math.PI/2,-Math.PI/2,Math.PI,-Math.PI/6,Math.PI/6,Math.PI*2/3,-Math.PI*2/3];
  for(const turn of turns)candidates.push([u.x+Math.cos(angle+turn)*radius,u.z+Math.sin(angle+turn)*radius]);
  const dx=p[0]-u.x,dz=p[1]-u.z,directed=Number.isFinite(maxStep)&&dx*dx+dz*dz>1e-12;
  // Moving formations may sidestep forward or wait, never reverse to resolve crowding.
  // Idle overlap repair still has full freedom to find an adjacent legal slot.
  for(const target of candidates)if((!directed||(target[0]-u.x)*dx+(target[1]-u.z)*dz>1e-12)&&Math.hypot(target[0]-u.x,target[1]-u.z)<=maxStep+1e-8&&valid(target)&&this.fits(u,target)){
   this.buckets.get(key(u.x,u.z))?.delete(u);u.x=target[0];u.z=target[1];this.add(u);return target;
  }return null;
 }
}
