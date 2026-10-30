import type {Building} from './types';
export function buildingBounds(type:Building['type'],x:number,z:number){return {left:x-.336,right:x+.336,top:z-(type==='dock'?.88:.336),bottom:z+.336};}
export function buildingsOverlap(type:Building['type'],x:number,z:number,b:Building){const a=buildingBounds(type,x,z),other=buildingBounds(b.type,b.x,b.z),gap=.025;return a.left<other.right+gap&&a.right>other.left-gap&&a.top<other.bottom+gap&&a.bottom>other.top-gap;}
