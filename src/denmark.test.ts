import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createGrid,findPath,cellAt} from './navigation';
import {createCampaign} from './campaign';
import {landComponents} from './strategy';
import type {ContinentData} from './types';
it('preserves navigable coastal land in Denmark without opening water',()=>{
 const data:ContinentData=JSON.parse(readFileSync(new URL('../public/data/europe.json',import.meta.url),'utf8')),grid=createGrid(data),owner=data.countries.findIndex(c=>c.id==='DNK');
 const land=Array.from(grid.owners.keys()).filter(i=>grid.owners[i]===owner),open=land.filter(i=>grid.walkable[i]);
 console.log({denmarkLand:land.length,walkable:open.length,cell:grid.cell});
 expect(open.length).toBe(land.length);
 const groups=landComponents(grid),largest=new Map<number,number[]>();for(const i of open){const list=largest.get(groups[i])??[];list.push(i);largest.set(groups[i],list);}
 const mainland=[...largest.values()].sort((a,b)=>b.length-a.length)[0];expect(mainland.length).toBeGreaterThan(2);
 const mask=grid.walkable.map((v,i)=>v&&grid.owners[i]===owner?1:0);const a=mainland[0],b=mainland.at(-1)!;
 expect(findPath(grid,mask,a,b).length).toBeGreaterThan(0);expect(Array.from(grid.walkable).every((v,i)=>!v||grid.owners[i]>=0)).toBe(true);
});

it('keeps Danish recruits on the same landmass as their headquarters',()=>{
 const data:ContinentData=JSON.parse(readFileSync(new URL('../public/data/europe.json',import.meta.url),'utf8')),grid=createGrid(data),state=createCampaign(data,grid,'DNK'),groups=landComponents(grid),hq=state.nations.DNK.capital!;
 expect(state.units.filter(u=>u.nation==='DNK').length).toBeGreaterThan(0);
 for(const u of state.units.filter(u=>u.nation==='DNK'))expect(groups[cellAt(grid,u.x,u.z)]).toBe(groups[cellAt(grid,...hq)]);
});
