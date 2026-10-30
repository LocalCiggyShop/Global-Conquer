import {techLevel} from "./technology";
import type {Campaign,IdeologyId,NationState} from './types';
export const ideologies:Record<IdeologyId,{name:string;income:number;production:number;damage:number;power:number;description:string}>={
 nonAligned:{name:'Non aligned',income:1,production:1,damage:1,power:1,description:'Neutral political direction; standard income, production, combat and political power.'},
 democracy:{name:'Democracy',income:1.05,production:1,damage:1,power:1.2,description:'+5% income, +20% political power; offensive wars cost stability.'},
 liberalism:{name:'Liberalism',income:1.12,production:1,damage:0.95,power:1,description:'+12% income, −5% combat strength; offensive wars cost stability.'},
 nationalism:{name:'Nationalism',income:0.95,production:1,damage:1.08,power:1,description:'+8% combat strength, −5% income; no initial offensive-war stability penalty.'},
 fascism:{name:'Fascism',income:0.9,production:1,damage:1.15,power:0.8,description:'+15% combat strength, −10% income and −20% political power; no initial offensive-war stability penalty.'},
 socialism:{name:'Socialism',income:0.95,production:1,damage:1,power:1,description:'+20% consumer-goods output, −5% income; offensive wars cost stability.'},
 communism:{name:'Communism',income:0.9,production:1.15,damage:1,power:1,description:'+15% factory speed, −10% income; offensive wars cost stability.'},
};
export const civicPolicies={none:{name:'No special policy',boost:0,cost:0,credits:0},rights:{name:'Civil rights',boost:1,cost:25,credits:5},welfare:{name:'Public welfare',boost:2,cost:40,credits:10}} as const;
export function initializePolitics(state:Campaign){for(const n of Object.values(state.nations)){n.ideology??='democracy';n.stability??=70;n.politicalPower??=25;n.civicPolicy??='none';n.consumerServed??=0;}}
export const ideologyOf=(n:NationState)=>ideologies[n.ideology??'democracy'];
export const stabilityEffect=(n:NationState)=>Math.min(1,0.7+Math.max(0,n.stability??70)*0.006);
export const consumerDemand=(n:NationState)=>(0.2+n.industry*0.04)*(n.civicPolicy==='welfare'?1.25:1);
export function changeIdeology(state:Campaign,id:IdeologyId){const n=state.nations[state.nation];
 if(!Object.hasOwn(ideologies,id))return 'Choose a valid ideology.';if(n.ideology===id)return 'This ideology is already adopted.';
 if(state.elapsed<(n.ideologyChangedAt??-25)+25)return 'Wait five days between ideology changes.';
 if(n.politicalPower!<100)return 'Changing ideology needs 100 political power.';
 n.politicalPower!-=100;n.ideology=id;n.ideologyChangedAt=state.elapsed;n.stability=Math.max(0,n.stability!-10);return null;
}
export function changeCivicPolicy(state:Campaign,id:keyof typeof civicPolicies){const n=state.nations[state.nation];if(!Object.hasOwn(civicPolicies,id))return 'Choose a valid policy.';
 if(n.civicPolicy===id)return null;const p=civicPolicies[id];if(n.politicalPower!<p.cost)return 'Insufficient political power.';n.politicalPower!-=p.cost;n.civicPolicy=id;return null;
}
export interface PoliticalGrowth {stability:number;power:number;stabilityDetails:string;powerDetails:string;supplied:boolean;funded:boolean;}
/** Shared by the daily simulation and the live UI forecast. */
export function politicalGrowth(state:Campaign,n:NationState,dayEnd=false):PoliticalGrowth{
 const ticks=dayEnd?5:state.elapsed%5,policy=civicPolicies[n.civicPolicy??'none'];
 const supplied=ticks===0?(n.lastConsumerSatisfied??(n.stockpile?.consumerGoods??0)>=consumerDemand(n)*5):(n.consumerServed??0)+1e-8>=consumerDemand(n)*ticks;
 const funded=n.credits>=policy.credits,war=state.wars.some(w=>w.a===n.id||w.b===n.id),unrest=(state.affairs?.news??[]).some(e=>e.nation===n.id&&e.kind==='unrest'&&!e.resolved&&state.elapsed-e.time<25);
 const goods=supplied?2:-2,warCost=war?-3:0,unrestCost=unrest?-1:0,boost=funded?policy.boost:0,researchBonus=.5*techLevel(n,"political"),raw=goods+warCost+unrestCost+boost+researchBonus;
 const stability=Math.max(0,Math.min(100,(n.stability??70)+raw))-(n.stability??70),power=Math.min(ideologyOf(n).power*(1+.1*techLevel(n,"political")),Math.max(0,500-(n.politicalPower??0)));
 const signed=(v:number)=>`${v>=0?'+':''}${v.toFixed(1)}`;
 return {stability,power,supplied,funded,
  stabilityDetails:`Daily stability forecast\nConsumer goods ${signed(goods)} — ${supplied?'household demand met':'household demand not met'}\nWar ${signed(warCost)}\nUnrest ${signed(unrestCost)}\nPolitical technology ${signed(researchBonus)}\n${policy.name} ${signed(boost)}${funded?'':' — not funded'}\n${raw!==stability?'Bounded by 0–100% stability.\n':''}Total ${signed(stability)} per day.\nForecast uses consumption so far today; applied every five ticks.`,
  powerDetails:`Daily political power\nBase income +1.0\n${ideologyOf(n).name} modifier ${signed(ideologyOf(n).power-1)}\n${power!==ideologyOf(n).power*(1+.1*techLevel(n,'political'))?'Political power is capped at 500.\n':''}Technology bonus ${signed(ideologyOf(n).power*.1*techLevel(n,"political"))}\nTotal ${signed(power)} per day.\nIdeology and civic-policy costs are one-time expenses, separate from this income.`};
}
export function politicsDay(state:Campaign){if(state.elapsed%5!==0)return;
 for(const n of Object.values(state.nations))if(!n.defeated){
  const growth=politicalGrowth(state,n,true),policy=civicPolicies[n.civicPolicy??'none'];
  if(growth.funded)n.credits-=policy.credits;n.stability=Math.max(0,Math.min(100,n.stability!+growth.stability));n.politicalPower=Math.min(500,n.politicalPower!+growth.power);n.lastConsumerSatisfied=growth.supplied;n.consumerServed=0;
 }
}
