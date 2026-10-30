import {mineMultiplier,techLevel} from "./technology";
import {initializePolitics,ideologyOf,stabilityEffect,consumerDemand} from "./politics";
import {advanceConstruction,constructionNeeds} from "./construction";
import {relationScore,adjustRelation} from "./relations";
import {TRADE_INTERVAL_TICKS} from "./game-clock";
import {allied,atWar} from "./relations";
import type {Building,Campaign,Commodity,FactoryRecipeId,Mineral,Stockpile} from "./types";

export const commodities = {
 iron:{name:"Iron",price:4,color:"#A7ADB3",extraction:0.65},
 coal:{name:"Coal",price:3,color:"#7F8A98",extraction:0.7},
 copper:{name:"Copper",price:7,color:"#C99879",extraction:0.45},
 zinc:{name:"Zinc",price:5,color:"#A3B8BE",extraction:0.5},
 gold:{name:"Gold",price:18,color:"#DDB565",extraction:0.18},
 diamonds:{name:"Diamonds",price:45,color:"#A6D8E1",extraction:0.08},
 steel:{name:"Steel",price:10,color:"#A5B6C7",extraction:0},
 electronics:{name:"Electronics",price:24,color:"#66CBB5",extraction:0},
 consumerGoods:{name:"Consumer goods",price:20,color:"#D2BE9B",extraction:0},
} satisfies Record<Commodity,{name:string;price:number;color:string;extraction:number}>;
export const commodityIds=Object.keys(commodities) as Commodity[];
const minerals:Mineral[]=["iron","coal","copper","zinc","gold","diamonds"];
const MAX_STOCK=10000;
export interface FactoryRecipe {
 name:string;duration:number;cost:number;inputs:Partial<Stockpile>;
 output:{commodity:Commodity|"supplies";amount:number};
}
export const factoryRecipes:Record<FactoryRecipeId,FactoryRecipe>={
 steel:{name:"Steel mill",duration:5,cost:2,inputs:{iron:3,coal:2},output:{commodity:"steel",amount:3}},
 electronics:{name:"Electronics",duration:6,cost:3,inputs:{copper:2,zinc:1,gold:0.25},output:{commodity:"electronics",amount:2}},
 consumer:{name:"Consumer goods",duration:6,cost:3,inputs:{steel:1,electronics:1},output:{commodity:"consumerGoods",amount:3}},
 jewelry:{name:"Jewellery",duration:8,cost:3,inputs:{gold:1,diamonds:0.2},output:{commodity:"consumerGoods",amount:3}},
 arms:{name:"Army supplies",duration:6,cost:2,inputs:{steel:2,copper:1},output:{commodity:"supplies",amount:8}},
};
const hash=(id:string)=>[...id].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0);
export const mineralFor=(nation:string,index:number):Mineral=>minerals[(hash(nation)+index)%minerals.length];
export const stockpile=(amount=0):Stockpile=>Object.fromEntries(commodityIds.map(id=>[id,amount])) as Stockpile;
const starter:Partial<Stockpile>={iron:24,coal:18,copper:12,zinc:10,gold:4,diamonds:1};
const finite=(value:unknown,fallback=0)=>typeof value==="number"&&Number.isFinite(value)?Math.max(0,value):fallback;
export function recipeSummary(id:FactoryRecipeId):string {
 const r=factoryRecipes[id];return `${Object.entries(r.inputs).map(([key,q])=>`${q} ${commodities[key as Commodity].name}`).join(" + ")} → ${r.output.amount} ${r.output.commodity==="supplies"?"army supplies":commodities[r.output.commodity].name} · ${r.duration} ticks · ${r.cost} credits`;
}
/** Save migration is idempotent; existing gold extractors retain their mineral. */
export function initializeEconomy(state:Campaign){
 for(const n of Object.values(state.nations)){
  if(!n.stockpile)n.stockpile={...stockpile(),...starter};
  for(const id of commodityIds)n.stockpile[id]=Math.min(1e7,finite(n.stockpile[id]));
  n.tradePolicy??="balanced";n.industryPolicy??="balanced";
  n.domesticSales??=true;n.commerceIncome=finite(n.commerceIncome);
 }
 const indices=new Map<string,number>();
 for(const node of state.nodes){
  const index=indices.get(node.nation)??0;indices.set(node.nation,index+1);
  if(!minerals.includes(node.mineral!))node.mineral=node.claimed?"gold":mineralFor(node.nation,index);
 }
 for(const b of state.buildings){
  if(b.type==="mine"&&!minerals.includes(b.mineral!))b.mineral=state.nodes.find(n=>n.nation===b.nation&&Math.hypot(n.x-b.x,n.z-b.z)<2.5)?.mineral??"gold";
  if(b.type==="factory"){
   if(!Object.hasOwn(factoryRecipes,b.recipe??""))b.recipe="steel";
   b.progress=Math.min(factoryRecipes[b.recipe!].duration,finite(b.progress));b.enabled??=true;
  }
 }
 state.market??={stock:stockpile(),trades:[]};
 for(const id of commodityIds)state.market.stock[id]=Math.min(20000,finite(state.market.stock[id]));
 state.market.trades=Array.isArray(state.market.trades)?state.market.trades.slice(-24):[];
 state.market.recurring=(state.market.recurring??[]).filter(order=>Number.isInteger(order.id)&&state.nations[order.nation]&&Object.hasOwn(commodities,order.commodity)&&["buy","sell"].includes(order.side)&&Number.isInteger(order.quantity)&&order.quantity>=1&&order.quantity<=500).slice(0,24);
 for(const order of state.market.recurring){order.nextTick=Number.isFinite(order.nextTick)?Math.max(0,Math.ceil(order.nextTick)):Math.floor(state.elapsed)+TRADE_INTERVAL_TICKS;order.enabled=order.enabled!==false;}
 state.economyClock=finite(state.economyClock)%1;state.economyVersion=1;
}
export interface TradeQuote {unitPrice:number;total:number;error:string|null;legs?:{partner:string;quantity:number;total:number}[];}
export class IndustryEconomy {
 onRecurringSettlement:()=>void=()=>{};
 private aiAt:number;
 constructor(readonly state:Campaign){initializeEconomy(state);initializePolitics(state);this.aiAt=state.elapsed+15;}
 income(id:string){return this.state.nations[id]?.commerceIncome??0;}
 factories(id:string){return this.state.buildings.filter(b=>b.nation===id&&b.type==="factory"&&b.hp>0);}
 outputMultiplier(nation:string,recipe:FactoryRecipeId){const social=this.state.nations[nation].ideology==="socialism"&&(recipe==="consumer"||recipe==="jewelry")?1.2:1;const p=this.state.nations[nation].industryPolicy;return social*(p==="civilian"?(recipe==="consumer"||recipe==="jewelry"?1.2:1):p==="industrial"?(recipe==="steel"||recipe==="electronics"?1.15:1):p==="mobilized"?(recipe==="arms"?1.25:0.9):1);}
 balance(nation:string){
  const net=stockpile(),demand=stockpile(),n=this.state.nations[nation];
  for(const b of this.state.buildings){if(b.hp<=0||b.nation!==nation)continue;
   if(b.construction){for(const [id,q] of Object.entries(constructionNeeds(b)))demand[id as Commodity]+=q;continue;}
   if(b.type==="mine")net[b.mineral??"gold"]+=commodities[b.mineral??"gold"].extraction*(1+n.industry*0.08)*mineMultiplier(b)*(1+.08*techLevel(n,"economy"))*5;
   if(b.type==="factory"&&b.enabled!==false){const r=factoryRecipes[b.recipe??"steel"],batches=5*(1+n.industry*0.05)*(1+.08*techLevel(n,"economy"))/r.duration;
    for(const [id,q] of Object.entries(r.inputs))demand[id as Commodity]+=q*batches;
    if(r.output.commodity!=="supplies"&&this.status(b)==="Producing")net[r.output.commodity]+=r.output.amount*batches*this.outputMultiplier(nation,b.recipe??"steel");
   }
  }
  if(n.domesticSales!==false)demand.consumerGoods+=consumerDemand(n)*5;
  for(const order of this.state.market!.recurring??[])if(order.nation===nation&&order.enabled){if(order.side==="buy")net[order.commodity]+=order.quantity/5;else demand[order.commodity]+=order.quantity/5;}
  for(const id of commodityIds)net[id]-=demand[id];return {net,demand};
 }
 exportable(nation:string,commodity:Commodity){const n=this.state.nations[nation];return !n||n.defeated||n.tradePolicy==="closed"?0:Math.max(0,n.stockpile![commodity]-(n.tradePolicy==="free"?0:5));}
 available(nation:string,commodity:Commodity,partner="world"){
  return partner==="world"?Object.values(this.state.nations).reduce((sum,n)=>sum+(n.id!==nation&&!atWar(this.state,nation,n.id)&&relationScore(this.state,nation,n.id)>=-10?this.exportable(n.id,commodity):0),0):this.exportable(partner,commodity);
 }
 quote(nation:string,commodity:Commodity,side:"buy"|"sell",quantity:number,partner="world"):TradeQuote{
  const fail=(error:string):TradeQuote=>({unitPrice:0,total:0,error});
  const n=this.state.nations[nation];
  if(this.state.result!=="playing"||!n||n.defeated)return fail("Choose an active nation.");
  if(!Object.hasOwn(commodities,commodity)||!["buy","sell"].includes(side))return fail("Choose a valid commodity and direction.");
  if(!Number.isInteger(quantity)||quantity<1||quantity>500)return fail("Trade between 1 and 500 units at a time.");
  if(n.tradePolicy==="closed")return fail("Closed economy policy blocks foreign trade.");
  if(partner==="world"){
   const legs:NonNullable<TradeQuote['legs']>=[];let remaining=quantity,total=0;
   for(const other of Object.values(this.state.nations)){
    if(other.id===nation||other.defeated||other.tradePolicy==="closed"||atWar(this.state,nation,other.id)||relationScore(this.state,nation,other.id)<-10)continue;
    const single=this.quote(nation,commodity,side,1,other.id);if(single.error)continue;
    let amount=Math.min(remaining,Math.floor(side==="buy"?this.exportable(other.id,commodity):Math.min(this.exportable(nation,commodity),MAX_STOCK-other.stockpile![commodity])));
    amount=Math.min(amount,Math.floor((side==="buy"?n.credits-total:other.credits)/single.unitPrice));
    if(amount<=0)continue;
    const quote=this.quote(nation,commodity,side,amount,other.id);if(quote.error)continue;
    legs.push({partner:other.id,quantity:amount,total:quote.total});total+=quote.total;remaining-=amount;if(!remaining)break;
   }
   if(remaining)return fail(side==="buy"?"Other nations cannot supply the requested quantity under current policies.":"No eligible nations can fund and store this export.");
   if(side==="buy"&&(n.credits<total||n.stockpile![commodity]+quantity>MAX_STOCK))return fail("Insufficient treasury or warehouse space.");
   if(side==="sell"&&this.exportable(nation,commodity)<quantity)return fail("Export exceeds stock available under your trade policy.");
   return {unitPrice:total/quantity,total:Math.round(total*100)/100,error:null,legs};
  }
  const other=this.state.nations[partner];
  if(!other||other.defeated||nation===partner||atWar(this.state,nation,partner))return fail("Direct trade requires another peaceful nation.");
  if(other.tradePolicy==="closed")return fail("This nation has a closed economy.");
  if(relationScore(this.state,nation,partner)<-10)return fail("Relations are too strained for bilateral trade (minimum −10).");
  const seller=side==="buy"?other:n,buyer=side==="buy"?n:other;
  const friendly=allied(this.state,nation,partner)||relationScore(this.state,nation,partner)>=20;
  const spread=side==="buy"?(friendly?1.04:1.08):(friendly?0.96:0.92);
  const tariff=(buyer.tradePolicy==="free"?1:1.03);
  const unitPrice=Math.round(commodities[commodity].price*spread*tariff*100)/100,total=Math.round(unitPrice*quantity*100)/100;
  if(this.exportable(seller.id,commodity)+1e-8<quantity)return fail("The seller lacks exportable stock under its trade policy.");
  if(buyer.stockpile![commodity]+quantity>MAX_STOCK)return fail("The buyer's warehouse is full.");
  if(buyer.credits<total)return fail("The buyer does not have enough credits.");
  return {unitPrice,total,error:null};
 }
 trade(nation:string,commodity:Commodity,side:"buy"|"sell",quantity:number,partner="world"):string|null{
  const quote=this.quote(nation,commodity,side,quantity,partner);if(quote.error)return quote.error;
  const n=this.state.nations[nation],market=this.state.market!;
  for(const leg of quote.legs??[{partner,quantity,total:quote.total}]){
   const other=this.state.nations[leg.partner],seller=side==="buy"?other:n,buyer=side==="buy"?n:other;
   seller.stockpile![commodity]-=leg.quantity;buyer.stockpile![commodity]+=leg.quantity;buyer.credits-=leg.total;seller.credits+=leg.total;
   adjustRelation(this.state,nation,other.id,Math.min(0.25,leg.quantity*0.01));
   if(other.id===this.state.nation)market.trades.push({time:this.state.elapsed,nation:other.id,partner:nation,commodity,side:side==="buy"?"sell":"buy",quantity:leg.quantity,total:leg.total});
  }
  if(nation===this.state.nation)market.trades.push({time:this.state.elapsed,nation,partner,commodity,side,quantity,total:quote.total});
  market.trades=market.trades.slice(-24);return null;
 }
 schedule(nation:string,commodity:Commodity,side:"buy"|"sell",quantity:number,partner="world"):string|null{
  const quote=this.quote(nation,commodity,side,quantity,partner);
  // Stock and money may be produced before the first delivery; configuration must be valid now.
  if(quote.error&&!/supply|fund and store|exportable stock|warehouse|credits|treasury/.test(quote.error))return quote.error;
  const orders=this.state.market!.recurring!;
  if(orders.length>=24)return "A campaign can have at most 24 recurring trade orders.";
  if(orders.some(o=>o.nation===nation&&o.partner===partner&&o.commodity===commodity&&o.side===side))return "A recurring order already exists for this commodity and partner. Cancel it to change the batch.";
  orders.push({id:this.state.nextId++,nation,commodity,side,quantity,partner,nextTick:Math.floor(this.state.elapsed)+TRADE_INTERVAL_TICKS,enabled:true});return null;
 }
 toggleRecurring(id:number):string|null{
  const order=this.state.market!.recurring!.find(o=>o.id===id&&o.nation===this.state.nation);
  if(!order)return "Choose one of your recurring orders.";
  order.enabled=!order.enabled;if(order.enabled)order.nextTick=Math.floor(this.state.elapsed)+TRADE_INTERVAL_TICKS;return null;
 }
 cancelRecurring(id:number):string|null{
  const orders=this.state.market!.recurring!,index=orders.findIndex(o=>o.id===id&&o.nation===this.state.nation);
  if(index<0)return "Choose one of your recurring orders.";orders.splice(index,1);return null;
 }
 private settleRecurring(){
  let changed=false;
  for(const order of this.state.market!.recurring!){
   if(!order.enabled||this.state.elapsed<order.nextTick)continue;
   changed=true;
   const error=this.trade(order.nation,order.commodity,order.side,order.quantity,order.partner);
   order.lastTick=Math.floor(this.state.elapsed);order.lastStatus=error?`Skipped: ${error}`:"Completed";
   if(!error&&order.nation===this.state.nation)this.state.market!.trades.at(-1)!.recurringId=order.id;
   order.nextTick+=(Math.floor((this.state.elapsed-order.nextTick)/TRADE_INTERVAL_TICKS)+1)*TRADE_INTERVAL_TICKS;
   if(this.state.nations[order.nation]?.defeated)order.enabled=false;
  }
  if(changed)this.onRecurringSettlement();
 }
 setRecipe(buildingId:number,recipe:FactoryRecipeId):string|null{
  if(this.state.result!=="playing"||this.state.nations[this.state.nation].defeated)return "This nation is no longer active.";
  const b=this.state.buildings.find(b=>b.id===buildingId&&b.hp>0&&b.type==="factory"&&b.nation===this.state.nation);
  if(!b||!Object.hasOwn(factoryRecipes,recipe))return "Choose one of your factories and a valid production line.";
  if(b.recipe!==recipe){b.recipe=recipe;b.progress=0;}return null;
 }
 toggleFactory(buildingId:number):string|null{
  if(this.state.result!=="playing"||this.state.nations[this.state.nation].defeated)return "This nation is no longer active.";
  const b=this.state.buildings.find(b=>b.id===buildingId&&b.hp>0&&b.type==="factory"&&b.nation===this.state.nation);
  if(!b)return "Choose one of your operational factories.";b.enabled=b.enabled===false;return null;
 }
 status(b:Building):string{
  if(b.construction)return "Under construction";
  if(b.enabled===false)return "Paused";const r=factoryRecipes[b.recipe??"steel"],n=this.state.nations[b.nation];
  if(n.credits<r.cost)return "Waiting for credits";
  const missing=Object.entries(r.inputs).filter(([key,q])=>n.stockpile![key as Commodity]+1e-8<q);
  if(missing.length)return "Needs "+missing.map(([key])=>commodities[key as Commodity].name).join(", ");
  const output=r.output.commodity==="supplies"?n.supplies:n.stockpile![r.output.commodity];
  return output+r.output.amount*this.outputMultiplier(n.id,b.recipe??"steel")>(r.output.commodity==="supplies"?9999:MAX_STOCK)?"Output storage full":"Producing";
 }
 tick(dt:number){
  this.state.economyClock!+=dt;
  while(this.state.economyClock!>=1-1e-9){this.state.economyClock=Math.max(0,this.state.economyClock!-1);this.advanceSecond();}
 }
 private advanceSecond(){
  const s=this.state;
  advanceConstruction(s);
  for(const b of s.buildings){
   const n=s.nations[b.nation];if(b.hp<=0||b.construction||!n||n.defeated)continue;
   if(b.type==="mine"){
    const mineral=b.mineral??"gold";n.stockpile![mineral]=Math.min(MAX_STOCK,n.stockpile![mineral]+commodities[mineral].extraction*(1+n.industry*0.08)*mineMultiplier(b)*(1+.08*techLevel(n,"economy")));
   }else if(b.type==="factory"&&this.status(b)==="Producing"){
    const r=factoryRecipes[b.recipe??"steel"];b.progress=(b.progress??0)+(1+n.industry*0.05)*(1+.08*techLevel(n,"economy"))*ideologyOf(n).production*stabilityEffect(n);
    if(b.progress+1e-8>=r.duration){
     // Inputs and operating cost change together only when a complete batch is ready.
     for(const [key,amount] of Object.entries(r.inputs))n.stockpile![key as Commodity]=Math.max(0,n.stockpile![key as Commodity]-amount);
     n.credits-=r.cost;
     if(r.output.commodity==="supplies")n.supplies=Math.min(9999,n.supplies+r.output.amount*this.outputMultiplier(n.id,b.recipe??"steel"));else n.stockpile![r.output.commodity]=Math.min(MAX_STOCK,n.stockpile![r.output.commodity]+r.output.amount*this.outputMultiplier(n.id,b.recipe??"steel"));
     b.progress=Math.max(0,b.progress-r.duration);
    }
   }
  }
  for(const n of Object.values(s.nations)){
   n.commerceIncome=0;if(n.defeated||n.domesticSales===false)continue;
   const amount=Math.min(n.stockpile!.consumerGoods,consumerDemand(n));
   n.consumerServed=(n.consumerServed??0)+amount;n.stockpile!.consumerGoods-=amount;n.commerceIncome=Math.round(amount*12*100)/100;n.credits+=n.commerceIncome;
  }
  this.settleRecurring();
  if(s.elapsed>=this.aiAt){this.aiAt=s.elapsed+15;for(const n of Object.values(s.nations))if(n.id!==s.nation&&!n.defeated)this.manageAI(n.id);}
 }
 private manageAI(nation:string){
  const n=this.state.nations[nation],desired=stockpile(30),factories=this.factories(nation);
  for(const b of factories)for(const [key,q] of Object.entries(factoryRecipes[b.recipe??"steel"].inputs))desired[key as Commodity]+=q*5;
  for(const b of this.state.buildings)if(b.nation===nation&&b.construction)for(const [id,q] of Object.entries(constructionNeeds(b)))desired[id as Commodity]+=q*3;
  const defensive=!!n.defenseReadiness;
  if(defensive){desired.steel+=20;desired.copper+=10;desired.iron+=10;}
  let budget=Math.min(300,Math.max(0,n.credits-(defensive?200:500)));
  for(const id of commodityIds){
   const spare=Math.floor(n.stockpile![id]-desired[id]);
   if(spare>=10)this.trade(nation,id,"sell",Math.min(25,spare));
  }
  const importOrder=defensive?["steel","copper","iron",...commodityIds.filter(id=>!["steel","copper","iron"].includes(id))] as Commodity[]:commodityIds;
  for(const id of importOrder){const missing=Math.ceil(Math.min(12,desired[id]-n.stockpile![id]));if(missing>0&&n.credits>(defensive?250:600)){const quote=this.quote(nation,id,"buy",missing);if(!quote.error&&quote.total<=budget){this.trade(nation,id,"buy",missing);budget-=quote.total;}}}
  for(const b of factories){
   for(const [key,q] of Object.entries(factoryRecipes[b.recipe??"steel"].inputs)){
    const id=key as Commodity,missing=Math.ceil(q*3-n.stockpile![id]);if(missing<=0)continue;
    const quote=this.quote(nation,id,"buy",missing);
    if(!quote.error&&quote.total<=budget){this.trade(nation,id,"buy",missing);budget-=quote.total;}
   }
  }
 }
 annex(loser:string,victor:string){
  const a=this.state.nations[loser],b=this.state.nations[victor];
  for(const id of commodityIds){b.stockpile![id]+=a.stockpile![id];a.stockpile![id]=0;}
  a.commerceIncome=0;
 }
}
