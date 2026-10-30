/** A single delegated tooltip; no per-frame work or per-stat listeners. */
export class GrowthTooltip {
 private element=document.createElement('div');
 private timer?:ReturnType<typeof setTimeout>;
 private target?:HTMLElement;
 constructor(parent:HTMLElement){
  this.element.id='growth-tooltip';this.element.className='growth-tooltip';this.element.hidden=true;this.element.setAttribute('role','tooltip');document.body.append(this.element);
  const start=(event:Event)=>{const target=(event.target as HTMLElement).closest<HTMLElement>('[data-growth-tooltip]');if(!target||target===this.target)return;this.hide();this.target=target;this.timer=setTimeout(()=>this.show(target),1000);};
  parent.addEventListener('pointerover',start);parent.addEventListener('focusin',start);
  parent.addEventListener('pointerout',event=>{if(this.target&&!this.target.contains(event.relatedTarget as Node|null))this.hide();});
  parent.addEventListener('focusout',()=>this.hide());window.addEventListener('blur',()=>this.hide());
  parent.addEventListener('scroll',()=>this.hide(),true);
 }
 private show(target:HTMLElement){if(!target.isConnected||target.closest('[hidden]')){this.hide();return;}
  this.element.textContent=target.dataset.growthTooltip??'';this.element.hidden=false;target.setAttribute('aria-describedby',this.element.id);
  const rect=target.getBoundingClientRect(),width=this.element.offsetWidth,height=this.element.offsetHeight;
  this.element.style.left=Math.max(8,Math.min(innerWidth-width-8,rect.left))+'px';this.element.style.top=Math.max(8,Math.min(innerHeight-height-8,rect.bottom+8))+'px';
 }
 private hide(){clearTimeout(this.timer);this.target?.removeAttribute('aria-describedby');this.target=undefined;this.element.hidden=true;}
}
