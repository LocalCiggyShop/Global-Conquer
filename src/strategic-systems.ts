import type {Campaign,NationState,Unit} from './types';
import {atWar,pairKey,relationScore} from './relations';
import {isShip} from './geopolitics';
export const personalities={builder:{name:'Economic builder',ratio:2.5,reason:'Prefers investment; needs an overwhelming advantage to expand.'},diplomat:{name:'Diplomat',ratio:2.8,reason:'Prefers strong relations, embassies and peaceful partnerships.'},expansionist:{name:'Expansionist',ratio:1.9,reason:'Seeks funded campaigns against weaker, unfriendly neighbours.'},guardian:{name:'Guardian',ratio:2.4,reason:'Prioritises border security and defensive partnerships.'}} as const;
export function initializeStrategy(s:Campaign){
 s.treaties??=[];s.resistance??={};s.controlGroups??={};s.objective??={kind:'economy'};
 for(const n of Object.values(s.nations)){let hash=0;for(const c of n.id)hash=(hash*31+c.charCodeAt(0))>>>0;n.personality??=(Object.keys(personalities) as (keyof typeof personalities)[])[hash%4];n.manpowerUsed??=0;}
 for(const u of s.units)u.organization??=100;
}
export function unitStatus(u:Unit,tick:number,supply=1){
 if(u.retreating)return u.path.length?'Local withdrawal':'Recovering organization';if(u.embarkedOn)return 'Embarked';
 if((u.underFireUntil??0)>tick)return 'In combat';
 if((u.blockedTicks??0)>=2&&u.path.length)return 'Waiting for space';
 if(u.path.length)return u.tacticalOrder==='fallback'?'Falling back':u.tacticalOrder==='attackMove'?'Advancing':'Moving';
 if(u.destination)return 'Awaiting route';if(u.routeFailed)return 'No permitted route';if(supply<.4)return 'Low supplies';
 if(u.frontline)return 'Holding border';if(u.tacticalOrder==='hold')return 'Holding position';return 'Ready';
}
/** Separate morale/organization from casualties; reinforcement is paid and gradual. */
export function recoverUnit(s:Campaign,u:Unit,supply:number,manpowerAvailable=true){
 const n=s.nations[u.nation],safe=(u.lastCombatAt??-100)<s.elapsed-3;
 if(safe&&!u.path.length){u.organization=Math.min(100,(u.organization??100)+supply*2);}
 if(u.retreating&&(u.organization??100)>=45&&!u.path.length&&!u.destination)u.retreating=false;
 if(s.elapsed%5||!safe||!manpowerAvailable||u.path.length||supply<.5||u.hp>=u.maxHp)return;
 const gain=Math.min(u.maxHp-u.hp,u.maxHp*.02),soldiers=Math.ceil(1000*gain/u.maxHp),steel=isShip(u.type)||u.type==='armor'?.5:.1;
 // Campaign reinforcement pool: one percent of population, recorded as casualties replaced.
 if(n.credits<soldiers*.1||n.supplies<1||!n.stockpile||n.stockpile.steel<steel)return;
 n.credits-=soldiers*.1;n.supplies--;n.stockpile.steel-=steel;n.manpowerUsed=(n.manpowerUsed??0)+soldiers;u.hp+=gain;
}
export function activeTruce(s:Campaign,a:string,b:string){return s.treaties?.find(t=>pairKey(t.a,t.b)===pairKey(a,b)&&t.until>s.elapsed);}
export function diplomaticReason(s:Campaign,actor:string,target:string){
 const n=s.nations[target];if(!n)return '';
 if(n.defeated)return 'This government has capitulated.';
 if(atWar(s,actor,target))return 'War prevents trade and alliances. Peace terms depend on occupied states and relative strength.';
 const truce=activeTruce(s,actor,target);if(truce)return `Truce: ${Math.ceil((truce.until-s.elapsed)/5)} days remaining.`;
 const r=relationScore(s,actor,target);return `${personalities[n.personality??'builder'].reason} ${r<20?'An alliance needs relations of +20.':'Relations support an alliance.'} ${n.credits<300?'Treasury reserves are low.':'Treasury reserves support cooperation.'}`;
}
export function objectiveProgress(s:Campaign,n:NationState,share:number){
 const kind=s.objective?.kind??'economy';
 return kind==='economy'?{name:'Economic power',progress:Math.min(1,Math.min(n.credits/10000,n.industry/8)),detail:'Hold 10,000 credits and infrastructure level 8.'}:kind==='regional'?{name:'Regional dominance',progress:Math.min(1,share/.6),detail:'Control 60% of this theatre’s land.'}:{name:'Historic unification',progress:n.formedNation?1:0,detail:'Proclaim an available historical formable from Government.'};
}
