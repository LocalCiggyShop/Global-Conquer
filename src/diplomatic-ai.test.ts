import {it,expect} from 'vitest';
import {createCampaign,Simulation} from './campaign';
import {createGrid} from './navigation';
import {adjustRelation} from './relations';
import {chooseAiAlly} from './ai-alliances';
import type {ContinentData} from './types';
const data:ContinentData={id:'test',bounds:[-64,-24,64,24],lakes:[],countries:['USA','RUS','CHN'].map((id,i)=>{const x=-60+i*40;return{id,name:id,population:20e6,bounds:[x,-20,x+40,20],polygons:[[[[x,-20],[x+40,-20],[x+40,20],[x,20]]]]};}) as ContinentData['countries']};
const grid=createGrid(data,96);
function fresh(){const sim=new Simulation(data,grid,createCampaign(data,grid,'USA'));for(const n of Object.values(sim.state.nations)){n.credits=5000;n.supplies=500;n.nextActionAt=1e9;}sim.state.affairs!.nextNewsAt=1e9;return sim;}
it('rejects new reports from or targeting conquered countries without side effects',()=>{
 const sim=fresh(),s=sim.state,n=s.nations.RUS;n.defeated=true;n.annexedBy='USA';const next=s.nextId,index=s.nations.USA.stockIndex;
 expect(sim.affairs.publish('RUS','election')).toBeNull();expect(sim.affairs.publish('USA','tension','RUS')).toBeNull();expect(s.affairs!.news).toHaveLength(0);expect(s.nextId).toBe(next);expect(s.nations.USA.stockIndex).toBe(index);
});
it('retires obsolete crises and prevents post-conquest escalation and random reporting',()=>{
 const sim=fresh(),s=sim.state,event=sim.affairs.publish('RUS','tension','USA')!;s.nations.RUS.annexedBy='USA';
 s.elapsed=60;sim.affairs.tick();expect(event.dismissed).toBe(true);expect(event.escalated).toBe(true);expect(s.affairs!.news.some(e=>e.kind==='nuclear')).toBe(false);
 for(let i=0;i<8;i++){s.affairs!.nextNewsAt=0;s.elapsed++;sim.affairs.tick();}
 expect(s.affairs!.news.filter(e=>e!==event).every(e=>e.nation!=='RUS'&&e.target!=='RUS')).toBe(true);
});
it('requires good relations and mutual strategic or economic usefulness for AI alliances',()=>{
 const sim=fresh(),s=sim.state;expect(chooseAiAlly(s,'RUS',['CHN'])).toBeNull();adjustRelation(s,'RUS','CHN',30);
 expect(chooseAiAlly(s,'RUS',['CHN'])).toBe('CHN');expect(chooseAiAlly(s,'RUS',[])).toBeNull();
 s.nations.RUS.defenseReadiness={level:1,neighbor:'USA',until:60,previousSpending:100,previousPriority:'balanced'};s.nations.CHN.defenseReadiness={...s.nations.RUS.defenseReadiness};expect(chooseAiAlly(s,'RUS',[])).toBe('CHN');
});
it('rejects threats, hostile ties, annexed candidates, and automatic player alliances',()=>{
 const sim=fresh(),s=sim.state;adjustRelation(s,'RUS','CHN',60);const e=sim.affairs.publish('RUS','tension','CHN')!;expect(chooseAiAlly(s,'RUS',['CHN'])).toBeNull();e.resolved=true;
 s.wars.push({a:'RUS',b:'USA',since:0});s.alliances!.push({a:'CHN',b:'USA',since:0});expect(chooseAiAlly(s,'RUS',['CHN'])).toBeNull();s.wars=[];s.alliances=[];s.nations.CHN.annexedBy='USA';expect(chooseAiAlly(s,'RUS',['CHN'])).toBeNull();
 adjustRelation(s,'RUS','USA',60);expect(chooseAiAlly(s,'RUS',['USA'])).toBeNull();expect(chooseAiAlly(s,'USA',['RUS'])).toBeNull();
});
it('forms an AI alliance through normal simulation decisions and preserves its cooldown',()=>{
 const sim=fresh(),s=sim.state,n=s.nations.RUS;adjustRelation(s,'RUS','CHN',30);n.nextActionAt=0;sim.step(1);
 expect(sim.allied('RUS','CHN')).toBe(true);expect(n.nextAllianceAt).toBe(26);n.nextActionAt=0;sim.step(1);expect(s.alliances).toHaveLength(1);expect(n.nextAllianceAt).toBe(26);expect(s.wars).toEqual([]);
});
