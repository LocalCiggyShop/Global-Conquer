import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createGrid,cellPoint} from '../src/navigation';
import {landComponents} from '../src/strategy';
import {createCampaign,Simulation} from '../src/campaign';
import {campaignSnapshot} from '../src/snapshot';
import type {ContinentData} from '../src/types';
test('Denmark infantry movement and reference-style command panels',async({page})=>{
 const data:ContinentData=JSON.parse(readFileSync(new URL('../public/data/europe.json',import.meta.url),'utf8')),grid=createGrid(data),sim=new Simulation(data,grid,createCampaign(data,grid,'DNK'));
 const owner=data.countries.findIndex(c=>c.id==='DNK'),groups=landComponents(grid),byGroup=new Map<number,number[]>();
 for(let i=0;i<grid.owners.length;i++)if(grid.owners[i]===owner&&grid.walkable[i]){const a=byGroup.get(groups[i])??[];a.push(i);byGroup.set(groups[i],a);}
 const main=[...byGroup.values()].sort((a,b)=>b.length-a.length)[0],from=cellPoint(grid,main[0]),to=cellPoint(grid,main.at(-1)!);
 sim.playerUnits[0].x=from[0];sim.playerUnits[0].z=from[1];for(const n of Object.values(sim.state.nations))n.nextActionAt=1e9;
 const id=sim.playerUnits[0].id,errors:string[]=[];page.on('pageerror',e=>{errors.push(e.message);console.log('BROWSER',e.message);});page.on('console',m=>{if(m.type()==='error')console.log(m.text());});
 await page.route('**/data/europe.json.gz',r=>r.fulfill({body:gzipSync(JSON.stringify(data)),contentType:'application/gzip'}));
 await page.addInitScript(save=>localStorage.setItem('worldrts.campaigns.v2',JSON.stringify({europe:save})),campaignSnapshot(sim.state));
 await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('#deploy-button')).toBeEnabled();await page.screenshot({path:'.cache/command-overview.png'});
 await page.locator('#deploy-button').click();await page.waitForFunction(()=>window.__worldRTS?.mode==='play');
 await expect(page.locator('.command-rail')).toBeVisible();await expect(page.locator('#army-controls')).toBeVisible();
 await page.keyboard.press('q');const target=await page.evaluate(p=>window.__worldRTS.project(p[0],p[1]),to);
 await page.mouse.click(target.x,target.y,{button:'right'});
 await expect.poll(()=>page.evaluate(({id,from})=>{const u=window.__worldRTS.state.units.find(u=>u.id===id)!;return Math.hypot(u.x-from[0],u.z-from[1]);},{id,from})).toBeGreaterThan(0.5);
 await page.screenshot({path:'.cache/command-army.png'});
 await page.locator('[data-workspace="diplomacy"]').click();await page.locator('#nation-search').fill('Germany');await page.locator('[data-nation="DEU"]').click();
 const box=await page.locator('#diplomacy-panel').boundingBox();expect(box!.width).toBe(400);await page.screenshot({path:'.cache/command-diplomacy.png'});
 await page.locator('[data-workspace="economy"]').click();await expect(page.locator('#economy-controls')).toBeVisible();expect(errors).toEqual([]);
});
