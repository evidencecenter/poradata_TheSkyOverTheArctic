/* The article owns its original names and metadata. This enhancement replaces
   only the ten static aircraft silhouettes with interactive 3D canvases. */
(function(){
  'use strict';
  const initial={yaw:.62,pitch:.63,zoom:1};
  const tau=Math.PI*2,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const degrees=yaw=>((yaw*180/Math.PI)%360+360)%360;
  const normalize=s=>String(s).normalize('NFKC').replace(/\s+/g,' ').trim();

  function init(){
    const engine=window.Fleet3D,gallery=document.getElementById('gallery');
    if(!engine||!gallery||gallery.dataset.fleetViewer==='ready')return;
    const states=new Map();
    let frame=0;
    const queue=new Set();
    const request=state=>{
      state.dirty=true;
      if(!state.visible||document.hidden)return;
      queue.add(state);
      if(!frame)frame=requestAnimationFrame(flush);
    };
    function flush(){
      frame=0;
      const pending=Array.from(queue);queue.clear();
      for(const state of pending){
        if(!state.visible||!state.dirty||document.hidden)continue;
        const bounds=state.canvas.getBoundingClientRect();
        if(bounds.width<1||bounds.height<1)continue;
        if(!state.model)state.model=engine.createModel(state.id);
        const result=engine.render(state.canvas,state.model,{
          width:bounds.width,height:bounds.height,yaw:state.yaw,pitch:state.pitch,zoom:state.zoom,
          dpr:1.5
        });
        if(result){
          state.canvas.dataset.renderEngine=result.engine;
          state.canvas.dataset.triangles=String(result.triangles);
          state.canvas.dataset.rotation=degrees(state.yaw).toFixed(1);
          state.canvas.dataset.pitch=state.pitch.toFixed(3);
          state.wrapper.classList.add('is-ready');
        }
        state.dirty=false;
      }
    }
    const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>{
      for(const entry of entries){
        const state=states.get(entry.target);if(!state)continue;
        state.visible=entry.isIntersecting;
        if(state.visible&&state.dirty)request(state);
        if(!state.visible)queue.delete(state);
      }
    },{rootMargin:'180px 0px'}):null;
    const resize='ResizeObserver' in window?new ResizeObserver(entries=>{
      for(const entry of entries){const state=states.get(entry.target);if(state)request(state);}
    }):null;
    function update(state,keepRange){
      const angle=keepRange?Number(state.range.value):Math.round(degrees(state.yaw));
      state.range.value=String(angle);
      state.range.setAttribute('aria-valuetext',angle+' градусов');
      state.reset.disabled=Math.abs(state.yaw-initial.yaw)<.001&&Math.abs(state.pitch-initial.pitch)<.001;
      request(state);
    }

    for(const card of gallery.querySelectorAll('.plane')){
      const name=card.querySelector('.name'),old=card.querySelector('svg');
      if(!name||!old)continue;
      const spec=engine.catalog.find(s=>normalize(s.name)===normalize(name.textContent)||normalize(s.family)===normalize(name.textContent));
      if(!spec)continue;
      const wrapper=document.createElement('div');wrapper.className='plane-viewer';wrapper.dataset.model=spec.id;
      const canvas=document.createElement('canvas');canvas.className='plane-canvas';canvas.width=640;canvas.height=400;
      canvas.tabIndex=0;canvas.setAttribute('role','img');
      canvas.setAttribute('aria-label','Объёмная иллюстративная модель '+spec.name+'. Перетащите, чтобы повернуть на 360 градусов. Стрелки меняют ракурс, Home возвращает исходный.');
      canvas.textContent='3D-модель '+spec.name;
      const controls=document.createElement('div');controls.className='plane-controls';
      const hint=document.createElement('span');hint.className='plane-turn-hint';hint.textContent='360°';hint.setAttribute('aria-hidden','true');
      const range=document.createElement('input');range.className='plane-angle';range.type='range';range.min='0';range.max='360';range.step='1';range.value=String(Math.round(degrees(initial.yaw)));
      range.setAttribute('aria-label','Повернуть '+spec.name);range.setAttribute('aria-valuetext',Math.round(degrees(initial.yaw))+' градусов');
      const reset=document.createElement('button');reset.className='plane-reset';reset.type='button';reset.textContent='↺';reset.disabled=true;
      reset.setAttribute('aria-label','Вернуть исходный ракурс '+spec.name);reset.title='Исходный ракурс';
      controls.append(hint,range,reset);wrapper.append(canvas,controls);old.replaceWith(wrapper);
      card.dataset.fleetModel=spec.id;
      const state={id:spec.id,wrapper,canvas,range,reset,...initial,model:null,visible:!observer,dirty:true,drag:null};
      states.set(wrapper,state);
      range.addEventListener('input',()=>{state.yaw=Number(range.value)*Math.PI/180;update(state,true);});
      reset.addEventListener('click',()=>{Object.assign(state,initial);update(state);});
      canvas.addEventListener('keydown',event=>{
        const step=event.shiftKey?.35:.12;
        if(event.key==='ArrowLeft')state.yaw-=step;
        else if(event.key==='ArrowRight')state.yaw+=step;
        else if(event.key==='ArrowUp')state.pitch=clamp(state.pitch+.09,-1.1,1.25);
        else if(event.key==='ArrowDown')state.pitch=clamp(state.pitch-.09,-1.1,1.25);
        else if(event.key==='Home')Object.assign(state,initial);
        else return;
        event.preventDefault();update(state);
      });
      canvas.addEventListener('pointerdown',event=>{
        if(event.button!==0)return;
        state.drag={pointer:event.pointerId,x:event.clientX,y:event.clientY,yaw:state.yaw,pitch:state.pitch,touch:event.pointerType==='touch',active:false};
        if(event.pointerType!=='touch'){
          canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);wrapper.classList.add('is-dragging');
        }
      });
      canvas.addEventListener('pointermove',event=>{
        const drag=state.drag;if(!drag||drag.pointer!==event.pointerId)return;
        const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
        if(drag.touch&&!drag.active){
          if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>6){state.drag=null;return;}
          if(Math.abs(dx)<6)return;
          drag.active=true;canvas.setPointerCapture(event.pointerId);wrapper.classList.add('is-dragging');
        }
        state.yaw=drag.yaw+dx*.012;
        if(!drag.touch)state.pitch=clamp(drag.pitch+dy*.007,-1.1,1.25);
        update(state);
      });
      const endDrag=event=>{
        if(!state.drag||state.drag.pointer!==event.pointerId)return;
        if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
        state.drag=null;wrapper.classList.remove('is-dragging');
      };
      canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('lostpointercapture',endDrag);
      if(observer)observer.observe(wrapper);else request(state);
      if(resize)resize.observe(wrapper);
    }
    if(!resize)window.addEventListener('resize',()=>states.forEach(request),{passive:true});
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){if(frame)cancelAnimationFrame(frame);frame=0;queue.clear();}
      else states.forEach(state=>{if(state.visible&&state.dirty)request(state);});
    });
    gallery.dataset.fleetViewer='ready';gallery.dataset.fleetModels=String(states.size);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
