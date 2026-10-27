import type {Campaign} from "./types";
export const SECONDS_PER_TICK=1;
export const TICKS_PER_DAY=5;
export const TRADE_INTERVAL_TICKS=5*TICKS_PER_DAY;
export function calendar(elapsed:number,phase=0){
 const ticks=Math.max(0,Math.floor(elapsed)),completed=ticks%TICKS_PER_DAY;
 return {ticks,day:Math.floor(ticks/TICKS_PER_DAY)+1,tick:completed+1,completed,
  progress:(completed+Math.min(1,Math.max(0,phase)))/TICKS_PER_DAY};
}
/** Preserve old progress while giving all simulation systems one integral clock. */
export function initializeClock(state:Campaign){
 const elapsed=Number.isFinite(state.elapsed)?Math.max(0,state.elapsed):0;
 if(state.clockVersion!==1){state.tickPhase=elapsed%1;state.economyClock=0;}
 state.elapsed=Math.floor(elapsed);
 state.tickPhase=Number.isFinite(state.tickPhase)?Math.min(1-Number.EPSILON,Math.max(0,state.tickPhase!)):0;
 state.clockVersion=1;state.pendingCommands??=[];
}
