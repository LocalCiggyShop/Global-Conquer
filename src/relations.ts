import type { Campaign } from "./types";

export function allied(state: Campaign, a: string, b: string): boolean {
  return a === b || (state.alliances ?? []).some(
    (p) => (p.a === a && p.b === b) || (p.a === b && p.b === a),
  );
}
export function atWar(state: Campaign, a: string, b: string): boolean {
  return a !== b && state.wars.some(
    (p) => (p.a === a && p.b === b) || (p.a === b && p.b === a),
  );
}
export function militaryAccess(state: Campaign, nation: string, controller: string | null): boolean {
  return controller !== null && (allied(state, nation, controller) || atWar(state, nation, controller));
}

export const pairKey=(a:string,b:string)=>[a,b].sort().join("|");
export function relationScore(state:Campaign,a:string,b:string){
 if(a===b)return 100;if(atWar(state,a,b))return -100;
 return Math.max(-100,Math.min(100,state.affairs?.relations[pairKey(a,b)]??0));
}
export function adjustRelation(state:Campaign,a:string,b:string,delta:number){
 if(!state.affairs||a===b)return;
 const key=pairKey(a,b);state.affairs.relations[key]=Math.max(-100,Math.min(100,(state.affairs.relations[key]??0)+delta));
}
export function spending(n:{militarySpending?:number}){return Math.max(50,Math.min(200,n.militarySpending??100))/100;}
export function combatFunding(n:{militarySpending?:number;credits:number;supplies:number}){return (0.5+spending(n)*0.5)*(n.credits>0?1:0.7)*(n.supplies>0?1:0.6);}
