(function editorialRefinements(){
  'use strict';
  // Run after the unchanged analytical script has populated the exact values.
  // Separate markers prevent its original observer from running at the same time.
  const values=Array.from(document.querySelectorAll('[data-count-v3]'));
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finalValues=values.map(el=>{
    const final=el.textContent;
    const decimals=(final.split(',')[1]||'').length;
    const target=Number(final.replace(/[^\d,]/g,'').replace(',','.'));
    el.setAttribute('aria-label',final);
    return {el,final,decimals,target};
  });
  // Intrinsic columns have equal empty space between the final numerals. Reserve
  // their final widths so the count-up never moves its neighbouring columns.
  const valueBoxes=Array.from(document.querySelectorAll('.key .kf .v')).map(el=>({el,html:el.innerHTML}));
  function reserveFinalWidths(){
    valueBoxes.forEach(({el,html})=>{
      const measure=el.cloneNode(false);
      measure.removeAttribute('id');
      measure.removeAttribute('data-count-v3');
      measure.removeAttribute('data-n');
      measure.setAttribute('aria-hidden','true');
      measure.inert=true;
      measure.innerHTML=html;
      measure.style.cssText='position:absolute!important;visibility:hidden!important;pointer-events:none!important;width:max-content!important;min-width:0!important;max-width:none!important;';
      el.parentNode.appendChild(measure);
      el.style.setProperty('--final-value-width',measure.getBoundingClientRect().width+'px');
      measure.remove();
    });
  }
  reserveFinalWidths();
  if(document.fonts)document.fonts.ready.then(reserveFinalWidths);
  let widthFrame=0;
  addEventListener('resize',()=>{
    cancelAnimationFrame(widthFrame);
    widthFrame=requestAnimationFrame(reserveFinalWidths);
  },{passive:true});
  if(!reduced&&'IntersectionObserver' in window){
    const format=(value,decimals)=>value.toLocaleString('ru-RU',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
    const byElement=new Map(finalValues.map(v=>[v.el,v]));
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(!entry.isIntersecting)return;
        observer.unobserve(entry.target);
        const v=byElement.get(entry.target);
        if(!v||!Number.isFinite(v.target))return;
        const start=performance.now();
        const duration=1650;
        const step=now=>{
          const p=Math.min(1,(now-start)/duration);
          const ease=1-Math.pow(1-p,3);
          v.el.textContent=p===1?v.final:format(1+(v.target-1)*ease,v.decimals);
          v.el.dataset.countProgress=String(Math.round(p*100));
          if(p<1)requestAnimationFrame(step);
        };
        v.el.textContent=format(1,v.decimals);
        v.el.dataset.countProgress='0';
        requestAnimationFrame(step);
      });
    },{threshold:.65,rootMargin:'0px 0px -25px 0px'});
    finalValues.forEach(v=>observer.observe(v.el));
  }
  // The same exact parts become labelled bars on narrow screens, with no duplicate legend.
  const parts=Array.from(document.querySelectorAll('#mix>div'));
  const total=parts.reduce((sum,p)=>sum+parseFloat(p.style.flexGrow||p.style.flex||'0'),0);
  parts.forEach(p=>p.style.setProperty('--share',(total?100*parseFloat(p.style.flexGrow||p.style.flex||'0')/total:0)+'%'));

  // The original app continues to own the airport, map and synchronized selects.
  // Only a user change collapses this control; returning up the story reveals it.
  const select=document.getElementById('mine-network-select');
  const firstStep=select&&select.closest('.step');
  const picker=select&&select.closest('.step-picker');
  if(picker&&firstStep){
    let chosen=false,lastY=window.scrollY,scrollFrame=0;
    function showPicker(){
      chosen=false;
      picker.classList.remove('is-chosen');
      picker.removeAttribute('aria-hidden');
      picker.inert=false;
    }
    select.addEventListener('change',()=>{
      if(!select.value){showPicker();return;}
      if(document.activeElement===select)firstStep.querySelector('h3').focus({preventScroll:true});
      chosen=true;
      picker.classList.add('is-chosen');
      picker.setAttribute('aria-hidden','true');
      picker.inert=true;
      lastY=window.scrollY;
    });
    addEventListener('scroll',()=>{
      if(scrollFrame)return;
      scrollFrame=requestAnimationFrame(()=>{
        const y=window.scrollY;
        const bounds=firstStep.getBoundingClientRect();
        if(chosen&&y<lastY&&bounds.top<innerHeight&&bounds.bottom>60)showPicker();
        lastY=y;
        scrollFrame=0;
      });
    },{passive:true});
  }
})();
