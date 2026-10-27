import {test,expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {createCampaign,Simulation} from "../src/campaign";
import {createGrid} from "../src/navigation";
import {campaignSnapshot} from "../src/snapshot";
import type {ContinentData} from "../src/types";

test("responsive deployment progress, real ports, cities and smooth occupation borders",async({page})=>{
 page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(60000);
 const data:ContinentData=JSON.parse(readFileSync(new URL("../public/data/europe.json",import.meta.url),"utf8")),grid=createGrid(data),sim=new Simulation(data,grid,createCampaign(data,grid,"FRA"));
 const city=sim.state.cities!.find((c)=>c.nation==="SVK"&&c.capital)!;
 sim.state.units=sim.state.units.filter((u)=>u.nation!=="SVK");
 const invader=sim.playerUnits[0];invader.x=city.x;invader.z=city.z;
 for(const n of Object.values(sim.state.nations))n.nextActionAt=1e9;
 sim.declareWar("SVK");
 await page.addInitScript((state)=>{
  localStorage.setItem("worldrts.campaigns.v2",JSON.stringify({europe:state}));

 },campaignSnapshot(sim.state));
 const errors:string[]=[];page.on("pageerror",(e)=>{errors.push(e.message);console.log("BROWSER",e.message);});page.on("console",(m)=>{if(m.type()==="error")console.log("CONSOLE",m.text());});
 await page.goto("/",{waitUntil:"domcontentloaded"});await expect(page.locator("#deploy-button")).toBeEnabled({timeout:45000});
 await page.evaluate(()=>{const probe={frames:[] as {time:number;gap:number}[],tasks:[] as {time:number;duration:number}[]};(window as any).__probe=probe;let previous=performance.now();setInterval(()=>{const now=performance.now();probe.frames.push({time:now,gap:now-previous});previous=now;},25);new PerformanceObserver((list)=>{for(const e of list.getEntries())probe.tasks.push({time:e.startTime,duration:e.duration});}).observe({type:"longtask",buffered:true});});
 await page.locator("#deploy-button").click();await expect(page.locator("#deployment-progress")).toBeVisible();
 const before=await page.evaluate(()=>(window as any).__probe.frames.length);
 await page.waitForFunction(()=>window.__worldRTS?.mode==="countdown",null,{timeout:60000});
 expect(await page.evaluate(()=>(window as any).__probe.frames.length)).toBeGreaterThan(before+3);
 await page.waitForFunction(()=>window.__worldRTS?.mode==="play");
 const start=await page.evaluate(()=>performance.now());
 await expect.poll(()=>page.evaluate(()=>window.__worldRTS.state.nations.SVK.annexedBy)).toBe("FRA");
 await page.waitForTimeout(800);
 expect(await page.evaluate(()=>window.__worldRTS.occupationInstances)).toBe(0);expect(await page.evaluate(()=>window.__worldRTS.seaControlInstances)).toBe(0);
 await expect(page.locator("#nation-flag")).toHaveAttribute("src","/flags/fr.svg");
 await page.locator("#diplomacy-button").click();await page.locator("#nation-search").fill("Slovakia");await page.locator('[data-nation="SVK"]').click();await page.locator("#view-nation").click();await page.locator("#diplomacy-close").click();
 await page.mouse.move(800,500);await page.mouse.wheel(0,-4000);
 await expect.poll(()=>page.evaluate(()=>window.__worldRTS.visibleCityNames)).toContain("Bratislava");
 await page.screenshot({path:".cache/occupation-slovakia-fixed.png"});
 await page.locator("#ports-button").click();await expect(page.locator("#dialog-content")).toContainText("Cherbourg");
 const metrics=await page.evaluate((start)=>{const p=(window as any).__probe,frames=p.frames.filter((f:any)=>f.time>=start);return {captureFrames:frames.length,maxFrameGapMs:Math.round(Math.max(...frames.map((f:any)=>f.gap))),longTasks:p.tasks.filter((t:any)=>t.time>=start),runtime:window.__worldRTS.runtimeTimings,render:window.__worldRTS.renderTimings,deployment:window.__worldRTS.deploymentTimings,places:window.__worldRTS.data.places.length,ports:window.__worldRTS.data.ports.length};},start);
 console.log(JSON.stringify(metrics));expect(errors).toEqual([]);
});
