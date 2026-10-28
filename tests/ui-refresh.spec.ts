import {test,expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {gzipSync} from "node:zlib";
import {createCampaign,Simulation} from "../src/campaign";
import {createGrid} from "../src/navigation";
import {campaignSnapshot} from "../src/snapshot";
import type {ContinentData} from "../src/types";

test("desktop management, diplomacy, faster zoom and camera-synchronous map icons",async({page})=>{
 const data:ContinentData=JSON.parse(readFileSync(new URL("../public/data/europe.json",import.meta.url),"utf8"));
 const grid=createGrid(data),sim=new Simulation(data,grid,createCampaign(data,grid,"FIN"));
 sim.playerNation.credits=3826;sim.playerNation.supplies=4038;sim.playerNation.industry=5;
 for(const nation of Object.values(sim.state.nations))nation.nextActionAt=1e9;
 const errors:string[]=[];
 page.on("pageerror",e=>errors.push(e.message));
 page.on("console",m=>{if(m.type()==="error"&&/THREE|shader/i.test(m.text()))errors.push(m.text());});
 // Real geographic data, served directly to avoid Windows/WSL dev-network stalls.
 await page.route("**/data/europe.json.gz",route=>route.fulfill({body:gzipSync(JSON.stringify(data)),contentType:"application/gzip"}));
 await page.addInitScript(save=>localStorage.setItem("worldrts.campaigns.v2",JSON.stringify({europe:save})),campaignSnapshot(sim.state));
 await page.goto("/",{waitUntil:"domcontentloaded"});await expect(page.locator("#deploy-button")).toBeEnabled();
 await page.locator("#deploy-button").click();await page.waitForFunction(()=>window.__worldRTS?.mode==="play");
 await expect(page.locator("#nation-flag")).toHaveAttribute("src","/flags/fi.svg");
 await page.locator("#economy-tab").click();await expect(page.locator("#economy-controls")).toBeVisible();await page.locator("#army-tab").click();
 await expect(page.locator("#army-controls")).toBeVisible();await expect(page.locator("#economy-controls")).toBeHidden();
 await expect(page.locator('[data-train="infantry"]')).toBeVisible();
 const strip=await page.locator(".resource-bar").boundingBox();expect(strip!.y).toBe(0);expect(strip!.height).toBe(52);
 expect(await page.evaluate(()=>getComputedStyle(document.querySelector(".command-panel")!).backgroundColor)).toBe("rgb(20, 20, 22)");
 // Record the camera projection used when the labels clear/draw, then compare it
 // to the camera after each rendered frame. This catches frame-order and throttle drift.
 await page.evaluate(()=>{
  const w=window as any,city=w.__worldRTS.data.places.find((c:any)=>c.name==="Helsinki");
  w.__iconProbe={city,last:null};const original=CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect=function(...args:Parameters<typeof original>){
   if(this.canvas.classList.contains("city-overlay"))w.__iconProbe.last=w.__worldRTS.project(city.x,city.z);
   return original.apply(this,args);
  };
 });
 await page.keyboard.down("d");
 const gaps=await page.evaluate(async()=>{
  const gaps:number[]=[];for(let i=0;i<16;i++)await new Promise<void>(resolve=>requestAnimationFrame(()=>{
   const w=window as any,p=w.__iconProbe,current=w.__worldRTS.project(p.city.x,p.city.z);
   if(p.last)gaps.push(Math.hypot(p.last.x-current.x,p.last.y-current.y));resolve();
  }));return gaps;
 });await page.keyboard.up("d");
 expect(gaps.length).toBeGreaterThan(10);expect(Math.max(...gaps)).toBeLessThan(0.1);
 const scale=()=>page.evaluate(()=>{const a=window.__worldRTS.project(0,0),b=window.__worldRTS.project(1,0);return Math.abs(a.x-b.x);});
 const before=await scale();await page.mouse.move(850,400);await page.mouse.wheel(0,-100);await expect.poll(scale).toBeGreaterThan(before*1.08);const zoomRatio=(await scale())/before;
 await page.locator("#focus-button").evaluate((button:HTMLButtonElement)=>button.click());
 await page.screenshot({path:".cache/ui-refresh-play.png"});
 await page.locator("#diplomacy-button").click();await page.locator("#nation-search").fill("Norway");await page.locator('[data-nation="NOR"]').click();
 await expect(page.locator("#foreign-capital")).toHaveText("Oslo");await expect(page.locator(".selected-nation .country-flag")).toHaveAttribute("src","/flags/no.svg");
 const panel=await page.locator("#diplomacy-panel").boundingBox();expect(panel!.width).toBe(400);
 await expect(page.locator("#alliance-action")).toBeVisible();await expect(page.locator("#war-action")).toBeVisible();
 const intel=await page.locator("#recon-button").boundingBox();const footer=await page.locator(".diplomacy-actions").boundingBox();expect(intel!.y+intel!.height).toBeLessThan(footer!.y);
 await page.screenshot({path:".cache/ui-refresh-diplomacy.png"});
 await page.locator("#alliance-action").click();await expect(page.locator("#alliance-action")).toContainText("End alliance");
 await page.locator("#nation-search").fill("");await page.locator("#nation-filter").selectOption("allies");await expect(page.locator(".diplomacy-nation")).toHaveCount(1);
 await page.locator('[data-diplomacy-tab="rankings"]').click();await expect(page.locator("#ranking-table table")).toBeVisible();await expect(page.locator("#diplomacy-sidebar")).toBeHidden();
 await page.locator('[data-diplomacy-tab="nations"]').click();await page.locator("#diplomacy-close").click();
 expect(errors).toEqual([]);console.log(JSON.stringify({cameraIconMaxDriftPixels:Math.max(...gaps),zoomRatio}));
});
