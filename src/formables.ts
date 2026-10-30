import type {ContinentData,Campaign} from './types';
export const formables=[
 {id:'german-reich',name:'German Reich',founders:['DEU'],required:['DEU','AUT','POL','FRA','NLD','BEL','LUX'],description:'Campaign unification: Germany, Austria, Poland, France, the Netherlands, Belgium and Luxembourg. All required states become cores of one country.'},
 {id:'commonwealth',name:'Polish–Lithuanian Commonwealth',founders:['POL','LTU'],required:['POL','LTU','BLR','UKR','LVA'],description:'Rzeczpospolita. Modern-country requirements approximate its eastern European territories.'},
 {id:'kalmar',name:'Kalmar Union',founders:['DNK','NOR','SWE'],required:['DNK','NOR','SWE'],description:'The three principal Nordic kingdoms. Historical overseas possessions are not required in this scenario.'},
] as const;
export function formationProgress(state:Campaign,data:ContinentData,actor:string,id:string,controls:(nation:string)=>boolean){
 const definition=formables.find(f=>f.id===id);if(!definition)return {error:'Unknown formable.',definition:undefined,missing:[] as string[]};
 const missing=definition.required.filter(nation=>!data.countries.some(c=>c.id===nation)||!controls(nation));
 const error=state.result!=='playing'||!state.nations[actor]||state.nations[actor].defeated?'This nation is no longer active.':!definition.founders.some(n=>n===actor)?'This nation cannot found this formable.':state.nations[actor]?.formedNation?'A formable has already been proclaimed.':missing.length?'Control all required national territory and cities first.':null;
 return {definition,missing,error};
}
export function formedName(state:Campaign,id:string,fallback:string){return formables.find(f=>f.id===state.nations[id]?.formedNation)?.name??fallback;}
