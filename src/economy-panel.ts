import {calendar,TICKS_PER_DAY,TRADE_INTERVAL_TICKS} from "./game-clock";
import {commodities,commodityIds,factoryRecipes,recipeSummary} from "./economy";
import {saveCampaign} from "./campaign";
import type {Simulation} from "./campaign";
import type {PlayView} from "./play-view";
import type {Commodity,FactoryRecipeId,Mineral,GameCommand} from "./types";
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]!);
const count=(n:number)=>n.toLocaleString(undefined,{maximumFractionDigits:1});

/** Persistent form controls; refresh only the numbers while the economy window is open. */
export class EconomyPanel {
 readonly element:HTMLElement;
 private lastRefresh=0;
 constructor(parent:HTMLElement,readonly simulation:()=>Simulation|null,readonly view:()=>PlayView|null,readonly buildFactory:()=>void,readonly notify:(text:string)=>void){
  this.element=document.createElement("aside");this.element.id="industry-panel";this.element.className="industry-panel panel";this.element.hidden=true;this.element.setAttribute("aria-label","Industry and global trade");
  this.element.innerHTML=`<div class="industry-header"><div class="panel-heading"><div><div class="eyebrow">NATIONAL ECONOMY</div><h2>Industry & trade</h2></div><button id="industry-close" class="icon-button" aria-label="Close industry and trade">✕</button></div><div class="diplomacy-tabs"><button data-economy-view="production" class="active">Production</button><button data-economy-view="market">Global trade</button><button data-economy-view="finance">Budget & markets</button></div></div>
   <div class="industry-body"><aside class="stockpile-panel"><h3>Your stockpiles</h3><p class="economy-muted">Minerals → materials → finished goods.</p><div class="stockpile-grid">${commodityIds.map(id=>`<div class="commodity-stock"><span><i style="background:${commodities[id].color}"></i>${commodities[id].name}</span><strong data-stock="${id}">0</strong><small data-balance="${id}"></small></div>`).join("")}</div><h3>Economic policies</h3><label>Trade policy<select id="trade-policy"><option value="free">Free market · export all available stock</option><option value="balanced">Balanced trade · keep 5 of each good</option><option value="closed">Closed economy · no foreign trade</option></select></label><label>Industrial priority<select id="industry-policy"><option value="balanced">Balanced production</option><option value="civilian">Civilian · +20% consumer goods</option><option value="industrial">Industrial · +15% steel & electronics</option><option value="mobilized">Mobilised · +25% army supplies, −10% other goods</option></select></label><p class="economy-muted">Daily balance includes planned factory inputs, construction instalments, domestic demand and recurring orders. Missing inputs pause actual output. Imports in recurring orders are forecasts, not guaranteed deliveries.</p><label class="domestic-toggle"><input id="domestic-sales" type="checkbox" checked> Sell consumer goods domestically</label><p id="commerce-note" class="economy-muted"></p><p class="economy-muted">Domestic customers pay 12 credits per good. Keep goods in storage to export them instead.</p></aside>
   <section id="factory-workspace" class="economy-workspace"><div class="workspace-heading"><h3>Factories <span id="factory-count"></span></h3><button id="build-factory" class="secondary-button">Build factory · 320 / 35 supply</button></div><p class="economy-muted">Each factory runs one line. Inputs and operating credits are consumed per completed batch. Missing inputs pause production.</p><div id="factory-list"></div><h3>Construction projects</h3><div class="construction-actions"><button data-build="mine" class="secondary-button">Build extractor</button><button data-build="depot" class="secondary-button">Build supply depot</button><button data-build="barracks" class="secondary-button">Build barracks</button><button id="economy-invest" class="secondary-button">Upgrade infrastructure</button></div><div id="construction-list"></div><h3>Controlled deposits</h3><p class="economy-muted">Place an extractor at a coloured deposit to collect its mineral. Deposits are generated for gameplay.</p><div id="deposit-list" class="deposit-list"></div></section>
   <section id="market-workspace" class="economy-workspace" hidden><div class="trade-toolbar"><label>Trade partner<select id="trade-partner" aria-label="Trade partner"><option value="world">Open market</option></select></label><label>Timing<select id="trade-timing" aria-label="Trade timing"><option value="once">Once · next tick</option><option value="recurring">Every 5 days</option></select></label><label>Batch size<input id="trade-quantity" type="number" min="1" max="500" step="1" value="10" aria-label="Trade quantity"></label></div><p id="trade-note" class="economy-muted"></p><p id="pending-trade-note" class="economy-muted"></p><div class="trade-table-wrap"><table class="trade-table"><thead><tr><th>Commodity</th><th>Yours</th><th>Available</th><th>Import</th><th>Export</th></tr></thead><tbody>${commodityIds.map(id=>`<tr><td><i class="commodity-dot" style="background:${commodities[id].color}"></i>${commodities[id].name}</td><td data-trade-owned="${id}"></td><td data-trade-available="${id}"></td><td><button class="secondary-button" data-trade-side="buy" data-trade-good="${id}"></button></td><td><button class="secondary-button" data-trade-side="sell" data-trade-good="${id}"></button></td></tr>`).join("")}</tbody></table></div><p class="economy-muted">One-off orders settle on the next tick. Recurring orders first run after 5 days (25 ticks), then repeat every 5 days. Prices and availability are checked at each delivery; failed deliveries are skipped until the next interval. Open market orders match real nations in this theatre. Stock, funds, relations and both nations’ policies must permit settlement. No outside warehouse creates goods.</p><h3>Recurring orders</h3><div id="recurring-orders" class="recurring-orders"></div><h3>Recent trade</h3><div id="trade-history" class="trade-history"></div></section></div>`;
  parent.append(this.element);
  this.q("#industry-close").addEventListener("click",()=>this.close());
  this.q("#build-factory").addEventListener("click",()=>{this.close();buildFactory();});
  this.element.addEventListener("keydown",e=>{if(e.key==="Escape"){e.stopPropagation();this.close();}});
  this.element.addEventListener("click",e=>{
   const button=(e.target as HTMLElement).closest<HTMLButtonElement>("button");if(!button)return;
   const sim=this.simulation();if(!sim)return;
   if(button.dataset.economyView)this.tab(button.dataset.economyView);
   if(button.dataset.tradeGood){
    const commodity=button.dataset.tradeGood as Commodity,side=button.dataset.tradeSide as "buy"|"sell";
    if(this.recurring())this.after(sim.economy.schedule(sim.state.nation,commodity,side,this.quantity(),this.partner()),"Recurring order saved. First delivery in 5 days.");
    else this.queue({kind:"trade",commodity,side,quantity:this.quantity(),partner:this.partner()});
   }
   if(button.dataset.factoryToggle)this.queue({kind:"factoryToggle",id:Number(button.dataset.factoryToggle)});
   if(button.dataset.recurringToggle)this.after(sim.economy.toggleRecurring(Number(button.dataset.recurringToggle)));
   if(button.dataset.recurringCancel)this.after(sim.economy.cancelRecurring(Number(button.dataset.recurringCancel)));
   if(button.dataset.factoryLocate){const b=sim.state.buildings.find(b=>b.id===Number(button.dataset.factoryLocate)&&b.nation===sim.state.nation);if(b){this.view()?.panTo(b.x,b.z);this.close();}}
   if(button.dataset.depositLocate){const node=sim.state.nodes.find(n=>n.nation===sim.state.nation&&!n.claimed&&n.mineral===button.dataset.depositLocate);if(node){this.view()?.panTo(node.x,node.z);this.close();}}
  });
  this.element.addEventListener("change",e=>{
   const target=e.target as HTMLSelectElement,sim=this.simulation();if(!sim)return;
   if(target.dataset.factoryRecipe)this.queue({kind:"factoryRecipe",id:Number(target.dataset.factoryRecipe),recipe:target.value as FactoryRecipeId});
   if(target.id==="trade-policy")this.queue({kind:"tradePolicy",policy:target.value as "free"|"balanced"|"closed"});
   if(target.id==="industry-policy")this.queue({kind:"industryPolicy",policy:target.value as "balanced"|"civilian"|"industrial"|"mobilized"});
   if(target.id==="domestic-sales")this.queue({kind:"domesticSales",enabled:(target as unknown as HTMLInputElement).checked});
   if(target.id==="trade-partner"||target.id==="trade-timing")this.refresh(true);
  });
  this.q("#trade-quantity").addEventListener("input",()=>this.refresh(true));
 }
 private q<T extends HTMLElement=HTMLElement>(selector:string){return this.element.querySelector<T>(selector)!;}
 attachFinance(finance:HTMLElement){finance.hidden=true;this.element.querySelector(".industry-body")!.append(finance);}
 get visible(){return !this.element.hidden;}
 open(tab="production"){this.element.hidden=false;this.tab(tab);this.q("#industry-close").focus();}
 openFactory(id:number){this.open("production");const card=this.element.querySelector<HTMLElement>(`[data-factory="${id}"]`);card?.scrollIntoView({block:"center"});card?.querySelector<HTMLSelectElement>("select")?.focus();}
 close(){this.element.hidden=true;document.querySelector("#industry-button")?.setAttribute("aria-expanded","false");}
 private tab(tab:string){
  const finance=tab==="finance";const financial=this.element.querySelector<HTMLElement>("#finance-workspace");if(financial)financial.hidden=!finance;this.q(".stockpile-panel").hidden=finance;
  const market=tab==="market";this.q("#market-workspace").hidden=!market;this.q("#factory-workspace").hidden=market||finance;
  for(const button of this.element.querySelectorAll<HTMLButtonElement>("[data-economy-view]")){const active=button.dataset.economyView===tab;button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active));}
  this.refresh(true);
 }
 private recurring(){return this.q<HTMLSelectElement>("#trade-timing").value==="recurring";}
 private queue(command:GameCommand){const sim=this.simulation();if(!sim)return;this.after(sim.enqueue(command),sim.paused?"Paused · order queued until the next tick after resume.":"Order queued for the next tick.");}
 private quantity(){return this.q<HTMLInputElement>("#trade-quantity").valueAsNumber;}
 private partner(){return this.q<HTMLSelectElement>("#trade-partner").value;}
 private after(error:string|null,message?:string){if(error)this.notify(error);else {const sim=this.simulation();if(sim)saveCampaign(sim.state);if(message)this.notify(message);}this.refresh(true);}
 refresh(force=false){
  if(!this.visible)return;const now=performance.now();if(!force&&now-this.lastRefresh<750)return;this.lastRefresh=now;
  const sim=this.simulation();if(!sim)return;const n=sim.playerNation,s=sim.state;
  const balance=sim.economy.balance(s.nation);
  for(const id of commodityIds){this.q(`[data-stock="${id}"]`).textContent=count(n.stockpile![id]);const label=this.q(`[data-balance="${id}"]`),net=balance.net[id];label.textContent=`${net>0?"Surplus +":net<0?"Deficit ":"Balanced "}${count(net)} / day`;label.className=net<0?"resource-deficit":"resource-surplus";label.title=`Planned daily use: ${count(balance.demand[id])}. Current stock covers ${balance.demand[id]?count(n.stockpile![id]/balance.demand[id]):"unlimited"} days of demand.`;}
  for(const kind of ["tradePolicy","industryPolicy"] as const){const control=this.q<HTMLSelectElement>(kind==="tradePolicy"?"#trade-policy":"#industry-policy"),pending=s.pendingCommands?.filter(c=>c.kind===kind).at(-1);if(document.activeElement!==control)control.value=pending&&"policy" in pending?pending.policy:n[kind]??"balanced";}

  const domestic=s.pendingCommands?.filter(c=>c.kind==="domesticSales").at(-1);
  this.q<HTMLInputElement>("#domestic-sales").checked=domestic?.kind==="domesticSales"?domestic.enabled:n.domesticSales!==false;
  this.q("#commerce-note").textContent=`Domestic sales: +${count(n.commerceIncome??0)} credits/tick`;
  const factories=sim.economy.factories(s.nation),list=this.q("#factory-list"),key=factories.map(b=>b.id).join(":");
  this.q("#factory-count").textContent=String(factories.length);
  if(list.dataset.key!==key){list.dataset.key=key;list.innerHTML=factories.length?factories.map(b=>`<article class="factory-card" data-factory="${b.id}"><div class="workspace-heading"><strong>Factory #${b.id}</strong><button class="text-button" data-factory-locate="${b.id}">Locate</button></div><label class="sr-only" for="recipe-${b.id}">Factory production line</label><select id="recipe-${b.id}" data-factory-recipe="${b.id}">${Object.entries(factoryRecipes).map(([id,r])=>`<option value="${id}">${r.name}</option>`).join("")}</select><p data-recipe-summary></p><div class="factory-progress"><span></span></div><div class="workspace-heading"><small data-factory-status></small><button class="secondary-button" data-factory-toggle="${b.id}">Pause</button></div></article>`).join(""):"<p class='economy-empty'>No factories yet. Build one on controlled land, then choose its production line.</p>";}
  for(const b of factories){
   const card=this.q(`[data-factory="${b.id}"]`),select=card.querySelector<HTMLSelectElement>("select")!;
   const pendingRecipe=s.pendingCommands?.filter(c=>c.kind==="factoryRecipe"&&c.id===b.id).at(-1);
   if(document.activeElement!==select)select.value=pendingRecipe?.kind==="factoryRecipe"?pendingRecipe.recipe:b.recipe??"steel";
   card.querySelector("[data-recipe-summary]")!.textContent=recipeSummary(b.recipe??"steel");
   card.querySelector<HTMLElement>(".factory-progress span")!.style.width=`${b.construction?100*b.construction.completedDays/b.construction.totalDays:Math.min(100,(b.progress??0)/factoryRecipes[b.recipe??"steel"].duration*100)}%`;
   card.querySelector("[data-factory-status]")!.textContent=s.pendingCommands?.some(c=>(c.kind==="factoryRecipe"||c.kind==="factoryToggle")&&c.id===b.id)?"Change queued for next tick":b.construction?`Construction ${b.construction.completedDays}/${b.construction.totalDays} days · ${b.construction.missing?.length?"Needs "+b.construction.missing.map(id=>commodities[id].name).join(", "):"Next daily material instalment pending"}`:sim.economy.status(b);
   card.querySelector("[data-factory-toggle]")!.textContent=b.enabled===false?"Resume":"Pause";
  }
  const projects=s.buildings.filter(b=>b.nation===s.nation&&b.hp>0&&b.construction),construction=this.q("#construction-list");
  const projectHTML=projects.map(b=>{const job=b.construction!;return `<p>${escape(b.type)} #${b.id} · ${job.completedDays}/${job.totalDays} days${job.missing?.length?" · Needs "+job.missing.map(id=>commodities[id].name).join(", "):" · Building"}</p>`;}).join("")||"<p class='economy-muted'>No active construction.</p>";
  if(construction.innerHTML!==projectHTML)construction.innerHTML=projectHTML;
  const deposits=this.q("#deposit-list"),minerals=commodityIds.filter(id=>commodities[id].extraction>0) as Mineral[];
  const depositHTML=minerals.map(id=>{const nodes=s.nodes.filter(node=>node.nation===s.nation&&node.mineral===id),open=nodes.filter(node=>!node.claimed).length;return `<div><span><i class="commodity-dot" style="background:${commodities[id].color}"></i>${commodities[id].name} <small>${nodes.length-open} active / ${nodes.length} sites</small></span><button class="secondary-button" data-deposit-locate="${id}" ${open?"":"disabled"}>Locate</button></div>`;}).join("");
  if(deposits.dataset.key!==depositHTML){deposits.dataset.key=depositHTML;deposits.innerHTML=depositHTML;}
  const partner=this.q<HTMLSelectElement>("#trade-partner"),partners=Object.values(s.nations).filter(other=>other.id!==s.nation&&!other.defeated&&!sim.atWar(s.nation,other.id)).sort((a,b)=>sim.nationName(a.id).localeCompare(sim.nationName(b.id)));
  const partnerKey=partners.map(other=>other.id).join(":");
  if(partner.dataset.key!==partnerKey){partner.dataset.key=partnerKey;const selected=partner.value;partner.replaceChildren(new Option("Open market","world"),...partners.map(other=>new Option(sim.nationName(other.id),other.id)));partner.value=partners.some(other=>other.id===selected)?selected:"world";}
  const repeating=this.recurring();
  this.q("#trade-note").textContent=repeating?"Repeats every 5 days (25 ticks). First delivery is 5 days from now; each delivery uses the current market price. Stock and credits are not reserved.":"One-off trades execute on the next tick. Orders match actual national stockpiles; allies offer better terms.";
  const pending=s.pendingCommands?.filter(c=>c.kind==="trade").length??0;
  this.q("#pending-trade-note").textContent=pending?`${pending} trade order${pending===1?"":"s"} queued${sim.paused?" · Resume to execute":" for the next tick"}.`:"";
  const quantity=this.quantity(),who=this.partner();
  for(const id of commodityIds){
   this.q(`[data-trade-owned="${id}"]`).textContent=count(n.stockpile![id]);this.q(`[data-trade-available="${id}"]`).textContent=count(sim.economy.available(s.nation,id,who));
   for(const side of ["buy","sell"] as const){const quote=sim.economy.quote(s.nation,id,side,quantity,who),button=this.q<HTMLButtonElement>(`[data-trade-good="${id}"][data-trade-side="${side}"]`);button.textContent=`${repeating?"Schedule ":""}${side==="buy"?"buy":"sell"} ${Number.isInteger(quantity)&&quantity>0?quantity:"—"}${repeating?"":` · ${count(quote.total)}`}`;
    const availability=quote.error&&/supply|fund and store|exportable stock|warehouse|credits|treasury/.test(quote.error);
    button.disabled=!!quote.error&&!(repeating&&availability);button.title=repeating?`Current indicative batch price: ${count(quote.total)} credits. Repeats every 5 days.`:quote.error??`${count(quote.unitPrice)} credits per unit`;}
  }
  const orders=s.market!.recurring!.filter(o=>o.nation===s.nation),recurringList=this.q("#recurring-orders");
  const orderKey=JSON.stringify(orders)+":"+s.elapsed;
  if(recurringList.dataset.key!==orderKey){recurringList.dataset.key=orderKey;recurringList.innerHTML=orders.length?orders.map(o=>{const due=calendar(o.nextTick),remaining=Math.max(0,o.nextTick-s.elapsed);return `<article class="recurring-order" data-recurring-order="${o.id}"><div><strong>${o.side==="buy"?"Import":"Export"} ${o.quantity} ${commodities[o.commodity].name}</strong><small>${o.partner==="world"?"Open market":escape(sim.nationName(o.partner))} · every ${TRADE_INTERVAL_TICKS/TICKS_PER_DAY} days</small><small>${o.enabled?`Next: Day ${due.day}, tick ${due.tick} · ${remaining} ticks remaining`:"Paused"}</small>${o.lastStatus?`<small class="${o.lastStatus.startsWith("Skipped")?"trade-skipped":""}">${escape(o.lastStatus)}</small>`:""}</div><button class="secondary-button" data-recurring-toggle="${o.id}">${o.enabled?"Pause":"Resume"}</button><button class="text-button" data-recurring-cancel="${o.id}">Cancel</button></article>`;}).join(""):"<p class='economy-muted'>Choose Every 5 days above, then schedule an import or export.</p>";}
  const history=this.q("#trade-history"),trades=s.market!.trades.slice(-6).reverse(),historyKey=JSON.stringify(trades);
  if(history.dataset.key!==historyKey){history.dataset.key=historyKey;history.innerHTML=trades.length?trades.map(t=>`<p><span>${t.recurringId?"Recurring · ":""}${t.side==="buy"?"Imported":"Exported"} ${t.quantity} ${commodities[t.commodity].name} · ${t.partner==="world"?"Open market":escape(sim.nationName(t.partner))}</span><strong>${t.side==="buy"?"−":"+"}${count(t.total)}</strong></p>`).join(""):"<p class='economy-muted'>Completed imports and exports appear here.</p>";}
 }
}
