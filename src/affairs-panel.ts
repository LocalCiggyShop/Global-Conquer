import type {Simulation} from './campaign';
import {spending} from './relations';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export class AffairsPanel {
 private panel=document.createElement('aside');
 private news=document.createElement('div');
 readonly finance:HTMLElement;
 private feed=document.createElement('div');
 private state?:Simulation;
 private key='';
 private routineTimers=new Map<number,ReturnType<typeof setTimeout>>();
 private newsTimers=new Map<number,ReturnType<typeof setTimeout>>();
 constructor(parent:HTMLElement,private report:(message:string)=>void,private save:()=>void,private locate:(nation:string)=>void=()=>{}){
  this.panel.className='affairs-panel panel';this.panel.hidden=true;this.panel.innerHTML=`<header><h2>World news</h2><button data-close aria-label="Close news">×</button></header><p>Campaign simulation · fictional news</p><section id="finance-workspace"><h3>Military budget</h3><label>Spending <output id="spending-output">100%</output><input id="military-spending" type="range" min="50" max="200" step="5" value="100"></label><p id="spending-details"></p><p>Baseline 100%. At 150% spending, funding gives +25% damage; recruitment costs and upkeep rise by 50%. Empty stores or treasury weaken forces.</p><h3>National stock exchange</h3><p id="stock-summary"></p><div id="stock-chart" role="img" aria-label="National stock index history"></div><div><button data-shares="buy">Buy 1 share</button><button data-shares="sell">Sell 1 share</button></div><p>Index shares use treasury funds. Prices reflect budgets, industry, war and news. Trading spread: 1% each way.</p><details><summary>World exchanges</summary><div id="exchange-list"></div></details></section><h3>News archive</h3><div id="news-archive"></div>`;
  this.finance=this.panel.querySelector<HTMLElement>('#finance-workspace')!;this.feed.className='routine-news';this.feed.setAttribute('aria-label','Routine world news');
  this.news.className='news-layer';parent.append(this.panel,this.news,this.feed);
  this.feed.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest<HTMLElement>('[data-locate]');if(b)this.locate(b.dataset.locate!);});
  this.query('[data-close]')!.addEventListener('click',()=>this.panel.hidden=true);
  const slider=this.query<HTMLInputElement>('#military-spending')!;
  slider.addEventListener('input',()=>this.query('output')!.textContent=slider.value+'%');
  slider.addEventListener('change',()=>this.order({kind:'spending',value:Number(slider.value)}));
  const actions=(e:Event)=>{const b=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-shares],[data-story],[data-locate]');if(!b||!this.state)return;
   if(b.dataset.locate)this.locate(b.dataset.locate);
   if(b.dataset.shares)this.order({kind:'shares',side:b.dataset.shares as 'buy'|'sell',quantity:1});
   if(b.dataset.story){const story=this.state.state.affairs!.news.find(n=>n.id===Number(b.dataset.story));if(story&&this.state.affairs.active(story.nation)&&(!story.target||this.state.affairs.active(story.target))){story.dismissed=false;this.key='';this.update(this.state);}}
  };this.panel.addEventListener('click',actions);this.finance.addEventListener('click',actions);
 }
 private query<T extends Element=Element>(selector:string):T|null{return this.panel.querySelector<T>(selector)??this.finance?.querySelector<T>(selector)??null;}
 open(){this.panel.hidden=false;this.key='';if(this.state)this.update(this.state);}
 close(){this.panel.hidden=true;}
 private order(command:Parameters<Simulation['enqueue']>[0]){if(!this.state)return;this.report(this.state.enqueue(command)??'Order queued for the next tick.');}
 toggle(){this.panel.hidden=!this.panel.hidden;this.key='';if(this.state)this.update(this.state);}
 update(sim:Simulation){
  if(this.state!==sim){for(const timer of this.routineTimers.values())clearTimeout(timer);this.routineTimers.clear();for(const timer of this.newsTimers.values())clearTimeout(timer);this.newsTimers.clear();this.news.replaceChildren();this.key="";}
  this.state=sim;const s=sim.state,n=sim.playerNation,a=s.affairs!;
  const key=s.region+s.nation+s.elapsed+'|'+a.news.map(e=>e.id+':'+e.dismissed+e.resolved).join(',')+'|'+this.panel.hidden+'|'+!!this.finance.closest('[hidden]');
  if(key===this.key)return;this.key=key;
  if(!this.finance.closest('[hidden]')){
   const slider=this.query<HTMLInputElement>('#military-spending')!;
   if(document.activeElement!==slider){slider.value=String(n.militarySpending);this.query('output')!.textContent=slider.value+'%';}
   this.query('#spending-details')!.textContent=`${sim.militaryUpkeep(s.nation).toFixed(1)} credits + ${sim.supplyUpkeep(s.nation).toFixed(2)} supplies upkeep/tick · funding combat modifier ${Math.round((0.5+spending(n)*0.5)*100)}%.`;
   this.query('#stock-summary')!.textContent=`Index ${n.stockIndex!.toFixed(2)} · ${n.shares} shares · value ${(n.shares!*n.stockIndex!).toFixed(0)} credits`;
   const history=[...(n.stockHistory??[])];if(history.at(-1)?.tick!==s.elapsed)history.push({tick:s.elapsed,value:n.stockIndex!});
   const chart=this.query<HTMLElement>('#stock-chart')!,chartKey=history.map(p=>p.tick+":"+p.value).join("|");
   if(chart.dataset.key!==chartKey){chart.dataset.key=chartKey;const values=history.map(p=>p.value),low=Math.min(...values)-1,high=Math.max(...values)+1,start=history[0]?.tick??s.elapsed,end=history.at(-1)?.tick??start;
    const points=history.map(p=>`${28+(p.tick-start)/Math.max(1,end-start)*304},${115-(p.value-low)/(high-low)*95}`).join(" ");
    chart.innerHTML=`<svg viewBox="0 0 360 155" aria-hidden="true"><path d="M28 20V115H332" fill="none" stroke="#626a75"/><path d="M28 67H332" stroke="#30343c"/><polyline points="${points}" fill="none" stroke="#E8EDF2" stroke-width="2"/><circle cx="${28+(history.at(-1)!.tick-start)/Math.max(1,end-start)*304}" cy="${115-(history.at(-1)!.value-low)/(high-low)*95}" r="3" fill="#E8EDF2"/><text x="28" y="14">${high.toFixed(1)}</text><text x="28" y="133">${low.toFixed(1)}</text><text x="28" y="150">Day ${Math.floor(start/5)+1}</text><text x="260" y="150">Day ${Math.floor(end/5)+1}</text></svg>`;
    chart.setAttribute('aria-label',`Stock index history, ${history.length} samples, current ${n.stockIndex!.toFixed(2)}, range ${low.toFixed(1)} to ${high.toFixed(1)}`);
   }
   this.query('#exchange-list')!.innerHTML=sim.data.countries.filter(c=>!s.nations[c.id].defeated).map(c=>`<p>${escape(c.name)} <b>${s.nations[c.id].stockIndex!.toFixed(2)}</b></p>`).join('');
  }
  if(!this.panel.hidden){
   const archive=this.query<HTMLElement>('#news-archive')!;const archiveHTML=[...a.news].reverse().map(e=>`<details><summary>Day ${Math.floor(e.time/5)+1} · ${escape(e.title)}${!sim.affairs.active(e.nation)||(e.target&&!sim.affairs.active(e.target))?' · historical':e.resolved?' · resolved':''}</summary><p>${escape(e.story)}</p><button data-locate="${e.nation}">Locate</button>${sim.affairs.active(e.nation)&&(!e.target||sim.affairs.active(e.target))?`<button data-story="${e.id}">Review report</button>`:''}</details>`).join('')||'<p>No reports yet.</p>';if(archive.dataset.key!==archiveHTML){archive.dataset.key=archiveHTML;archive.innerHTML=archiveHTML;}
  }
  const eligible=a.news.filter(e=>!e.dismissed&&sim.affairs.active(e.nation)&&(!e.target||sim.affairs.active(e.target))).sort((x,y)=>y.severity-x.severity||y.time-x.time);
  const relevant=(e:typeof a.news[number])=>e.nation===s.nation||e.target===s.nation;
  const visible=eligible.filter(e=>relevant(e)&&e.severity>=2).slice(0,2);
  const routine=eligible.filter(e=>!visible.includes(e)).slice(0,3);
  for(const [id,timer] of this.routineTimers)if(!routine.some(e=>e.id===id)){clearTimeout(timer);this.routineTimers.delete(id);}
  for(const e of routine)if(!this.routineTimers.has(e.id))this.routineTimers.set(e.id,setTimeout(()=>{this.routineTimers.delete(e.id);if(this.state!==sim)return;e.dismissed=true;this.key='';this.save();this.update(sim);},15000));
  const feedHTML=routine.map(e=>`<div>${sim.data.countries.find(c=>c.id===e.nation)?.flagCode?`<img src="/flags/${encodeURIComponent(sim.data.countries.find(c=>c.id===e.nation)!.flagCode!)}.svg" alt="${escape(sim.nationName(e.nation))} flag">`:''}<span title="${escape(e.story)}">${escape(e.title)}</span><button data-locate="${e.nation}">Locate</button></div>`).join('');if(this.feed.dataset.key!==feedHTML){this.feed.dataset.key=feedHTML;this.feed.innerHTML=feedHTML;}
  for(const child of [...this.news.children])if(!visible.some(e=>e.id===Number((child as HTMLElement).dataset.news))){const id=Number((child as HTMLElement).dataset.news);clearTimeout(this.newsTimers.get(id));this.newsTimers.delete(id);child.remove();}
  visible.forEach((e,i)=>{
   let modal=this.news.querySelector<HTMLElement>(`[data-news="${e.id}"]`);if(modal){const button=modal.querySelector<HTMLButtonElement>('[data-resolve]');if(button&&e.resolved){button.textContent='Resolved';button.disabled=true;}return;}
   const c=sim.data.countries.find(c=>c.id===e.nation);modal=document.createElement('section');modal.dataset.news=String(e.id);modal.className=`news-modal panel severity-${e.severity}`;modal.setAttribute('role','dialog');modal.setAttribute('aria-label',e.title);modal.style.left=`${320+i*35}px`;modal.style.top=`${100+i*100}px`;
   modal.innerHTML=`<header>${c?.flagCode?`<img src="/flags/${encodeURIComponent(c.flagCode)}.svg" alt="${escape(c.name)} flag">`:''}<strong>${escape(e.title)}</strong><button data-dismiss aria-label="Dismiss news">×</button></header><small>Fictional campaign report · Day ${Math.floor(e.time/5)+1} · Severity ${e.severity}/4</small><p>${escape(e.story)}</p>${['tension','nuclear','unrest'].includes(e.kind)&&(e.nation===s.nation||e.target===s.nation)?`<button data-resolve ${e.resolved?'disabled':''}>${e.resolved?'Resolved':'Fund crisis talks · 75 credits'}</button>`:''}`;
   const timeoutSeconds=e.severity>=3?30:15;
   modal.insertAdjacentHTML('beforeend',`<div class="news-timeout" aria-label="Automatically closes after ${timeoutSeconds} seconds"><span style="animation-duration:${timeoutSeconds}s"></span></div><small>Auto closes after ${timeoutSeconds}s · saved in News archive</small>`);
   const dismiss=()=>{clearTimeout(this.newsTimers.get(e.id));this.newsTimers.delete(e.id);if(this.state!==sim)return;e.dismissed=true;modal!.remove();this.save();this.key='';};
   this.newsTimers.set(e.id,setTimeout(dismiss,timeoutSeconds*1000));
   modal.insertAdjacentHTML('beforeend','<button data-locate>Locate country</button>');modal.querySelector('[data-locate]')!.addEventListener('click',()=>this.locate(e.nation));
   modal.querySelector('[data-dismiss]')!.addEventListener('click',dismiss);
   modal.querySelector('[data-resolve]')?.addEventListener('click',()=>this.order({kind:'resolveNews',id:e.id}));
   const header=modal.querySelector('header')!;
   header.addEventListener('pointerdown',event=>{if((event.target as HTMLElement).closest('button'))return;event.preventDefault();const x=event.clientX,y=event.clientY,rect=modal!.getBoundingClientRect();header.setPointerCapture(event.pointerId);
    const move=(ev:PointerEvent)=>{modal!.style.left=Math.max(54,Math.min(innerWidth-rect.width,rect.left+ev.clientX-x))+'px';modal!.style.top=Math.max(52,Math.min(innerHeight-48,rect.top+ev.clientY-y))+'px';};
    const end=()=>{header.removeEventListener('pointermove',move);header.removeEventListener('pointerup',end);header.removeEventListener('pointercancel',end);};header.addEventListener('pointermove',move);header.addEventListener('pointerup',end);header.addEventListener('pointercancel',end);
   });this.news.append(modal);
  });
 }
}
