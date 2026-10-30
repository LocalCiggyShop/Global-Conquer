import type {Campaign} from './types';
import {allied,atWar,relationScore} from './relations';
/** Called at the AI decision cadence, using the shared current-border cache. */
export function neighboringThreat(state:Campaign,nation:string,neighbors:readonly string[]){
 let level=0,target:string|undefined,formations=0;
 const eligible=new Set(neighbors.filter(id=>state.nations[id]&&!state.nations[id].defeated&&!allied(state,nation,id)));
 const power=new Map<string,number>(),counts=new Map<string,number>();
 for(const u of state.units)if(u.hp>0&&(u.nation===nation||eligible.has(u.nation))){power.set(u.nation,(power.get(u.nation)??0)+u.hp*(u.type==='armor'?1.4:u.type==='frigate'?1.6:u.type==='transport'?0.2:1));counts.set(u.nation,(counts.get(u.nation)??0)+1);}
 const own=(power.get(nation)??0)+state.nations[nation].reserves*45;
 for(const id of eligible){
  const n=state.nations[id],strength=(power.get(id)??0)+n.reserves*45,relations=relationScore(state,nation,id);
  const reports=state.affairs?.news.filter(e=>e.nation===id&&e.target===nation&&!e.resolved&&state.elapsed-e.time<=120)??[];
  const nuclear=reports.some(e=>e.kind==='nuclear'),tension=reports.some(e=>e.kind==='tension');
  const candidate=atWar(state,nation,id)||nuclear?2:tension||relations<=-25&&strength>=own*0.8||relations<=-10&&(n.militarySpending??100)>=150&&strength>Math.max(90,own*1.2)?1:0;
  const size=(counts.get(id)??0)+n.reserves;
  if(candidate>level||candidate===level&&candidate>0&&size>formations){level=candidate;target=id;formations=size;}
 }
 return {level,target,formations};
}
