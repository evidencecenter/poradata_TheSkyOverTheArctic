(function(){
'use strict';
const D=window.DATA; const X=D.extra||{}; const BM=D.basemap; const P=BM.proj; const NODES=D.nodes; const ROUTES=D.routes;
const CAPITALS=new Set(['MOW','LED']); const HUBS2=new Set(['TJM','UFA','SVX','OVB','KJA']);
const CLUSTER_COLORS={YKS:'var(--c-yks)',KJA:'var(--c-kja)',NSK:'var(--c-nsk)',GDX:'var(--c-gdx)',PYJ:'var(--c-pyj)',CEE:'var(--c-cee)'};
const CLUSTER_OF={}; for(const [r,locs] of Object.entries(D.clusters)) for(const l of locs){ (CLUSTER_OF[l]=CLUSTER_OF[l]||[]).push(r); }
const MONTHS=['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
const MONTHS_L=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_P=['январе','феврале','марте','апреле','мае','июне','июле','августе','сентябре','октябре','ноябре','декабре'];
const thin='\u202F';
function fmt(n,d){ if(n==null||isNaN(n)) return '—'; const neg=n<0; const s=Math.abs(Number(n)).toFixed(d==null?0:d); const [i,f]=s.split('.'); const g=i.replace(/\B(?=(\d{3})+(?!\d))/g,thin); return (neg?'−':'')+(f?g+','+f:g); }
function pct(x,d){ return fmt(x*100,d||0); }
function seatsW(n){ return fmt(n)+' '+pl(Math.round(n),'кресло','кресла','кресел'); }
function flightsW(n){ return fmt(n)+' '+pl(Math.round(n),'рейс','рейса','рейсов'); }
function pl(n,one,few,many){ n=Math.abs(n)%100; const n1=n%10; if(n>10&&n<20) return many; if(n1>1&&n1<5) return few; if(n1==1) return one; return many; }
// часы и минуты: до 10 часов — с точностью до минуты; дольше — до целого часа или (precise) до 5 минут
function hm(h,precise){ let m=Math.round(h*60); if(h>=10) m=precise?Math.round(m/5)*5:Math.round(m/60)*60; return [Math.floor(m/60),m%60]; }
const NB=' ';
function fmtH(h,precise){ if(h==null||isNaN(h)) return '—'; const [H,M]=hm(h,precise); return H?(H+NB+'ч'+(M?' '+M+NB+'мин':'')):(M+NB+'мин'); }
function fmtHb(h){ if(h==null||isNaN(h)) return '—'; const [H,M]=hm(h,true); return H?(`${H}<small>${NB}ч</small>`+(M?` ${M}<small>${NB}мин</small>`:'')):`${M}<small>${NB}мин</small>`; }
// винительный падеж для «через …»: Москва → Москву, Уфа → Уфу
function acc(s){ return /[^и]а$/.test(s)?s.slice(0,-1)+'у':(/я$/.test(s)?s.slice(0,-1)+'ю':s); }
const $=(s,r)=>(r||document).querySelector(s); const $$=(s,r)=>Array.from((r||document).querySelectorAll(s));
function svgEl(tag,attrs,parent){ const e=document.createElementNS('http://www.w3.org/2000/svg',tag); if(attrs) for(const k in attrs){ if(attrs[k]!=null) e.setAttribute(k,attrs[k]); } if(parent) parent.appendChild(e); return e; }
function h(tag,attrs,html){ const e=document.createElement(tag); if(attrs) for(const k in attrs){ if(k==='class') e.className=attrs[k]; else e.setAttribute(k,attrs[k]); } if(html!=null) e.innerHTML=html; return e; }
function nm(c){ return NODES[c]?NODES[c].name:(D.profiles[c]?D.profiles[c].city:c); }
function project(lon,lat){ let lam=(lon-P.lam0)*Math.PI/180; while(lam>Math.PI) lam-=2*Math.PI; while(lam<-Math.PI) lam+=2*Math.PI; const phi=lat*Math.PI/180; const rho=Math.sqrt(P.C-2*P.n*Math.sin(phi))/P.n; const th=P.n*lam; const x=rho*Math.sin(th), y=P.rho0-rho*Math.cos(th); return [P.s*x+P.tx, BM.H-(P.ty+P.s*y)]; }
function gcPts(a,b,n){ n=n||24; const R=Math.PI/180; const la1=a.lat*R,lo1=a.lon*R,la2=b.lat*R,lo2=b.lon*R; const d=2*Math.asin(Math.sqrt(Math.sin((la2-la1)/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin((lo2-lo1)/2)**2)); const pts=[]; for(let i=0;i<=n;i++){ const f=i/n; let lon,lat; if(d<1e-9){lon=a.lon;lat=a.lat;} else { const A=Math.sin((1-f)*d)/Math.sin(d), B=Math.sin(f*d)/Math.sin(d); const x=A*Math.cos(la1)*Math.cos(lo1)+B*Math.cos(la2)*Math.cos(lo2); const y=A*Math.cos(la1)*Math.sin(lo1)+B*Math.cos(la2)*Math.sin(lo2); const z=A*Math.sin(la1)+B*Math.sin(la2); lon=Math.atan2(y,x)/R; lat=Math.atan2(z,Math.sqrt(x*x+y*y))/R; } pts.push(project(lon,lat)); } return pts; }
function gcPath(a,b,n){ return 'M'+gcPts(a,b,n).map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join('L'); }
function gcKm(a,b){ const R=Math.PI/180; const la1=a.lat*R,lo1=a.lon*R,la2=b.lat*R,lo2=b.lon*R; return 6371.0088*2*Math.asin(Math.sqrt(Math.sin((la2-la1)/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin((lo2-lo1)/2)**2)); }
function responsive(el,render){ let w0=-1; const run=()=>{ const w=Math.round(el.clientWidth); if(!w||Math.abs(w-w0)<6) return; w0=w; render(w); }; new ResizeObserver(run).observe(el); run(); }
// ---------- tooltip ----------
const tip=$('#tip'); let tipOn=false;
function showTip(html,x,y){ tip.innerHTML=html; tip.classList.add('on'); tipOn=true; moveTip(x,y); }
function moveTip(x,y){ const w=tip.offsetWidth,hh=tip.offsetHeight; let left=x+14, top=y+14; if(left+w>window.innerWidth-10) left=Math.max(10,x-w-14); if(top+hh>window.innerHeight-10) top=Math.max(10,y-hh-14); tip.style.left=left+'px'; tip.style.top=top+'px'; }
function hideTip(){ tip.classList.remove('on'); tipOn=false; }
function bindTip(el,fn){ el.addEventListener('pointerenter',e=>showTip(fn(),e.clientX,e.clientY)); el.addEventListener('pointermove',e=>{ if(tipOn) moveTip(e.clientX,e.clientY); }); el.addEventListener('pointerleave',hideTip); el.addEventListener('focus',()=>{ const r=el.getBoundingClientRect(); showTip(fn(),r.left+r.width/2,r.top); }); el.addEventListener('blur',hideTip); }
document.addEventListener('scroll',()=>{ if(tipOn) hideTip(); },{passive:true});
// ---------- numbers for copy ----------
const T=D.meta.totals, PT=D.meta.prices, SH=D.shares, HS=D.hub_shares, FL=D.fleet.local, CN=D.connectivity, PS=D.prices.summary;
const hubShare=c=>{ const r=HS.find(x=>x.iata===c); return r?r.seat_share:0; };
const gapRatios=D.prices.monthly_gap.map(g=>g.small/g.trunk);
const nLocalDirs=FL.n_directions, nTrunkDirs=D.fleet.n_directions-FL.n_directions;
const outCenters=new Set(D.classification.root_outside.map(c=>c==='KCY'?'KJA':c)); const nOut=outCenters.size;
const NUMW={1:'Один',2:'Два',3:'Три',4:'Четыре',5:'Пять',6:'Шесть',7:'Семь'};
const nLocal=D.classification.local.length;
const imputed=((D.meta.clean_log||'').match(/прилёт пересчитан\): (\d+)/)||[])[1];
const tzShift=((D.meta.clean_log||'').match(/пересчитано по поясам\): (\d+)/)||[])[1];
const insidePct=Math.round(SH.seats['АЗРФ']*100);
const comp=X.competition||{}; const BF=X.block_fit||{};
const N={flights:fmt(T.flights), price_routes:fmt(PT.eligible_routes), routes:fmt(T.routes), arctic_airports:T.arctic_airports, airlines:T.airlines,
  airports_phrase:T.airports+' '+pl(T.airports,'аэропорт','аэропорта','аэропортов'), routes_phrase:T.routes+' '+pl(T.routes,'маршрут','маршрута','маршрутов'),
  seats_mln:fmt(T.seats/1e6,1), mean_dist:fmt(T.mean_dist_km), share_capitals:pct(SH.seats['Столицы']), svo_share:pct(hubShare('SVO')), led_share:pct(hubShare('LED')),
  share_hubs:pct((X.dest_mix||{}).hubs||0), share_resorts:pct(SH.seats['Курорты']), share_inside:pct(SH.seats['АЗРФ']), share_inside_fl:pct(SH.flights['АЗРФ']), mainland_of_100:100-insidePct,
  n_centers:D.classification.root_arctic.length+nOut, n_local_phrase:nLocal+' '+pl(nLocal,'местный аэропорт выходит','местных аэропорта выходят','местных аэропортов выходят'),
  out_centers_phrase:(NUMW[nOut]||nOut)+' '+pl(nOut,'центр лежит','центра лежат','центров лежат'), yks_local:(D.clusters.YKS||[]).length, kja_local:(D.clusters.KJA||[]).length,
  pairs:CN.n_pairs, pairs_conn:CN.connected, pairs_direct:CN.direct, sov_dir:FL.soviet_directions, local_dir:nLocalDirs, trunk_dir:nTrunkDirs, unp_dir:FL.unpaved_directions,
  sov_seats:pct(FL.soviet_share_seats), unp_seats:pct(FL.unpaved_share_seats), rk_small:fmt(PS.small.rub_km_median,0), rk_trunk:fmt(PS.trunk.rub_km_median,0),
  n_small:PS.small.routes, n_trunk:PS.trunk.routes, gap_min:fmt(Math.min(...gapRatios),1), gap_max:fmt(Math.max(...gapRatios),1),
  mono_share:pct(comp.share_mono||0), mono_effect:(comp.effect>0?'+':'')+fmt((comp.effect||0)*100,0),
  rows_raw:fmt(109393), arctic_airports_all:36, airports_all:T.airports_all, routes_all:T.routes_all, price_rows:fmt(PT.rows), price_routes_all:PT.routes, price_airports:PT.airports,
  yandex_found:D.meta.yandex.yandex_found, yandex_all:D.meta.yandex.yandex_flights, dups:fmt(109393-106616), miss0:fmt(2887), miss1:33, imputed:fmt(+imputed||0),
  strict_seats:fmt(D.shares_strict.seats*100,1), strict_fl:fmt(D.shares_strict.flights*100,1), missing_n:(X.missing||[]).length, registry_n:(X.registry||{}).azrf_total,
  bt_routes:BF.n_routes, bt_a:fmt(BF.a_min,0), bt_b:fmt(BF.b_min_per_km,3), bt_kmh:BF.b_min_per_km?fmt(Math.round(60/BF.b_min_per_km/10)*10):'—', tz_shift:fmt(+tzShift||0)};
{ const M=X.missing||[]; N.missing_list=M.map(m=>m.name).join(', '); const G=D.season_by_group['АЗРФ']; const gm=G.reduce((a,v)=>a+v,0)/12; N.inside_jun=fmt(Math.round((G[5]/gm-1)*100)); N.inside_jan=fmt(Math.round((1-G[0]/gm)*100)); const F=X.price_fair||{}; const hiR=Math.max((F.match||{}).median||0,...(F.bins||[]).filter(b=>b.ratio).map(b=>b.ratio)); N.fair_lo=fmt((F.reg||{}).mult,1); N.fair_hi=fmt(hiR,1); }
{ const I=X.isolation||{}; const loc=D.classification.local.filter(c=>I[c]); const n2=loc.filter(c=>I[c].per_week<=2).length; N.iso_2pw_phrase=`${n2} из ${loc.length} ${pl(loc.length,'посёлка','посёлков','посёлков')} с местными аэропортами`; const a=Math.round(BF.a_min||0); N.bt_a_phrase=`${a} ${pl(a,'минута','минуты','минут')}`; }
$$('[data-n]').forEach(e=>{ const k=e.dataset.n; if(N[k]!=null) e.textContent=N[k]; });
const TIPS={seats_exact:()=>`<b>${seatsW(T.seats)}</b> за год по расписанию`};
$$('[data-tipkey]').forEach(e=>{ e.tabIndex=0; bindTip(e,()=>TIPS[e.dataset.tipkey]()); });
// dynamic footnotes
(function(){ const F=X.price_fair; if(F){ const b=F.bins.filter(x=>x.ratio); const s=b.map(x=>`${fmt(x.lo)}–${fmt(x.hi)} км: медианы ${fmt(x.rk_small,0)} и ${fmt(x.rk_trunk,0)} ₽ за км (×${fmt(x.ratio,1)})`).join('; ');
    $('#fn-fair').dataset.note=`Сравниваем маршруты одной длины. ${s}. Если сопоставить каждый маршрут малых бортов с магистральными той же длины (±20 %), медиана ×${fmt(F.match.median,1)} (у половины маршрутов от ×${fmt(F.match.q1,1)} до ×${fmt(F.match.q3,1)}). Регрессия с поправкой на расстояние даёт ×${fmt(F.reg.mult,1)} (95 % интервал от ×${fmt(F.reg.lo,1)} до ×${fmt(F.reg.hi,1)}). Без поправки на расстояние медианы по всем маршрутам — ${N.rk_small} и ${N.rk_trunk} ₽ за км (×${fmt(PS.ratio_median,1)}).`; }
  const S=X.sensitivity; if(S&&$('#fn-thr')){ const at=t=>(S.find(s=>s[0]===t)||[])[1]; const lo=at(26), hi=at(52);
    $('#fn-thr').dataset.note=`47 недель — около 90 % года, такой порог мы взяли из методики ПОРА. Связность считаем за сентябрь 2025 — август 2026 года: сентябрь 2026-го в выгрузке — ещё расписание. Главный вывод от порога не зависит: даже если считать связью полгода (26 недель), регулярно связаны ${lo} ${pl(lo,'пара','пары','пар')} из 91; если требовать все 52 недели — ${hi}. График ниже.`; }
  if(BF.a_min&&$('#fn-direct')){ const vkt=(X.isolation||{}).VKT; const ex=BF.a_min+BF.b_min_per_km*594;
    $('#fn-direct').dataset.note=`Прямой рейс оцениваем по расписанию турбовинтовых самолётов на ${BF.n_routes} маршрутах: ${fmt(BF.a_min,0)} минут на взлёт и посадку плюс полёт со скоростью около ${N.bt_kmh} км/ч. Например, 594 км (Нарьян-Мар — Салехард) — около ${fmtH(ex/60)}.`+(vkt?` Воркута в таблицу не входит: у неё есть железная дорога, а самолёт улетал оттуда только ${vkt.days_dep} ${pl(vkt.days_dep,'день','дня','дней')} в году.`:''); }
  if(comp.n) $('#fn-mono').dataset.note=`Разница цены при одинаковом расстоянии и классе аэродрома: ${N.mono_effect} %, 95 % интервал от ${fmt(comp.lo*100,0)} до ${comp.hi>0?'+':''}${fmt(comp.hi*100,0)} %. ${comp.n} маршрутов, из них ${comp.n_mono} с одним перевозчиком (доля рейсов от 10 %).`; })();
// numbered footnotes per chapter with a notes list
$$('section').forEach(sec=>{ const fns=$$('.fn',sec); if(!fns.length) return; const box=$('.notes',sec); const ol=h('ol'); fns.forEach((f,i)=>{ f.textContent=i+1; f.tabIndex=0; f.setAttribute('role','note'); f.setAttribute('aria-label','Сноска '+(i+1)+': '+f.dataset.note); bindTip(f,()=>f.dataset.note); ol.appendChild(h('li',null,f.dataset.note)); }); if(box){ box.hidden=false; box.appendChild(h('h4',null,'Примечания')); box.appendChild(ol); } });
// ---------- count-up ----------
(function countUp(){ const els=$$('[data-count]'); if(!els.length||matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const run=el=>{ const final=el.textContent; const dec=(final.split(',')[1]||'').length; const target=parseFloat(final.replace(/[^\d,]/g,'').replace(',','.')); if(isNaN(target)) return; const t0=performance.now(), dur=1100; const tick=now=>{ const f=Math.min(1,(now-t0)/dur); const e=1-Math.pow(1-f,3); el.textContent=fmt(target*e,dec); if(f<1) requestAnimationFrame(tick); else el.textContent=final; }; el.textContent=fmt(0,dec); requestAnimationFrame(tick); };
  const io=new IntersectionObserver(es=>{ es.forEach(e=>{ if(e.isIntersecting){ run(e.target); io.unobserve(e.target); } }); },{threshold:0.4}); els.forEach(el=>io.observe(el)); })();
// ---------- glass glyphs: miniatures of each chapter's data ----------
(function glyphs(){ let gid=0;
  function tile(el,draw){ const id='gl'+(gid++); const s=svgEl('svg',{viewBox:'0 0 96 96'},el); const defs=svgEl('defs',null,s);
    const lg=svgEl('linearGradient',{id:id+'g',x1:0,y1:0,x2:1,y2:1},defs); svgEl('stop',{offset:'0',style:'stop-color:#fff;stop-opacity:.95'},lg); svgEl('stop',{offset:'1',style:'stop-color:var(--sky-pale);stop-opacity:1'},lg);
    const hl=svgEl('radialGradient',{id:id+'h',cx:.3,cy:.15,r:.7},defs); svgEl('stop',{offset:'0',style:'stop-color:#fff;stop-opacity:.9'},hl); svgEl('stop',{offset:'1',style:'stop-color:#fff;stop-opacity:0'},hl);
    const f=svgEl('filter',{id:id+'f',x:'-20%',y:'-20%',width:'140%',height:'150%'},defs); svgEl('feDropShadow',{dx:0,dy:6,stdDeviation:6,'flood-color':'#1F6FD2','flood-opacity':.18},f);
    svgEl('rect',{x:4,y:4,width:88,height:88,rx:22,fill:`url(#${id}g)`,filter:`url(#${id}f)`},s); svgEl('rect',{x:4,y:4,width:88,height:88,rx:22,fill:`url(#${id}h)`},s); svgEl('rect',{x:4.5,y:4.5,width:87,height:87,rx:21.5,fill:'none',stroke:'#fff','stroke-opacity':.9},s); svgEl('rect',{x:4,y:4,width:88,height:88,rx:22,fill:'none',stroke:'var(--line-2)','stroke-opacity':.7},s);
    const g=svgEl('g',null,s); draw(g); }
  const G={
    network:g=>{ const inside=SH.seats['АЗРФ']; const r=24, cx=48, cy=48; const a1=-Math.PI/2+2*Math.PI*inside; const arc=(a0,a,col,w)=>{ const p0=[cx+r*Math.cos(a0),cy+r*Math.sin(a0)], p1=[cx+r*Math.cos(a),cy+r*Math.sin(a)]; svgEl('path',{d:`M${p0[0]},${p0[1]} A${r},${r} 0 ${a-a0>Math.PI?1:0} 1 ${p1[0]},${p1[1]}`,fill:'none',stroke:col,'stroke-width':w,'stroke-linecap':'butt'},g); };
      arc(a1+.06,-Math.PI/2+2*Math.PI-.06,'var(--sky-deep)',10); arc(-Math.PI/2,a1,'var(--accent)',10); const t=svgEl('text',{x:cx,y:cy+5,'text-anchor':'middle','font-family':'Forum, serif','font-size':16,fill:'var(--ink)'},g); t.textContent=insidePct+'%'; },
    detour:g=>{ const R=CN.roots, n=R.length, s=60/n; R.forEach((a,i)=>R.forEach((b,j)=>{ if(i===j) return; const k=a<b?a+'-'+b:b+'-'+a; const st=CN.matrix[k]; svgEl('rect',{x:18+j*s,y:18+i*s,width:s-.8,height:s-.8,rx:.6,fill:st==='direct'?'var(--navy)':(st==='transit'?'var(--sky)':'var(--line-2)'),'fill-opacity':st==='none'?.5:1},g); })); },
    fleet:g=>{ const dirs=D.fleet.directions.filter(d=>d.local).sort((x,y)=>y.seats-x.seats); const SOVS=new Set(['Ан-24','Ан-26','Як-42','Ми-8']), UNPS=new Set(['Ан-24','Ан-26','ATR 42/72','DHC-8','Ми-8']); dirs.forEach((d,i)=>{ const c=i%6, r=Math.floor(i/6); const sov=SOVS.has(d.family), unp=UNPS.has(d.family); const col=sov?'var(--amber)':'var(--sky-deep)'; svgEl('rect',{x:20+c*9.6,y:24+r*9.6,width:8,height:8,rx:1.5,fill:unp?col:'none',stroke:col,'stroke-width':unp?0:1.4},g); }); },
    season:g=>{ const a=D.season_by_group['Курорты']; const m=a.reduce((s,v)=>s+v,0)/12; const mx=Math.max(...a); a.forEach((v,i)=>{ const hgt=46*v/mx; svgEl('rect',{x:19+i*5,y:72-hgt,width:3.6,height:hgt,rx:1,fill:v>m?'var(--sky-deep)':'var(--grey-blue)'},g); }); svgEl('line',{x1:17,x2:79,y1:72-46*m/mx,y2:72-46*m/mx,stroke:'var(--ink)','stroke-width':1,'stroke-dasharray':'2 2'},g); },
    prices:g=>{ const s=PS.small.rub_km_median, t=PS.trunk.rub_km_median; const hs=50, ht=50*t/s; svgEl('rect',{x:28,y:72-hs,width:16,height:hs,rx:2,fill:'var(--accent)'},g); svgEl('rect',{x:52,y:72-ht,width:16,height:ht,rx:2,fill:'var(--sky-deep)'},g); svgEl('line',{x1:22,x2:74,y1:72.5,y2:72.5,stroke:'var(--ink-2)','stroke-width':1},g); },
    subsidies:g=>{ for(let i=0;i<58;i++){ const c=i%10, r=Math.floor(i/10); svgEl('circle',{cx:21+c*6,cy:30+r*7.4,r:2.4,fill:i===57?'var(--accent)':'var(--navy)'},g); } },
    conclusions:g=>{ [0,1,2,3].forEach(i=>{ svgEl('circle',{cx:28,cy:30+i*12.5,r:3.6,fill:'var(--sky-deep)'},g); svgEl('rect',{x:37,y:27.5+i*12.5,width:[34,27,31,23][i],height:5,rx:2.5,fill:'var(--grey-blue)'},g); }); },
    method:g=>{ for(let r=0;r<4;r++) for(let c=0;c<4;c++) svgEl('rect',{x:22+c*13.5,y:26+r*11,width:11.5,height:8,rx:1.5,fill:r===0?'var(--sky-deep)':'var(--grey-blue)','fill-opacity':r===0?1:.55},g); } };
  $$('[data-glyph]').forEach(el=>{ const f=G[el.dataset.glyph]; if(f) tile(el,f); }); })();
// ---------- map factory ----------
function makeMap(container,opts){ opts=opts||{}; const svg=svgEl('svg',{viewBox:`0 0 ${BM.W} ${BM.H}`,role:'img','aria-label':opts.label||'Карта авиамаршрутов АЗРФ'},container); const defs=svgEl('defs',null,svg); const pat=svgEl('pattern',{id:'hatch'+(opts.id||''),width:6,height:6,patternUnits:'userSpaceOnUse',patternTransform:'rotate(45)'},defs); svgEl('rect',{width:6,height:6,fill:'var(--map-part)'},pat); svgEl('line',{x1:0,y1:0,x2:0,y2:6,stroke:'var(--map-full)','stroke-width':2.5},pat);
  svgEl('path',{d:BM.others,class:'oth'},svg); svgEl('path',{d:BM.russia,class:'ru'},svg); svgEl('path',{d:BM.azrf_part,fill:`url(#hatch${opts.id||''})`},svg); svgEl('path',{d:BM.azrf_full,class:'full'},svg); svgEl('path',{d:BM.admin1,class:'a1'},svg); svgEl('path',{d:BM.circle,class:'circle'},svg);
  const gTech=svgEl('g',null,svg); const gRoutes=svgEl('g',{class:'routes'},svg), gPath=svgEl('g',null,svg), gMiss=svgEl('g',null,svg), gNodes=svgEl('g',null,svg), gLbl=svgEl('g',null,svg), gTop=svgEl('g',null,svg);
  const maxSeats=Math.max(...ROUTES.map(r=>r.seats));
  const routeEls=ROUTES.map(r=>{ const a=NODES[r.a],b=NODES[r.b]; if(!a||!b) return null; const p=svgEl('path',{d:gcPath(a,b),class:'route'+(r.local?' in':'')},gRoutes); p.__r=r; return p; }).filter(Boolean);
  const XY={}; for(const c in NODES) XY[c]=project(NODES[c].lon,NODES[c].lat);
  const maxNode=Math.max(...Object.values(NODES).map(n=>n.seats));
  const NARROW=new Set(['MMK','ARH','NSK','NUX','YKS','DYR','MOW','KJA','NNM','PWE','SLY']); const LABELS=new Set([...D.classification.root_arctic,'YKS','KJA','GDX','PYJ','MOW','LED','TJM','UFA','SVX','OVB','AER','KHV']);
  const OFF={MOW:[-6,-6,'end'],LED:[-6,-5,'end'],KVK:[6,10,'start'],MMK:[7,-2,'start'],ARH:[-7,8,'end'],NNM:[7,-4,'start'],USK:[-7,11,'end'],VKT:[7,-4,'start'],SLY:[-7,9,'end'],NYM:[7,9,'start'],NUX:[7,-4,'start'],NOJ:[7,8,'start'],BVJ:[0,-7,'middle'],NSK:[7,-3,'start'],DYR:[7,11,'start'],PWE:[-7,-5,'end'],YKS:[7,8,'start'],KJA:[7,8,'start'],GDX:[7,8,'start'],PYJ:[0,13,'middle'],TJM:[7,8,'start'],UFA:[-7,8,'end'],SVX:[7,8,'start'],OVB:[7,8,'start'],AER:[7,8,'start'],KHV:[-7,8,'end']};
  const nodeEls={}, lblEls={}, missEls=[];
  if(opts.missing){ for(const m of (X.missing||[])){ const [x,y]=project(m.lon,m.lat); const c=svgEl('circle',{cx:x.toFixed(1),cy:y.toFixed(1),r:4,class:'miss',tabindex:0},gMiss); missEls.push(c); bindTip(c,()=>`<b>${m.name}</b><br>${m.region}${m.klass?', класс '+m.klass:''}<br>${m.kind==='airport'?'аэропорт с регулярными рейсами':'аэродром местных линий'} — в данных Aviastats нет`); } }
  const order=Object.keys(NODES).sort((x,y)=>NODES[y].seats-NODES[x].seats);
  for(const c of order){ const n=NODES[c]; const [x,y]=XY[c]; const cls='node '+(n.azrf?(n.role==='local'?'az local':'az'):(n.role==='hub'||c==='MOW'?'hub':(n.role==='rootOut'?'rootOut':'ext'))); const el=svgEl('circle',{cx:x.toFixed(1),cy:y.toFixed(1),r:4,class:cls,tabindex:opts.interactive?0:null},gNodes); el.__c=c; nodeEls[c]=el;
    if(LABELS.has(c)){ const o=OFF[c]||[6,-4,'start']; const t=svgEl('text',{x:(x+o[0]).toFixed(1),y:(y+o[1]).toFixed(1),'text-anchor':o[2],class:'lbl'+(n.azrf?'':' ext')},gLbl); t.textContent=n.name; lblEls[c]=t; }
    if(opts.interactive){ bindTip(el,()=>{ const p=D.profiles[c]; if(p) return `<b>${p.name}</b><br>${p.role==='root'?'магистральный аэропорт':'местный аэропорт, сеть '+p.roots.map(nm).join(', ')}<br>${flightsW(p.flights)}, ${seatsW(p.seats)} за год<br>${p.n_dest} ${pl(p.n_dest,'направление','направления','направлений')}, чаще всего — ${p.top.slice(0,3).map(t=>nm(t[0])).join(', ')}`; return `<b>${n.name}</b><br>${n.role==='hub'||c==='MOW'?'узловой аэропорт':(n.role==='rootOut'?'центр местной сети вне АЗРФ':'город вне АЗРФ')}<br>${flightsW(n.flights)}, ${seatsW(n.seats)} за год`; }); }
  }
  const techEls=[]; if(!opts.noTech){ const circ=project(21,66.5622); const t=svgEl('text',{x:(circ[0]+4).toFixed(1),y:(circ[1]-5).toFixed(1),class:'tech'},gTech); t.textContent='66°33′ с. ш. · Северный полярный круг'; techEls.push(t);
    const LAT=55, LON=138; const degPer1000=1000/(111.32*Math.cos(LAT*Math.PI/180)); const p0=project(LON,LAT), p1=project(LON+degPer1000,LAT); const pts=[]; for(let i=0;i<=12;i++) pts.push(project(LON+degPer1000*i/12,LAT));
    svgEl('path',{d:'M'+pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join('L'),class:'scale',fill:'none'},gTech); for(const p of [p0,p1]) svgEl('line',{x1:p[0].toFixed(1),x2:p[0].toFixed(1),y1:(p[1]-3).toFixed(1),y2:(p[1]+3).toFixed(1),class:'scale'},gTech);
    const s2=svgEl('text',{x:((p0[0]+p1[0])/2).toFixed(1),y:(p0[1]+12).toFixed(1),'text-anchor':'middle',class:'tech'},gTech); s2.textContent='1\u202F000 км на 55° с. ш.'; techEls.push(s2); }
  const api={svg,routeEls,nodeEls,lblEls,XY,gTop,k:()=>k};
  let k=1; function resize(){ const w=container.clientWidth||600; k=BM.W/w; const narrow=w<560; gTech.style.display=narrow?'none':''; for(const t of techEls){ t.setAttribute('font-size',(10*Math.max(1,k)).toFixed(1)); t.style.display=narrow?'none':''; }
    for(const c in nodeEls){ const n=NODES[c]; const base=n.azrf?(n.role==='local'?2.2:2.6+6*Math.sqrt(n.seats/maxNode)):(n.role==='hub'||c==='MOW'?4:2.2+4*Math.sqrt(n.seats/maxNode)); nodeEls[c].setAttribute('r',(base*Math.max(1,k*0.9)).toFixed(1)); }
    for(const m of missEls) m.setAttribute('r',(2.6*Math.max(1,k*0.9)).toFixed(1));
    for(const c in lblEls){ const t=lblEls[c]; t.setAttribute('font-size',(12*Math.max(1,k)).toFixed(1)); t.style.display=(narrow&&!NARROW.has(c))?'none':''; } if(api.onResize) api.onResize(k); }
  new ResizeObserver(resize).observe(container); resize();
  api.setMode=function(mode,sel){ for(const p of routeEls){ const r=p.__r; const w=0.5+3.2*Math.sqrt(r.seats/maxSeats); const cls='route'+(r.local?' in':''); let show=true, dim=false;
      if(mode==='capitals') dim=!(CAPITALS.has(r.a)||CAPITALS.has(r.b)); else if(mode==='hubs') dim=!(HUBS2.has(r.a)||HUBS2.has(r.b)); else if(mode==='inside') show=r.local; else if(mode==='clusters') show=r.cluster; else if(mode==='mine'&&sel) dim=!(r.a===sel||r.b===sel);
      p.setAttribute('class',cls+(dim?' dim':'')+(show?'':' hide')); p.setAttribute('stroke-width',(show?w:0).toFixed(2)); p.style.strokeOpacity=''; if(show&&!dim) p.style.strokeOpacity=r.local?0.85:(mode==='all'?0.3:0.55);
      if(mode==='clusters'&&r.local){ const loc=NODES[r.a]&&NODES[r.a].role==='local'?r.a:(NODES[r.b]&&NODES[r.b].role==='local'?r.b:null); const root=loc?(CLUSTER_OF[loc]||[])[0]:null; p.style.stroke=root&&CLUSTER_COLORS[root]?CLUSTER_COLORS[root]:''; } else p.style.stroke=''; }
    for(const c in nodeEls){ const n=NODES[c]; const el=nodeEls[c]; let dim=false, hide=false; const lbl=lblEls[c];
      if(mode==='inside') hide=!n.azrf; else if(mode==='clusters') hide=!(n.azrf||n.role==='rootOut'); else if(mode==='capitals') dim=!(n.azrf||CAPITALS.has(c)); else if(mode==='hubs') dim=!(n.azrf||HUBS2.has(c)); else if(mode==='mine'&&sel) dim=!(c===sel||ROUTES.some(r=>(r.a===sel&&r.b===c)||(r.b===sel&&r.a===c)));
      el.style.display=hide?'none':''; el.classList.toggle('dim',dim); el.classList.toggle('hl',mode==='mine'&&c===sel);
      if(mode==='clusters'&&n.role==='local'){ const root=(CLUSTER_OF[c]||[])[0]; el.style.fill=root&&CLUSTER_COLORS[root]?CLUSTER_COLORS[root]:''; } else el.style.fill='';
      if(lbl){ lbl.style.visibility=hide?'hidden':''; lbl.classList.toggle('dim',dim); } } };
  api.showPath=function(codes,fromTo){ gPath.innerHTML=''; if(fromTo){ const [a,b]=fromTo; if(NODES[a]&&NODES[b]) svgEl('path',{d:gcPath(NODES[a],NODES[b]),class:'direct'},gPath); } if(codes&&codes.length>1){ let d=''; for(let i=0;i<codes.length-1;i++) if(NODES[codes[i]]&&NODES[codes[i+1]]) d+=gcPath(NODES[codes[i]],NODES[codes[i+1]]); svgEl('path',{d,class:'path-casing'},gPath); svgEl('path',{d,class:'path'},gPath); }
    const on=new Set(codes||[]); for(const c in nodeEls){ const hit=on.has(c)||(fromTo&&fromTo.includes(c)); nodeEls[c].classList.toggle('dim',!hit); nodeEls[c].classList.toggle('hl',hit); } for(const c in lblEls) lblEls[c].classList.toggle('dim',!(on.has(c)||(fromTo&&fromTo.includes(c)))); };
  return api; }
// ---------- сутки над Арктикой ----------
(function sky(){ const box=$('#map-sky'); if(!box||!X.day) return; const map=makeMap(box,{id:'s',label:'Самолёты в воздухе в течение суток',noTech:true}); map.setMode('all'); map.routeEls.forEach(p=>{ p.style.strokeOpacity=p.__r.local?0.25:0.08; });
  for(const c in map.lblEls){ if(!D.profiles[c]&&!['MOW','LED','OVB','KJA','YKS'].includes(c)) map.lblEls[c].style.display='none'; }
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches; let day='winter', t=reduce?720:0, playing=!reduce, last=null, flights=[];
  const slider=$('#sky-time'), clock=$('#sky-clock'), air=$('#sky-air'), total=$('#sky-total'), totalW=$('#sky-total-w'), btn=$('#sky-play');
  function load(){ map.gTop.innerHTML=''; flights=X.day[day].flights.filter(f=>NODES[f[0]]&&NODES[f[1]]).map(f=>{ const pts=gcPts(NODES[f[0]],NODES[f[1]],40); const el=svgEl('circle',{class:'plane-dot',r:3,fill:f[4]?'var(--accent)':'var(--sky-deep)',opacity:0},map.gTop); return {a:f[0],b:f[1],dep:f[2],arr:f[3],local:f[4],seats:f[5],pts,el}; });
    const n=flights.filter(f=>f.dep>=0&&f.dep<1440).length; total.textContent=fmt(n); totalW.textContent=pl(n,'рейс','рейса','рейсов'); size(); draw(); }
  function size(){ const k=map.k(); for(const f of flights) f.el.setAttribute('r',((2+2.4*Math.sqrt(Math.min(f.seats,200)/200))*Math.max(1,k*0.85)).toFixed(1)); }
  map.onResize=()=>size();
  function draw(){ let n=0; for(const f of flights){ if(t>=f.dep&&t<=f.arr){ const q=(t-f.dep)/Math.max(1,f.arr-f.dep); const i=Math.min(39,Math.floor(q*40)), r=q*40-i; const p0=f.pts[i], p1=f.pts[i+1]; const x=p0[0]+(p1[0]-p0[0])*r, y=p0[1]+(p1[1]-p0[1])*r; f.el.setAttribute('cx',x.toFixed(1)); f.el.setAttribute('cy',y.toFixed(1)); f.el.setAttribute('opacity',1); n++; } else f.el.setAttribute('opacity',0); }
    const hh=Math.floor(t/60)%24, mm=Math.floor(t%60); clock.textContent=String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0'); air.textContent=n; slider.value=Math.floor(t)%1440; }
  function frame(now){ if(!playing){ last=null; return; } if(last!=null){ t+=(now-last)/1000*60; if(t>=1440) t-=1440; } last=now; draw(); requestAnimationFrame(frame); }
  function setPlay(p){ playing=p; btn.textContent=p?'❚❚ Пауза':'▶ Смотреть'; btn.setAttribute('aria-label',p?'Пауза':'Запустить'); if(p) requestAnimationFrame(frame); }
  btn.addEventListener('click',()=>setPlay(!playing));
  slider.addEventListener('input',()=>{ t=+slider.value; draw(); });
  const MON_G=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']; $$('#network [data-day]').forEach(b=>{ const dd=(X.day[b.dataset.day]||{}).date; if(dd){ const [yy,mm,dy]=dd.split('-').map(Number); b.textContent=(b.dataset.day==='winter'?'Зима':'Лето')+', '+dy+' '+MON_G[mm-1]+' '+yy; } });
  $$('#network [data-day]').forEach(b=>b.addEventListener('click',()=>{ $$('#network [data-day]').forEach(x=>x.classList.toggle('on',x===b)); day=b.dataset.day; load(); }));
  const io=new IntersectionObserver(es=>es.forEach(e=>{ if(!e.isIntersecting&&playing){ playing=false; box.__resume=true; } else if(e.isIntersecting&&box.__resume){ box.__resume=false; setPlay(true); } }),{threshold:0}); io.observe(box);
  load(); setPlay(playing); })();
// ---------- куда ведут рейсы ----------
(function mix(){ const M=X.dest_mix; if(!M) return; const parts=[['capitals','m-cap','Москва и Петербург','--navy'],['hubs','m-hub','Тюмень, Уфа, Красноярск, Новосибирск, Екатеринбург','--sky-deep'],['other','m-oth','другие города','--grey-blue'],['resorts','m-res','курорты','--sky'],['inside','m-in','внутри Арктики и местных сетей','--accent']];
  const box=$('#mix'); box.setAttribute('aria-label',parts.map(p=>p[2]+' '+pct(M[p[0]])+' %').join(', '));
  for(const [k,c,l] of parts){ const d=h('div',{class:c,tabindex:'0'},`<b>${pct(M[k])}%</b><span>${l}</span>`); d.style.flex=M[k]; box.appendChild(d); bindTip(d,()=>`<b>${l}</b><br>${pct(M[k],1)} % пассажиропотока за год`); }
  $('#mix-legend').innerHTML=parts.map(([k,c,l,v])=>`<span class="k"><span class="sw" style="background:var(${v})"></span>${l} · ${pct(M[k])} %</span>`).join('');
 })();
// ---------- main scrolly map ----------
const mainMap=makeMap($('#map-main'),{interactive:true,id:'m',missing:true});
mainMap.setMode('all');
$('#map-legend').innerHTML=`<span class="k"><span class="sw line" style="background:var(--sky-deep)"></span>рейсы на большую землю</span><span class="k"><span class="sw line" style="background:var(--accent)"></span>внутри Арктики и местных сетей</span><span class="k mk"><span class="sw dot" style="background:var(--navy)"></span>магистральный аэропорт АЗРФ</span><span class="k mk"><span class="sw dot" style="background:var(--accent)"></span>местный аэропорт</span><span class="k mk"><span class="sw ring"></span>узловой аэропорт</span><span class="k mk"><span class="sw miss"></span>аэродром АЗРФ без данных</span><span class="k mk"><span class="sw" style="background:var(--map-full)"></span>регион целиком в АЗРФ</span><span class="k mk"><span class="sw" style="background:repeating-linear-gradient(45deg,var(--map-part),var(--map-part) 2px,var(--map-full) 2px,var(--map-full) 4px)"></span>частично</span>`;
const steps=$$('.step'); let mineCode=null;
const io=new IntersectionObserver(es=>{ es.forEach(e=>{ if(e.isIntersecting){ steps.forEach(s=>s.classList.toggle('on',s===e.target)); const m=e.target.dataset.mode; mainMap.setMode(m==='all'&&mineCode?'mine':m,mineCode); } }); },{rootMargin:'-45% 0px -45% 0px',threshold:0});
steps.forEach(s=>io.observe(s));
// ---------- matrix of root pairs ----------
const ROOTS=CN.roots.slice().sort((a,b)=>D.profiles[a].lon-D.profiles[b].lon);
const TT=X.travel||{}; const PW=X.pair_weeks||{};
function pairKey(a,b){ return a<b?a+'-'+b:b+'-'+a; }
(function matrix(){ const box=$('#matrix'); if(!box) return;
  responsive(box,W=>{ box.innerHTML=''; const n=ROOTS.length; const lab=W<480?78:118; const padR=W<480?36:52; const cs=Math.max(14,Math.floor((W-lab-padR)/n)); const top=lab-8; const H=top+cs*n+4; const svg=svgEl('svg',{viewBox:`0 0 ${lab+cs*n+padR} ${H}`,role:'img','aria-label':`Матрица связности ${n} магистральных аэропортов`},box);
    const short=c=>{ const s=D.profiles[c].city; return W<480?(s.length>9?s.slice(0,8)+'.':s):s; };
    const rowL=[], colL=[];
    ROOTS.forEach((a,i)=>{ const t=svgEl('text',{x:lab-6,y:top+i*cs+cs/2+4,'text-anchor':'end',class:'lab'},svg); t.textContent=short(a); rowL.push(t); const c=svgEl('text',{x:0,y:0,class:'lab',transform:`translate(${lab+i*cs+cs/2+4},${top-6}) rotate(-60)`},svg); c.textContent=short(a); colL.push(c); });
    ROOTS.forEach((a,i)=>ROOTS.forEach((b,j)=>{ if(i===j) return; const k=pairKey(a,b); const st=CN.matrix[k]; const r=svgEl('rect',{x:lab+j*cs,y:top+i*cs,width:cs,height:cs,class:'cell',fill:st==='direct'?'var(--navy)':(st==='transit'?'var(--sky)':'var(--bg-3)'),tabindex:0},svg);
      bindTip(r,()=>{ const w=PW[k]||[0,0]; const ab=a<b?w[0]:w[1], ba=a<b?w[1]:w[0]; const t1=TT[a+'-'+b], t2=TT[b+'-'+a]; return `<b>${D.profiles[a].city} ↔ ${D.profiles[b].city}</b><br>${st==='direct'?'прямой рейс круглый год':(st==='transit'?'регулярная стыковка с одной пересадкой':'регулярной связи нет')}<br>недель со связью: туда ${ab}, обратно ${ba} из 52<br>обычно в пути: ${t1?fmtH(t1.med):'—'} туда, ${t2?fmtH(t2.med):'—'} обратно`; });
      r.addEventListener('pointerenter',()=>{ rowL[i].classList.add('on'); colL[j].classList.add('on'); }); r.addEventListener('pointerleave',()=>{ rowL[i].classList.remove('on'); colL[j].classList.remove('on'); }); })); });
 })();
// ---------- sensitivity of the regularity threshold ----------
(function sens(){ const box=$('#chart-sens'); const S=X.sensitivity; if(!box||!S) return;
  responsive(box,W=>{ box.innerHTML=''; const H=Math.round(Math.max(220,Math.min(280,W*0.62))); const ml=34,mr=14,mt=16,mb=34; const svg=svgEl('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':'Число связанных пар в зависимости от порога'},box);
    const x0=S[0][0], x1=S[S.length-1][0], y0=10, y1=40; const x=v=>ml+(W-ml-mr)*(v-x0)/(x1-x0), y=v=>mt+(H-mt-mb)*(1-(v-y0)/(y1-y0));
    [10,20,30,40].forEach(t=>{ svgEl('line',{x1:ml,x2:W-mr,y1:y(t),y2:y(t),class:'grid'},svg); const tx=svgEl('text',{x:ml-6,y:y(t)+4,'text-anchor':'end',class:'tick'},svg); tx.textContent=t; });
    [26,30,35,40,45,52].forEach(t=>{ const tx=svgEl('text',{x:x(t),y:H-mb+18,'text-anchor':'middle',class:'tick'},svg); tx.textContent=t; });
    const xl=svgEl('text',{x:W-mr,y:H-4,'text-anchor':'end',class:'lab'},svg); xl.textContent='недель со связью в году →';
    let d=''; S.forEach(([t,n],i)=>{ d+=(i?'H'+x(t).toFixed(1)+'V':'M'+x(t).toFixed(1)+',')+y(n).toFixed(1); }); svgEl('path',{d,class:'ln',stroke:'var(--sky-deep)'},svg);
    const m=S.find(s=>s[0]===47); if(m){ svgEl('line',{x1:x(47),x2:x(47),y1:mt,y2:H-mb,class:'guide'},svg); svgEl('circle',{cx:x(47),cy:y(m[1]),r:5,fill:'var(--accent)',stroke:'var(--bg)','stroke-width':2},svg); const t=svgEl('text',{x:x(47)-10,y:y(m[1])+22,'text-anchor':'end',class:'ann halo'},svg); t.textContent=`47 недель: ${m[1]} ${pl(m[1],'пара','пары','пар')}`; }
    const hit=svgEl('rect',{x:ml,y:mt,width:W-ml-mr,height:H-mt-mb,fill:'transparent'},svg); hit.addEventListener('pointermove',e=>{ const r=svg.getBoundingClientRect(); const px=(e.clientX-r.left)*W/r.width; const v=Math.round(x0+(px-ml)/(W-ml-mr)*(x1-x0)); const s=S.find(q=>q[0]===Math.max(x0,Math.min(x1,v))); if(s) showTip(`<b>${s[0]} ${pl(s[0],'неделя','недели','недель')}</b> со связью в году<br>${s[1]} ${pl(s[1],'пара','пары','пар')} из 91`,e.clientX,e.clientY); }); hit.addEventListener('pointerleave',hideTip); });
 })();
// ---------- detour calculator (hours first) ----------
const arcticCodes=Object.keys(D.profiles).sort((a,b)=>D.profiles[a].city.localeCompare(D.profiles[b].city,'ru'));
const selFrom=$('#from'), selTo=$('#to'), mineSels=$$('.mine-select');
for(const c of arcticCodes){ for(const s of [selFrom,selTo,...mineSels]) s.appendChild(h('option',{value:c},D.profiles[c].city)); }
selFrom.value=D.profiles.NNM?'NNM':arcticCodes[0]; selTo.value=D.profiles.SLY?'SLY':arcticCodes[1];
const detMap=makeMap($('#map-detour'),{id:'d',noTech:true}); detMap.setMode('all'); detMap.routeEls.forEach(p=>{ p.style.strokeOpacity=0.12; });
function cap1(s){ return s?s[0].toUpperCase()+s.slice(1):s; }
// время прямого рейса по расписанию турбовинтовых самолётов (та же оценка, что в сноске и методике), часы
function directH(a,b){ const rec=D.detour[a+'-'+b]||D.detour[b+'-'+a]||{}; const km=rec.d||gcKm(NODES[a]||D.profiles[a],NODES[b]||D.profiles[b]); return (BF.a_min+BF.b_min_per_km*km)/60; }
// лишние часы для таблицы: от показанного (округлённого) времени в пути, чтобы разность сходилась
function extraShown(med,dir){ return med>=10?Math.max(0,Math.round(Math.round(med)-dir)):Math.max(0,med-dir); }
function renderDetour(){ const a=selFrom.value,b=selTo.value; const box=$('#detour-result'); if(a===b){ box.innerHTML='<p class="note">Выберите два разных аэропорта.</p>'; detMap.showPath(null,null); return; }
  const t=TT[a+'-'+b]; const rec=D.detour[a+'-'+b]||{}; const direct=rec.d||Math.round(gcKm(NODES[a],NODES[b])); const km=rec.reg||rec.all;
  const kmTip=`По прямой ${fmt(direct)} км.`+(km?` Кратчайший путь по ${rec.reg?'круглогодичным':'всем'} рейсам — ${fmt(km[0])} км (×${fmt(km[2],1)}): ${km[1].map(nm).join(' → ')}.`:'');
  let html=`<h3>${nm(a)} → ${nm(b)}</h3>`;
  if(!t){ html+=`<p class="prose" style="margin-top:8px">По расписанию за год добраться с двумя пересадками за трое суток нельзя ни в один день. <span class="hv" tabindex="0" data-tip="${kmTip}">${fmt(direct)} км по прямой</span>.</p>`; box.innerHTML=html; detMap.showPath(km?km[1]:null,[a,b]); }
  else { const days=X.period_days||365; const legs=t.ex; const cities=[legs[0][0],...legs.map(l=>l[1])]; const noDirect=t.via.length>0; const dir=directH(a,b); const ext=Math.max(0,t.med-dir);
    html+=`<div class="big"><div class="stat"><div class="v num"><span class="hv" tabindex="0" data-tip="Медиана самого быстрого варианта по дням вылета. Самый быстрый за год — ${fmtH(t.min,true)}. Вылететь с прибытием в пределах трёх суток можно ${t.days} ${pl(t.days,'день','дня','дней')} из ${days}.">${fmtHb(t.med)}</span></div><div class="l">обычно в пути</div></div><div class="stat"><div class="v num">≈${fmtHb(dir)}</div><div class="l">занял бы прямой рейс</div></div><div class="stat${noDirect&&ext>=3?' hi':''}"><div class="v num">${noDirect?'+'+fmtHb(ext):'0'}</div><div class="l">${noDirect?'лишних часов':'прямой рейс есть'}</div></div></div>`;
    html+=`<p class="route-line">${noDirect?'Обычно так':'Прямой рейс'}: ${cities.map((c,i)=>i===0||i===cities.length-1?'<b>'+nm(c)+'</b>':nm(c)).join(' → ')}${noDirect?` — в ${pct(t.via_share)} % дней`:''}. <span class="hv" tabindex="0" data-tip="${kmTip}">${fmt(direct)} км по прямой</span>.</p>`;
    html+=`<ul class="legs">${legs.map(l=>`<li>${l[6]&&l[6]!==l[5]?`${l[5]} ${l[2]} → ${l[6]} ${l[3]}`:`${l[5]} · ${l[2]}–${l[3]}`} · ${nm(l[0])} → ${nm(l[1])} · рейс ${l[4]}</li>`).join('')}</ul><p class="note" style="margin-top:6px">Пример — день, когда дорога заняла обычное время. Время местное.</p>`;
    if(rec.g) html+=`<p class="note" style="margin-top:8px">${cap1(rec.g)}, поэтому крюк по воздуху здесь не показатель доступности.</p>`;
    if(rec.n) html+=`<p class="note" style="margin-top:8px">${cap1(rec.n)}.</p>`;
    box.innerHTML=html; detMap.showPath(cities,[a,b]); }
  $$('[data-tip]',box).forEach(e=>bindTip(e,()=>e.dataset.tip)); }
selFrom.addEventListener('change',renderDetour); selTo.addEventListener('change',renderDetour); renderDetour();
// ranked: longest trips between neighbours
(function ranked(){ const rows=[]; const R=ROOTS; for(let i=0;i<R.length;i++) for(let j=i+1;j<R.length;j++){ const a=R[i],b=R[j]; if(a==='VKT'||b==='VKT') continue; const d1=D.detour[a+'-'+b]||{}, d2=D.detour[b+'-'+a]||{}; if(d1.g||d1.n||d2.g||d2.n) continue; const km=d1.d||d2.d; if(!km||km>1000) continue; const dir=directH(a,b); const c=[[a,b],[b,a]].map(([x,y])=>({x,y,t:TT[x+'-'+y]})).filter(o=>o.t).map(o=>({...o,dir,ext:Math.max(0,o.t.med-dir)})).sort((p,q)=>q.ext-p.ext); if(c.length) rows.push({...c[0],km}); }
  rows.sort((p,q)=>q.ext-p.ext); const top=rows.slice(0,8); const mx=top.length?top[0].ext:1; const tb=$('#ranked tbody');
  top.forEach(r=>{ const tr=h('tr',{tabindex:'0'}); const via=r.t.via.map(c=>acc(nm(c))); tr.innerHTML=`<td><b>${nm(r.x)} → ${nm(r.y)}</b></td><td>${via.length?'через '+via.join(' и '):'прямой рейс'}</td><td class="n t">${fmtH(r.t.med)}</td><td class="n x"><div style="display:flex;align-items:center;gap:8px;justify-content:flex-end"><div class="bar" style="width:${Math.round(80*r.ext/mx)}px"></div>+${fmtH(extraShown(r.t.med,r.dir))}</div></td>`; tb.appendChild(tr);
    bindTip(tr,()=>`<b>${nm(r.x)} → ${nm(r.y)}</b><br>${fmt(r.km)} км по прямой; прямой рейс занял бы около ${fmtH(r.dir)}<br>обычно в пути ${fmtH(r.t.med,true)}, самый быстрый вариант за год — ${fmtH(r.t.min,true)}<br>вылететь можно ${r.t.days} ${pl(r.t.days,'день','дня','дней')} из ${X.period_days||365}`); });
 })();
// ---------- fleet unit chart ----------
const SOV=new Set(['Ан-24','Ан-26','Як-42','Ми-8']), UNP=new Set(['Ан-24','Ан-26','ATR 42/72','DHC-8','Ми-8']);
(function units(){ const dirs=D.fleet.directions.slice().sort((x,y)=>y.seats-x.seats); const loc=$('#units-local'), tr=$('#units-trunk'); for(const d of dirs){ const sov=SOV.has(d.family), unp=UNP.has(d.family); const u=h('div',{class:'unit'+(sov?' sov':'')+(unp?'':' paved')+(d.local?'':' trunk'),tabindex:'0'}); u.innerHTML=`<span class="t">${d.family.replace('CRJ 100/200','CRJ').replace('ATR 42/72','ATR').replace('Boeing 737','737').replace('SSJ 100','SSJ')}</span>`; bindTip(u,()=>`<b>${d.pair[0]} — ${d.pair[1]}</b><br>основной тип: ${d.family}; ${seatsW(d.seats)} за год<br>${Object.entries(d.families).sort((x,y)=>y[1]-x[1]).map(f=>f[0]+' '+pct(f[1]/Object.values(d.families).reduce((s,v)=>s+v,0))+' %').join(', ')}`); (d.local?loc:tr).appendChild(u); }
 })();
// ---------- isolation barcode ----------
(function iso(){ const I=X.isolation; const box=$('#iso'); if(!I||!box) return; const days=X.period_days||365; const loc=D.classification.local.filter(c=>I[c]).sort((a,b)=>I[a].days_dep-I[b].days_dep);
  for(const c of loc){ const v=I[c]; const row=h('div',{class:'row',tabindex:'0'}); row.appendChild(h('div',{class:'nm'},D.profiles[c].city)); const s=svgEl('svg',{class:'bc',viewBox:`0 0 ${days} 18`,preserveAspectRatio:'none','aria-hidden':'true'}); svgEl('rect',{x:0,y:0,width:days,height:18,fill:'var(--bg-2)'},s); let d=''; for(let i=0;i<v.bits.length;i++) if(v.bits[i]==='1') d+=`M${i} 0h1v18h-1z`; svgEl('path',{d,fill:'var(--accent)'},s); row.appendChild(s); row.appendChild(h('div',{class:'vl'},`${v.days_dep} ${pl(v.days_dep,'день','дня','дней')}`)); box.appendChild(row);
    bindTip(row,()=>`<b>${D.profiles[c].city}</b><br>вылеты ${v.days_dep} ${pl(v.days_dep,'день','дня','дней')} из ${days}, всего ${fmt(v.deps)} ${pl(v.deps,'рейс','рейса','рейсов')}<br>в среднем ${fmt(v.per_week,1)} в неделю, самый долгий перерыв — ${v.max_gap} ${pl(v.max_gap,'день','дня','дней')}`); }
  const ax=h('div',{class:'axis'}); ax.innerHTML=`<span></span><span class="ms"><span>окт 2025</span><span>янв</span><span>апр</span><span>июл</span><span>сен 2026</span></span><span></span>`; box.appendChild(ax);
  const GEN={'Светлогорск':'Светлогорска','Диксон':'Диксона','Саскылах':'Саскылаха','Подкаменная Тунгуска':'Подкаменной Тунгуски','Мома':'Момы','Саккырыр':'Саккырыра','Зырянка':'Зырянки','Кепервеем':'Кепервеема'};
  const LOC={'Зырянка':'в Зырянке','Кепервеем':'в Кепервееме','Белая Гора':'в Белой Горе','Светлогорск':'в Светлогорске','Саскылах':'в Саскылахе'};
  const a=loc[0], b=loc[1]; const ca=D.profiles[a].city, cb=D.profiles[b].city; const g=loc.slice().sort((p,q)=>I[q].max_gap-I[p].max_gap)[0]; const cg=D.profiles[g].city; const weekly=loc.filter(c=>I[c].per_week<=2).length;
  $('#iso-text').innerHTML=`Из ${GEN[ca]||ca} и ${GEN[cb]||cb} самолёт улетал меньше чем раз в неделю: <span class="hv" tabindex="0" data-tip="${fmt(I[a].deps)} и ${fmt(I[b].deps)} ${pl(I[b].deps,'рейс','рейса','рейсов')} за год">${I[a].days_dep} и ${I[b].days_dep} дней с вылетами за год</span>. Самый долгий перерыв — ${LOC[cg]||'в аэропорту '+cg}: ${I[g].max_gap} ${pl(I[g].max_gap,'день','дня','дней')} без единого вылета. В ${weekly} из ${loc.length} ${pl(loc.length,'посёлка','посёлков','посёлков')} рейсы бывают в среднем не чаще двух раз в неделю.`;
  $$('#iso-text [data-tip]').forEach(e=>bindTip(e,()=>e.dataset.tip));
 })();
// aircraft gallery
(function gallery(){ const shapes={ turbo:'M50 4 L53 12 L54 24 L96 30 L96 35 L54 36 L53 46 L62 50 L62 53 L50 52 L38 53 L38 50 L47 46 L46 36 L4 35 L4 30 L46 24 L47 12 Z M28 26 L28 40 M72 26 L72 40', jet:'M50 3 L53.5 10 L55 21 L93 44 L93 49 L55 35 L54 45 L65 53 L65 56 L50 52 L35 56 L35 53 L46 45 L45 35 L7 49 L7 44 L45 21 L46.5 10 Z', heli:'M50 12 L54 16 L54 30 L52 48 L58 52 L58 54 L50 53 L42 54 L42 52 L48 48 L46 30 L46 16 Z M50 14 L22 28 M50 14 L78 28 M50 14 L22 2 M50 14 L78 2' };
  const info={'SSJ 100':['jet','Sukhoi Superjet 100','Россия, 2011'],'Airbus A320':['jet','Airbus A320','Франция'],'Boeing 737':['jet','Boeing 737','США'],'CRJ 100/200':['jet','Bombardier CRJ 100/200','Канада'],'Embraer E-Jet':['jet','Embraer 170/190','Бразилия'],'Ан-24':['turbo','Ан-24','СССР, 1962'],'DHC-8':['turbo','De Havilland DHC-8-300','Канада'],'ATR 42/72':['turbo','ATR 42/72','Франция, Италия'],'Як-42':['jet','Як-42','СССР, Россия'],'Ан-26':['turbo','Ан-26','СССР, 1969'],'Ми-8':['heli','Ми-8','СССР, Россия']};
  const g=$('#gallery'); const dirCount={}; for(const d of D.fleet.directions) dirCount[d.family]=(dirCount[d.family]||0)+1; for(const f of D.fleet_all){ if(!info[f.family]||f.flights<100) continue; const [shape,name,origin]=info[f.family]; const card=h('div',{class:'plane'+(SOV.has(f.family)?' sov':'')}); card.innerHTML=`<svg viewBox="0 0 100 58" aria-hidden="true"><path d="${shapes[shape]}" fill="none" stroke="${SOV.has(f.family)?'var(--amber)':'var(--sky-deep)'}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg><div class="name">${name}</div><div class="meta">${origin} · ${seatsW(f.seats_typ)}<br>${pct(f.share_flights,1)} % рейсов за год${dirCount[f.family]?'<br>основной тип на '+dirCount[f.family]+' '+pl(dirCount[f.family],'направлении','направлениях','направлениях'):''}${UNP.has(f.family)?'<br>садится на грунт':''}</div>`; g.appendChild(card); } })();
// ---------- season heat strip ----------
const seasonRows=[];
function cv(a){ const m=a.reduce((s,v)=>s+v,0)/a.length; return m?Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/a.length)/m:0; }
(function heat(){ const H=$('#heat'); H.appendChild(h('div')); MONTHS.forEach(m=>H.appendChild(h('div',{class:'h'},`<span class="full">${m}</span><span class="short">${m[0].toUpperCase()}</span>`))); H.appendChild(h('div',{class:'h'},'КВ')); const rows=Object.keys(D.season).filter(k=>!k.startsWith('__')); const all=[...rows.map(k=>[k,D.profiles[k].city,D.season[k]]),['__inside_azrf','Внутри Арктики',D.season.__inside_azrf],['__all','Все рейсы',D.season.__all]]; all.sort((x,y)=>{ if(x[0].startsWith('__')!==y[0].startsWith('__')) return x[0].startsWith('__')?1:-1; return cv(x[2])-cv(y[2]); });
  const col=v=>{ const t=Math.max(0,Math.min(1,(v-0.6)/0.8)); const c0=[220,235,250], c1=[13,54,107]; return `rgb(${c0.map((a,i)=>Math.round(a+(c1[i]-a)*t)).join(',')})`; };
  let sep=false; for(const [k,name,arr] of all){ if(k.startsWith('__')&&!sep){ H.appendChild(h('div',{class:'sep'})); sep=true; } const mean=arr.reduce((s,v)=>s+v,0)/arr.length; const r=h('div',{class:'r'},name); r.dataset.code=k; H.appendChild(r); seasonRows.push(r); arr.forEach((v,i)=>{ const c=h('div',{class:'c',tabindex:'0'}); const idx=mean?v/mean:0; c.style.background=v?col(idx):'var(--bg-3)'; bindTip(c,()=>`<b>${name} · ${MONTHS_L[i]} ${i>=9?2025:2026}</b><br>${seatsW(v)} в сутки, ${fmt(idx,2)}× среднего за год`); H.appendChild(c); }); H.appendChild(h('div',{class:'cv'},fmt(cv(arr),2))); }
 })();
// group index lines (responsive)
(function groups(){ const G=D.season_by_group; const keys=['Столицы','Курорты','Остальные вне АЗРФ','АЗРФ']; const colors={'Столицы':'var(--navy)','Курорты':'var(--sky)','Остальные вне АЗРФ':'var(--grey-blue)','АЗРФ':'var(--accent)'}; const labels={'Столицы':'Москва и Петербург','Курорты':'курорты','Остальные вне АЗРФ':'остальные города','АЗРФ':'внутри Арктики и местных сетей'};
  const series=keys.map(k=>{ const a=G[k]; const m=a.reduce((s,v)=>s+v,0)/a.length; return {k,v:a.map(x=>100*x/m)}; });
  const box=$('#chart-groups'); responsive(box,W=>{ box.innerHTML=''; const Hh=300; const ml=40,mr=16,mt=26,mb=30; const svg=svgEl('svg',{viewBox:`0 0 ${W} ${Hh}`,role:'img','aria-label':'Сезонность по группам направлений'},box);
    const ymin=40,ymax=190; const x=i=>ml+(W-ml-mr)*i/11, y=v=>mt+(Hh-mt-mb)*(1-(v-ymin)/(ymax-ymin)); [50,100,150].forEach(t=>{ svgEl('line',{x1:ml,x2:W-mr,y1:y(t),y2:y(t),class:t===100?'axis':'grid'},svg); const tx=svgEl('text',{x:ml-6,y:y(t)+4,'text-anchor':'end',class:'tick'},svg); tx.textContent=t; }); MONTHS.forEach((m,i)=>{ if(W<420&&i%2) return; const tx=svgEl('text',{x:x(i),y:Hh-8,'text-anchor':'middle',class:'tick'},svg); tx.textContent=m; });
    for(const s of series){ svgEl('path',{d:'M'+s.v.map((v,i)=>x(i).toFixed(1)+','+y(Math.min(ymax,v)).toFixed(1)).join('L'),class:'ln',stroke:colors[s.k],'stroke-width':s.k==='АЗРФ'||s.k==='Курорты'?2.6:2},svg); const peak=s.v.indexOf(Math.max(...s.v)); if(s.k==='Курорты'||s.k==='АЗРФ'){ svgEl('circle',{cx:x(peak),cy:y(Math.min(ymax,s.v[peak])),r:4,fill:colors[s.k],stroke:'var(--bg)','stroke-width':2},svg); const label=(s.k==='Курорты'?'курорты: ':'внутри Арктики: ')+fmt(s.v[peak])+' в '+MONTHS_P[peak]; const tw=label.length*7.2; let lx=x(peak)+8; if(lx+tw>W-4) lx=x(peak)-8-tw; if(lx<ml) lx=Math.max(ml,Math.min(W-4-tw,x(peak)-tw/2)); const t=svgEl('text',{x:lx,y:y(Math.min(ymax,s.v[peak]))-10,class:'ann','text-anchor':'start'},svg); t.textContent=label; } }
    const hit=svgEl('rect',{x:ml,y:mt,width:W-ml-mr,height:Hh-mt-mb,fill:'transparent'},svg); const cursor=svgEl('line',{x1:0,x2:0,y1:mt,y2:Hh-mb,class:'axis',style:'display:none'},svg); hit.addEventListener('pointermove',e=>{ const r=svg.getBoundingClientRect(); const px=(e.clientX-r.left)*W/r.width; const i=Math.max(0,Math.min(11,Math.round((px-ml)/((W-ml-mr)/11)))); cursor.setAttribute('x1',x(i)); cursor.setAttribute('x2',x(i)); cursor.style.display=''; showTip(`<b>${MONTHS_L[i]} ${i>=9?2025:2026}</b><br>`+series.map(s=>labels[s.k]+': '+fmt(s.v[i])+' ('+seatsW(G[s.k][i])+' в сутки)').join('<br>'),e.clientX,e.clientY); }); hit.addEventListener('pointerleave',()=>{ cursor.style.display='none'; hideTip(); }); });
  $('#legend-groups').innerHTML=keys.map(k=>`<span class="k"><span class="sw line" style="background:${colors[k]}"></span>${labels[k]}</span>`).join('');
 })();
// CV x HHI scatter (responsive, labels placed without overlaps)
(function cvhhi(){ const pts=Object.entries(D.cv_hhi).filter(([c,v])=>v.cv<0.6); const box=$('#chart-cvhhi');
  responsive(box,W=>{ box.innerHTML=''; const Hh=Math.round(Math.max(320,Math.min(400,W*0.7))); const ml=44,mr=16,mt=16,mb=36; const svg=svgEl('svg',{viewBox:`0 0 ${W} ${Hh}`,role:'img','aria-label':'Сезонность и концентрация потока по магистральным аэропортам'},box);
    const xmin=-0.085,xmax=0.42,ymin=0.1,ymax=0.75; const x=v=>ml+(W-ml-mr)*(v-xmin)/(xmax-xmin), y=v=>mt+(Hh-mt-mb)*(1-(v-ymin)/(ymax-ymin));
    [0.1,0.2,0.3,0.4].forEach(t=>{ svgEl('line',{x1:x(t),x2:x(t),y1:mt,y2:Hh-mb,class:'grid'},svg); const tx=svgEl('text',{x:x(t),y:Hh-mb+16,'text-anchor':'middle',class:'tick'},svg); tx.textContent=fmt(t,1); }); [0.2,0.4,0.6].forEach(t=>{ svgEl('line',{x1:ml,x2:W-mr,y1:y(t),y2:y(t),class:'grid'},svg); const tx=svgEl('text',{x:ml-6,y:y(t)+4,'text-anchor':'end',class:'tick'},svg); tx.textContent=fmt(t,1); });
    const xl=svgEl('text',{x:W-mr,y:Hh-4,'text-anchor':'end',class:'lab'},svg); xl.textContent='сезонность (КВ) →'; const yl=svgEl('text',{x:ml+4,y:mt+10,class:'lab'},svg); yl.textContent='↑ концентрация на хабах (HHI)';
    const z1=svgEl('text',{x:x(-0.07),y:y(0.115),class:'zone'},svg); z1.textContent=W<520?'вахтовая':'вахтовая: ровно и во много городов'; const z2=svgEl('text',{x:x(0.4),y:y(0.70),'text-anchor':'end',class:'zone'},svg); z2.textContent=W<520?'туристическая':'туристическая: сезонно';
    const boxes=pts.map(([c,v])=>({x:x(v.cv)-10,y:y(v.hhi)-10,w:20,h:20})); [0.2,0.4,0.6].forEach(t=>boxes.push({x:ml-30,y:y(t)-6,w:28,h:12})); boxes.push({x:x(-0.07)-2,y:y(0.115)-12,w:W<520?80:250,h:14},{x:x(0.4)-(W<520?110:170),y:y(0.70)-12,w:W<520?112:172,h:14},{x:ml,y:mt,w:220,h:14});
    const CAND=[[9,4,'start'],[-9,4,'end'],[0,-10,'middle'],[0,17,'middle'],[9,-6,'start'],[9,15,'start'],[-9,-6,'end'],[-9,15,'end'],[0,-20,'middle'],[0,27,'middle']]; const hit=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
    pts.slice().sort((p,q)=>p[1].hhi-q[1].hhi).forEach(([c,v])=>{ const name=v.name.replace(/ \(.*\)/,''); const tw=name.length*6.9+4, th=13; const px=x(v.cv), py=y(v.hhi); const own=pts.findIndex(q=>q[0]===c); let best=null,bestN=1e9; for(const [dx,dy,an] of CAND){ const bx=an==='end'?px+dx-tw:(an==='middle'?px+dx-tw/2:px+dx); const bb={x:bx,y:py+dy-th+2,w:tw,h:th}; if(bb.x<ml+1||bb.x+bb.w>W+4) continue; const n=boxes.reduce((s,b,i)=>s+(i!==own&&hit(bb,b)?1:0),0); if(n<bestN){ bestN=n; best=[dx,dy,an,bb]; if(!n) break; } }
      if(!best) best=[9,4,'start',{x:px+9,y:py-9,w:tw,h:th}]; const [dx,dy,an,bb]=best; const showLab=!(bestN>0&&W<520); if(showLab) boxes.push(bb); const g=svgEl('g',null,svg); const dot=svgEl('circle',{cx:px,cy:py,r:6,class:'dot',fill:v.cv>0.15?'var(--sky)':'var(--navy)',tabindex:0},g); dot.dataset.code=c; if(showLab){ const t=svgEl('text',{x:px+dx,y:py+dy,class:'lab','text-anchor':an},g); t.textContent=name; } bindTip(dot,()=>`<b>${v.name}</b><br>КВ ${fmt(v.cv,2)}, HHI ${fmt(v.hhi,2)}<br>${v.n_dest} ${pl(v.n_dest,'направление','направления','направлений')} вне АЗРФ, крупнейшие: ${v.top.map(t=>t[0]+' '+pct(t[1])+' %').join(', ')}`); });
    });
 })();
// ---------- prices ----------
const WAGE=(X.wages||{}).values||{}; const WD=(X.wages||{}).workdays||21;
function arcticRegion(r){ const c=r.oa?r.o:(r.da?r.d:null); return c&&D.profiles[c]?D.profiles[c].region:null; }
function workdays(price,region){ const w=WAGE[region]; return w?price/(w/WD):null; }
let priceDots=[]; let mineApply=null;
(function price(){ const R=D.prices.routes.filter(r=>r.el&&r.p30&&r.km>100); const box=$('#chart-price'); const F=(X.price_fair||{}).fits;
  responsive(box,W=>{ box.innerHTML=''; priceDots=[]; const Hh=Math.round(Math.max(340,Math.min(520,W*0.62))); const ml=W<480?62:66,mr=14,mt=18,mb=40; const svg=svgEl('svg',{viewBox:`0 0 ${W} ${Hh}`,role:'img','aria-label':'Цена билета и расстояние по маршрутам'},box);
    const xmin=Math.log10(180),xmax=Math.log10(7000),ymin=Math.log10(1200),ymax=Math.log10(120000); const x=v=>ml+(W-ml-mr)*(Math.log10(v)-xmin)/(xmax-xmin), y=v=>mt+(Hh-mt-mb)*(1-(Math.log10(v)-ymin)/(ymax-ymin));
    [200,500,1000,2000,5000].forEach(t=>{ svgEl('line',{x1:x(t),x2:x(t),y1:mt,y2:Hh-mb,class:'grid'},svg); const tx=svgEl('text',{x:x(t),y:Hh-mb+16,'text-anchor':'middle',class:'tick'},svg); tx.textContent=fmt(t); }); [2000,5000,10000,20000,50000,100000].forEach(t=>{ svgEl('line',{x1:ml,x2:W-mr,y1:y(t),y2:y(t),class:'grid'},svg); const tx=svgEl('text',{x:ml-6,y:y(t)+4,'text-anchor':'end',class:'tick'},svg); tx.textContent=t>=1000?fmt(t/1000)+' тыс.':t; });
    const xl=svgEl('text',{x:W-mr,y:Hh-4,'text-anchor':'end',class:'lab'},svg); xl.textContent='расстояние по прямой, км →'; const yl=svgEl('text',{x:ml+4,y:mt+10,class:'lab'},svg); yl.textContent='↑ медиана цены за 30 дней до вылета, ₽';
    [1,10,40].forEach(kk=>{ let a=[200,200*kk], b=[6500,6500*kk]; if(a[1]<1200) a=[1200/kk,1200]; if(b[1]>120000) b=[120000/kk,120000]; svgEl('line',{x1:x(a[0]),y1:y(a[1]),x2:x(b[0]),y2:y(b[1]),class:'guide'},svg); const t=svgEl('text',{x:x(b[0])-4,y:y(b[1])-5,'text-anchor':'end',class:'tick'},svg); t.textContent=kk+' ₽/км'; });
    if(F) for(const [g,col] of [['trunk','var(--sky-deep)'],['small','var(--accent)']]){ const f=F[g]; const pts=[]; for(let i=0;i<=24;i++){ const km=Math.exp(Math.log(f.kmin)+(Math.log(f.kmax)-Math.log(f.kmin))*i/24); pts.push([x(km),y(Math.exp(f.a+f.b*Math.log(km)))]); } svgEl('path',{d:'M'+pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join('L'),class:'fit',stroke:col},svg); }
    const maxfl=Math.max(...R.map(r=>r.fl)); const sorted=R.slice().sort((a,b)=>b.fl-a.fl);
    for(const r of sorted){ const rad=2.5+9*Math.sqrt(Math.max(r.fl,5)/maxfl)*(W<480?0.7:1); const d=svgEl('circle',{cx:x(r.km).toFixed(1),cy:y(r.p30).toFixed(1),r:rad.toFixed(1),class:'dot',fill:r.small?'var(--accent)':'var(--sky-deep)','fill-opacity':0.75,tabindex:'0'},svg); d.__r=r; priceDots.push(d);
      bindTip(d,()=>{ const wd=workdays(r.p30,arcticRegion(r)); return `<b>${r.on} → ${r.dn}</b><br>${fmt(r.km)} км, медиана ${fmt(r.p30)} ₽, ${fmt(r.rk,1)} ₽/км${wd?`<br>≈ ${fmt(wd,1)} рабочих ${pl(Math.round(wd),'дня','дней','дней')} при средней зарплате в регионе`:''}<br>${fmt(r.fl)} ${pl(r.fl,'рейс','рейса','рейсов')} за год${r.fam?', '+r.fam:''}<br>за 14 дней: ${r.p14?fmt(r.p14)+' ₽':'н/д'}, за 3 дня: ${r.p3?fmt(r.p3)+' ₽':'н/д'}`; }); }
    const SD=X.same_distance; const ann=[]; if(SD){ ann.push([SD.small.o,SD.small.d,[[-40,-34],[40,-34],[-40,40],[40,40]]]); if(SD.trunk[0]) ann.push([SD.trunk[0].o,SD.trunk[0].d,[[-46,52],[-20,74],[46,52],[40,-40],[-40,-40]]]); } ann.push(['SVO','MMK',[[40,30],[40,56],[-40,44],[40,-40],[-40,-40]]]);
    const placed=[]; const hit=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
    for(const [o,dd,cands] of ann){ const r=R.find(q=>q.o===o&&q.d===dd); if(!r) continue; const px=x(r.km), py=y(r.p30); const l1=`${r.on} → ${r.dn}`, l2=`${fmt(r.km)} км · ${fmt(r.p30)} ₽`; const tw=Math.max(l1.length*7.4,l2.length*6.6)+6;
      const boxOf=([dx,dy])=>{ const tx=px+dx, ty=py+dy; const left=dx<0, up=dy<0; const b={x:left?tx-4-tw:tx+4, y:up?ty-18:ty, w:tw, h:30}; b.sx=0; if(b.x<ml) b.sx=ml-b.x; else if(b.x+b.w>W-mr) b.sx=W-mr-b.x-b.w; b.x+=b.sx; return b; };
      let pick=cands[0], pb=boxOf(cands[0]); for(const c of cands){ const b=boxOf(c); if(b.y<mt||b.y+b.h>Hh-mb) continue; if(placed.some(q=>hit(q,b))) continue; pick=c; pb=b; break; }
      placed.push(pb); const [dx,dy]=pick; const tx=px+dx, ty=py+dy; const left=dx<0, up=dy<0; const lx=tx+(left?-4:4)+pb.sx;
      svgEl('path',{d:`M${px},${py} L${tx},${ty}`,class:'leader'},svg); const t=svgEl('text',{x:lx,y:ty+(up?-4:12),class:'ann','text-anchor':left?'end':'start'},svg); t.textContent=l1; const t2=svgEl('text',{x:lx,y:ty+(up?10:26),class:'ann-s','text-anchor':left?'end':'start'},svg); t2.textContent=l2; }
    if(mineApply) mineApply(); });
  // tickets: one distance, two prices
  const SD=X.same_distance; const tk=$('#tickets'); if(SD){ const find=(o,d)=>D.prices.routes.find(r=>r.o===o&&r.d===d); const pair=[[find(SD.small.o,SD.small.d),'small'],[SD.trunk[0]&&find(SD.trunk[0].o,SD.trunk[0].d),'']];
    for(const [t,cls] of pair){ if(!t) continue; const reg=arcticRegion(t); const wd=workdays(t.p30,reg); const el=h('div',{class:'ticket '+cls}); el.innerHTML=`<div class="rt">${t.on} → ${t.dn}</div><div class="m"><span>${fmt(t.km)} км по прямой</span><span>${t.fam||''}</span><span>${fmt(t.fl)} ${pl(t.fl,'рейс','рейса','рейсов')} за год</span>${t.spf?`<span>${seatsW(t.spf)} в рейсе</span>`:''}</div><div class="pk"><span class="p">${fmt(t.p30)} ₽</span>${wd?`<span class="d"><span class="hv" tabindex="0" data-tip="Средняя начисленная зарплата: ${reg}, август 2026 года — ${fmt(WAGE[reg])} ₽ в месяц, ${WD} рабочий день">≈ ${fmt(wd,1)} рабочих ${pl(Math.round(wd),'дня','дней','дней')}</span></span>`:''}</div><div class="m" style="margin-top:6px"><span>медиана за 30 дней до вылета</span><span><b>${fmt(t.rk,0)} ₽/км</b></span></div>`; tk.appendChild(el); }
    $$('[data-tip]',tk).forEach(e=>bindTip(e,()=>e.dataset.tip)); }
  // booking depth
  const dp=D.prices.depth; const dbox=$('#depth'); for(const [k,title] of [['all','Все маршруты'],['small','Через аэропорты классов Г, Д, Е'],['trunk','Остальные маршруты']]){ const d=dp[k]; const row=h('div'); const up=d.share_up_10, flat=d.share_flat, down=d.share_down_5, rest=Math.max(0,1-up-flat-down); row.innerHTML=`<div class="t">${title} · ${d.routes} ${pl(d.routes,'маршрут','маршрута','маршрутов')}</div><div class="seg-bar" role="img" aria-label="${title}: дороже на 10% и больше — ${pct(up)}%, без изменений — ${pct(flat)}%, дешевле — ${pct(down)}%"><div class="s1" style="flex:${up}">${up>0.08?pct(up)+' %':''}</div><div class="s2" style="flex:${rest}"></div><div class="s3" style="flex:${flat}">${pct(flat)} %</div><div class="s4" style="flex:${down}">${down>0.08?pct(down)+' %':''}</div></div>`; dbox.appendChild(row); }
  dbox.appendChild(h('div',{class:'legend'},`<span class="k"><span class="sw" style="background:var(--navy)"></span>за 3 дня дороже на 10 % и больше</span><span class="k"><span class="sw" style="background:var(--sky)"></span>дороже до 10 %</span><span class="k"><span class="sw" style="background:var(--grey)"></span>та же цена (±5 %)</span><span class="k"><span class="sw" style="background:var(--bg-3);box-shadow:inset 0 0 0 1px var(--line-2)"></span>за 3 дня дешевле</span>`));
  // resort table
  const RS=D.prices.resort; const months=Object.keys(Object.values(RS)[0]).sort(); const order=['NSK','NOJ','NUX','NYM','SLY','ARH','MMK','NNM'].filter(c=>RS[c]); const tbl=$('#resort'); const mlabel=m=>{ const [yy,mm]=m.split('-'); return MONTHS[+mm-1]+' '+yy.slice(2); }; tbl.innerHTML='<thead><tr><th>Куда</th>'+months.map(m=>'<th>'+mlabel(m)+'</th>').join('')+'</tr></thead>'; const tb=h('tbody'); for(const c of order){ const row=RS[c]; const vals=months.map(m=>row[m]).filter(v=>v!=null); const lo=Math.min(...vals),hi=Math.max(...vals); const tr=h('tr'); tr.innerHTML='<td>'+nm(c)+'</td>'+months.map(m=>{ const v=row[m]; if(v==null) return '<td><span style="color:var(--muted)">н/д</span></td>'; const t=hi>lo?(v-lo)/(hi-lo):0.5; const c0=[232,241,251],c1=[11,60,140]; const bg=`rgb(${c0.map((a,i)=>Math.round(a+(c1[i]-a)*t)).join(',')})`; return `<td><span style="background:${bg};color:${t>0.55?'#fff':'#0D1B33'}">${fmt(v)}</span></td>`; }).join(''); tb.appendChild(tr); } tbl.appendChild(tb);
 })();
// ---------- subsidies ----------
(function dots(){ const d=$('#dots'); const S=D.subsidies||{}; const inside=S.inside_route||'Нарьян-Мар — Архангельск'; for(let i=0;i<58;i++){ const s=h('i',{tabindex:'0'}); const last=i===57; if(last) s.className='in'; bindTip(s,()=>last?`<b>${inside}</b><br>единственное субсидируемое направление между двумя аэропортами АЗРФ, ${fmt(S.inside_pair_flights||105)} парных рейсов в 2026 году`:`Направление ${i+1} из 58<br>между аэропортом АЗРФ и городом вне зоны`); d.appendChild(s); } })();
// ---------- ссылка на ограничения данных ----------
$$('a[href="#limits"]').forEach(a=>a.addEventListener('click',e=>{ const d=$('#limits'); if(!d) return; e.preventDefault(); d.open=true; d.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}); }));
if(location.hash==='#limits'){ const d=$('#limits'); if(d) d.open=true; }
// ---------- my airport ----------
function setMine(code){ mineCode=code||null; try{ localStorage.setItem('skyarctic-mine',mineCode||''); }catch(e){}
  const blocks={network:$('#mine-network'),fleet:$('#mine-fleet'),season:$('#mine-season'),prices:$('#mine-prices')};
  mineApply=()=>{ priceDots.forEach(d=>{ const m=!!mineCode&&(d.__r.o===mineCode||d.__r.d===mineCode); d.classList.toggle('dim',!!mineCode&&!m); d.classList.toggle('hl',m); }); };
  mineApply();
  if(!mineCode){ for(const b of Object.values(blocks)) b.hidden=true; const on=$('.step.on'); mainMap.setMode(on?on.dataset.mode:'all'); seasonRows.forEach(r=>r.classList.remove('mine')); return; }
  const p=D.profiles[mineCode]; const top=p.top.slice(0,3).map(t=>`${acc(nm(t[0]))} (${pct(t[2])} %)`).join(', '); const iso=(X.isolation||{})[mineCode];
  blocks.network.hidden=false; $('.txt',blocks.network).textContent=`${p.name}: ${p.role==='root'?'магистральный аэропорт':'местный аэропорт сети '+p.roots.map(nm).join(' и ')}, ${flightsW(p.flights)}, ${seatsW(p.seats)} за год, ${p.n_dest} ${pl(p.n_dest,'направление','направления','направлений')}. Внутри Арктики и местной сети — ${pct(p.share_azrf_seats)} % пассажиропотока. Чаще всего летают в ${top}.`;
  const on=$('.step.on'); if(on&&on.dataset.mode==='all') mainMap.setMode('mine',mineCode);
  blocks.fleet.hidden=false; $('.txt',blocks.fleet).textContent=`${p.name}: чаще всего летают ${p.families.slice(0,3).map(f=>f[0]+' ('+fmt(f[1])+' '+pl(f[1],'рейс','рейса','рейсов')+')').join(', ')}.`+(iso?` Самолёты улетали ${iso.days_dep} ${pl(iso.days_dep,'день','дня','дней')} из ${X.period_days||365}, самый долгий перерыв — ${iso.max_gap} ${pl(iso.max_gap,'день','дня','дней')}.`:'');
  const arr=p.monthly; const mean=arr.reduce((s,v)=>s+v,0)/12; const peak=arr.indexOf(Math.max(...arr)); const low=arr.indexOf(Math.min(...arr.filter(v=>v>0)));
  blocks.season.hidden=false; $('.txt',blocks.season).textContent=`${p.name}: в среднем ${seatsW(mean)} в сутки, пик в ${MONTHS_P[peak]} (${fmt(arr[peak])}), минимум в ${MONTHS_P[low]} (${fmt(arr[low])}).`;
  seasonRows.forEach(r=>r.classList.toggle('mine',r.dataset.code===mineCode));
  const mine=D.prices.routes.filter(r=>r.el&&r.p30&&(r.o===mineCode||r.d===mineCode));
  blocks.prices.hidden=false; if(mine.length){ const rks=mine.map(r=>r.rk).sort((a,b)=>a-b); const med=rks[Math.floor(rks.length/2)]; const cheap=mine.slice().sort((a,b)=>a.p30-b.p30)[0]; const dear=mine.slice().sort((a,b)=>b.p30-a.p30)[0]; const wd=workdays(dear.p30,p.region); $('.txt',blocks.prices).textContent=`${p.name}: ${mine.length} ${pl(mine.length,'маршрут','маршрута','маршрутов')} с ценами, медиана ${fmt(med,0)} ₽ за километр. Самый дешёвый билет — ${cheap.on} → ${cheap.dn} за ${fmt(cheap.p30)} ₽, самый дорогой — ${dear.on} → ${dear.dn} за ${fmt(dear.p30)} ₽${wd?`, это около ${fmt(wd,1)} рабочих ${pl(Math.round(wd),'дня','дней','дней')} при средней зарплате в регионе`:''}.`; } else $('.txt',blocks.prices).textContent=`${p.name}: по этому аэропорту цен в выгрузке нет.`;
  selFrom.value=mineCode; if(selTo.value===mineCode) selTo.value=arcticCodes.find(c=>c!==mineCode); renderDetour(); }
function syncMine(v){ mineSels.forEach(s=>{ if(s.value!==v) s.value=v; }); }
mineSels.forEach(s=>s.addEventListener('change',()=>{ syncMine(s.value); setMine(s.value); }));
try{ const saved=localStorage.getItem('skyarctic-mine'); if(saved&&D.profiles[saved]){ syncMine(saved); setMine(saved); } }catch(e){}
// ---------- типографика: без висячих предлогов ----------
// Короткие предлоги, союзы и частицы (до двух букв, а также «для», «без», «над», «под», «при», «про», «или», «как», «что»)
// привязываем неразрывным пробелом к следующему слову, число — к следующему слову, единице или знаку, тире — к предыдущему слову.
const RX_SHORT=/(^|[\s(«„"'—–\-])([а-яёa-z]{1,2}|для|без|над|под|при|про|или|как|что)[ \t\n\r]+/giu;
const RX_NUM=/(\d)[ \t\n\r\u00A0]+(?=[%₽×]|(?:км|ч|м|т|кг|г)(?![а-яё])|[а-яёa-z]{3})/giu;   // число + слово от трёх букв, единица или знак; предлог после числа не привязываем, чтобы не было длинных неразрывных цепочек
const RX_DASH=/[ \t\n\r]+(—)/g;
const TYPO_SKIP='svg,script,style,select,textarea';
function typoText(t){ let r=t, prev=null; for(let i=0;i<3&&r!==prev;i++){ prev=r; r=r.replace(RX_SHORT,'$1$2\u00A0'); } return r.replace(RX_NUM,'$1\u00A0').replace(RX_DASH,'\u00A0$1'); }
function typo(root){ if(!root) return; if(root.nodeType===3){ root=root.parentNode; if(!root) return; } if(root.nodeType!==1) return; if(root.closest&&root.closest(TYPO_SKIP)) return;
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>{ const p=n.parentElement; return p&&!p.closest(TYPO_SKIP)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT; }});
  const list=[]; while(w.nextNode()) list.push(w.currentNode); for(const n of list){ const t=typoText(n.data); if(t!==n.data) n.data=t; } }
typo(document.body);
// текст, который скрипт дописывает позже: калькулятор, подсказки, «мой аэропорт»
const typoQueue=new Set(); let typoRaf=0;
new MutationObserver(ms=>{ for(const m of ms){ if(m.type==='characterData') typoQueue.add(m.target); else m.addedNodes.forEach(n=>typoQueue.add(n)); }
  if(!typoRaf) typoRaf=requestAnimationFrame(()=>{ typoRaf=0; const q=[...typoQueue]; typoQueue.clear(); for(const n of q) if(n.isConnected) typo(n); }); })
  .observe(document.body,{subtree:true,childList:true,characterData:true});
})();
