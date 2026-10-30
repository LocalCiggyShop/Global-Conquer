import type {Campaign,ContinentData,NewsEvent} from './types';
import {adjustRelation,atWar,pairKey,relationScore} from './relations';
const nuclearPowers=new Set(['USA','RUS','CHN','GBR','FRA','IND','PAK','PRK','ISR']);
/** Bounded history; no DOM, geography scans or pairwise work on animation frames. */
export class WorldAffairs {
 private distances=new Map<string,number>();
 constructor(readonly state:Campaign,readonly data:ContinentData){
  state.affairs??={relations:{},embassies:[],news:[],nextNewsAt:state.elapsed+20};
  for(const n of Object.values(state.nations)){n.militarySpending??=100;n.stockIndex??=100;n.shares??=0;n.stockHistory??=[{tick:state.elapsed,value:n.stockIndex}];n.stockHistory=n.stockHistory.slice(-120);}
 }
 active(nation:string){const n=this.state.nations[nation];return !!n&&!n.defeated&&!n.annexedBy;}
 private distance(a:string,b:string){
  const key=pairKey(a,b),hit=this.distances.get(key);if(hit!==undefined)return hit;
  const ca=this.data.countries.find(c=>c.id===a)!,cb=this.data.countries.find(c=>c.id===b)!;
  const distance=Math.hypot((ca.bounds[0]+ca.bounds[2]-cb.bounds[0]-cb.bounds[2])/2,(ca.bounds[1]+ca.bounds[3]-cb.bounds[1]-cb.bounds[3])/2);
  this.distances.set(key,distance);return distance;
 }
 publish(nation:string,kind:NewsEvent['kind'],target?:string){
  if(!this.active(nation)||(target!==undefined&&!this.active(target)))return null;
  if(kind==='unrest')this.state.nations[nation].lastUnrestAt=this.state.elapsed;
  const name=this.data.countries.find(c=>c.id===nation)?.name??nation,other=this.data.countries.find(c=>c.id===target)?.name??target;
  const stories={tension:[`Diplomatic tensions in ${name}`,`${name} has summoned diplomatic representatives following a dispute${target?` with ${other}`:''}. Officials are calling for talks before further measures are considered.`,2],nuclear:[`${name} issues nuclear warning`, `As diplomatic talks stall, ${name} has raised its strategic alert level. International envoys are urging restraint and renewed negotiations.`,4],unrest:[`Demonstrations in ${name}`,`Rising living costs have brought demonstrators onto the streets of ${name}. The government is under pressure to protect household incomes and restore confidence.`,2],election:[`${name} holds elections`,`Voters in ${name} have elected a new administration promising economic stability and diplomatic engagement. Investors await its first budget.`,1],war:[`${name} declares war`,`${name} has declared war on ${other}. Border forces are mobilising and markets are pricing in disruption to industry and trade.`,4],peace:[`Peace agreement signed`,`${name} and ${other} have agreed to end hostilities. Diplomats will supervise the agreement as businesses prepare to reopen trade.`,3]} as const;
  const [title,story,severity]=stories[kind];const event:NewsEvent={id:this.state.nextId++,nation,target,kind,title,story,severity,time:this.state.elapsed};
  this.state.affairs!.news.push(event);this.state.affairs!.news=this.state.affairs!.news.slice(-32);
  const shock=kind==='war'?-0.12:kind==='nuclear'?-0.08:kind==='unrest'?-0.04:kind==='tension'?-0.02:0.03;
  for(const id of [nation,target])if(id&&this.state.nations[id])this.state.nations[id].stockIndex=Math.max(20,Math.min(500,this.state.nations[id].stockIndex!*(1+shock)));
  if(target)adjustRelation(this.state,nation,target,kind==='peace'?20:kind==='election'?5:-15);
  return event;
 }
 embassy(target:string){
  const s=this.state,key=pairKey(s.nation,target),other=s.nations[target],n=s.nations[s.nation];
  if(!other||other.defeated||target===s.nation||atWar(s,s.nation,target))return 'Embassies require an active peaceful foreign nation.';
  if(s.affairs!.embassies.includes(key))return 'A mutual embassy agreement already exists.';
  if(relationScore(s,s.nation,target)<-20)return 'Improve relations through crisis talks before establishing an embassy.';
  if(n.credits<150)return 'An embassy requires 150 credits.';
  n.credits-=150;s.affairs!.embassies.push(key);adjustRelation(s,s.nation,target,15);return null;
 }
 resolve(id:number){
  const s=this.state,e=s.affairs!.news.find(e=>e.id===id),n=s.nations[s.nation];
  if(!e||!this.active(e.nation)||(e.target!==undefined&&!this.active(e.target))||e.resolved||!['tension','nuclear','unrest'].includes(e.kind))return 'This story has no pending crisis.';
  if(e.nation!==s.nation&&e.target!==s.nation)return 'Only affected governments can resolve this crisis.';
  if(n.credits<75)return 'Crisis mediation requires 75 credits.';
  n.credits-=75;e.resolved=true;n.stockIndex=Math.min(500,n.stockIndex!*1.02);
  if(e.target)adjustRelation(s,e.nation,e.target,20);return null;
 }
 shares(side:'buy'|'sell',quantity:number){
  const n=this.state.nations[this.state.nation];if(!Number.isInteger(quantity)||quantity<1||quantity>100)return 'Trade 1–100 index shares.';
  const total=quantity*n.stockIndex!*(side==='buy'?1.01:0.99);
  if(side==='buy'){if(n.credits<total)return 'Insufficient treasury.';n.credits-=total;n.shares!+=quantity;}
  else {if(n.shares!<quantity)return 'Insufficient shares.';n.shares!-=quantity;n.credits+=total;}return null;
 }
 tick(){
  const s=this.state,a=s.affairs!;
  // Historical reports remain archived; extinct governments cannot sustain crises.
  for(const e of a.news)if(!this.active(e.nation)||(e.target!==undefined&&!this.active(e.target))){e.dismissed=true;e.escalated=true;}
  // A day-level pass is linear in nations plus existing embassies, not all nation pairs.
  if(s.elapsed%5===0){
   for(const n of Object.values(s.nations))if(!n.defeated){
    const war=s.wars.some(w=>w.a===n.id||w.b===n.id),growth=(n.industry*0.0003+(n.domesticSales!==false?0.0003:0)-(war?0.002:0)-(n.credits<=0?0.003:0));
    n.stockIndex=Math.max(20,Math.min(500,n.stockIndex!*(1+growth)));
    n.stockHistory!.push({tick:s.elapsed,value:n.stockIndex});n.stockHistory=n.stockHistory!.slice(-120);
   }
   for(const key of a.embassies){const [x,y]=key.split('|');if(!s.nations[x]?.defeated&&!s.nations[y]?.defeated&&!atWar(s,x,y)){adjustRelation(s,x,y,0.5);s.nations[x].credits+=2;s.nations[y].credits+=2;}}
  }
  for(const e of a.news)if(this.active(e.nation)&&(!e.target||this.active(e.target))&&e.kind==='tension'&&!e.resolved&&!e.escalated&&s.elapsed-e.time>=60){
   e.escalated=true;
   if(nuclearPowers.has(e.nation)&&e.target)this.publish(e.nation,'nuclear',e.target);
  }
  if(s.elapsed<a.nextNewsAt)return;
  const active=this.data.countries.filter(c=>this.active(c.id));if(!active.length)return;
  const c=active[Math.floor(Math.random()*active.length)],others=active.filter(o=>o.id!==c.id);
  const pool=others.slice().sort((x,y)=>this.distance(c.id,x.id)-this.distance(c.id,y.id)).slice(0,6);
  const target=pool.length?pool[Math.floor(Math.random()*pool.length)].id:undefined;
  if(target){const affinity=8-this.distance(c.id,target)/15;adjustRelation(s,c.id,target,Math.max(-3,Math.min(3,affinity)));}
  const unrest=(s.nations[c.id].stability??70)<35||s.nations[c.id].credits<150||s.nations[c.id].militarySpending!>=150;
  const kind=unrest?'unrest':target&&Math.random()<0.55?'tension':'election';
  this.publish(c.id,kind,kind==='tension'?target:undefined);
  const severity=a.news.filter(e=>this.active(e.nation)&&(!e.target||this.active(e.target))&&!e.resolved&&s.elapsed-e.time<100).reduce((v,e)=>Math.max(v,e.severity),0);
  a.nextNewsAt=s.elapsed+(severity>=3?15:severity===2?25:40);
 }
}
