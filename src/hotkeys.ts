export const hotkeyActions=[
 {id:'move',label:'Move',selector:'#move-button',key:'KeyM'},
 {id:'attackMove',label:'Attack move',selector:'#attack-move-button',key:'KeyJ'},
 {id:'hold',label:'Hold position',selector:'#hold-button',key:'KeyH'},
 {id:'stop',label:'Stop',selector:'#stop-button',key:'KeyX'},
 {id:'merge',label:'Merge formations',selector:'#merge-button',key:'KeyG'},
 {id:'split',label:'Split stack',selector:'#split-button',key:'KeyV'},
 {id:'frontline',label:'Frontline',selector:'#frontline-button',key:'KeyR'},
 {id:'fallback',label:'Fallback line',selector:'#fallback-button',key:''},
 {id:'embark',label:'Board transport',selector:'#embark-button',key:'KeyB'},
 {id:'land',label:'Land troops',selector:'#land-button',key:'KeyL'},
 {id:'selectAll',label:'Select all formations',selector:'#select-all-button',key:'KeyQ'},
 {id:'inspect',label:'Inspect selection',selector:'#inspect-button',key:'KeyI'},
 {id:'leaders',label:'Military leaders',selector:'#leaders-button',key:'KeyC'},
 {id:'diplomacy',label:'Diplomacy',selector:'#diplomacy-button',key:'KeyE'},
 {id:'economy',label:'Economy',selector:'[data-workspace="economy"]',key:'KeyO'},
 {id:'government',label:'Government',selector:'[data-workspace="government"]',key:'KeyP'},
 {id:'news',label:'News',selector:'#affairs-button',key:'KeyN'},
 {id:'technology',label:'Technology tree',selector:'#technology-button',key:'KeyY'},
 {id:'objectives',label:'Campaign objectives',selector:'#objectives-button',key:'KeyT'},
 {id:'army',label:'Forces',selector:'[data-workspace="army"]',key:'KeyU'},
 {id:'map',label:'Map workspace',selector:'[data-workspace="map"]',key:'KeyZ'},
 {id:'focus',label:'Focus headquarters',selector:'#focus-button',key:'KeyF'},
 {id:'frame',label:'Frame continent',selector:'#frame-button',key:'Home'},
 {id:'pause',label:'Pause / resume',selector:'#pause-button',key:'Space'},
 {id:'politicalMap',label:'Political map',selector:'[data-map-mode="political"]',key:'F1'},
 {id:'militaryMap',label:'Military map',selector:'[data-map-mode="military"]',key:'F2'},
 {id:'supplyMap',label:'Supply map',selector:'[data-map-mode="supply"]',key:'F3'},
 {id:'resourcesMap',label:'Resources map',selector:'[data-map-mode="resources"]',key:'F4'},
 {id:'settings',label:'Settings',selector:'#menu-settings',key:'F10'},
 {id:'infantry',label:'Train infantry',selector:'[data-train="infantry"]',key:''},
 {id:'armor',label:'Train armor',selector:'[data-train="armor"]',key:''},
 {id:'frigate',label:'Train frigate',selector:'[data-train="frigate"]',key:''},
 {id:'transport',label:'Train transport',selector:'[data-train="transport"]',key:''},
 {id:'factory',label:'Build factory',selector:'#build-factory',key:''},
 {id:'extractor',label:'Build extractor',selector:'[data-build="mine"]',key:''},
 {id:'barracks',label:'Build barracks',selector:'[data-build="barracks"]',key:''},
 {id:'depot',label:'Build supply depot',selector:'[data-build="depot"]',key:''},
] as const;
export type HotkeyAction=typeof hotkeyActions[number]['id'];
export const keyLabel=(code:string)=>code.startsWith('Key')?code.slice(3):code.startsWith('Digit')?code.slice(5):code==='Space'?'Space':code||'Unassigned';
const reserved=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Escape','Tab','Enter','ShiftLeft','ShiftRight','ControlLeft','ControlRight','AltLeft','AltRight','MetaLeft','MetaRight']);
export function validHotkey(code:string){return code===''||(!reserved.has(code)&&!/^Digit[1-9]$/.test(code)&&/^(Key[A-Z]|Digit0|F([1-9]|1[0-2])|Space|Home|End|Insert|Backquote|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Minus|Equal)$/.test(code));}
export function defaults(){return Object.fromEntries(hotkeyActions.map(a=>[a.id,a.key])) as Record<HotkeyAction,string>;}
/** Single validated binding table; saved per device independently of campaign saves. */
export class Hotkeys {
 private bindings=defaults();
 private dialog=document.createElement('dialog');
 private capture?:HotkeyAction;
 private storageKey='global-conquer.hotkeys.v1';
 constructor(private parent:HTMLElement,private notify:(message:string)=>void){
  try{const saved=JSON.parse(localStorage.getItem(this.storageKey)??'{}');const keys=new Set<string>();for(const a of hotkeyActions){const code=typeof saved[a.id]==='string'&&validHotkey(saved[a.id])?saved[a.id]:a.key;this.bindings[a.id]=code&&!keys.has(code)?code:'';if(code)keys.add(code);}}catch{/* Defaults remain available when storage is unavailable. */}
  this.dialog.id='settings-dialog';this.dialog.className='settings-dialog';this.dialog.setAttribute('aria-label','Settings and keyboard shortcuts');this.dialog.innerHTML=`<header><div><h2>Settings</h2><p>Keyboard shortcuts</p></div><button data-close aria-label="Close settings">×</button></header><p>Click a shortcut and press a key. Backspace or Delete clears it. Camera keys, Escape and numbered control groups are reserved.</p><p class="settings-status" role="status"></p><div class="shortcut-list">${hotkeyActions.map(a=>`<div><span>${a.label}</span><button data-bind="${a.id}" aria-label="Change ${a.label} shortcut"></button></div>`).join('')}</div><p>Fixed controls: WASD / arrows pan · Shift + right-click queues waypoints · Ctrl + 1–9 saves groups · 1–9 recalls groups · Escape cancels.</p><button data-reset>Restore defaults</button>`;
  parent.append(this.dialog);this.refresh();
  this.dialog.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b)return;if(b.hasAttribute('data-close'))this.dialog.close();if(b.dataset.bind){this.capture=b.dataset.bind as HotkeyAction;this.status('Press a key for '+hotkeyActions.find(a=>a.id===this.capture)!.label+'. Escape cancels.');this.refresh();}if(b.hasAttribute('data-reset')){this.bindings=defaults();this.capture=undefined;this.save();this.refresh();this.status('Default shortcuts restored.');}});
  this.dialog.addEventListener('close',()=>this.capture=undefined);
  this.dialog.addEventListener('keydown',e=>{if(!this.capture)return;e.preventDefault();e.stopPropagation();if(e.code==='Escape'){this.capture=undefined;this.status('Binding cancelled.');this.refresh();return;}const code=['Backspace','Delete'].includes(e.code)?'':e.code;if(e.ctrlKey||e.metaKey||e.altKey||e.shiftKey||!validHotkey(code)){this.status('That key is reserved. Choose an unmodified key.');return;}const error=this.assign(this.capture,code);if(error){this.status(error);return;}this.capture=undefined;this.status('Shortcut saved.');this.refresh();});
 }
 get open(){return this.dialog.open;}
 show(){this.capture=undefined;this.refresh();this.status('');if(!this.dialog.open)this.dialog.showModal();}
 code(action:HotkeyAction){return this.bindings[action];}
 assign(action:HotkeyAction,code:string){if(!validHotkey(code))return 'That key is reserved.';const conflict=hotkeyActions.find(a=>a.id!==action&&code&&this.bindings[a.id]===code);if(conflict)return keyLabel(code)+' is already assigned to '+conflict.label+'. Clear or change it first.';this.bindings[action]=code;this.save();this.refresh();return null;}
 private status(s:string){this.dialog.querySelector('.settings-status')!.textContent=s;}
 private save(){try{localStorage.setItem(this.storageKey,JSON.stringify(this.bindings));}catch{this.notify('Shortcut changed for this session; browser storage is unavailable.');}}
 refresh(){for(const a of hotkeyActions){const code=this.bindings[a.id],label=keyLabel(code);this.dialog.querySelector(`[data-bind="${a.id}"]`)!.textContent=this.capture===a.id?'Press key…':label;for(const button of this.parent.querySelectorAll<HTMLElement>(a.selector)){let badge=button.querySelector('kbd');if(!badge){badge=document.createElement('kbd');button.append(badge);}badge.textContent=label;badge.hidden=!code;button.dataset.hotkey=a.id;button.dataset.baseTitle??=button.getAttribute('title')??a.label;button.title=button.dataset.baseTitle+(code?' ('+label+')':'');if(code)button.setAttribute('aria-keyshortcuts',label);else button.removeAttribute('aria-keyshortcuts');}}}
 handle(event:KeyboardEvent){if(event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||event.repeat)return false;const a=hotkeyActions.find(a=>this.bindings[a.id]===event.code);if(!a)return false;event.preventDefault();const button=this.parent.querySelector<HTMLButtonElement>(a.selector);if(button&&!button.disabled)button.click();return true;}
}
