import type {Campaign} from './types';
import {allied,atWar,relationScore} from './relations';
const MAX_ALLIES=3;
/** A bounded, mutual-interest decision; player alliances remain player-controlled. */
export function chooseAiAlly(state:Campaign,actor:string,neighbors:readonly string[]):string|null{
 const a=state.nations[actor];if(!a||a.defeated||a.annexedBy||actor===state.nation||a.credits<150)return null;
 const counts=new Map<string,number>();for(const p of state.alliances??[]){counts.set(p.a,(counts.get(p.a)??0)+1);counts.set(p.b,(counts.get(p.b)??0)+1);}
 if((counts.get(actor)??0)>=MAX_ALLIES)return null;
 let best:string|null=null,bestScore=-1;
 for(const b of Object.values(state.nations)){
  if(b.id===actor||b.id===state.nation||b.defeated||b.annexedBy||b.credits<150||(counts.get(b.id)??0)>=MAX_ALLIES||allied(state,actor,b.id)||atWar(state,actor,b.id))continue;
  const relations=relationScore(state,actor,b.id);if(relations<20)continue;
  // Neither nation accepts a partner threatening it or allied to its enemy.
  if(state.affairs?.news.some(e=>!e.resolved&&state.elapsed-e.time<=120&&['tension','nuclear','war'].includes(e.kind)&&((e.nation===actor&&e.target===b.id)||(e.nation===b.id&&e.target===actor))))continue;
  if(state.wars.some(w=>(w.a===actor&&allied(state,b.id,w.b))||(w.b===actor&&allied(state,b.id,w.a))||(w.a===b.id&&allied(state,actor,w.b))||(w.b===b.id&&allied(state,actor,w.a))))continue;
  const commonThreat=!!a.defenseReadiness?.neighbor&&a.defenseReadiness.neighbor===b.defenseReadiness?.neighbor;
  const commonEnemy=state.wars.some(w=>(w.a===actor&&atWar(state,b.id,w.b))||(w.b===actor&&atWar(state,b.id,w.a)));
  const trade=a.tradePolicy!=='closed'&&b.tradePolicy!=='closed';
  const usefulness=(neighbors.includes(b.id)?3:0)+(commonThreat||commonEnemy?6:0)+(trade?(a.personality==="diplomat"?4:2):0)+(relations>=50?2:0);
  if(usefulness<4)continue;
  const score=usefulness*100+relations;if(score>bestScore||(score===bestScore&&b.id<(best??b.id))){best=b.id;bestScore=score;}
 }
 return best;
}
