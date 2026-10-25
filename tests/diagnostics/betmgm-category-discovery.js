// Read-only DevTools diagnostic. Select Players in Elements first, then run.
// No clicks, storage writes, requests, odds/account text or full-page HTML.
(() => {
  const excluded='aside, footer, [data-testid*="betslip" i], [data-testid*="bet-slip" i], [class*="betslip" i], [class*="bet-slip" i], [data-testid*="social" i], [class*="social-feed" i], #ev-parlay-extension-toast';
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  const text=e=>clean(e?.innerText||e?.textContent||'');
  const ids={Players:'Players',Spread:'Spreads',Totals:'Totals','-1':'All'};
  const summary=e=>e?{tag:e.tagName,id:String(e.id||'').slice(0,100),className:String(e.className||'').slice(0,240),testId:(e.getAttribute('data-testid')||'').slice(0,100)}:null;
  function visual(e) {
    const w=e.ownerDocument.defaultView,r=e.getBoundingClientRect(),s=w.getComputedStyle(e);
    let check=null;try{check=e.checkVisibility?e.checkVisibility({opacityProperty:true,visibilityProperty:true}):null;}catch{check='error';}
    const hidden=e.closest('[hidden], [aria-hidden="true"]');
    const visible=!!e.isConnected&&check!==false&&r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&!hidden;
    return {...summary(e),visible,checkVisibility:check,width:Math.round(r.width*100)/100,height:Math.round(r.height*100)/100,display:s.display,visibility:s.visibility,opacity:s.opacity,contentVisibility:s.contentVisibility,hiddenAncestor:summary(hidden),excludedAncestor:summary(e.closest(excluded))};
  }
  function reasons(e) {
    const v=visual(e),out=[];
    if(!v.visible)out.push('not-visible');
    if(v.excludedAncestor)out.push('excluded-region');
    if(e.disabled||e.getAttribute('aria-disabled')==='true')out.push('disabled');
    const own=[e.getAttribute('data-testid'),e.className,e.getAttribute('data-test-id')].join(' ');
    if(/(?:outcome|selection|add.to.bet|place.bet)/i.test(own)||e.hasAttribute('data-type'))out.push('outcome-or-data-type');
    const t=text(e);if(!t||t.length>130||/(?:^|\s)[+-]\d{3,}(?:\s|$)/.test(t))out.push('unsafe-text');
    for(let p=e;p;p=p.parentElement) {
      const css=e.ownerDocument.defaultView.getComputedStyle(p);
      if(p.hidden||p.getAttribute('aria-hidden')==='true'||css.display==='none'||css.visibility==='hidden'||css.visibility==='collapse'){out.push('hidden-ancestor');break;}
    }
    const a=e.closest('a');
    if(a) {
      try {
        const current=new URL(e.ownerDocument.location.href),dest=new URL(a.getAttribute('href'),current.href);
        const nav=/^(tab|market|category|subcategory|activeTab)$/i;
        if(dest.origin!==current.origin||dest.pathname!==current.pathname||[...current.searchParams].some(([k,v])=>!nav.test(k)&&dest.searchParams.get(k)!==v)||[...dest.searchParams].some(([k,v])=>!nav.test(k)&&current.searchParams.get(k)!==v))out.push('unsafe-link');
      }catch{out.push('unsafe-link');}
    }
    if(e.hasAttribute('aria-expanded'))out.push('accordion-not-category');
    const id=e.getAttribute('data-menu-item-id');
    if(text(e.querySelector('.ds-pill-text'))!==ids[id]||t!==ids[id])out.push('label-mismatch');
    return out;
  }
  const bars=Array.from(document.body.querySelectorAll('ul.event-details-pills-list'));
  const rendered=bars.filter(e=>{const v=visual(e);return v.visible&&!v.excludedAncestor;});
  const selected=typeof $0!=='undefined'&&$0?.nodeType===1?($0.closest('button[data-menu-item-id]')||$0):null;
  const chosen=selected||document.querySelector('button[data-menu-item-id="Players"]');
  const ancestors=[];
  for(let p=chosen;p&&ancestors.length<12;p=p.parentElement||p.getRootNode()?.host||null)ancestors.push(visual(p));
  const reports=bars.slice(0,4).map(bar=>{
    const buttons=Array.from(bar.querySelectorAll('button[ds-pill][msthemedpills][data-menu-item-id]')).filter(e=>Object.hasOwn(ids,e.getAttribute('data-menu-item-id')));
    const counts={};for(const b of buttons){const id=b.getAttribute('data-menu-item-id');counts[id]=(counts[id]||0)+1;}
    return {bar:visual(bar),insideMain:!!bar.closest('main'),idCounts:counts,duplicateSupportedIds:Object.keys(counts).filter(k=>counts[k]>1),buttons:buttons.slice(0,8).map(e=>({id:e.getAttribute('data-menu-item-id'),label:text(e).slice(0,100),visual:visual(e),reasons:reasons(e)}))};
  });
  const report={diagnostic:'betmgm-discovery-1410-readonly',topFrame:window===window.top,mainPresent:!!document.querySelector('main'),lightDomBarCount:bars.length,renderedUnexcludedBarCount:rendered.length,frameCount:document.querySelectorAll('iframe,frame').length,
    selectedElement:summary(selected),selectedInConsoleDocument:!selected||selected.ownerDocument===document,selectedRoot:chosen?.getRootNode()?.nodeType===9?'document':chosen?.getRootNode()?.host?summary(chosen.getRootNode().host):'none',reports,selectedAncestors:ancestors};
  console.log(JSON.stringify(report,null,2));
  return report;
})();
