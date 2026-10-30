import type {Simulation} from './campaign';
import {ideologies,civicPolicies,politicalGrowth} from './politics';
import {formables,formationProgress} from './formables';
import {personnel} from './unit-stacks';
import type {GameCommand,IdeologyId} from './types';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const branches:IdeologyId[][]=[['democracy','liberalism'],['nationalism','fascism'],['socialism','communism']];
export class NationPanel{
 readonly element=document.createElement('aside');private nation='';private key='';private shell='';private selected:IdeologyId='nonAligned';
 constructor(parent:HTMLElement,private sim:()=>Simulation|null,private notify:(s:string)=>void){
  this.element.className='nation-government panel';this.element.hidden=true;this.element.setAttribute('aria-label','Government and formables');parent.append(this.element);
  this.element.addEventListener('click',event=>{const b=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b)return;
   if(b.hasAttribute('data-close')){this.element.hidden=true;return;}
   if(b.dataset.ideology){this.selected=b.dataset.ideology as IdeologyId;this.updatePreview();}
   if(b.dataset.form)this.queue({kind:'formNation',id:b.dataset.form});
   if(b.hasAttribute('data-change-ideology'))this.queue({kind:'ideology',ideology:this.selected});
   if(b.dataset.civic)this.queue({kind:'civicPolicy',policy:b.dataset.civic as 'none'|'rights'|'welfare'});
  });
 }
 private q<T extends HTMLElement=HTMLElement>(selector:string){return this.element.querySelector<T>(selector)!;}
 private queue(command:GameCommand){const s=this.sim();if(s)this.notify(s.enqueue(command)??'Order queued for the next tick.');}
 open(nation:string){this.nation=nation;this.element.hidden=false;this.key='';this.shell='';this.selected=this.sim()?.state.nations[nation]?.ideology??'nonAligned';this.update();}
 private updatePreview(){const sim=this.sim(),n=sim?.state.nations[this.nation];if(!sim||!n)return;
  this.q('#ideology-preview').textContent=ideologies[this.selected].name+' · '+ideologies[this.selected].description;
  for(const node of this.element.querySelectorAll<HTMLButtonElement>('[data-ideology]')){node.classList.toggle('selected',node.dataset.ideology===this.selected);node.classList.toggle('adopted',node.dataset.ideology===n.ideology);node.setAttribute('aria-pressed',String(node.dataset.ideology===this.selected));}
  const button=this.element.querySelector<HTMLButtonElement>('[data-change-ideology]');if(button){const waiting=sim.state.elapsed<(n.ideologyChangedAt??-25)+25;button.disabled=n.politicalPower!<100||n.ideology===this.selected||waiting;button.textContent=n.ideology===this.selected?'Current path':waiting?'Available after five-day cooldown':'Adopt '+ideologies[this.selected].name+' · 100 political power';}
 }
 update(){const sim=this.sim();if(!sim||this.element.hidden)return;const state=sim.state,n=state.nations[this.nation];if(!n)return;
  const key=[this.nation,state.elapsed,n.formedNation,n.defeated,sim.territory.landRevision].join(':');if(key===this.key)return;this.key=key;
  const own=this.nation===state.nation&&!n.defeated,c=sim.data.countries.find(c=>c.id===this.nation)!;
  const shell=[this.nation,own,n.formedNation].join(':');
  if(shell!==this.shell){this.shell=shell;const node=(id:IdeologyId)=>`<button type="button" data-ideology="${id}" class="ideology-node" aria-pressed="false">${ideologies[id].name}<small data-current-path="${id}"></small></button>`;
   this.element.innerHTML=`<header><h2>${escape(sim.nationName(n.id))}</h2><button data-close aria-label="Close government">×</button></header><p>Government & formables</p><div class="government-stats"><span>Stability <b id="government-stability"></b><small id="stability-growth" class="growth-rate" tabindex="0"></small></span><span>Political power <b id="government-power"></b><small id="power-growth" class="growth-rate" tabindex="0"></small></span><span id="personnel-label">Personnel <b id="government-personnel"></b></span></div><p id="reinforcement-pool"></p><h3>Ideological paths</h3><div class="ideology-tree" role="group" aria-label="Ideology tree"><div class="ideology-root">${node('nonAligned')}</div><div class="ideology-branches">${branches.map(branch=>`<div class="ideology-branch">${branch.map(node).join('')}</div>`).join('')}</div></div><p id="ideology-preview"></p>${own?`<button data-change-ideology>Adopt path</button><small>Adopting a path costs 100 political power and 10 stability. Five days between changes. The tree groups the available political directions.</small><h3>Civic policies</h3>${Object.entries(civicPolicies).map(([id,p])=>`<button data-civic="${id}">${p.name} · +${p.boost} stability/day · ${p.cost} PP to adopt · ${p.credits} credits/day</button>`).join('')}`:''}<p>Daily stability: enough consumer goods +2; shortages −2; war −3; unrest −1. Funded civic policies add their bonus. Hover over a growth rate for one second for its breakdown.</p><p id="instability-warning"></p><h3>Occupation & resistance</h3><p id="government-resistance"></p><h3>Historical formables</h3><p>Control every required state and city. Allied land does not count. Proclaiming the formable integrates and cores all required states as one country.</p>${formables.filter(f=>f.founders.some(id=>id===this.nation)).map(f=>`<article><h3>${escape(f.name)}</h3><p>${escape(f.description)}</p><ul>${f.required.map(id=>`<li data-required="${f.id}:${id}"></li>`).join('')}</ul>${own?`<button data-form="${f.id}">Proclaim ${escape(f.name)}</button>`:''}</article>`).join('')||`<p>No formables available for ${escape(c.name)}.</p>`}`;
  }
  const intelligence=own||sim.visibility.hasIntelligence(state.nation,n.id),troops=intelligence?sim.nationPersonnel(n.id):state.units.filter(u=>u.nation===n.id&&sim.visibility.canSee(state.nation,u)).reduce((sum,u)=>sum+personnel(u),0);
  this.q('#government-stability').textContent=n.stability!.toFixed(0)+'%';this.q('#government-power').textContent=n.politicalPower!.toFixed(1);this.q('#government-personnel').textContent=troops.toLocaleString();this.q('#personnel-label').firstChild!.textContent=intelligence?'Personnel ':'Observed personnel ';
  const growth=politicalGrowth(state,n);for(const [id,value,description] of [['#stability-growth',growth.stability,growth.stabilityDetails],['#power-growth',growth.power,growth.powerDetails]] as const){const label=this.q(id);label.textContent=`${value>=0?'+':''}${value.toFixed(1)}/day`;label.className='growth-rate '+(value>0?'growth-positive':value<0?'growth-negative':'growth-neutral');label.dataset.growthTooltip=description;label.setAttribute('aria-label',description);}
  this.q('#reinforcement-pool').textContent=`Reinforcement pool: ${Math.max(0,Math.floor(sim.territory.population(n.id)*.01-(n.manpowerUsed??0))).toLocaleString()} personnel remaining · replacements consume steel, supplies and credits when connected to supply.`;
  for(const button of this.element.querySelectorAll<HTMLButtonElement>('[data-civic]'))button.disabled=button.dataset.civic===n.civicPolicy;
  for(const label of this.element.querySelectorAll<HTMLElement>('[data-current-path]'))label.textContent=label.dataset.currentPath===n.ideology?'Current path':'';
  this.q('#instability-warning').textContent=n.instabilitySince!==undefined?`Breakup risk: ${Math.floor((state.elapsed-n.instabilitySince)/5)} / 30 days of stability below 50% after unrest. Recover to 50% to stop the timer. The capital state remains under central control.`:'Prolonged stability below 50% after demonstrations can cause states to declare independence after 30 days.';
  this.q('#government-resistance').textContent=Object.entries(state.resistance??{}).filter(([id])=>{const p=sim.territory.states.find(p=>p.id===id);return p&&sim.territory.stateController(p)===n.id;}).map(([id,r])=>sim.territory.states.find(p=>p.id===id)!.name+': '+r.level.toFixed(0)+'% resistance').join(' · ')||'No resistance in controlled states.';
  for(const f of formables.filter(f=>f.founders.some(id=>id===this.nation))){const progress=formationProgress(state,sim.data,n.id,f.id,id=>sim.controlsNation(id,n.id));for(const id of f.required)this.q(`[data-required="${f.id}:${id}"]`).textContent=`${progress.missing.includes(id)?'○':'✓'} ${sim.data.countries.find(c=>c.id===id)?.name??id}${!sim.data.countries.some(c=>c.id===id)?' · outside this theatre':''}`;const button=this.element.querySelector<HTMLButtonElement>(`[data-form="${f.id}"]`);if(button){button.disabled=!!progress.error;button.textContent=n.formedNation===f.id?'Formed':'Proclaim '+f.name;}}
  this.updatePreview();
 }
}
