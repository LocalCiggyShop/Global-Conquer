import {test,expect} from '@playwright/test';
import {gzipSync} from 'node:zlib';
import {createGrid} from '../src/navigation';
import {createCampaign,Simulation} from '../src/campaign';
import {campaignSnapshot} from '../src/snapshot';
import type {ContinentData} from '../src/types';
test('news drag, spending, shares and embassy controls',async({page})=>{
 const data:ContinentData={id:'europe',kmPerUnit:45,bounds:[-44,-24,44,24],lakes:[],countries:[
 {id:'RUS',name:'Russia',flagCode:'ru',population:20e6,bounds:[-40,-20,0,20],polygons:[[[[-40,-20],[0,-20],[0,20],[-40,20]]]]},
 {id:'USA',name:'United States',flagCode:'us',population:20e6,bounds:[0,-20,40,20],polygons:[[[[0,-20],[40,-20],[40,20],[0,20]]]]}]};
 const grid=createGrid(data),sim=new Simulation(data,grid,createCampaign(data,grid,'RUS'));
 sim.playerNation.credits=5000;sim.state.affairs!.nextNewsAt=1e9;for(const n of Object.values(sim.state.nations))n.nextActionAt=1e9;sim.affairs.publish('RUS','tension','USA');
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/data/europe.json.gz',r=>r.fulfill({body:gzipSync(JSON.stringify(data)),contentType:'application/gzip'}));
 await page.addInitScript(save=>localStorage.setItem('worldrts.campaigns.v2',JSON.stringify({europe:save})),campaignSnapshot(sim.state));
 await page.goto('/');await expect(page.locator('#deploy-button')).toBeEnabled();await page.locator('#deploy-button').click();await page.waitForFunction(()=>window.__worldRTS?.mode==='play');
 const news=page.locator('.news-modal');await expect(news).toBeVisible();await expect(news.locator('img')).toHaveAttribute('src','/flags/ru.svg');
 const before=(await news.boundingBox())!;await page.mouse.move(before.x+150,before.y+25);await page.mouse.down();await page.mouse.move(before.x+230,before.y+60);await page.mouse.up();expect((await news.boundingBox())!.x).toBeGreaterThan(before.x+60);
 await page.locator('#affairs-button').click();await expect(page.locator('.affairs-panel')).toBeVisible();
 await page.locator('#military-spending').evaluate(e=>{(e as HTMLInputElement).value='150';e.dispatchEvent(new Event('input'));e.dispatchEvent(new Event('change'));});
 await page.waitForFunction(()=>window.__worldRTS.state.nations.RUS.militarySpending===150);
 await page.locator('[data-shares="buy"]').click();await page.waitForFunction(()=>window.__worldRTS.state.nations.RUS.shares===1);
 await page.locator('[data-resolve]').click();await page.waitForFunction(()=>window.__worldRTS.state.affairs!.news[0].resolved===true);await news.locator('[data-dismiss]').click();await expect(news).toHaveCount(0);
 await page.locator('[data-close]').click();await page.locator('[data-workspace="diplomacy"]').click();await page.locator('[data-nation="USA"]').click();await expect(page.locator('#embassy-button')).toBeVisible();await page.locator('#embassy-button').click();await page.waitForFunction(()=>window.__worldRTS.state.affairs!.embassies.length===1);
 expect(errors).toEqual([]);
});
