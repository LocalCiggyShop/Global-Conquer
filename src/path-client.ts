import { routeCellsClear } from "./navigation";
import { isShip } from "./geopolitics";
import type { Simulation } from "./campaign";
import type { Point, Unit } from "./types";

type Request = { unit: Unit; target: Point; order: number; serial: number };
export class PathClient {
  private pending = new Map<number, Request>();
  private latest = new Map<number, number>();
  private serial = 0;
  constructor(readonly sim: Simulation, readonly port: Pick<Worker,"postMessage">, readonly report: (message:string)=>void) {}
  request(unit:Unit,target:Point) {
    const serial=++this.serial; this.latest.set(unit.id,serial);
    this.pending.set(unit.id,{unit,target:[...target],order:unit.order,serial});
  }
  flush(budget=8) {
    for(let priority=0;priority<3&&budget>0;priority++)for(const [id,r] of this.pending) {
      const u=r.unit, rank=u.nation===this.sim.state.nation?(u.orderMode==="manual"?0:1):2;
      if(rank!==priority)continue;
      this.pending.delete(id);
      if(u.hp<=0||u.order!==r.order||!u.destination)continue;
      this.port.postMessage({type:"path",id,serial:r.serial,order:r.order,nation:u.nation,priority,revision:this.sim.accessRevision,
        obstaclesRevision:this.sim.obstacleRevision,domain:isShip(u.type)?"sea":"land",from:[u.x,u.z],to:r.target});
      if(--budget===0)break;
    }
  }
  receive(result:{id:number;serial:number;order:number;revision:number;obstaclesRevision:number;path:Point[]}) {
    const sim=this.sim,u=sim.state.units.find((candidate)=>candidate.id===result.id);
    if(!u||u.hp<=0||u.order!==result.order||this.latest.get(u.id)!==result.serial)return;
    const stale=result.revision!==sim.accessRevision||result.obstaclesRevision!==sim.obstacleRevision;
    if(stale) {
      const mask=isShip(u.type)?sim.naval.water:sim.landMask(u.nation);
      const valid=result.path.length>0&&routeCellsClear(sim.grid,[u.x,u.z],result.path,(i)=>mask[i]===1);
      if(!valid) { if(u.destination)this.request(u,u.destination); return; }
    }
    u.path=result.path;
    if(!u.path.length) {
      u.destination=null;
      if(u.frontline)u.frontline.retryAt=sim.state.elapsed+3;
      if(u.nation===sim.state.nation&&u.orderMode==="manual")this.report("No permitted route. Neutral borders are closed; use allied land or a transport for sea crossings.");
    }
  }
  get queued() { return this.pending.size; }
}
