/* Aircraft geometry and portable 3D renderer. No libraries or network.
   Sizes are in metres and follow published dimensions of each type:
   fuselage, wing planform with kink and dihedral, winglets, nacelles,
   propellers and tail. Surfaces are simplified, so the models stay
   illustrations rather than engineering drawings. */
(function(root){
  'use strict';
  const PI=Math.PI,TAU=PI*2,DEG=PI/180;
  const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
  const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
  const mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const len=a=>Math.hypot(a[0],a[1],a[2]);
  const norm=a=>{const l=len(a)||1;return [a[0]/l,a[1]/l,a[2]/l];};
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const mix=(a,b,t)=>a+(b-a)*t;
  const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
  const spow=(v,p)=>(v<0?-1:1)*Math.pow(Math.abs(v),p);
  const lin=(a,b,n)=>Array.from({length:n+1},(_,i)=>a+(b-a)*i/n);
  const se=(s,m)=>Math.pow(1-Math.pow(1-clamp(s,0,1),m),1/m);
  const bump=(x,a,b,r)=>smooth((x-a)/r)*smooth((b-x)/r);
  /* Monotone cubic through [x,y] knots (Fritsch–Carlson), used for nacelle and fairing outlines. */
  function curve(k){
    const n=k.length,xs=k.map(p=>p[0]),ys=k.map(p=>p[1]),d=[],m=new Array(n);
    for(let i=0;i<n-1;i++)d.push((ys[i+1]-ys[i])/(xs[i+1]-xs[i]));
    m[0]=d[0];m[n-1]=d[n-2];
    for(let i=1;i<n-1;i++)m[i]=d[i-1]*d[i]<=0?0:(d[i-1]+d[i])/2;
    for(let i=0;i<n-1;i++){
      if(d[i]===0){m[i]=m[i+1]=0;continue;}
      const a=m[i]/d[i],b=m[i+1]/d[i],h=a*a+b*b;
      if(h>9){const t=3/Math.sqrt(h);m[i]=t*a*d[i];m[i+1]=t*b*d[i];}
    }
    return x=>{
      if(x<=xs[0])return ys[0];if(x>=xs[n-1])return ys[n-1];
      let i=0;while(x>xs[i+1])i++;
      const h=xs[i+1]-xs[i],t=(x-xs[i])/h,t2=t*t,t3=t2*t;
      return (2*t3-3*t2+1)*ys[i]+(t3-2*t2+t)*h*m[i]+(-2*t3+3*t2)*ys[i+1]+(t3-t2)*h*m[i+1];
    };
  }

  /* z is measured from the nose rearwards; x is the span (left wing positive), y is up.
     wing.plan: [span station, leading edge, chord]; engines: x, y of the axis, z of the intake lip. */
  const catalog=[
    {id:'ssj100',name:'Sukhoi Superjet 100',family:'SSJ 100',length:29.94,span:27.8,
      body:{d:3.46,top:1.02,nose:[5.0,6.6,5.6],noseY:-.3,shape:[1.6,2.3,2.1],tail:8.6,tailY:.5,tailR:.09,cockpit:'jet'},
      windows:{n:23,from:6.2,to:24.0,y:.25,w:.26,h:.37},doors:[[4.6,.82],[24.5,.78]],
      wing:{y:-.55,dihedral:[5],tc:[.14,.12,.1],plan:[[1.73,11.5,4.9],[5,13.17,3.23],[13.9,17.7,1.2]],canoes:[3.7,6.8,9.8]},
      engine:{type:'fan',x:4.3,y:-2.05,z:9.8,r:.86,len:3.7},
      htail:{span:10.6,root:3.1,tip:1.05,sweep:33,dihedral:6,z:25.4,y:.24},
      vtail:{h:5.0,root:4.8,tip:1.55,sweep:40,z:23.4,fillet:[20.8,.52]}},
    {id:'boeing737',name:'Boeing 737',family:'Boeing 737',length:39.47,span:35.79,
      body:{d:3.76,top:1.13,nose:[5.4,8.0,6.6],noseY:-.38,shape:[1.5,2.2,2.0],tail:10.8,tailY:.44,tailR:.1,cockpit:'jet'},
      windows:{n:34,from:6.4,to:33.4,y:.27,w:.25,h:.36},doors:[[5.0,.86],[33.8,.86]],
      wing:{y:-.58,dihedral:[6],tc:[.15,.125,.105],plan:[[1.88,14.9,6.1],[5.6,16.88,4.12],[17.16,23.03,1.3]],canoes:[6.9,10.2,13.3],
        tip:{h:2.44,cant:16,sweep:44,chord:.6,r:.75}},
      engine:{type:'fan',x:4.95,y:-1.98,z:13.1,r:1.03,len:3.75,flat:.17},
      htail:{span:14.35,root:3.9,tip:1.25,sweep:35,dihedral:7,z:33.7,y:.2},
      vtail:{h:6.5,root:5.9,tip:1.65,sweep:39,z:31.1,fillet:[26.0,.64]}},
    {id:'a320',name:'Airbus A320',family:'Airbus A320',length:37.57,span:35.8,
      body:{d:3.95,top:1.09,nose:[5.3,7.4,6.2],noseY:-.27,shape:[1.65,2.3,2.15],tail:10.4,tailY:.48,tailR:.1,cockpit:'jet'},
      windows:{n:30,from:6.9,to:32.4,y:.25,w:.25,h:.37},doors:[[5.0,.86],[33.0,.86]],
      wing:{y:-.5,dihedral:[5.1],tc:[.155,.125,.108],plan:[[1.975,13.7,6],[6.3,15.9,3.8],[17.05,21.38,1.5]],canoes:[7.3,10.4,13.4],
        tip:{h:2.43,cant:12,sweep:52,chord:.45,r:.95}},
      engine:{type:'fan',x:5.75,y:-2.1,z:12.7,r:1.12,len:4.3},
      htail:{span:12.45,root:3.7,tip:1.25,sweep:32,dihedral:6,z:32.4,y:.22},
      vtail:{h:5.87,root:5.6,tip:1.95,sweep:37,z:30.2,fillet:[28.2,.38]}},
    {id:'crj',name:'Bombardier CRJ 100/200',family:'CRJ 100/200',length:26.77,span:21.21,
      body:{d:2.69,top:1,nose:[4.9,6.6,5.5],noseY:-.24,shape:[1.5,2.2,2.0],tail:7.9,tailY:.45,tailR:.09,cockpit:'jet'},
      windows:{n:14,from:5.4,to:17.4,y:.24,w:.28,h:.4},doors:[[3.9,.82]],
      wing:{y:-.58,dihedral:[3],tc:[.14,.12,.1],plan:[[1.345,12.2,4],[3.9,13.67,2.53],[10,17.2,.95]],
        tip:{h:1.1,cant:22,sweep:50,chord:.42,r:.25}},
      engine:{type:'fan',mount:'rear',x:2.43,y:.42,z:18.4,r:.66,len:3.3,fanExit:.9},
      htail:{tee:true,span:6.35,root:2.1,tip:.95,sweep:35,dihedral:-2},
      vtail:{h:2.85,root:3.9,tip:2.25,sweep:45,z:20.4,fillet:[18.9,.32]}},
    {id:'an24',name:'Ан-24',family:'Ан-24',length:23.53,span:29.2,
      body:{d:2.9,top:1,nose:[3.9,5.4,4.6],noseY:-.14,shape:[1.9,2.4,2.2],tail:7.0,tailY:.62,tailR:.1,cockpit:'soviet'},
      windows:{n:13,from:4.9,to:15.6,y:.22,w:.38,h:.38,round:true},doors:[[16.9,.75]],
      wing:{high:true,y:1.51,dihedral:[.5,-2],tc:[.18,.16,.13],plan:[[0,9.2,3.5],[4.6,9.2,3.4],[14.6,10.39,1.25]]},
      engine:{type:'prop',x:3.95,blades:4,radius:1.95,spinner:.36,axis:1.24,
        nacelle:[[6.15,1.62,.86,.36],[6.9,1.86,.6,.56],[8.0,1.99,.32,.62],[10.6,1.99,.22,.62],[12.6,1.88,.28,.57],[14.5,1.55,.62,.38],[15.9,1.3,1.06,.1]]},
      htail:{span:9.08,root:2.7,tip:1.15,sweep:12,dihedral:9,z:19.7,y:.3},
      vtail:{h:4.2,root:4.4,tip:1.55,sweep:33,z:17.9,fillet:[13.7,.8]}},
    {id:'embraer',name:'Embraer 170/190',family:'Embraer E-Jet',length:31.68,span:26,
      body:{d:3.01,top:1.18,nose:[3.9,5.4,4.6],noseY:-.22,shape:[1.75,2.3,2.1],tail:7.9,tailY:.48,tailR:.1,cockpit:'jet'},
      windows:{n:22,from:5.4,to:24.6,y:.3,w:.26,h:.38},doors:[[3.9,.82],[25.7,.78]],
      wing:{y:-.6,dihedral:[5],tc:[.145,.12,.1],plan:[[1.505,12.3,4.7],[4.6,13.88,3.12],[12.2,17.75,1.3]],canoes:[6.1,8.6,10.7],
        tip:{h:1.6,cant:15,sweep:42,chord:.55,r:.4}},
      engine:{type:'fan',x:4.65,y:-1.72,z:11.3,r:.82,len:3.4},
      htail:{span:10,root:2.9,tip:1.1,sweep:33,dihedral:7,z:26.6,y:.26},
      vtail:{h:5,root:4.9,tip:1.6,sweep:42,z:24.6,fillet:[20.8,.58]}},
    {id:'dhc8',name:'De Havilland DHC-8-300',family:'DHC-8',length:25.68,span:27.43,
      body:{d:2.69,top:1,nose:[4.6,6.2,5.2],noseY:-.28,shape:[1.55,2.3,2.0],tail:8.2,tailY:.6,tailR:.09,cockpit:'turbo'},
      windows:{n:15,from:5.0,to:17.6,y:.22,w:.3,h:.42},doors:[[3.6,.78],[18.7,1.25]],
      wing:{high:true,y:1.445,dihedral:[0,2.5],tc:[.18,.17,.135],plan:[[0,10,2.75],[4.2,10,2.7],[13.7,10.5,1.25]]},
      engine:{type:'prop',x:4.1,blades:4,radius:1.98,spinner:.31,axis:1.12,
        nacelle:[[7.55,1.43,.81,.31],[8.3,1.77,.5,.47],[9.6,1.86,.26,.5],[12.5,1.81,.22,.5],[14.6,1.63,.42,.4],[16.8,1.32,1.04,.1]]},
      htail:{tee:true,span:7.9,root:2.25,tip:1.2,sweep:20,dihedral:0},
      vtail:{h:3.75,root:4.6,tip:2.6,sweep:35,z:19.1,fillet:[15.6,.62]}},
    {id:'atr',name:'ATR 42/72',family:'ATR 42/72',length:22.67,span:24.57,
      body:{d:2.865,top:1,nose:[3.8,5.4,4.5],noseY:-.22,shape:[1.7,2.4,2.1],tail:8.0,tailY:.7,tailR:.08,flat:2.35,cockpit:'turbo'},
      windows:{n:13,from:4.9,to:14.9,y:.22,w:.3,h:.42},doors:[[3.8,1.4],[16.0,.8]],
      wing:{high:true,y:1.57,dihedral:[0,2.5],tc:[.18,.165,.13],plan:[[0,8.9,2.6],[4.1,8.9,2.57],[12.3,9.34,1.4]]},
      engine:{type:'prop',x:4.05,blades:6,radius:1.965,spinner:.32,axis:1.24,scimitar:true,
        nacelle:[[6.65,1.56,.92,.32],[7.3,1.73,.66,.45],[8.5,1.79,.48,.47],[10.4,1.71,.52,.46],[11.6,1.56,.85,.32],[12.4,1.43,1.22,.1]]},
      sponson:{x:1.25,from:8.0,to:13.9,knots:[[8.0,-.45,-.7,.05],[8.7,-.16,-.94,.44],[10.2,-.12,-.99,.52],[12.6,-.16,-.97,.5],[13.9,-.42,-.78,.05]]},
      htail:{tee:true,span:7.31,root:2,tip:1.1,sweep:12,dihedral:0},
      vtail:{h:3.9,root:4.5,tip:2.15,sweep:34,z:16.2,fillet:[12.5,.72]}},
    {id:'yak42',name:'Як-42',family:'Як-42',length:36.38,span:34.88,
      body:{d:3.8,top:1,nose:[5.0,6.8,5.8],noseY:-.2,shape:[1.85,2.3,2.15],tail:9.4,tailY:.28,tailR:.3,tailPowT:2.4,cockpit:'soviet'},
      windows:{n:27,from:6.6,to:24.6,y:.25,w:.26,h:.37},doors:[[5.0,.86]],
      wing:{y:-.55,dihedral:[2.5],tc:[.15,.13,.11],plan:[[1.9,15.4,6.3],[6,17.36,4.7],[17.44,22.81,1.65]]},
      engine:{type:'fan',mount:'rear',x:3.11,y:.45,z:25.0,r:.86,len:4.3,fanExit:.93,
        intake:{z:24.6,knots:[[24.6,3.02,1.62,.76],[25.8,3.08,1.6,.74],[27.4,2.95,1.6,.56],[29.6,2.66,1.6,.28]]}},
      htail:{tee:true,span:11.6,root:3.5,tip:1.4,sweep:38,dihedral:0},
      vtail:{h:4.6,root:6.2,tip:3.2,sweep:42,z:27.1}},
    {id:'an26',name:'Ан-26',family:'Ан-26',length:23.8,span:29.2,
      body:{d:2.9,top:1,nose:[3.9,5.4,4.6],noseY:-.14,shape:[1.9,2.4,2.2],tail:10.5,tailTop:4.6,tailWidth:8.6,tailY:.8,tailR:.12,tailPowB:1.05,ramp:3.2,cockpit:'soviet'},
      windows:{n:5,from:5.9,to:11.2,y:.22,w:.38,h:.38,round:true},doors:[[15.6,.8]],blister:{z:3.9,y:.28,r:.34},
      wing:{high:true,y:1.51,dihedral:[.5,-2],tc:[.18,.16,.13],plan:[[0,9.3,3.5],[4.6,9.3,3.4],[14.6,10.49,1.25]]},
      engine:{type:'prop',x:3.95,blades:4,radius:1.95,spinner:.36,axis:1.24,jet:true,
        nacelle:[[6.25,1.62,.86,.36],[7.0,1.86,.6,.56],[8.1,1.99,.32,.62],[10.7,1.99,.22,.62],[12.7,1.88,.28,.57],[14.6,1.55,.62,.38],[16.0,1.3,1.06,.12]]},
      strakes:{from:15.9,to:21.6,x:.62,h:.55,cant:40},
      htail:{span:9.97,root:2.8,tip:1.2,sweep:12,dihedral:9,z:20.1,y:.72},
      vtail:{h:4.35,root:4.6,tip:1.55,sweep:33,z:17.6,fillet:[13.1,.84]}}
  ];
  const palette={paint:[234,240,246],wing:[219,231,242],flap:[205,220,234],belly:[160,185,209],edge:[139,169,195],glass:[20,44,65],dark:[18,32,45],metal:[104,133,157],blue:[101,164,217],lip:[196,210,223],prop:[34,48,62],seam:[201,213,226]};
  const modelCache=new Map();
  const naca=(x,t)=>5*t*(.2969*Math.sqrt(Math.max(0,x))-.126*x-.3516*x*x+.2843*x*x*x-.1036*x*x*x*x);

  function createModel(id){
    if(modelCache.has(id))return modelCache.get(id);
    const spec=catalog.find(s=>s.id===id||s.family===id||s.name===id)||catalog[0];
    const L=spec.length,B=spec.body,R=B.d/2,TOP=(B.top||1)*R;
    const Z=zn=>L/2-zn;
    /* Triangles go straight into flat arrays: 9 coordinates, a face normal, 3 vertex normals and a colour. */
    const Pp=[],Nn=[],VNn=[],Cc=[];
    function tri(a,b,c,col,vn,out){
      let n=cross(sub(b,a),sub(c,a));const l=len(n);if(l<1e-9)return;n=mul(n,1/l);
      const ref=vn?add(add(vn[0],vn[1]),vn[2]):out;
      if(ref&&dot(n,ref)<0)n=mul(n,-1);
      const v=vn||[n,n,n],k=palette[col]||palette.paint;
      Pp.push(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2]);Nn.push(n[0],n[1],n[2]);
      VNn.push(v[0][0],v[0][1],v[0][2],v[1][0],v[1][1],v[1][2],v[2][0],v[2][1],v[2][2]);Cc.push(k[0],k[1],k[2]);
    }
    function quad(a,b,c,d,col,vn,out){tri(a,b,c,col,vn&&[vn[0],vn[1],vn[2]],out);tri(a,c,d,col,vn&&[vn[0],vn[2],vn[3]],out);}
    function both(a,b,c,d,col,out){quad(a,b,c,d,col,null,out);quad(a,b,c,d,col,null,mul(out,-1));}
    /* Parametric patch with vertex normals from finite differences on the surface function. */
    function surface(fn,us,vs,col,opt){
      opt=opt||{};
      const nu=us.length,nv=vs.length,u0=us[0],u1=us[nu-1],v0=vs[0],v1=vs[nv-1];
      const eu=Math.abs(u1-u0)*(opt.eps||2e-4),ev=Math.abs(v1-v0)*(opt.eps||2e-4);
      const P=us.map(u=>vs.map(v=>fn(u,v)));
      const N=us.map(u=>vs.map(v=>{
        const ua=Math.max(u0,u-eu),ub=Math.min(u1,u+eu);
        let va=v-ev,vb=v+ev;if(!opt.closed){va=Math.max(v0,va);vb=Math.min(v1,vb);}
        let n=cross(sub(fn(ub,v),fn(ua,v)),sub(fn(u,vb),fn(u,va)));
        if(len(n)<1e-14)n=opt.tip?opt.tip(u,v):[0,0,1];
        n=norm(n);return opt.flip?mul(n,-1):n;
      }));
      for(let i=0;i<nu-1;i++)for(let j=0;j<nv-1;j++){
        const c=typeof col==='function'?col((us[i]+us[i+1])/2,(vs[j]+vs[j+1])/2,i,j):col;
        if(c)quad(P[i][j],P[i+1][j],P[i+1][j+1],P[i][j+1],c,[N[i][j],N[i+1][j],N[i+1][j+1],N[i][j+1]]);
      }
      return {P,N};
    }
    function disk(center,radius,axis,col,n,ry){
      const a=norm(axis),t1=norm(Math.abs(a[1])<.9?cross(a,[0,1,0]):cross(a,[1,0,0])),t2=cross(a,t1),k=n||20;
      for(let i=0;i<k;i++){
        const p=j=>add(center,add(mul(t1,radius*Math.cos(j*TAU/k)),mul(t2,(ry||radius)*Math.sin(j*TAU/k))));
        tri(center,p(i),p(i+1),col,null,a);
      }
    }
    /* Surface of revolution around an axis parallel to z; mer: [z, r] from front to back. */
    function revolve(cx,cy,mer,col,opt){
      opt=opt||{};const k=opt.k||(()=>1),m=mer.length;
      const fn=(u,t)=>{const i=Math.min(m-2,Math.floor(u)),f=u-i,r=mix(mer[i][1],mer[i+1][1],f)*k(t);
        return [cx+r*Math.cos(t),cy+r*Math.sin(t),mix(mer[i][0],mer[i+1][0],f)];};
      return surface(fn,lin(0,m-1,m-1),lin(0,TAU,opt.seg||22),col,{closed:true,flip:opt.flip,eps:.004,tip:opt.tip});
    }

    /* ---------- fuselage ---------- */
    const [mT,mB,mW]=B.shape||[1.7,2.3,2.1],[nT,nBt,nWd]=B.nose,y0=(B.noseY||0)*R;
    const tB=B.tail,tT=B.tailTop||B.tail,tW=B.tailWidth||B.tail,yT=(B.tailY||.5)*R,rT=(B.tailR||.1)*R;
    const W=spec.wing,plan=W.plan;
    const wingLE=plan[0][1],wingTE=plan[0][1]+plan[0][2];
    /* a high wing sits on a dorsal fairing that reaches its upper surface */
    const fair=W.high?Math.max(0,W.y+.5*W.tc[0]*plan[0][2]+.05*plan[0][2]-TOP-.04):0;
    function fusSec(zn){
      let yt=TOP,yb=-R,hw=R;
      if(zn<nT)yt=y0+(TOP-y0)*se(zn/nT,mT);
      if(zn<nBt)yb=y0-(y0+R)*se(zn/nBt,mB);
      if(zn<nWd)hw=R*se(zn/nWd,mW);
      const sb=(zn-(L-tB))/tB,st=(zn-(L-tT))/tT,sw=(zn-(L-tW))/tW;
      if(sb>0)yb=-R+(yT-rT+R)*Math.pow(sb,B.tailPowB||1.25);
      if(st>0)yt=TOP-(TOP-yT-rT)*Math.pow(st,B.tailPowT||2.1);
      if(sw>0)hw=R-(R-rT)*Math.pow(sw,B.tailPowW||1.7);
      const yw=(yt+yb)/2;let hl=hw,nb=B.flat||2,nt=2;
      if(W.high){const f=smooth((zn-wingLE+1.4)/1.4)*smooth((wingTE+2.6-zn)/2.4);yt+=fair*f;nt=2+1.9*f;}
      else{const b=bump(zn,wingLE-1.6,wingTE+2.1,1.7);yb-=R*.05*b;hl=hw*(1+.075*b);}
      if(B.ramp&&sb>0)nb=mix(nb,B.ramp,smooth(sb*3));
      return {yw,bU:yt-yw,bL:yw-yb,hu:hw,hl,nt,nb};
    }
    function fusPoint(zn,th){
      const s=fusSec(zn),c=Math.cos(th),si=Math.sin(th);
      if(si>=0)return [s.hu*spow(c,2/s.nt),s.yw+s.bU*spow(si,2/s.nt),Z(zn)];
      const hw=s.hu+(s.hl-s.hu)*Math.pow(-si,.8);
      return [hw*spow(c,2/s.nb),s.yw+s.bL*spow(si,2/s.nb),Z(zn)];
    }
    function fusNormal(zn,th){
      const e=.004;
      return norm(cross(sub(fusPoint(zn+e,th),fusPoint(Math.max(0,zn-e),th)),sub(fusPoint(zn,th+e),fusPoint(zn,th-e))));
    }
    const fusTop=zn=>{const s=fusSec(zn);return s.yw+s.bU;};
    const zs=[];
    for(let i=0;i<=16;i++)zs.push(nWd*Math.pow(i/16,1.7));
    const tailStart=L-Math.max(tB,tT,tW);
    for(let z=nWd+.9;z<tailStart;z+=1.15)zs.push(z);
    for(let i=0;i<=14;i++)zs.push(mix(tailStart,L,Math.pow(i/14,.85)));
    zs.sort((a,b)=>a-b);
    const zsU=zs.filter((z,i)=>i===0||z-zs[i-1]>.05);
    surface(fusPoint,zsU,lin(0,TAU,36),(zn,th)=>Math.sin(th)<-.5?'belly':'paint',{closed:true,tip:u=>u<L/2?[0,0,1]:[0,0,-1],eps:1e-4});
    {const s=fusSec(L),c=[0,s.yw,Z(L)];
      disk(c,rT,[0,0,-1],B.tailR>.2?'metal':'dark',20);
      if(B.tailR>.2)disk(add(c,[0,0,-.02]),rT*.78,[0,0,-1],'dark',20);}

    /* Decals sit 3 cm above the skin and follow its curvature. */
    function decal(corners,col,div){
      const d=div||1,pt=(a,b)=>{
        const zn=mix(mix(corners[0][0],corners[1][0],a),mix(corners[3][0],corners[2][0],a),b);
        const th=mix(mix(corners[0][1],corners[1][1],a),mix(corners[3][1],corners[2][1],a),b);
        return [add(fusPoint(zn,th),mul(fusNormal(zn,th),.03)),fusNormal(zn,th)];
      };
      for(let i=0;i<d;i++)for(let j=0;j<d;j++){
        const a=pt(i/d,j/d),b=pt((i+1)/d,j/d),c=pt((i+1)/d,(j+1)/d),e=pt(i/d,(j+1)/d);
        quad(a[0],b[0],c[0],e[0],col,null,a[1]);
      }
    }
    function oval(zn,th,hz,ht,col,off){
      const c=add(fusPoint(zn,th),mul(fusNormal(zn,th),off||.03)),n=fusNormal(zn,th);
      const k=10,p=i=>{const a=i*TAU/k;return add(fusPoint(zn+hz*Math.cos(a),th+ht*Math.sin(a)),mul(n,off||.03));};
      for(let i=0;i<k;i++)tri(c,p(i),p(i+1),col,null,n);
    }
    const thAt=(zn,y,side)=>{const s=fusSec(zn),q=(y-s.yw)/(y>=s.yw?s.bU:s.bL),e=y>=s.yw?s.nt:s.nb,a=Math.asin(clamp(spow(q,e/2),-1,1));return side>0?a:PI-a;};
    const win=spec.windows;
    for(const side of [1,-1])for(let k=0;k<win.n;k++){
      const zn=win.n>1?mix(win.from,win.to,k/(win.n-1)):win.from,th=thAt(zn,win.y*R,side);
      if(win.round)oval(zn,th,win.w/2,win.h/2/R,'glass');
      else{
        const hz=win.w/2,ht=win.h/2/R,cz=hz*.45,ct=ht*.4;
        const pts=[[zn-hz,th-ht+ct],[zn-hz+cz,th-ht],[zn+hz-cz,th-ht],[zn+hz,th-ht+ct],[zn+hz,th+ht-ct],[zn+hz-cz,th+ht],[zn-hz+cz,th+ht],[zn-hz,th+ht-ct]];
        const n=fusNormal(zn,th),c=add(fusPoint(zn,th),mul(n,.03)),P=pts.map(p=>add(fusPoint(p[0],p[1]),mul(n,.03)));
        for(let i=0;i<8;i++)tri(c,P[i],P[(i+1)%8],'glass',null,n);
      }
    }
    for(const [zn,wd] of spec.doors||[])for(const side of [1,-1]){
      const th0=thAt(zn,-.42*R,side),th1=thAt(zn,.78*R,side),e=.035/R,f=.035;
      decal([[zn,th0],[zn+wd,th0],[zn+wd,th0+side*e],[zn,th0+side*e]],'seam');
      decal([[zn,th1-side*e],[zn+wd,th1-side*e],[zn+wd,th1],[zn,th1]],'seam');
      decal([[zn,th0],[zn+f,th0],[zn+f,th1],[zn,th1]],'seam',3);
      decal([[zn+wd-f,th0],[zn+wd,th0],[zn+wd,th1],[zn+wd-f,th1]],'seam',3);
    }
    /* Flight deck glazing: corners in [share of the nose length, angle from the crown]. */
    const glass={
      jet:[[[.47,.06],[.58,.98],[.74,.7],[.65,.06]],[[.6,1.06],[.8,1.12],[.81,.64],[.76,.68]],[[.83,1.12],[.98,1.14],[.97,.66],[.84,.64]]],
      soviet:[[[.42,.06],[.5,.62],[.62,.5],[.58,.06]],[[.52,.7],[.6,1.02],[.7,.86],[.64,.56]],[[.63,1.04],[.82,1.1],[.82,.74],[.72,.86]],[[.85,1.08],[.98,1.1],[.97,.76],[.86,.74]]],
      turbo:[[[.47,.06],[.57,.98],[.72,.7],[.64,.06]],[[.6,1.06],[.81,1.12],[.82,.66],[.74,.7]],[[.84,1.12],[.98,1.14],[.97,.7],[.85,.68]]]
    }[B.cockpit||'jet'];
    for(const pane of glass)for(const side of [1,-1])
      decal(pane.map(([s,a])=>[s*nT,PI/2-side*a]),'glass',4);
    if(spec.blister){const b=spec.blister,th=thAt(b.z,b.y*R,1),n=fusNormal(b.z,th),c=fusPoint(b.z,th);
      const t1=[0,0,1],t2=norm(cross(n,t1));
      surface((u,v)=>add(c,add(mul(n,b.r*.62*Math.cos(u)),add(mul(t1,b.r*Math.sin(u)*Math.cos(v)),mul(t2,b.r*Math.sin(u)*Math.sin(v))))),lin(0,PI/2,5),lin(0,TAU,16),'glass',{closed:true,tip:()=>n});}

    /* ---------- lifting surfaces ---------- */
    /* Station: p = leading edge point, c = chord, t = thickness ratio, n = thickness axis, cam = camber. */
    function lift(st,paint,opt){
      opt=opt||{};const cnt=st.length;
      const S=u=>{const i=Math.min(cnt-2,Math.floor(u)),f=u-i,a=st[i],b=st[i+1];
        return {p:[mix(a.p[0],b.p[0],f),mix(a.p[1],b.p[1],f),mix(a.p[2],b.p[2],f)],c:mix(a.c,b.c,f),t:mix(a.t,b.t,f),
          n:norm([mix(a.n[0],b.n[0],f),mix(a.n[1],b.n[1],f),mix(a.n[2],b.n[2],f)]),cam:mix(a.cam||0,b.cam||0,f)};};
      const xc=v=>v<=1?(1+Math.cos(PI*v))/2:(1-Math.cos(PI*(v-1)))/2;
      const fn=(u,v)=>{const s=S(u),x=xc(v),h=(v<=1?1:-1)*naca(x,s.t)*s.c+s.cam*s.c*4*x*(1-x);
        return [s.p[0]+s.n[0]*h,s.p[1]+s.n[1]*h,s.p[2]+s.n[2]*h-x*s.c];};
      const span=sub(st[cnt-1].p,st[0].p),flip=dot(cross(span,[0,0,1]),st[Math.floor(cnt/2)].n)<0;
      const us=[0];
      for(let i=0;i<cnt-1;i++){const k=Math.max(opt.min||1,Math.ceil(len(sub(st[i+1].p,st[i].p))/(opt.step||1.4)));for(let j=1;j<=k;j++)us.push(i+j/k);}
      const vs=lin(0,2,2*(opt.chord||10));
      surface(fn,us,vs,paint,{flip,eps:2e-3});
      if(opt.cap!==false){
        const ue=cnt-1,out=norm(sub(st[cnt-1].p,st[cnt-2].p)),half=vs.filter(v=>v<=1);
        for(let k=0;k<half.length-1;k++){
          const col=typeof paint==='function'?paint(ue,half[k]):paint;
          quad(fn(ue,half[k]),fn(ue,half[k+1]),fn(ue,2-half[k+1]),fn(ue,2-half[k]),col==='flap'?'wing':col,null,out);
        }
      }
      return {fn,S};
    }
    const mirror=st=>st.map(s=>Object.assign({},s,{p:[-s.p[0],s.p[1],s.p[2]],n:[-s.n[0],s.n[1],s.n[2]]}));
    const bankN=phi=>[-Math.sin(phi),Math.cos(phi),0];
    const surfacePaint=(top,bottom,flaps,from)=>(u,v)=>{
      if(Math.abs(v-1)<.12&&u>=(from||0))return 'edge';
      if(v<1)return flaps&&(1+Math.cos(PI*v))/2>.73&&u<flaps?'flap':top;
      return bottom;
    };

    /* Wing */
    const dih=k=>(W.dihedral[Math.min(k,W.dihedral.length-1)])*DEG;
    const wst=[];{
      let y=W.high?W.y:W.y*R;
      if(plan[0][0]>.01){
        const [x0,z0,c0]=plan[0],[x1,z1]=plan[1],slope=(z1-z0)/(x1-x0),zc=z0-slope*x0;
        wst.push({x:0,y,zl:zc,c:z0+c0-zc,t:W.tc[0],phi:0});
      }
      plan.forEach(([x,zl,c],i)=>{
        if(i>0)y+=(x-plan[i-1][0])*Math.tan(dih(i-1));
        wst.push({x,y,zl,c,t:W.tc[Math.min(i,W.tc.length-1)],phi:dih(Math.max(0,i-1))});
      });
    }
    function wingAt(x){
      let i=0;while(i<wst.length-2&&x>wst[i+1].x)i++;
      const a=wst[i],b=wst[i+1],f=clamp((x-a.x)/(b.x-a.x),0,1);
      return {y:mix(a.y,b.y,f),zl:mix(a.zl,b.zl,f),c:mix(a.c,b.c,f),t:mix(a.t,b.t,f)};
    }
    const wingStations=wst.map(s=>({p:[s.x,s.y,Z(s.zl)],c:s.c,t:s.t,n:bankN(s.phi),cam:.018}));
    if(W.tip){
      const T=W.tip,last=wingStations[wingStations.length-1],phi0=wst[wst.length-1].phi,phi1=(90-T.cant)*DEG;
      const C=add(last.p,mul(bankN(phi0),T.r)),tanS=Math.tan(T.sweep*DEG),arc=T.r*(phi1-phi0);
      const rise=T.r*(Math.cos(phi0)-Math.cos(phi1)),straight=Math.max(.2,T.h-rise);
      const at=(p,s,c,phi)=>({p:[p[0],p[1],p[2]-s*tanS],c,t:.09,n:bankN(phi),cam:.008});
      for(let k=1;k<=6;k++){const a=mix(phi0,phi1,k/6);wingStations.push(at(sub(C,mul(bankN(a),T.r)),arc*k/6,mix(last.c,last.c*.9,k/6),a));}
      const base=wingStations[wingStations.length-1].p.slice(),dir=[Math.cos(phi1),Math.sin(phi1),0];
      for(const f of [.5,1]){const p=add(base,mul(dir,straight*f));p[2]+=arc*tanS;wingStations.push(at(p,arc+straight*f,mix(last.c*.9,T.chord,f),phi1));}
    }
    const flapLimit=wst.length-1,edgeFrom=W.high?R/plan[1][0]:0;
    lift(wingStations,surfacePaint('wing','belly',flapLimit,edgeFrom),{step:1.25,chord:11});
    lift(mirror(wingStations),surfacePaint('wing','belly',flapLimit,edgeFrom),{step:1.25,chord:11});
    /* Flap-track fairings under the trailing edge */
    for(const x of W.canoes||[]){
      const w=wingAt(x),zl=w.zl,c=w.c,yLow=w.y-naca(.6,w.t)*c*.9,r=.07*c+.08;
      for(const s of [1,-1])revolve(s*x,yLow-r*.25,[[Z(zl+.5*c),.05*r],[Z(zl+.6*c),.62*r],[Z(zl+.85*c),r],[Z(zl+1.1*c),.72*r],[Z(zl+1.27*c),.06*r]],'belly',{seg:12,k:t=>Math.sin(t)>0?.6:1});
    }

    /* Tail */
    const V=spec.vtail,H=spec.htail,tanV=Math.tan(V.sweep*DEG);
    const yr=fusTop(V.z),finTipY=yr+V.h,finTipZ=V.z+V.h*tanV;
    const fin=[{p:[0,yr-.45,Z(V.z-.45*tanV)],c:V.root,t:.11,n:[1,0,0]},{p:[0,finTipY,Z(finTipZ)],c:V.tip,t:.09,n:[1,0,0]}];
    lift(fin,(u,v)=>Math.abs(v-1)<.1?'edge':'paint',{step:1.2});
    if(V.fillet){
      const [zf,fh]=V.fillet,chordAt=y=>mix(V.root,V.tip,(y-yr)/V.h),yTopF=fusTop(zf);
      const teAt=y=>V.z+(y-yr)*tanV+chordAt(y);
      const s0={p:[0,yTopF-.35,Z(zf)],c:teAt(yr)-zf-.2,n:[1,0,0]};
      const ym=yr+fh*.42,zm=mix(zf,V.z+fh*.42*tanV,.8),s1={p:[0,ym,Z(zm)],c:teAt(ym)-zm-.1,n:[1,0,0]};
      const yt2=yr+fh,zt2=V.z+fh*tanV,s2={p:[0,yt2,Z(zt2)],c:chordAt(yt2)*.98,n:[1,0,0]};
      [s0,s1,s2].forEach(s=>s.t=.11*V.root/s.c*.95);
      lift([s0,s1,s2],'paint',{step:1,cap:false});
    }
    {
      const tee=H.tee,tanH=Math.tan(H.sweep*DEG),d=H.dihedral*DEG;
      const hy=tee?finTipY-.04:H.y*R,hz=tee?finTipZ+V.tip*.06:H.z,half=H.span/2;
      const hst=[{p:[0,hy,Z(hz)],c:H.root,t:.1,n:bankN(d)},{p:[half,hy+half*Math.tan(d),Z(hz+half*tanH)],c:H.tip,t:.09,n:bankN(d)}];
      const paint=surfacePaint('wing','belly',0);
      lift(hst,paint,{step:1.1});lift(mirror(hst),paint,{step:1.1});
      if(tee){const r=.13*R,z0=finTipZ-.55,z1=finTipZ+V.tip+.35;
        revolve(0,finTipY+.02,[[Z(z0),.02],[Z(z0+.25),.55*r],[Z(z0+.8),r],[Z(z1-.5),r*.9],[Z(z1),.04]],'paint',{seg:14});}
    }

    /* ---------- engines ---------- */
    const E=spec.engine;
    function fanNacelle(cx,cy,zl,r,ln,opt){
      opt=opt||{};const fe=opt.fanExit||.72,k=opt.flat?t=>1-opt.flat*Math.pow(Math.max(0,-Math.sin(t)),2):undefined;
      const z=d=>Z(zl+d);
      revolve(cx,cy,[[z(.17*r),.79*r],[z(.05*r),.82*r],[z(0),.88*r],[z(.09*r),.965*r],[z(.3*r),r],[z(.38*ln),r],[z(.6*ln),.95*r],[z(fe*ln),.8*r]],
        (u)=>u<3.2?'lip':'paint',{k,seg:24});
      revolve(cx,cy,[[z(.17*r),.79*r],[z(.6*r),.79*r]],'dark',{k,seg:20,flip:true});
      disk([cx,cy,z(.6*r)],.79*r,[0,0,1],'dark',20,k?.79*r*k(-PI/2):undefined);
      for(let i=0;i<18;i++){const a=i*TAU/18,b=a+.12,rr=.74*r,zz=z(.59*r);
        tri([cx+Math.cos(a)*r*.2,cy+Math.sin(a)*r*.2,zz],[cx+Math.cos(a+.25)*rr,cy+Math.sin(a+.25)*rr,zz],[cx+Math.cos(b+.25)*rr,cy+Math.sin(b+.25)*rr,zz],'metal',null,[0,0,1]);}
      revolve(cx,cy,[[z(.6*r-.001),.24*r],[z(.42*r),.17*r],[z(.3*r),.02]],'lip',{seg:14,flip:true,tip:()=>[0,0,1]});
      const cz=fe*ln,ce=Math.min(.97,fe+.17);
      revolve(cx,cy,[[z(cz),.8*r],[z(cz+.001),.56*r]],'dark',{k,seg:22});
      revolve(cx,cy,[[z(cz),.56*r],[z(ce*ln),.42*r]],'metal',{seg:18});
      revolve(cx,cy,[[z(ce*ln),.42*r],[z(ce*ln+.001),.3*r]],'dark',{seg:16});
      revolve(cx,cy,[[z(ce*ln),.3*r],[z(ce*ln+.12*ln),.16*r],[z(ce*ln+.2*ln),.02]],'edge',{seg:14,tip:()=>[0,0,-1]});
    }
    if(E.type==='fan'&&E.mount!=='rear'){
      for(const s of [1,-1]){
        const x=s*E.x;fanNacelle(x,E.y,E.z,E.r,E.len,{flat:E.flat});
        const w=wingAt(E.x),top=E.y+E.r*(E.flat?1:.98),zb=E.z+.2*E.len,cb=.78*E.len,zt=w.zl-.3,ct=w.c+.7;
        lift([{p:[x,top-.15,Z(zb)],c:cb,t:.38/cb,n:[1,0,0]},{p:[x,w.y,Z(zt)],c:ct,t:.38/ct,n:[1,0,0]}],'paint',{step:2,cap:false,chord:8});
      }
    }
    if(E.type==='fan'&&E.mount==='rear'){
      for(const s of [1,-1]){
        const x=s*E.x;fanNacelle(x,E.y,E.z,E.r,E.len,{fanExit:E.fanExit});
        const c=.5*E.len;
        lift([{p:[s*R*.5,E.y,Z(E.z+.3*E.len)],c,t:.3/c,n:[0,1,0]},{p:[x,E.y,Z(E.z+.3*E.len)],c,t:.3/c,n:[0,1,0]}],'paint',{step:2,cap:false,chord:8});
      }
      if(E.intake){
        const I=E.intake,k=I.knots,Yt=curve(k.map(q=>[q[0],q[1]])),Yb=curve(k.map(q=>[q[0],q[2]])),Hw=curve(k.map(q=>[q[0],q[3]]));
        const fn=(zn,th)=>{const yt=Yt(zn),yb=Yb(zn),yw=(yt+yb)/2,c=Math.cos(th),si=Math.sin(th);
          return [Hw(zn)*spow(c,2/2.4),yw+(yt-yw)*spow(si,2/2.4),Z(zn)];};
        surface(fn,lin(k[0][0],k[k.length-1][0],12),lin(0,TAU,24),(zn)=>zn<k[0][0]+.12?'lip':'paint',{closed:true});
        const ym=(k[0][1]+k[0][2])/2+.18;
        disk([0,ym,Z(I.z)+.015],k[0][3]*.82,[0,0,1],'dark',20,(k[0][1]-ym)*.8);
      }
    }
    if(E.type==='prop'){
      const k=E.nacelle,Yt=curve(k.map(q=>[q[0],q[1]])),Yb=curve(k.map(q=>[q[0],q[2]])),Hw=curve(k.map(q=>[q[0],q[3]]));
      const z0=k[0][0],z1=k[k.length-1][0],ex=2/2.3;
      for(const s of [1,-1]){
        const cx=s*E.x;
        const fn=(zn,th)=>{const yt=Yt(zn),yb=Yb(zn),yw=(yt+yb)/2,c=Math.cos(th),si=Math.sin(th);
          return [cx+Hw(zn)*spow(c,ex),yw+(yt-yw)*spow(si,ex),Z(zn)];};
        const zsN=lin(0,1,16).map(t=>mix(z0,z1,t*t*(1.6-.6*t)));
        surface(fn,zsN,lin(0,TAU,24),'paint',{closed:true,eps:5e-4});
        const zf=Z(z0),yc=(Yt(z0)+Yb(z0))/2;
        disk([cx,yc,zf+.005],Hw(z0)*1.02,[0,0,1],'paint',20,(Yt(z0)-yc)*1.02);
        disk([cx,(Yt(z1)+Yb(z1))/2,Z(z1)-.005],Hw(z1),[0,0,-1],E.jet&&s<0?'dark':'paint',14,(Yt(z1)-Yb(z1))/2);
        /* chin intake and outboard exhaust */
        const pm=(zn,th,o)=>{const p=fn(zn,th),q=fn(zn+.01,th),r2=fn(zn,th+.01);return add(p,mul(norm(cross(sub(q,p),sub(r2,p))),o));};
        const intake=[[z0+.22,-PI/2-.5],[z0+.62,-PI/2-.58],[z0+.62,-PI/2+.58],[z0+.22,-PI/2+.5]].map(([zz,t])=>pm(zz,t,.03));
        quad(intake[0],intake[1],intake[2],intake[3],'dark',null,[0,-1,.3]);
        const zx=wingTE-.4,tx=s>0?0:PI,exh=[[zx,tx-.22],[zx+.75,tx-.22],[zx+.75,tx+.22],[zx,tx+.22]].map(([zz,t])=>pm(zz,t,.03));
        quad(exh[0],exh[1],exh[2],exh[3],'dark',null,[s,0,0]);
        /* spinner and blades */
        const sr=E.spinner,ya=E.axis,ls=sr*2.3;
        revolve(cx,ya,[[zf+ls,.02],[zf+ls*.82,sr*.42],[zf+ls*.5,sr*.82],[zf+ls*.18,sr*.99],[zf,sr]],'lip',{seg:16,flip:true,tip:()=>[0,0,1]});
        const rp=E.radius,zp=zf+ls*.28,nb=E.blades,stn=[.15,.3,.45,.6,.75,.88,.96,1];
        for(let b=0;b<nb;b++){
          const a=b*TAU/nb+(nb===6?.25:.62),er=[Math.cos(a),Math.sin(a),0],et=[-Math.sin(a),Math.cos(a),0];
          const pts=stn.map(rho=>{
            const r=rho*rp,ch=rp*(rho>.99?.03:(E.scimitar?.05+.085*Math.sin(PI*Math.min(1,rho*1.02)):.07+.075*Math.sin(PI*Math.min(1,rho*.98)))),beta=(54-38*rho)*DEG;
            const sw=E.scimitar?.16*rp*rho*rho*rho:0,dir=add(mul(et,Math.cos(beta)),[0,0,Math.sin(beta)]);
            const c0=add(add([cx,ya,zp],mul(er,r)),mul(et,-sw));
            return [add(c0,mul(dir,-.42*ch)),add(c0,mul(dir,.58*ch))];
          });
          for(let i=0;i<pts.length-1;i++){
            const n=norm(cross(sub(pts[i+1][0],pts[i][0]),sub(pts[i][1],pts[i][0])));
            both(pts[i][0],pts[i+1][0],pts[i+1][1],pts[i][1],stn[i]>=.87?'paint':'prop',n);
          }
        }
      }
    }
    if(spec.sponson){
      const P=spec.sponson,k=P.knots,Yt=curve(k.map(q=>[q[0],q[1]*R])),Yb=curve(k.map(q=>[q[0],q[2]*R])),Hw=curve(k.map(q=>[q[0],q[3]]));
      for(const s of [1,-1]){
        const fn=(zn,th)=>{const yt=Yt(zn),yb=Yb(zn),yw=(yt+yb)/2,c=Math.cos(th),si=Math.sin(th);
          return [s*P.x+Hw(zn)*spow(c,2/2.6),yw+(yt-yw)*spow(si,2/2.6),Z(zn)];};
        surface(fn,lin(P.from,P.to,14),lin(0,TAU,22),(zn,th)=>Math.sin(th)<-.3?'belly':'paint',{closed:true,eps:5e-4});
      }
    }
    if(spec.strakes){
      const K=spec.strakes,ca=K.cant*DEG;
      for(const s of [1,-1]){
        const zA=K.from,zB=K.to,mid=(zA+zB)/2,yb=fusSec(mid).yw-fusSec(mid).bL;
        const root={p:[s*K.x,yb+.18,Z(zA)],c:zB-zA,t:.05,n:[s*Math.cos(ca),Math.sin(ca),0]};
        const tipP=[s*(K.x+K.h*Math.sin(ca)),yb+.18-K.h*Math.cos(ca),Z(zA+1.6)];
        lift([root,{p:tipP,c:zB-zA-2.2,t:.05,n:root.n}],'belly',{step:1,chord:6});
      }
    }

    const P=Float32Array.from(Pp),count=Nn.length/3;let radius=0;
    for(let i=0;i<P.length;i+=3)radius=Math.max(radius,Math.hypot(P[i],P[i+1],P[i+2]));
    const model={id:spec.id,name:spec.name,spec,radius,triangleCount:count,
      buf:{n:count,P,N:Float32Array.from(Nn),VN:Float32Array.from(VNn),C:Float32Array.from(Cc)}};
    /* Face objects are rebuilt only on request, so ten loaded models stay light on phones. */
    Object.defineProperty(model,'faces',{enumerable:false,get(){
      const b=model.buf,out=[],v=(a,i)=>[a[i],a[i+1],a[i+2]];
      for(let f=0;f<b.n;f++)out.push({p:[v(b.P,f*9),v(b.P,f*9+3),v(b.P,f*9+6)],n:v(b.N,f*3),vn:[v(b.VN,f*9),v(b.VN,f*9+3),v(b.VN,f*9+6)],c:v(b.C,f*3)});
      return out;
    }});
    modelCache.set(spec.id,model);return model;
  }

  const VIEW={yaw:.62,pitch:.63};
  function rotate(v,yaw,pitch){
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cx=Math.cos(pitch),sx=Math.sin(pitch);
    const x=v[0]*cy+v[2]*sy,z=-v[0]*sy+v[2]*cy;
    return [x,v[1]*cx-z*sx,v[1]*sx+z*cx];
  }
  function extent(model,yaw,pitch){
    const P=model.buf.P;let a=Infinity,b=-Infinity,c=Infinity,d=-Infinity;
    for(let i=0;i<P.length;i+=3){const q=rotate([P[i],P[i+1],P[i+2]],yaw,pitch);if(q[0]<a)a=q[0];if(q[0]>b)b=q[0];if(q[1]<c)c=q[1];if(q[1]>d)d=q[1];}
    return [b-a,d-c];
  }
  const LIGHT=norm([-.45,.75,.7]),HALF=norm([-.3,.5,1.4]);
  /* Transforms, culls and lights the model into flat arrays: screen x, y, depth and r, g, b per vertex. */
  function frame(model,o,w,h){
    const {n,P,N,VN,C}=model.buf;
    const yaw=o.yaw===undefined?VIEW.yaw:o.yaw,pitch=o.pitch===undefined?VIEW.pitch:o.pitch,zoom=o.zoom||1,fill=o.fill||.9;
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    const T=new Float32Array(n*9);let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(let i=0;i<n*9;i+=3){
      const x=P[i],y=P[i+1],z=P[i+2],xr=x*cy+z*sy,zr=-x*sy+z*cy,yy=y*cp-zr*sp;
      T[i]=xr;T[i+1]=yy;T[i+2]=y*sp+zr*cp;
      if(xr<minX)minX=xr;if(xr>maxX)maxX=xr;if(yy<minY)minY=yy;if(yy>maxY)maxY=yy;
    }
    const ref=model.refExtent||(model.refExtent=extent(model,VIEW.yaw,VIEW.pitch));
    const base=Math.min(w*fill/ref[0],h*fill/ref[1]);
    const scale=Math.min(base,w*fill/(maxX-minX),h*fill/(maxY-minY))*zoom;
    const ox=w/2-(minX+maxX)/2*scale,oy=h/2+(minY+maxY)/2*scale;
    const S=new Float32Array(n*9),K=new Float32Array(n*9),index=new Int32Array(n);let m=0;
    for(let f=0;f<n;f++){
      const nx=N[f*3],ny=N[f*3+1],nz=N[f*3+2];
      if(ny*sp+(-nx*sy+nz*cy)*cp<=-.025)continue;
      const r=C[f*3],g=C[f*3+1],bl=C[f*3+2];
      for(let k=0;k<3;k++){
        const j=f*9+k*3,o9=m*9+k*3;
        S[o9]=ox+T[j]*scale;S[o9+1]=oy-T[j+1]*scale;S[o9+2]=T[j+2];
        const vx=VN[j],vy=VN[j+1],vz=VN[j+2],vxr=vx*cy+vz*sy,vzr=-vx*sy+vz*cy,a=vxr,bb=vy*cp-vzr*sp,c=vy*sp+vzr*cp;
        const diff=Math.max(0,a*LIGHT[0]+bb*LIGHT[1]+c*LIGHT[2]),sky=.5+.5*(bb*cp+c*sp),shade=.28+.16*sky+.6*diff;
        const hh=Math.max(0,a*HALF[0]+bb*HALF[1]+c*HALF[2]),h2=hh*hh,h4=h2*h2,h8=h4*h4,q=1-Math.abs(c);
        const add=h8*h8*h8*h2*30+q*q*q*10,dk=1-diff;
        K[o9]=r*shade+add+dk;K[o9+1]=g*shade+add+dk*6;K[o9+2]=bl*shade+add+dk*12;
      }
      index[m++]=f;
    }
    return {count:m,S,K,index,triangles:n,yaw,pitch,zoom};
  }
  function projection(model,options){
    const o=options||{},w=o.width||480,h=o.height||300,fr=frame(model,o,w,h),polygons=[];
    for(let i=0;i<fr.count;i++){
      const pt=k=>[fr.S[i*9+k*3],fr.S[i*9+k*3+1],fr.S[i*9+k*3+2]],cl=k=>[0,1,2].map(c=>Math.round(clamp(fr.K[i*9+k*3+c],0,255)));
      const points=[pt(0),pt(1),pt(2)],rgbs=[cl(0),cl(1),cl(2)],rgb=[0,1,2].map(c=>Math.round((rgbs[0][c]+rgbs[1][c]+rgbs[2][c])/3));
      polygons.push({points,z:(points[0][2]+points[1][2]+points[2][2])/3,color:`rgb(${rgb.join(',')})`,rgb,rgbs});
    }
    polygons.sort((a,b)=>a.z-b.z);
    return {width:w,height:h,polygons,triangles:fr.triangles,yaw:fr.yaw,pitch:fr.pitch,zoom:fr.zoom};
  }
  /* A small software depth buffer keeps glazing, propellers and intersecting
     wings correctly occluded, even where WebGL is disabled. Pixels are only
     recomputed when the user changes the view; no animation loop is required. */
  function rasterize(model,options){
    const o=options||{},w=Math.round(o.width||480),h=Math.round(o.height||300),size=w*h;
    const b=o.buffer&&o.buffer.width===w&&o.buffer.height===h?o.buffer:{width:w,height:h,data:new Uint8ClampedArray(size*4),depth:new Float32Array(size)};
    b.data.fill(0);b.depth.fill(-Infinity);
    const fr=frame(model,o,w,h),S=fr.S,K=fr.K,data=b.data,depth=b.depth;
    for(let f=0;f<fr.count;f++){
      const q=f*9;
      let x0=S[q],y0=S[q+1],z0=S[q+2],x1=S[q+3],y1=S[q+4],z1=S[q+5],x2=S[q+6],y2=S[q+7],z2=S[q+8];
      let r0=K[q],g0=K[q+1],b0=K[q+2],r1=K[q+3],g1=K[q+4],b1=K[q+5],r2=K[q+6],g2=K[q+7],b2=K[q+8];
      let area=(x2-x1)*(y0-y1)-(y2-y1)*(x0-x1);
      if(Math.abs(area)<.0001)continue;
      if(area<0){let t=x1;x1=x2;x2=t;t=y1;y1=y2;y2=t;t=z1;z1=z2;z2=t;t=r1;r1=r2;r2=t;t=g1;g1=g2;g2=t;t=b1;b1=b2;b2=t;area=-area;}
      const xa=Math.max(0,Math.floor(Math.min(x0,x1,x2))),xb=Math.min(w-1,Math.ceil(Math.max(x0,x1,x2)));
      const ya=Math.max(0,Math.floor(Math.min(y0,y1,y2))),yb=Math.min(h-1,Math.ceil(Math.max(y0,y1,y2)));
      if(xa>xb||ya>yb)continue;
      const dx0=y1-y2,dy0=x2-x1,dx1=y2-y0,dy1=x0-x2,dx2=y0-y1,dy2=x1-x0,iz=1/area;
      let row0=dy0*(ya+.5-y1)+dx0*(xa+.5-x1),row1=dy1*(ya+.5-y2)+dx1*(xa+.5-x2),row2=dy2*(ya+.5-y0)+dx2*(xa+.5-x0);
      const dzx=(dx0*z0+dx1*z1+dx2*z2)*iz,dzy=(dy0*z0+dy1*z1+dy2*z2)*iz;
      const drx=(dx0*r0+dx1*r1+dx2*r2)*iz,dry=(dy0*r0+dy1*r1+dy2*r2)*iz;
      const dgx=(dx0*g0+dx1*g1+dx2*g2)*iz,dgy=(dy0*g0+dy1*g1+dy2*g2)*iz;
      const dbx=(dx0*b0+dx1*b1+dx2*b2)*iz,dby=(dy0*b0+dy1*b1+dy2*b2)*iz;
      let rowZ=(row0*z0+row1*z1+row2*z2)*iz,rowR=(row0*r0+row1*r1+row2*r2)*iz,rowG=(row0*g0+row1*g1+row2*g2)*iz,rowB=(row0*b0+row1*b1+row2*b2)*iz;
      for(let y=ya;y<=yb;y++){
        let e0=row0,e1=row1,e2=row2,z=rowZ,r=rowR,g=rowG,bl=rowB,index=y*w+xa;
        for(let x=xa;x<=xb;x++,index++){
          if(e0>=-.00001&&e1>=-.00001&&e2>=-.00001&&z>depth[index]){
            depth[index]=z;const i=index*4;data[i]=r;data[i+1]=g;data[i+2]=bl;data[i+3]=255;
          }
          e0+=dx0;e1+=dx1;e2+=dx2;z+=dzx;r+=drx;g+=dgx;bl+=dbx;
        }
        row0+=dy0;row1+=dy1;row2+=dy2;rowZ+=dzy;rowR+=dry;rowG+=dgy;rowB+=dby;
      }
    }
    b.triangles=fr.triangles;b.yaw=fr.yaw;b.pitch=fr.pitch;
    return b;
  }
  const canvasBuffers=typeof WeakMap!=='undefined'?new WeakMap():new Map();
  function render(canvas,model,options){
    const o=options||{},width=o.width||canvas.clientWidth||480,height=o.height||canvas.clientHeight||300;
    const dpr=Math.min(o.dpr||(typeof devicePixelRatio==='number'?devicePixelRatio:1),2);
    const dw=Math.round(width*dpr),dh=Math.round(height*dpr);
    if(canvas.width!==dw||canvas.height!==dh){canvas.width=dw;canvas.height=dh;}
    const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)return null;
    const frame=rasterize(model,Object.assign({},o,{width:dw,height:dh,buffer:canvasBuffers.get(canvas)}));
    canvasBuffers.set(canvas,frame);
    const bitmap=ctx.createImageData(dw,dh);bitmap.data.set(frame.data);
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,dw,dh);ctx.putImageData(bitmap,0,0);
    if(o.background&&o.background!=='transparent'){
      ctx.globalCompositeOperation='destination-over';ctx.fillStyle=o.background;ctx.fillRect(0,0,dw,dh);ctx.globalCompositeOperation='source-over';
    }
    return {triangles:frame.triangles,yaw:frame.yaw,pitch:frame.pitch,engine:'canvas-3d-depth-buffer'};
  }
  function toSVG(model,options){
    const s=projection(model,options),bg=options&&options.background;
    const paths=s.polygons.map(f=>`<path d="M${f.points.map(p=>p.slice(0,2).map(v=>v.toFixed(2)).join(',')).join('L')}Z" fill="${f.color}" stroke="${f.color}" stroke-width=".45" stroke-linejoin="round"/>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s.width}" height="${s.height}" viewBox="0 0 ${s.width} ${s.height}">${bg&&bg!=='transparent'?`<rect width="100%" height="100%" fill="${bg}"/>`:''}${paths}</svg>`;
  }
  const api={catalog,createModel,render,rasterize,toSVG,project:projection,view:VIEW,version:'2.0.0'};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.Fleet3D=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:this);
