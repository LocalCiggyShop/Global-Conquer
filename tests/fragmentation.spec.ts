import {test,expect} from '@playwright/test';
import {gzipSync} from 'node:zlib';
import {Simulation,createCampaign} from '../src/campaign';
import {createGrid} from '../src/navigation';
import {campaignSnapshot} from '../src/snapshot';
import type {ContinentData} from '../src/types';
test.use({actionTimeout:10000});
test('live breakup renders new governments and preserves them when deploying a saved game',async({page})=>{
 test.setTimeout(90000);
 const data:ContinentData={id:'europe',kmPerUnit:45,bounds:[-44,-24,44,24],lakes:[],countries:[{id:'DEU',name:'Germany',flagCode:'de',population:20e6,bounds:[-40,-20,0,20],polygons:[[[[-40,-20],[0,-20],[0,20],[-40,20]]]]},{id:'FRA',name:'France',flagCode:'fr',population:20e6,bounds:[0,-20,40,20],polygons:[[[[0,-20],[40,-20],[40,20],[0,20]]]]}]};
 const grid=createGrid(data),sim=new Simulation(data,grid,createCampaign(data,grid,'DEU'));sim.state.elapsed=4;for(const n of Object.values(sim.state.nations)){n.nextActionAt=1e9;n.credits=5000;n.supplies=500;}sim.state.affairs!.nextNewsAt=1e9;const n=sim.state.nations.FRA;n.stability=0;n.lastUnrestAt=0;n.instabilitySince=-150;
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/data/europe.json.gz',r=>r.fulfill({body:gzipSync(JSON.stringify(data)),contentType:'application/gzip'}));
 await page.addInitScript(save=>{if(!localStorage.getItem('worldrts.campaigns.v2'))localStorage.setItem('worldrts.campaigns.v2',JSON.stringify({europe:save}));},campaignSnapshot(sim.state));
 const deploy=async()=>{await expect(page.locator('#deploy-button')).toBeEnabled();await page.locator('#deploy-button').click();await page.waitForFunction(()=>window.__worldRTS?.mode==='play',null,{timeout:30000});};
 await page.goto('/');await deploy();await page.waitForFunction(()=>Object.values(window.__worldRTS.state.nations).some(n=>n.breakaway),null,{timeout:15000});
 const child=await page.evaluate(()=>Object.values(window.__worldRTS.state.nations).find(n=>n.breakaway)!);await page.locator('#diplomacy-button').click();await page.locator('#nation-search').fill(child.breakaway!.name);await expect(page.locator(`[data-nation="${child.id}"]`)).toBeVisible();await page.locator(`[data-nation="${child.id}"]`).click();await expect(page.locator('#nation-details h3')).toHaveText(child.breakaway!.name);
 await page.locator('#game-menu-button').click();await page.locator('#menu-world').click();await page.reload();await deploy();expect(await page.evaluate(id=>window.__worldRTS.state.nations[id]?.breakaway?.parent,child.id)).toBe('FRA');await page.locator('#diplomacy-button').click();await page.locator('#nation-search').fill(child.breakaway!.name);await expect(page.locator(`[data-nation="${child.id}"]`)).toBeVisible();await page.screenshot({path:'.cache/fragmentation.png'});expect(errors).toEqual([]);
});
