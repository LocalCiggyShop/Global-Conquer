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
const MAX_STOCK=10000,MARKET_TARGET=2000;
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
 state.market??={stock:stockpile(MARKET_TARGET),trades:[]};
 for(const id of commodityIds)state.market.stock[id]=Math.min(20000,finite(state.market.stock[id],MARKET_TARGET));
 state.market.trades=Array.isArray(state.market.trades)?state.market.trades.slice(-24):[];
 state.market.recurring=(state.market.recurring??[]).filter(order=>Number.isInteger(order.id)&&state.nations[order.nation]&&Object.hasOwn(commodities,order.commodity)&&["buy","sell"].includes(order.side)&&Number.isInteger(order.quantity)&&order.quantity>=1&&order.quantity<=500).slice(0,24);
 for(const order of state.market.recurring){order.nextTick=Number.isFinite(order.nextTick)?Math.max(0,Math.ceil(order.nextTick)):Math.floor(state.elapsed)+TRADE_INTERVAL_TICKS;order.enabled=order.enabled!==false;}
 state.economyClock=finite(state.economyClock)%1;state.economyVersion=1;
}
export interface TradeQuote {unitPrice:number;total:number;error:string|null;}
export class IndustryEconomy {
 onRecurringSettlement:()=>void=()=>{};
 private aiAt:number;
 constructor(readonly state:Campaign){initializeEconomy(state);this.aiAt=state.elapsed+15;}
 income(id:string){return this.state.nations[id]?.commerceIncome??0;}
 factories(id:string){return this.state.buildings.filter(b=>b.nation===id&&b.type==="factory"&&b.hp>0);}
 private scarcity(stock:number){return Math.min(2,Math.max(0.5,1+(MARKET_TARGET-stock)/MARKET_TARGET*0.6));}
 quote(nation:string,commodity:Commodity,side:"buy"|"sell",quantity:number,partner="world"):TradeQuote{
  const fail=(error:string):TradeQuote=>({unitPrice:0,total:0,error});
  if(this.state.result!=="playing")return fail("Trade is unavailable after the campaign ends.");
  if(!Object.hasOwn(commodities,commodity)||!["buy","sell"].includes(side))return fail("Choose a valid commodity and trade direction.");
  if(!Number.isInteger(quantity)||quantity<1||quantity>500)return fail("Trade between 1 and 500 units at a time.");
  const n=this.state.nations[nation],other=this.state.nations[partner];
  if(!Object.hasOwn(this.state.nations,nation)||!n||n.defeated)return fail("Choose an active nation.");
  if(partner!=="world"&&(!Object.hasOwn(this.state.nations,partner)||!other||other.defeated||nation===partner||atWar(this.state,nation,partner)))return fail("Direct trade requires another peaceful nation.");
  const market=this.state.market!.stock,start=market[commodity];
  const end=partner==="world"?start+(side==="buy"?-quantity:quantity):start;
  const friendly=partner!=="world"&&allied(this.state,nation,partner);
  const spread=side==="buy"?(friendly?1.08:1.12):(friendly?0.92:0.88);
  // Average both ends of the order so a large order cannot pump its own resale price.
  const unitPrice=Math.round(commodities[commodity].price*(this.scarcity(start)+this.scarcity(end))/2*spread*100)/100;
  const total=Math.round(unitPrice*quantity*100)/100;
  const source=side==="buy"?(partner==="world"?market:other.stockpile!):n.stockpile!;
  const destination=side==="buy"?n.stockpile!:(partner==="world"?market:other.stockpile!);
  const buyer=side==="buy"?n:other;
  let error:string|null=null;
  if(source[commodity]+1e-8<quantity)error="The seller does not have enough stock.";
  else if(destination[commodity]+quantity>(partner==="world"&&side==="sell"?20000:MAX_STOCK))error="The buyer's warehouse is full.";
  else if(buyer&&buyer.credits+1e-8<total)error="The buyer does not have enough credits.";
  return {unitPrice,total,error};
 }
 trade(nation:string,commodity:Commodity,side:"buy"|"sell",quantity:number,partner="world"):string|null{
  const quote=this.quote(nation,commodity,side,quantity,partner);if(quote.error)return quote.error;
  const n=this.state.nations[nation],other=this.state.nations[partner],world=this.state.market!;
  const source=side==="buy"?(partner==="world"?world.stock:other.stockpile!):n.stockpile!;
  const destination=side==="buy"?n.stockpile!:(partner==="world"?world.stock:other.stockpile!);
  source[commodity]=Math.max(0,source[commodity]-quantity);destination[commodity]+=quantity;
  n.credits+=side==="buy"?-quote.total:quote.total;
  if(other)other.credits+=side==="buy"?quote.total:-quote.total;
  if(nation===this.state.nation){world.trades.push({time:this.state.elapsed,nation,partner,commodity,side,quantity,total:quote.total});world.trades=world.trades.slice(-24);}
  return null;
 }
 schedule(nation:string,commodity:Commodity,side:"buy"|"sell",quantity:number,partner="world"):string|null{
  const quote=this.quote(nation,commodity,side,quantity,partner);
  // Stock and money may be produced before the first delivery; configuration must be valid now.
  if(quote.error&&!['The seller does not have enough stock.',"The buyer's warehouse is full.",'The buyer does not have enough credits.'].includes(quote.error))return quote.error;
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
  if(b.enabled===false)return "Paused";const r=factoryRecipes[b.recipe??"steel"],n=this.state.nations[b.nation];
  if(n.credits<r.cost)return "Waiting for credits";
  const missing=Object.entries(r.inputs).filter(([key,q])=>n.stockpile![key as Commodity]+1e-8<q);
  if(missing.length)return "Needs "+missing.map(([key])=>commodities[key as Commodity].name).join(", ");
  const output=r.output.commodity==="supplies"?n.supplies:n.stockpile![r.output.commodity];
  return output+r.output.amount>(r.output.commodity==="supplies"?9999:MAX_STOCK)?"Output storage full":"Producing";
 }
 tick(dt:number){
  this.state.economyClock!+=dt;
  while(this.state.economyClock!>=1-1e-9){this.state.economyClock=Math.max(0,this.state.economyClock!-1);this.advanceSecond();}
 }
 private advanceSecond(){
  const s=this.state;
  for(const id of commodityIds){const v=s.market!.stock[id];s.market!.stock[id]=Math.max(0,Math.min(20000,v+(MARKET_TARGET-v)*0.002));}
  for(const b of s.buildings){
   const n=s.nations[b.nation];if(b.hp<=0||!n||n.defeated)continue;
   if(b.type==="mine"){
    const mineral=b.mineral??"gold";n.stockpile![mineral]=Math.min(MAX_STOCK,n.stockpile![mineral]+commodities[mineral].extraction*(1+n.industry*0.08));
   }else if(b.type==="factory"&&this.status(b)==="Producing"){
    const r=factoryRecipes[b.recipe??"steel"];b.progress=(b.progress??0)+1+n.industry*0.05;
    if(b.progress+1e-8>=r.duration){
     // Inputs and operating cost change together only when a complete batch is ready.
     for(const [key,amount] of Object.entries(r.inputs))n.stockpile![key as Commodity]=Math.max(0,n.stockpile![key as Commodity]-amount);
     n.credits-=r.cost;
     if(r.output.commodity==="supplies")n.supplies+=r.output.amount;else n.stockpile![r.output.commodity]+=r.output.amount;
     b.progress=Math.max(0,b.progress-r.duration);
    }
   }
  }
  for(const n of Object.values(s.nations)){
   n.commerceIncome=0;if(n.defeated||n.domesticSales===false)continue;
   const amount=Math.min(n.stockpile!.consumerGoods,0.2+n.industry*0.04);
   n.stockpile!.consumerGoods-=amount;n.commerceIncome=Math.round(amount*12*100)/100;n.credits+=n.commerceIncome;
  }
  this.settleRecurring();
  if(s.elapsed>=this.aiAt){this.aiAt=s.elapsed+15;for(const n of Object.values(s.nations))if(n.id!==s.nation&&!n.defeated)this.manageAI(n.id);}
 }
 private manageAI(nation:string){
  const n=this.state.nations[nation],desired=stockpile(30),factories=this.factories(nation);
  for(const b of factories)for(const [key,q] of Object.entries(factoryRecipes[b.recipe??"steel"].inputs))desired[key as Commodity]+=q*5;
  let budget=Math.min(300,Math.max(0,n.credits-500));
  for(const id of commodityIds){
   const spare=Math.floor(n.stockpile![id]-desired[id]);
   if(spare>=10)this.trade(nation,id,"sell",Math.min(25,spare));
  }
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
