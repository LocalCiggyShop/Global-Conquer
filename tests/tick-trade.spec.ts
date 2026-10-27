import {test,expect} from "@playwright/test";
import {gzipSync} from "node:zlib";
import {createCampaign,Simulation} from "../src/campaign";
import {createGrid} from "../src/navigation";
import {campaignSnapshot} from "../src/snapshot";
import type {ContinentData} from "../src/types";
const data:ContinentData={id:"europe",bounds:[-54,-24,54,24],lakes:[],countries:[
 {id:"FRA",name:"France",flagCode:"fr",population:40_000_000,bounds:[-48,-18,0,18],polygons:[[[[-48,-18],[0,-18],[0,18],[-48,18]]]]},
 {id:"DEU",name:"Germany",flagCode:"de",population:45_000_000,bounds:[0,-18,48,18],polygons:[[[[0,-18],[48,-18],[48,18],[0,18]]]]},
]};

test("real-time day progress, queued trades, recurring five-day delivery and reload",async({page})=>{
 const grid=createGrid(data),sim=new Simulation(data,grid,createCampaign(data,grid,"FRA"));sim.playerNation.credits=5000;sim.playerNation.domesticSales=false;
 for(const n of Object.values(sim.state.nations))n.nextActionAt=1e9;
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 await page.route("**/data/europe.json.gz",route=>route.fulfill({body:gzipSync(JSON.stringify(data)),contentType:"application/gzip"}));
 await page.addInitScript(save=>{if(!localStorage.getItem("worldrts.campaigns.v2"))localStorage.setItem("worldrts.campaigns.v2",JSON.stringify({europe:save}));},campaignSnapshot(sim.state));
 await page.goto("/",{waitUntil:"domcontentloaded"});await expect(page.locator("#deploy-button")).toBeEnabled();await page.locator("#deploy-button").click();await page.waitForFunction(()=>window.__worldRTS?.mode==="play");
 await expect(page.locator("#operation-time")).toHaveText("Day 1");await expect(page.locator("#game-tick")).toContainText("/ 5");
 await page.locator("#pause-button").click();const frozen=await page.evaluate(()=>({elapsed:window.__worldRTS.state.elapsed,phase:window.__worldRTS.state.tickPhase}));
 await page.locator("#industry-button").click();await page.locator('[data-economy-view="market"]').click();await page.locator("#trade-quantity").fill("5");
 const initial=await page.evaluate(()=>window.__worldRTS.state.nations.FRA.stockpile!.copper);
 await page.locator('[data-trade-good="copper"][data-trade-side="buy"]').click();
 expect(await page.evaluate(()=>window.__worldRTS.state.nations.FRA.stockpile!.copper)).toBe(initial);await expect(page.locator("#pending-trade-note")).toContainText("Resume");
 await page.waitForTimeout(1200);expect(await page.evaluate(()=>({elapsed:window.__worldRTS.state.elapsed,phase:window.__worldRTS.state.tickPhase}))).toEqual(frozen);
 await page.locator("#trade-timing").selectOption("recurring");await page.locator("#trade-quantity").fill("2");await page.locator('[data-trade-good="copper"][data-trade-side="buy"]').click();
 const due=await page.evaluate(()=>window.__worldRTS.state.market!.recurring![0].nextTick);expect(due).toBe(frozen.elapsed+25);await expect(page.locator("#recurring-orders")).toContainText("every 5 days");
 await page.locator("#pause-button").click();const started=Date.now();
 await expect.poll(()=>page.evaluate(()=>window.__worldRTS.state.nations.FRA.stockpile!.copper)).toBe(initial+5);
 await page.waitForFunction(tick=>window.__worldRTS.state.elapsed===tick,due-1,{timeout:35000});
 expect(await page.evaluate(()=>window.__worldRTS.state.nations.FRA.stockpile!.copper)).toBe(initial+5);
 await expect.poll(()=>page.evaluate(()=>window.__worldRTS.state.nations.FRA.stockpile!.copper),{timeout:5000}).toBe(initial+7);
 const elapsedWall=Date.now()-started;expect(elapsedWall).toBeGreaterThan(23000);expect(elapsedWall).toBeLessThan(29000);
 await expect(page.locator("#recurring-orders")).toContainText("Completed");await expect(page.locator("#operation-time")).toHaveText(`Day ${Math.floor(due/5)+1}`);
 await page.locator("#pause-button").click();await page.screenshot({path:".cache/tick-calendar-trade.png"});
 const next=await page.evaluate(()=>window.__worldRTS.state.market!.recurring![0].nextTick);expect(next).toBe(due+25);
 await page.reload({waitUntil:"domcontentloaded"});await expect(page.locator("#deploy-button")).toBeEnabled();await page.locator("#deploy-button").click();await page.waitForFunction(()=>window.__worldRTS?.mode==="play");
 expect(await page.evaluate(()=>window.__worldRTS.state.market!.trades.length)).toBe(2);expect(await page.evaluate(()=>window.__worldRTS.state.market!.recurring![0].nextTick)).toBe(next);
 await page.locator("#industry-button").click();await page.locator('[data-economy-view="market"]').click();await page.locator("[data-recurring-toggle]").click();await expect(page.locator("#recurring-orders")).toContainText("Paused");
 await page.locator("[data-recurring-toggle]").click();await expect(page.locator("#recurring-orders")).toContainText("Next:");await page.locator("[data-recurring-cancel]").click();await expect(page.locator(".recurring-order")).toHaveCount(0);
 expect(errors).toEqual([]);console.log(JSON.stringify({ticksPerDay:5,deliveryIntervalTicks:25,measuredDeliveryMilliseconds:elapsedWall}));
});
