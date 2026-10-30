import {test,expect} from '@playwright/test';
import {gzipSync} from 'node:zlib';
import {createGrid} from '../src/navigation';
import {createCampaign,Simulation} from '../src/campaign';
import {campaignSnapshot} from '../src/snapshot';
import type {ContinentData,Unit} from '../src/types';

test('prepared real models load in play mode with bounded detail and animation',async({page})=>{
 test.setTimeout(60000);
 const data:ContinentData={id:'europe',bounds:[-24,-24,24,24],lakes:[],countries:[{id:'DEU',name:'Germany',flagCode:'de',population:20e6,bounds:[-20,-20,20,20],polygons:[[[[-20,-20],[20,-20],[20,20],[-20,20]]]]}],cities:[{name:'Test capital',nation:'DEU',capital:true,population:1e6,x:0,z:0}]};
 const grid=createGrid(data),sim=new Simulation(data,grid,createCampaign(data,grid,'DEU'));
 sim.playerNation.nextActionAt=1e9;sim.state.affairs!.nextNewsAt=1e9;
 sim.state.units=Array.from({length:30},(_,i)=>({id:sim.state.nextId++,nation:'DEU',team:'player',type:'infantry',x:(i%6-2.5)*.8,z:(Math.floor(i/6)-2)*.8,hp:90,maxHp:90,path:[],cooldown:0,order:0,stackSeparated:true} as Unit));
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='warning'&&/Unit model rejected|Unable to load .* model|THREE.PropertyBinding/.test(m.text()))errors.push(m.text());});
 await page.route('**/data/europe.json.gz',r=>r.fulfill({body:gzipSync(JSON.stringify(data)),contentType:'application/gzip'}));
 await page.addInitScript(s=>localStorage.setItem('worldrts.campaigns.v2',JSON.stringify({europe:s})),campaignSnapshot(sim.state));
 await page.goto('/');await expect(page.locator('#deploy-button')).toBeEnabled();await page.locator('#deploy-button').click();
 await page.waitForFunction(()=>window.__worldRTS?.mode==='play');await page.locator('[data-workspace="map"]').click();
 await page.waitForFunction(()=>window.__worldRTS.modelAssets?.loaded===4);
 await page.mouse.move(700,450);await page.mouse.wheel(0,-2000);
 await page.waitForFunction(()=>window.__worldRTS.modelAssets?.animated>0);
 const stats=await page.evaluate(()=>({assets:window.__worldRTS.modelAssets,render:window.__worldRTS.renderer.render,timings:window.__worldRTS.runtimeTimings}));
 expect(stats.assets.detailed).toBeGreaterThan(0);expect(stats.assets.detailed).toBeLessThanOrEqual(24);
 expect(stats.assets.animated).toBeLessThanOrEqual(12);
 expect(stats.assets.trianglesPerModel).toEqual({infantry:11128,armor:15237,frigate:4650,transport:926});
 await page.locator('#pause-button').click();await page.waitForFunction(()=>window.__worldRTS.paused);
 const paused=await page.evaluate(()=>window.__worldRTS.state.units.map(u=>[u.x,u.z]));
 const frameTimes=await page.evaluate(async()=>{
  const samples:number[]=[];let last=performance.now();
  for(let i=0;i<90;i++){const now=await new Promise<number>(resolve=>requestAnimationFrame(resolve));if(i>10)samples.push(now-last);last=now;}
  samples.sort((a,b)=>a-b);return {medianMs:samples[Math.floor(samples.length*.5)],p95Ms:samples[Math.floor(samples.length*.95)]};
 });
 await page.screenshot({path:'.cache/unit-models-game.png'});
 expect(await page.evaluate(()=>window.__worldRTS.state.units.map(u=>[u.x,u.z]))).toEqual(paused);
 console.log('Real-model rendering diagnostics:',JSON.stringify({...stats,frameTimes}));expect(errors).toEqual([]);
});
