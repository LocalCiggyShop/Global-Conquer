import {test,expect} from '@playwright/test';
import {gzipSync} from 'node:zlib';
import {createGrid} from '../src/navigation';
import {createCampaign,Simulation} from '../src/campaign';
import {campaignSnapshot} from '../src/snapshot';
import type {ContinentData,Unit} from '../src/types';
test('stack rendering and selection, flag government controls and formation',async({page})=>{
 const data:ContinentData={id:'europe',kmPerUnit:45,bounds:[-44,-24,44,24],lakes:[],countries:[{id:'DEU',name:'Germany',flagCode:'de',population:20e6,bounds:[-40,-20,0,20],polygons:[[[[-40,-20],[0,-20],[0,20],[-40,20]]]]},{id:'AUT',name:'Austria',flagCode:'at',population:20e6,bounds:[0,-20,40,20],polygons:[[[[0,-20],[40,-20],[40,20],[0,20]]]]}]};
 const grid=createGrid(data),sim=new Simulation(data,grid,createCampaign(data,grid,'DEU'));sim.territory.annex('AUT','DEU');sim.playerNation.credits=5000;sim.playerNation.politicalPower=250;sim.state.affairs!.nextNewsAt=1e9;for(const n of Object.values(sim.state.nations))n.nextActionAt=1e9;
 sim.state.units=Array.from({length:6},()=>({id:sim.state.nextId++,nation:'DEU',team:'player',type:'infantry',x:-15,z:0,hp:90,maxHp:90,path:[],cooldown:0,order:0} as Unit));
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/data/europe.json.gz',r=>r.fulfill({body:gzipSync(JSON.stringify(data)),contentType:'application/gzip'}));await page.addInitScript(save=>localStorage.setItem('worldrts.campaigns.v2',JSON.stringify({europe:save})),campaignSnapshot(sim.state));
 await page.goto('/');await expect(page.locator('#deploy-button')).toBeEnabled();await page.locator('#deploy-button').click();await page.waitForFunction(()=>window.__worldRTS?.mode==='play'&&window.__worldRTS.state.elapsed>=1);await page.locator('[data-workspace="map"]').click();
 await expect.poll(()=>page.evaluate(()=>window.__worldRTS.visibleUnitIds.length)).toBe(2);
 const point=await page.evaluate(()=>{const units=window.__worldRTS.state.units,u=units.find(u=>units.filter(o=>Math.hypot(o.x-u.x,o.z-u.z)<0.2).length===5)!;return window.__worldRTS.project(u.x,u.z);});await page.mouse.click(point.x,point.y);await expect(page.locator('#selection-title')).toContainText('5 formations');await expect(page.locator('#selection-title')).toContainText('5,000');
 await page.locator('#nation-flag').click();await expect(page.locator('.nation-government')).toBeVisible();await expect(page.locator('[data-form="german-reich"]')).toBeDisabled();await page.locator('[data-ideology="nationalism"]').click();await page.locator('[data-change-ideology]').click();await page.waitForFunction(()=>window.__worldRTS.state.nations.DEU.ideology==='nationalism');
 await page.locator('[data-civic="welfare"]').click();await page.waitForFunction(()=>window.__worldRTS.state.nations.DEU.civicPolicy==='welfare');await expect(page.locator('[data-form="german-reich"]')).toBeDisabled();await expect(page.locator('#play-nation')).toHaveText('Germany');await page.screenshot({path:'.cache/nations-government.png'});expect(errors).toEqual([]);
});
