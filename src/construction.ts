import type {Building,Campaign,Commodity,Stockpile} from './types';
export const constructionPlans:Record<Exclude<Building['type'],'hq'>,{days:number;materials:Partial<Stockpile>}>= {
 depot:{days:2,materials:{steel:1,iron:2}},
 mine:{days:2,materials:{iron:2,copper:1}},
 barracks:{days:3,materials:{steel:2,iron:1}},
 factory:{days:3,materials:{copper:1,iron:3}},
 dock:{days:4,materials:{steel:3,iron:2}},
};
export function constructionNeeds(b:Building){return b.type==='hq'?{}:constructionPlans[b.type].materials;}
export function advanceConstruction(state:Campaign){
 for(const b of state.buildings){
  const job=b.construction;if(!job||b.hp<=0||state.elapsed<job.nextTick)continue;
  // No backdated catch-up: each funded instalment advances one construction day.
  job.nextTick=state.elapsed+5;const n=state.nations[b.nation];if(!n||n.defeated)continue;
  const needs=constructionNeeds(b),missing=Object.entries(needs).filter(([id,q])=>n.stockpile![id as Commodity]+1e-8<q);
  job.missing=missing.map(([id])=>id as Commodity);if(missing.length)continue;
  for(const [id,q] of Object.entries(needs))n.stockpile![id as Commodity]-=q;
  job.completedDays++;if(job.completedDays>=job.totalDays)delete b.construction;
 }
}
