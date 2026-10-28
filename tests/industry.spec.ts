import {test,expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {gzipSync} from "node:zlib";
import {createCampaign,Simulation} from "../src/campaign";
import {createGrid,cellPoint} from "../src/navigation";
import {campaignSnapshot} from "../src/snapshot";
import type {ContinentData} from "../src/types";

test("small models, live factory production, world/nation trade and saved stockpiles",async({page})=>{
 const data:ContinentData=JSON.parse(readFileSync(new URL("../public/data/europe.json",import.meta.url),"utf8"));
 const grid=createGrid(data),sim=new Simulation(data,grid,createCampaign(data,grid,"FRA"));
 sim.playerNation.credits=5000;sim.playerNation.supplies=500;sim.playerNation.domesticSales=false;
 for(const n of Object.values(sim.state.nations))n.nextActionAt=1e9;
 const capital=sim.playerNation.capital!;
 let factoryId:number|undefined;
 for(let i=0;i<grid.walkable.length;i++){
  if(!grid.walkable[i])continue;const p=cellPoint(grid,i),distance=Math.hypot(p[0]-capital[0],p[1]-capital[1]);
  if(distance>2&&distance<5&&!sim.placementError("factory",...p)){sim.build("factory",...p);factoryId=sim.state.buildings.at(-1)!.id;break;}
 }
 expect(factoryId).toBeDefined();
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error"&&/THREE|shader/i.test(m.text()))errors.push(m.text());});
 await page.route("**/data/europe.json.gz",route=>route.fulfill({body:gzipSync(JSON.stringify(data)),contentType:"application/gzip"}));
 await page.addInitScript(save=>{if(!localStorage.getItem("worldrts.campaigns.v2"))localStorage.setItem("worldrts.campaigns.v2",JSON.stringify({europe:save}));},campaignSnapshot(sim.state));
 await page.goto("/",{waitUntil:"domcontentloaded"});await expect(page.locator("#deploy-button")).toBeEnabled();await page.locator("#deploy-button").click();await page.waitForFunction(()=>window.__worldRTS?.mode==="play");
 expect(await page.evaluate(()=>(window.__worldRTS as any).modelScales)).toEqual({unit:0.5,building:0.32});
 await page.locator("#economy-tab").click();await page.locator("#industry-button").click();await expect(page.locator("#industry-panel")).toBeVisible();await expect(page.locator(".factory-card")).toHaveCount(1);
 const deposits=await page.evaluate(()=>window.__worldRTS.state.nodes.filter(n=>n.nation===window.__worldRTS.state.nation));
 expect(deposits.map(n=>n.mineral)).toEqual(sim.state.nodes.filter(n=>n.nation==="FRA").map(n=>n.mineral));
 await expect(page.locator('#deposit-list [data-deposit-locate="coal"]')).toBeEnabled();
 await expect.poll(()=>page.evaluate(()=>window.__worldRTS.state.nations.FRA.stockpile!.steel)).toBeGreaterThanOrEqual(3);
 await page.screenshot({path:".cache/industry-production.png"});
 await page.locator("#pause-button").click();expect(await page.evaluate(()=>window.__worldRTS.paused)).toBe(true);
 await page.locator('[data-economy-view="market"]').click();await page.locator("#trade-quantity").fill("5");
 const before=await page.evaluate(()=>window.__worldRTS.state.nations.FRA.stockpile!.copper);
 await page.locator('[data-trade-good="copper"][data-trade-side="buy"]').click();
 expect(await page.evaluate(()=>window.__worldRTS.state.nations.FRA.stockpile!.copper)).toBe(before);await page.locator("#pause-button").click();await expect.poll(()=>page.evaluate(()=>window.__worldRTS.state.nations.FRA.stockpile!.copper)).toBe(before+5);await page.locator("#pause-button").click();await expect(page.locator("#trade-history")).toContainText("Imported 5 Copper");
 await page.locator("#trade-partner").selectOption("DEU");await page.locator('[data-trade-good="copper"][data-trade-side="sell"]').click();
 await page.locator("#pause-button").click();await expect.poll(()=>page.evaluate(()=>window.__worldRTS.state.nations.FRA.stockpile!.copper)).toBe(before);await page.locator("#pause-button").click();await expect(page.locator("#trade-history")).toContainText("Germany");
 await page.locator("#trade-partner").selectOption("world");await page.screenshot({path:".cache/global-trade.png"});
 await page.locator("#trade-quantity").fill("0");await expect(page.locator('[data-trade-good="iron"][data-trade-side="buy"]')).toBeDisabled();
 await page.locator('[data-economy-view="production"]').click();await page.locator(`[data-factory-recipe="${factoryId}"]`).selectOption("consumer");
 await page.locator("#pause-button").click();await expect(page.locator("[data-factory-status]")).toContainText("Electronics");await page.locator("#pause-button").click();await page.locator(`[data-factory-toggle="${factoryId}"]`).click();await page.locator("#pause-button").click();await expect(page.locator("[data-factory-status]")).toHaveText("Paused");
 await page.locator("#industry-close").click();await page.screenshot({path:".cache/scaled-units-buildings.png"});
 await page.reload({waitUntil:"domcontentloaded"});await expect(page.locator("#deploy-button")).toBeEnabled();await page.locator("#deploy-button").click();await page.waitForFunction(()=>window.__worldRTS?.mode==="play");
 expect(await page.evaluate(()=>window.__worldRTS.state.nations.FRA.stockpile!.copper)).toBe(before);
 await page.locator("#economy-tab").click();await page.locator("#industry-button").click();await expect(page.locator(`[data-factory-recipe="${factoryId}"]`)).toHaveValue("consumer");await expect(page.locator("[data-factory-status]")).toHaveText("Paused");
 expect(await page.evaluate(()=>window.__worldRTS.state.market!.trades.length)).toBe(2);expect(errors).toEqual([]);
});
