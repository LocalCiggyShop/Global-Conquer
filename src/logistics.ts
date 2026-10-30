import {cellAt,nearestOpen} from './navigation';
import {allied,atWar} from './relations';
import {landComponents} from './strategy';
import type {Campaign,Grid} from './types';
import type {Territory} from './territory';

/** Static province graph, refreshed per five ticks or ownership/diplomacy change.
 * Every nation runs one graph traversal; units only look up a cached value. */
export class Logistics {
 readonly adjacency:Set<number>[];
 private sea:Int32Array;
 private levels=new Map<string,Float32Array>();
 private key='';
 revision=0;
 readonly routes=new Map<string,[number,number][]>();
 constructor(private state:Campaign,private grid:Grid,private territory:Territory,private water:Uint8Array){
  this.sea=landComponents({...grid,walkable:water});
  this.adjacency=territory.states.map(()=>new Set<number>());
  for(let i=0;i<territory.membership.length;i++){
   const a=territory.membership[i];if(a<0)continue;
   for(const j of [i%grid.width<grid.width-1?i+1:-1,i+grid.width]){
    const b=j>=0&&j<territory.membership.length?territory.membership[j]:-1;
    if(b>=0&&a!==b){this.adjacency[a].add(b);this.adjacency[b].add(a);}
   }
  }
 }
 refresh(force=false){
  const s=this.state,t=this.territory;
  const key=[Math.floor(s.elapsed/5),t.landRevision,s.buildings.length,s.wars.map(w=>w.a+w.b).join(','),s.alliances?.map(w=>w.a+w.b).join(',')].join('|');
  if(!force&&key===this.key)return;this.key=key;this.revision++;this.routes.clear();this.levels.clear();
  const assets=s.buildings.filter(b=>b.hp>0&&!b.construction),ports=assets.filter(b=>b.type==='dock').map(b=>{const cell=nearestOpen(this.grid,this.water,b.x,b.z,4);return{b,province:t.membership[cellAt(this.grid,b.x,b.z)],sea:cell<0?-1:this.sea[cell],blocked:s.units.some(u=>u.hp>0&&u.type==='frigate'&&atWar(s,u.nation,b.nation)&&Math.hypot(u.x-b.x,u.z-b.z)<8)};});
  for(const n of Object.values(s.nations)){
   if(n.defeated)continue;
   const levels=new Float32Array(t.states.length),distance=new Float32Array(t.states.length).fill(Infinity),queue:number[]=[],routes:[number,number][]=[];
   const allowed=(i:number)=>allied(s,n.id,t.stateController(t.states[i]));
   for(const city of s.cities??[])if(city.capital&&city.nation===n.id&&city.controller===n.id){const i=t.membership[cellAt(this.grid,city.x,city.z)];if(i>=0){distance[i]=0;queue.push(i);}}
   if(!queue.length&&!(s.cities??[]).some(c=>c.nation===n.id&&c.capital))for(const b of assets)if(b.nation===n.id&&b.type==='hq'){const i=t.membership[cellAt(this.grid,b.x,b.z)];if(i>=0){distance[i]=0;queue.push(i);}}
   if(!queue.length&&n.breakaway&&n.capital){const cell=cellAt(this.grid,...n.capital),i=t.membership[cell];if(i>=0&&t.controllerAt(cell)===n.id){distance[i]=0;queue.push(i);}}
   const relays=new Set(assets.filter(b=>b.nation===n.id&&['barracks','dock','depot'].includes(b.type)).map(b=>t.membership[cellAt(this.grid,b.x,b.z)]));
   const links=new Map<number,number[]>();const ownPorts=ports.filter(p=>p.b.nation===n.id&&p.province>=0&&p.sea>=0&&!p.blocked);
   const harbours=new Map<number,number[]>();for(const p of ownPorts){const group=harbours.get(p.sea)??[];if(!group.includes(p.province))group.push(p.province);harbours.set(p.sea,group);}
   for(const group of harbours.values()){const [hub,...rest]=group;if(!rest.length)continue;links.set(hub,rest);for(const p of rest)links.set(p,[hub]);}
   const expanded=new Float32Array(t.states.length).fill(Infinity);
   for(let q=0;q<queue.length;q++){
    const a=queue[q],d=distance[a];if(d>=expanded[a])continue;expanded[a]=d;
    const next=d+(relays.has(a)?0.35:1);
    for(const b of [...this.adjacency[a],...(links.get(a)??[])])if(allowed(b)&&next<distance[b]&&next<=12){distance[b]=next;queue.push(b);routes.push([a,b]);}
   }
   for(let i=0;i<distance.length;i++)levels[i]=Number.isFinite(distance[i])?Math.max(.35,1-distance[i]*.055):.15;
   this.levels.set(n.id,levels);this.routes.set(n.id,routes);
  }
 }
 level(nation:string,index:number){return this.levels.get(nation)?.[this.territory.membership[index]]??.15;}
 provinceLevel(nation:string,province:number){return this.levels.get(nation)?.[province]??.15;}
}
