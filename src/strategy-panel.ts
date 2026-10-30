import type {Simulation} from './campaign';
import type {PlayView} from './play-view';
import type {PeaceTerms,Point} from './types';
import {personnel,MAX_STACK_UNITS} from './unit-stacks';
import {unitStatus,objectiveProgress} from './strategic-systems';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** One contextual inspector; DOM changes only when the selected state changes. */
export class StrategyPanel {
 readonly element=document.createElement('aside');
 private key='';private page:'selection'|'objectives'|'peace'|'building'='selection';private target='';private building=0;
 constructor(parent:HTMLElement,private sim:()=>Simulation|null,private view:()=>PlayView|null,private notify:(s:string)=>void,private rally:(id:number)=>void){
  this.element.className='context-panel panel';this.element.hidden=true;this.element.setAttribute('aria-label','Context inspector');parent.append(this.element);
  this.element.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b)return;
   const sim=this.sim(),view=this.view();if(!sim||!view)return;
   if(b.hasAttribute('data-close'))this.element.hidden=true;
   if(b.dataset.unit){view.selected.clear();for(const id of sim.expandSelection([Number(b.dataset.unit)]))view.selected.add(id);this.key='';this.update();}
   if(b.hasAttribute("data-split-stack"))this.notify(sim.enqueue({kind:"splitUnits",ids:[Number(b.dataset.splitStack)]})??"Split queued for next tick.");
   if(b.dataset.objective){this.notify(sim.enqueue({kind:'objective',objective:b.dataset.objective as 'economy'|'regional'|'formable'})??'Objective queued for next tick.');}
   if(b.hasAttribute('data-upgrade-mine'))this.notify(sim.enqueue({kind:'upgradeMine',id:this.building})??'Mine upgrade queued.');
   if(b.hasAttribute('data-rally'))this.rally(this.building);
   if(b.hasAttribute('data-peace-submit')){const terms=this.terms();if(terms)this.notify(sim.enqueue({kind:'peaceTerms',terms})??'Peace proposal queued for next tick.');}
  });
  this.element.addEventListener('change',()=>{if(this.page==='peace')this.assess();});
 }
 private open(page:typeof this.page){this.page=page;this.key='';this.element.hidden=false;this.update();}
 inspect(){this.open('selection');}
 objectives(){this.open('objectives');}
 peace(target:string){this.target=target;this.open('peace');}
 inspectBuilding(id:number){this.building=id;this.open('building');}
 private terms():PeaceTerms|null{if(this.page!=='peace')return null;return{target:this.target,keepStates:[...this.element.querySelectorAll<HTMLInputElement>('[data-state]:checked')].map(e=>e.dataset.state!),reparations:Number(this.element.querySelector<HTMLInputElement>('#peace-reparations')!.value),demilitarize:this.element.querySelector<HTMLInputElement>('#peace-demilitarize')!.checked};}
 private assess(){const terms=this.terms(),sim=this.sim();if(!terms||!sim)return;const error=sim.peaceAssessment(terms);this.element.querySelector('#peace-assessment')!.textContent=error??'Terms acceptable under the current military situation.';this.element.querySelector<HTMLButtonElement>('[data-peace-submit]')!.disabled=!!error;}
 update(){
  const sim=this.sim(),view=this.view();if(!sim||!view||this.element.hidden)return;
  const s=sim.state,selected=sim.playerUnits.filter(u=>view.selected.has(u.id)),key=[this.page,s.elapsed,[...view.selected].join(','),this.target,this.building,sim.territory.landRevision].join('|');if(key===this.key)return;
  // Do not rebuild a peace form during live ticks; re-evaluate terms independently.
  if(this.page==='peace'&&this.key&&this.key.split('|')[3]===this.target){this.key=key;this.assess();return;}this.key=key;
  const header=(title:string)=>`<header><h2>${title}</h2><button data-close aria-label="Close inspector">×</button></header>`;
  if(this.page==='selection'){
   if(!selected.length){this.element.innerHTML=header('Unit inspector')+'<p>Select a formation or stack to inspect orders, organization and supply.</p>';return;}
   const ids=new Set(selected.map(u=>sim.visibleStacks().representatives.get(u.id)??u.id)),groups=[...ids].map(id=>sim.visibleStacks().groups.get(id)??selected.filter(u=>u.id===id));
   const hp=selected.reduce((n,u)=>n+u.hp,0),max=selected.reduce((n,u)=>n+u.maxHp,0);
   this.element.innerHTML=header('Selected forces')+`<p>${selected.length} formations · ${selected.reduce((n,u)=>n+personnel(u),0).toLocaleString()} personnel</p><p>Strength ${Math.round(hp/max*100)}% · Organization ${Math.round(selected.reduce((n,u)=>n+(u.organization??100),0)/selected.length)}%</p>`+groups.map(group=>`<details open class="stack-card"><summary>${group.length}/${MAX_STACK_UNITS} formations · ${group.reduce((n,u)=>n+personnel(u),0).toLocaleString()} personnel</summary><p>${esc(sim.command.forUnit(group[0])?.name??'Independent command')} · ${(group.reduce((sum,u)=>sum+personnel(u),0)/1000).toFixed(2)} full-formation equivalents</p>${group.length>1?`<button data-split-stack="${group[0].id}">Split stack</button><small>Persistent group · split before selecting members individually.</small>`:''}${group.map(u=>{const supply=sim.unitSupply(u);return `<button data-unit="${u.id}" class="unit-inspect-row"><strong>${esc(u.type)} #${u.id}</strong><span>${unitStatus(u,s.elapsed,supply)}</span><small>${personnel(u)} personnel · Org ${Math.round(u.organization??100)}% · Supply ${Math.round(supply*100)}%</small><small>${u.waypoints?.length??0} queued waypoints · ${sim.unitSpeedKmh(u).toFixed(1)} km/h</small></button>`;}).join('')}</details>`).join('')+'<p>Organization measures combat readiness and morale. Below 15%, troops retreat. They recover while resting; connected, equipped formations replace casualties every day.</p><p>Merged members stay together until you use Split. After splitting, click a formation to select it separately. Shift + right-click queues a waypoint. Ctrl + 1–9 saves a control group; 1–9 recalls it.</p>';
  }else if(this.page==='objectives'){
   const counts=sim.territory.landCounts(),share=(counts[s.nation]??0)/Math.max(1,Object.values(counts).reduce((a,b)=>a+b,0)),p=objectiveProgress(s,sim.playerNation,share);
   this.element.innerHTML=header('Campaign objectives')+`<h3>${p.name}</h3><p>${p.detail}</p><progress max="1" value="${p.progress}"></progress><p>${s.objective?.completedAt!==undefined?'✓ Completed · Continue your campaign freely.':Math.floor(p.progress*100)+'% complete'}</p><button data-objective="economy">Economic power</button><button data-objective="regional">Regional dominance</button><button data-objective="formable">Historic unification</button><p>Choose one goal at a time. Completing an objective does not end the simulation. Formable requirements are in Government.</p>`;
  }else if(this.page==='building'){
   const b=s.buildings.find(b=>b.id===this.building&&b.hp>0);if(!b){this.element.hidden=true;return;}
   this.element.innerHTML=header(esc(b.type)+' #'+b.id)+`<p>${esc(sim.nationName(b.nation))} · Strength ${Math.round(100*b.hp/b.maxHp)}%</p>${b.nation===s.nation&&['hq','barracks','dock'].includes(b.type)?`<button data-rally>Set rally point</button><p>${b.rally?'Recruits move automatically to the assigned rally point.':'New recruits currently remain at this building.'}</p>`:''}<p>${b.type==='mine'?`Level ${b.mineLevel??1} extractor · +${((b.mineLevel??1)-1)*50}% mineral output. ${b.mineUpgrade?`Upgrading: ${b.mineUpgrade.total-b.mineUpgrade.remaining}/${b.mineUpgrade.total} ticks`:''}`:b.type==='barracks'?'Barracks relay supply from the capital along connected states.':b.type==='dock'?'Operational, unblocked ports extend supply over connected seas.':b.type==='depot'?'Relays capital supply along connected states. Depots require a route to the capital; an isolated depot cannot create supplies.':''}</p>`;
   if(b.type==='mine'&&b.nation===s.nation)this.element.insertAdjacentHTML('beforeend',`<button data-upgrade-mine ${(b.mineLevel??1)>=3||b.mineUpgrade||b.construction?'disabled':''}>${(b.mineLevel??1)>=3?'Maximum level':b.mineUpgrade?'Upgrading':`Upgrade mine · ${150*(b.mineLevel??1)} credits + ${5*(b.mineLevel??1)} steel`}</button>`);
  }else{
   const states=sim.territory.states.filter(p=>sim.territory.stateController(p)===s.nation&&s.stateOccupation?.[p.id]?.opponent===this.target);
   this.element.innerHTML=header('Peace with '+esc(sim.nationName(this.target)))+`<p>End this war with a 30-day truce. Undemanded occupied states return to their previous controller. Captured capitals can still trigger full capitulation.</p><h3>Territorial demands</h3>${states.map(p=>`<label><input data-state="${p.id}" type="checkbox"> ${esc(p.name)}</label>`).join('')||'<p>No occupied states available to demand.</p>'}<label>Reparations per day (10 days)<input id="peace-reparations" type="number" min="0" max="100" step="5" value="0"></label><label><input id="peace-demilitarize" type="checkbox"> Demilitarize demanded states for the truce</label><p id="peace-assessment" role="status"></p><button data-peace-submit>Propose peace</button><p>Retained states start with resistance. A local garrison reduces it; high resistance costs treasury funds.</p>`;this.assess();
  }
 }
}
