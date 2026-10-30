import { cellAt,routeCellsClear } from "./navigation";
import { isShip } from "./geopolitics";
import type { Simulation } from "./campaign";
import type { Point, Unit } from "./types";

type Request = { unit: Unit; target: Point; order: number; serial: number; traffic?:number[] };
export class PathClient {
  private pending = new Map<number, Request>();
  private latest = new Map<number, Request>();
  private serial = 0;
  constructor(readonly sim: Simulation, readonly port: Pick<Worker,"postMessage">, readonly report: (message:string)=>void) {}
  request(unit:Unit,target:Point,traffic?:number[]) {
    const serial=++this.serial,request:Request={unit,target:[...target],order:unit.order,serial,traffic};
    this.latest.set(unit.id,request);
    this.pending.set(unit.id,request);
  }
  flush(budget=8) {
    for(let priority=0;priority<3&&budget>0;priority++)for(const [id,r] of this.pending) {
      const u=r.unit, rank=u.nation===this.sim.state.nation?(u.orderMode==="manual"?0:1):2;
      if(rank!==priority)continue;
      this.pending.delete(id);
      if(u.hp<=0||u.order!==r.order||!u.destination)continue;
      this.port.postMessage({type:"path",id,serial:r.serial,order:r.order,nation:u.nation,priority,revision:this.sim.accessRevision,
        obstaclesRevision:this.sim.obstacleRevision,domain:isShip(u.type)?"sea":"land",traffic:r.traffic,from:[u.x,u.z],to:r.target});
      if(--budget===0)break;
    }
  }
  receive(result:{id:number;serial:number;order:number;revision:number;obstaclesRevision:number;path:Point[];traffic?:boolean}) {
    const sim=this.sim,u=sim.state.units.find((candidate)=>candidate.id===result.id);
    if(!u||u.hp<=0||u.order!==result.order||this.latest.get(u.id)?.serial!==result.serial)return;
    if(result.traffic&&(!result.path.length||(u.blockedTicks??0)===0)){this.latest.delete(u.id);return;} // Keep the order and wait when traffic leaves no legal detour.
    const stale=result.revision!==sim.accessRevision||result.obstaclesRevision!==sim.obstacleRevision;
    if(stale) {
      const mask=isShip(u.type)?sim.naval.water:sim.landMask(u.nation);
      const valid=result.path.length>0&&routeCellsClear(sim.grid,[u.x,u.z],result.path,(i)=>mask[i]===1);
      if(!valid) { if(u.destination)this.request(u,u.destination); return; }
    }
    if(result.path.length>1){
      const mask=isShip(u.type)?sim.naval.water:sim.landMask(u.nation),start=cellAt(sim.grid,u.x,u.z);
      const blocked=new Set(this.latest.get(u.id)?.traffic??[]);
      // Adopt ahead of the current position; never revisit the worker's old start.
      // Bounded lookahead and crossed-cell validation preserve borders/coastlines.
      for(let i=Math.min(16,result.path.length-1);i>0;i--)if(routeCellsClear(sim.grid,[u.x,u.z],[result.path[i]],cell=>mask[cell]===1&&(cell===start||!blocked.has(cell)))){
        result.path=result.path.slice(i);break;
      }
    }
    this.latest.delete(u.id);
    u.path=result.path;u.routeFailed=!result.path.length;
    if(!u.path.length) {
      u.destination=null;
      if(u.frontline)u.frontline.retryAt=sim.state.elapsed+3;
      if(u.nation===sim.state.nation&&u.orderMode==="manual")this.report("No permitted route. Neutral borders are closed; use allied land or a transport for sea crossings.");
    }
  }
  get queued() { return this.pending.size; }
}
