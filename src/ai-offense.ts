import {techCombat} from "./technology";
import type {Campaign} from './types';
import {atWar,combatFunding} from './relations';
import {doctrines} from './doctrines';
import {ideologyOf,stabilityEffect} from './politics';
import {isShip} from './geopolitics';
export interface LandStrength {power:number;ready:number;count:number;}
/** One shared unit pass per AI order cycle; no navigation or frame-time scans. */
export function landStrengths(state:Campaign){
 const forces=new Map<string,LandStrength>();for(const n of Object.values(state.nations))forces.set(n.id,{power:n.reserves*45,ready:0,count:0});
 for(const u of state.units)if(u.hp>0&&!isShip(u.type)&&!u.embarkedOn){const force=forces.get(u.nation);if(!force)continue;const tech=techCombat(state.nations[u.nation],u.type),value=u.hp*tech.attack/tech.received*(u.type==='armor'?1.4:1)*(0.4+0.6*(u.organization??100)/100);force.power+=value;force.count++;if(!u.retreating&&(u.organization??100)>=40&&u.hp/u.maxHp>=.4)force.ready+=value;}
 for(const [id,f] of forces){const n=state.nations[id],d=doctrines[n.doctrine],factor=d.damage/d.received*combatFunding(n)*ideologyOf(n).damage*stabilityEffect(n);f.power*=factor;f.ready*=factor;}
 return forces;
}
export function canAiAdvance(state:Campaign,actor:string,target:string,forces:ReadonlyMap<string,LandStrength>,continuing=false){
 const n=state.nations[actor],enemy=state.nations[target],own=forces.get(actor),other=forces.get(target);
 if(!n||!enemy||n.defeated||enemy.defeated||!own||!other||!atWar(state,actor,target))return false;
 if(n.credits<Math.max(80,own.count*3)||n.supplies<12||(n.stability??70)<10||!own.ready)return false;
 const ratio=continuing?1:(n.personality==='expansionist'?1.1:n.personality==='diplomat'?1.4:1.25);
 return own.ready>=Math.max(30,other.power*Math.max(ratio,(n.stability??70)<25?2:0));
}
