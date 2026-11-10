/* Original decorative aircraft model. Native WebGL; no external assets or runtime dependencies. */
(function () {
  'use strict';
  const canvas = document.getElementById('aircraft-canvas');
  if (!canvas) return;
  const stage = canvas.closest('.hero-stage') || canvas.parentElement;
  const hero = canvas.closest('#top') || stage;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const gl = canvas.getContext('webgl', {alpha:true, antialias:true, premultipliedAlpha:true, powerPreference:'default'}) || canvas.getContext('experimental-webgl', {alpha:true, antialias:true});
  if (!gl) { canvas.dataset.webglReady='false'; canvas.dataset.webglError='context-unavailable'; console.warn('Aircraft3D: this browser has no available WebGL context; using the rendered poster.'); return; }

  const vertexSource = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec3 aColor;
    attribute vec2 aMaterial;
    uniform mat4 uModel;
    uniform mat4 uViewProjection;
    varying vec3 vPosition;
    varying vec3 vLocal;
    varying vec3 vNormal;
    varying vec3 vColor;
    varying vec2 vMaterial;
    void main(){
      vec4 world = uModel * vec4(aPosition,1.0);
      vPosition = world.xyz;
      vLocal = aPosition;
      vNormal = normalize(mat3(uModel)*aNormal);
      vColor = aColor;
      vMaterial = aMaterial;
      gl_Position = uViewProjection * world;
    }
  `;
  const fragmentSource = `
    precision mediump float;
    varying vec3 vPosition;
    varying vec3 vLocal;
    varying vec3 vNormal;
    varying vec3 vColor;
    varying vec2 vMaterial;
    uniform vec3 uCamera;
    uniform vec3 uLocalLight;
    vec3 film(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}
    void main(){
      vec3 N=normalize(vNormal);
      vec3 V=normalize(uCamera-vPosition);
      vec3 L=normalize(vec3(0.38,0.86,0.34));
      vec3 H=normalize(L+V);
      float rough=vMaterial.x;
      float metal=vMaterial.y;
      float ndl=max(dot(N,L),0.0);
      float ndv=max(dot(N,V),0.0);
      float hemisphere=smoothstep(-0.25,0.95,N.y);
      vec3 ambient=mix(vec3(0.115,0.20,0.29),vec3(0.50,0.64,0.78),hemisphere);
      float fill=max(dot(N,normalize(vec3(0.6,0.22,-0.7))),0.0)*0.24;
      vec3 base=pow(vColor,vec3(2.2));
      float rayT=max(0.0,-dot(vLocal.xy,uLocalLight.xy)/max(dot(uLocalLight.xy,uLocalLight.xy),0.001));
      float distanceToBody=length(vLocal.xy+uLocalLight.xy*rayT);
      float shadow=(1.0-smoothstep(0.68,0.90,distanceToBody))*smoothstep(0.05,0.25,rayT);
      shadow*=step(-5.3,vLocal.z+uLocalLight.z*rayT)*step(vLocal.z+uLocalLight.z*rayT,4.1)*step(vLocal.y,0.40);
      vec3 diffuse=base*(ambient*0.50+vec3(0.90,0.96,1.0)*ndl*1.55*(1.0-shadow*0.86)+fill);
      float power=mix(180.0,26.0,rough);
      float spec=pow(max(dot(N,H),0.0),power)*(1.0-rough)*1.9;
      float wide=pow(max(dot(N,H),0.0),18.0)*0.12;
      float fresnel=0.035+(1.0-0.035)*pow(1.0-ndv,5.0);
      vec3 reflection=mix(vec3(0.10,0.17,0.24),vec3(0.73,0.83,0.94),smoothstep(-0.1,0.8,reflect(-V,N).y));
      vec3 color=diffuse*(1.0-metal*0.55)+vec3(0.87,0.94,1.0)*(spec+wide)*(0.4+metal)+reflection*fresnel*(0.22+metal*0.75);
      color=pow(film(color*1.15),vec3(1.0/2.2));
      gl_FragColor=vec4(color,1.0);
    }
  `;
  function shader(type,source){
    const s=gl.createShader(type); gl.shaderSource(s,source); gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(s)||'unknown shader error';canvas.dataset.webglError=(type===gl.VERTEX_SHADER?'vertex-shader: ':'fragment-shader: ')+log;console.warn('Aircraft3D shader:',log);gl.deleteShader(s);return null;}
    return s;
  }
  const vs=shader(gl.VERTEX_SHADER,vertexSource), fs=shader(gl.FRAGMENT_SHADER,fragmentSource);
  if(!vs||!fs){canvas.dataset.webglReady='false';return;}
  const program=gl.createProgram(); gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){canvas.dataset.webglReady='false';canvas.dataset.webglError='program-link: '+(gl.getProgramInfoLog(program)||'unknown');console.warn('Aircraft3D program:',canvas.dataset.webglError);return;}
  gl.useProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);

  const vertices=[];
  const paint={color:[.94,.97,1],rough:.29,metal:.14};
  const wingPaint={color:[.89,.94,.98],rough:.30,metal:.16};
  const belly={color:[.76,.84,.90],rough:.34,metal:.22};
  const edge={color:[.64,.73,.81],rough:.13,metal:.85};
  const silver={color:[.83,.89,.94],rough:.10,metal:.95};
  const glass={color:[.055,.12,.18],rough:.065,metal:.72};
  const seam={color:[.37,.47,.56],rough:.38,metal:.25};
  const dark={color:[.027,.04,.05],rough:.62,metal:.35};
  const fanMetal={color:[.14,.20,.24],rough:.22,metal:.8};
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const mix=(a,b,t)=>a+(b-a)*t;
  function sub(a,b){return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
  function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  function norm(v){const m=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/m,v[1]/m,v[2]/m];}
  function vertex(p,n,m){vertices.push(...p,...n,...m.color,m.rough,m.metal);}
  function tri(a,b,c,m,na,nb,nc){const area=cross(sub(b,a),sub(c,a));if(Math.hypot(...area)<1e-10)return;const n=norm(area);vertex(a,na||n,m);vertex(b,nb||n,m);vertex(c,nc||n,m);}
  function quad(a,b,c,d,m,na,nb,nc,nd){tri(a,b,c,m,na,nb,nc);tri(a,c,d,m,na,nc,nd);}

  // Fuselage: smooth cubic loft with an ogive nose and rising tail cone.
  const profiles=[[-8.6,.026,.20],[-8.25,.16,.18],[-7.6,.34,.14],[-6.7,.56,.08],[-5.6,.72,.025],[-4.4,.79,0],[0,.80,0],[3.65,.79,0],[4.65,.74,-.015],[5.40,.62,-.04],[6.02,.42,-.075],[6.5,.19,-.09],[6.68,.015,-.095]];
  function bodyAt(z){
    let i=0;while(i<profiles.length-2&&z>profiles[i+1][0])i++;
    const a=profiles[Math.max(0,i-1)], b=profiles[i], c=profiles[i+1], d=profiles[Math.min(profiles.length-1,i+2)];
    const t=clamp((z-b[0])/(c[0]-b[0]),0,1), t2=t*t,t3=t2*t;
    const cubic=k=>.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t2+(-a[k]+3*b[k]-3*c[k]+d[k])*t3);
    return [Math.max(.01,cubic(1)),cubic(2)];
  }
  function bodyPoint(z,angle,offset){const r=bodyAt(z);return [(r[0]+(offset||0))*Math.cos(angle),r[1]+(r[0]*.96+(offset||0))*Math.sin(angle),z];}
  function bodyNormal(z,a){const eps=.008;const p1=bodyPoint(Math.min(6.679,z+eps),a),p0=bodyPoint(Math.max(-8.599,z-eps),a);return norm([Math.cos(a),Math.sin(a)/.96,-(p1[0]-p0[0])*Math.cos(a)/(eps*2)-(p1[1]-p0[1])*Math.sin(a)/(eps*2)]);}
  const longitudinal=104, radial=64;
  for(let j=0;j<longitudinal;j++){
    const z0=mix(-8.6,6.68,j/longitudinal),z1=mix(-8.6,6.68,(j+1)/longitudinal);
    for(let i=0;i<radial;i++){
      const a0=i*Math.PI*2/radial,a1=(i+1)*Math.PI*2/radial;
      const material=Math.sin((a0+a1)/2)<-.53?belly:paint;
      quad(bodyPoint(z0,a0),bodyPoint(z1,a0),bodyPoint(z1,a1),bodyPoint(z0,a1),material,bodyNormal(z0,a0),bodyNormal(z1,a0),bodyNormal(z1,a1),bodyNormal(z0,a1));
    }
  }

  // Rounded windows and doors are wrapped over the actual curved body surface.
  function surfacePolygon(points,mat,offset,subdivisions){
    const center=points.reduce((p,q)=>[p[0]+q[0]/points.length,p[1]+q[1]/points.length],[0,0]);
    const cp=bodyPoint(center[0],center[1],offset);
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length];
      const count=subdivisions||1;
      const at=(u,v)=>[center[0]+(a[0]-center[0])*u+(b[0]-center[0])*v,center[1]+(a[1]-center[1])*u+(b[1]-center[1])*v];
      const patch=(q,r,s)=>tri(bodyPoint(q[0],q[1],offset),bodyPoint(r[0],r[1],offset),bodyPoint(s[0],s[1],offset),mat,bodyNormal(q[0],q[1]),bodyNormal(r[0],r[1]),bodyNormal(s[0],s[1]));
      for(let u=0;u<count;u++)for(let v=0;v<count-u;v++){
        patch(at(u/count,v/count),at((u+1)/count,v/count),at(u/count,(v+1)/count));
        if(u+v<count-1)patch(at((u+1)/count,v/count),at((u+1)/count,(v+1)/count),at(u/count,(v+1)/count));
      }
    }
  }
  function roundRect(z,angle,w,h,r){
    const out=[];const corners=[[w/2-r,h/2-r],[-w/2+r,h/2-r],[-w/2+r,-h/2+r],[w/2-r,-h/2+r]];
    corners.forEach((c,i)=>{for(let j=0;j<=5;j++){const a=(i*90+j*18)*Math.PI/180;out.push([z+c[0]+Math.cos(a)*r,angle+c[1]+Math.sin(a)*r]);}});
    return out;
  }
  for(const side of [-1,1]){
    const angle=side===1?.28:Math.PI-.28;
    for(let i=0;i<27;i++){
      const z=-4.5+i*.326;
      surfacePolygon(roundRect(z,angle,.204,.33,.064),edge,.009);
      surfacePolygon(roundRect(z,angle,.167,.283,.059),glass,.014);
      // Small highlight at the top edge, not an opaque decal panel.
      const aa=angle+(side===1?1:-1)*.11;
      surfacePolygon([[z-.045,aa],[z+.045,aa],[z+.055,aa+.013],[z-.053,aa+.013]],silver,.017);
    }
    for(const z of [-5.35,4.48]){
      surfacePolygon(roundRect(z,side===1?.03:Math.PI-.03,.40,.88,.07),seam,.007);
      surfacePolygon(roundRect(z,side===1?.03:Math.PI-.03,.378,.85,.068),paint,.010);
      surfacePolygon(roundRect(z,angle,.132,.20,.045),glass,.015);
    }
    // A pair of over-wing emergency exits.
    for(const z of [-.10,.48]){
      surfacePolygon(roundRect(z,side===1?.02:Math.PI-.02,.263,.61,.043),seam,.007);
      surfacePolygon(roundRect(z,side===1?.02:Math.PI-.02,.244,.59,.04),paint,.009);
      surfacePolygon(roundRect(z,angle,.157,.26,.05),glass,.017);
    }
  }
  // Cockpit windscreen facets, arranged around the upper nose, with narrow frames.
  const screens=[
    [[5.07,.57],[5.80,.68],[5.98,1.17],[5.16,1.34]],
    [[5.16,1.42],[5.98,1.32],[5.98,1.82],[5.16,1.72]],
    [[5.16,1.82],[5.98,1.98],[5.80,2.46],[5.07,2.57]]
  ];
  screens.forEach(p=>surfacePolygon(p,glass,.022,9));
  // Radome separation follows the nose curvature.
  for(let i=0;i<64;i++){const a=i*Math.PI/32,b=(i+1)*Math.PI/32;quad(bodyPoint(6.07,a,.003),bodyPoint(6.081,a,.003),bodyPoint(6.081,b,.003),bodyPoint(6.07,b,.003),edge);}

  // Swept wings: a real closed airfoil volume, washout, dihedral and raked tips.
  function airfoil(u,t){return 5*t*(.2969*Math.sqrt(Math.max(0,u))-.126*u-.3516*u*u+.2843*u*u*u-.1036*u*u*u*u);}
  function wing(stations,side,vertical,material){
    const chordSteps=40;
    function at(row,u,top){
      const [span,leading,trailing,height,thickness]=row;
      const chord=leading-trailing;
      const thick=airfoil(u,thickness)*chord*(top?1:-1);
      const camber=.016*chord*Math.sin(Math.PI*u);
      if(vertical)return [thick,span,leading-u*chord];
      return [side*span,height+thick+camber,leading-u*chord];
    }
    for(let row=0;row<stations.length-1;row++)for(let j=0;j<chordSteps;j++){
      const u0=j/chordSteps,u1=(j+1)/chordSteps;
      for(const top of [true,false]){
        const a=at(stations[row],u0,top),b=at(stations[row+1],u0,top),c=at(stations[row+1],u1,top),d=at(stations[row],u1,top);
        const m=u0<.065?edge:material;
        if(vertical?!top:((side===1)===top))quad(a,b,c,d,m);else quad(d,c,b,a,m);
      }
    }
    const tip=stations[stations.length-1];
    for(let j=0;j<chordSteps;j++){const u0=j/chordSteps,u1=(j+1)/chordSteps;quad(at(tip,u0,true),at(tip,u1,true),at(tip,u1,false),at(tip,u0,false),material);}
    // A restrained flap/aileron line on the top skin.
    for(let row=0;row<stations.length-1;row++){
      const a=at(stations[row],.72,true),b=at(stations[row+1],.72,true),c=at(stations[row+1],.724,true),d=at(stations[row],.724,true);
      if(vertical){a[0]+=.006;b[0]+=.006;c[0]+=.006;d[0]+=.006;}else{a[1]+=.006;b[1]+=.006;c[1]+=.006;d[1]+=.006;}
      quad(a,b,c,d,seam);
    }
  }
  const mainWing=[ [.47,1.20,-2.63,-.31,.105],[1.5,.91,-2.52,-.28,.10],[2.9,.31,-2.65,-.20,.085],[4.4,-.43,-2.96,-.07,.068],[6.0,-1.20,-3.34,.10,.05],[7.15,-1.91,-3.66,.25,.036],[7.7,-2.62,-3.82,.39,.025] ];
  const tailWing=[ [.16,-5.51,-7.65,.32,.09],[1.1,-5.74,-7.61,.36,.08],[2.6,-6.35,-7.92,.52,.055],[3.25,-6.93,-8.06,.64,.035] ];
  [-1,1].forEach(side=>{wing(mainWing,side,false,wingPaint);wing(tailWing,side,false,wingPaint);});
  wing([[.40,-5.0,-8.2,0,.13],[1.20,-5.66,-8.05,0,.10],[2.55,-6.86,-8.02,0,.065],[2.88,-7.17,-8.04,0,.04]],1,true,paint);

  // Smooth lathed shapes for the nacelles, recessed ducts, spinner and fairings.
  function revolve(cx,cy,cz,profile,material,segments,reverse){
    segments=segments||48;
    for(let j=0;j<profile.length-1;j++){
      const [z0,r0]=profile[j],[z1,r1]=profile[j+1];
      const slope=(r1-r0)/(z1-z0||1e-5);
      for(let i=0;i<segments;i++){
        const a=i*2*Math.PI/segments,b=(i+1)*2*Math.PI/segments;
        const p=(z,r,t)=>[cx+r*Math.cos(t),cy+r*Math.sin(t),cz+z];
        const normal=t=>{const n=norm([Math.cos(t),Math.sin(t),-slope]);return reverse?n.map(v=>-v):n;};
        quad(p(z0,r0,a),p(z1,r1,a),p(z1,r1,b),p(z0,r0,b),material,normal(a),normal(a),normal(b),normal(b));
      }
    }
  }
  function disk(cx,cy,z,r,mat){const center=[cx,cy,z];for(let i=0;i<64;i++){const a=i*Math.PI/32,b=(i+1)*Math.PI/32;tri(center,[cx+r*Math.cos(a),cy+r*Math.sin(a),z],[cx+r*Math.cos(b),cy+r*Math.sin(b),z],mat,[0,0,1],[0,0,1],[0,0,1]);}}
  for(const side of [-1,1]){
    const ex=side*2.62,ey=-.93,ez=.44;
    const outer=[[-1.36,.16],[-1.25,.31],[-.83,.45],[-.25,.57],[.36,.63],[.90,.62],[1.12,.585],[1.20,.55]];
    revolve(ex,ey,ez,outer,paint,64);
    revolve(ex,ey,ez,[[1.16,.55],[1.22,.53],[1.225,.49],[1.18,.47]],silver,64);
    revolve(ex,ey,ez,[[1.18,.47],[.94,.46],[.68,.44]],dark,64,true);
    disk(ex,ey,ez+.69,.44,dark);
    // Curved individual fan blades visible inside the recessed inlet.
    for(let i=0;i<24;i++){
      const a=i*Math.PI/12, next=a+.13;
      const p=(r,t,z)=>[ex+r*Math.cos(t),ey+r*Math.sin(t),ez+z];
      quad(p(.10,a,.735),p(.425,a+.22,.708),p(.435,next+.23,.708),p(.10,next,.743),fanMetal);
    }
    revolve(ex,ey,ez,[[.69,.115],[.85,.10],[1.02,.025]],edge,48);
    revolve(ex,ey,ez,[[-1.35,.15],[-1.46,.12]],edge,48);
    disk(ex,ey,ez-1.44,.11,dark);
    // Streamlined pylon joins the nacelle into the underside of the wing.
    const pylon=[[ex-.12,-.48,ez+.32],[ex+.12,-.48,ez+.32],[ex+.095,-.05,ez-.10],[ex-.095,-.05,ez-.10]];
    const rear=pylon.map(p=>[p[0],p[1],p[2]-1.08]);
    quad(...pylon,wingPaint);quad(...rear,wingPaint);
    for(let i=0;i<4;i++)quad(pylon[i],pylon[(i+1)%4],rear[(i+1)%4],rear[i],wingPaint);
    // Flap-track fairings, thin aerodynamic pods under each wing.
    for(const [x,z] of [[3.75,-2.83],[5.4,-3.18]])revolve(side*x,-.06,z,[[-.55,.025],[-.32,.087],[.20,.10],[.55,.045],[.70,.008]],belly,24);
  }
  // Small wing-tip navigation lights, integrated into the surface.
  function sphere(cx,cy,cz,rx,ry,rz,mat){
    const rings=10,segments=16;
    const p=(a,b)=>[cx+rx*Math.sin(a)*Math.cos(b),cy+ry*Math.cos(a),cz+rz*Math.sin(a)*Math.sin(b)];
    const n=(a,b)=>norm([Math.sin(a)*Math.cos(b)/rx,Math.cos(a)/ry,Math.sin(a)*Math.sin(b)/rz]);
    for(let i=0;i<rings;i++)for(let j=0;j<segments;j++){const a=i*Math.PI/rings,b=(i+1)*Math.PI/rings,c=j*Math.PI*2/segments,d=(j+1)*Math.PI*2/segments;quad(p(a,c),p(b,c),p(b,d),p(a,d),mat,n(a,c),n(b,c),n(b,d),n(a,d));}
  }
  sphere(-7.62,.4,-2.86,.046,.035,.07,{color:[.78,.13,.08],rough:.10,metal:.30});
  sphere(7.62,.4,-2.86,.046,.035,.07,{color:[.10,.65,.39],rough:.10,metal:.30});
  sphere(0,.80,.6,.05,.065,.08,{color:[.7,.12,.08],rough:.10,metal:.25});

  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
  const stride=44;
  [['aPosition',3,0],['aNormal',3,12],['aColor',3,24],['aMaterial',2,36]].forEach(([name,size,offset])=>{const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,stride,offset);});
  const uniforms={model:gl.getUniformLocation(program,'uModel'),viewProjection:gl.getUniformLocation(program,'uViewProjection'),camera:gl.getUniformLocation(program,'uCamera'),localLight:gl.getUniformLocation(program,'uLocalLight')};
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.clearColor(0,0,0,0);

  function identity(){return [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];}
  function multiply(a,b){const out=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];return out;}
  function rotationX(a){const c=Math.cos(a),s=Math.sin(a);return [1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1];}
  function rotationY(a){const c=Math.cos(a),s=Math.sin(a);return [c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1];}
  function rotationZ(a){const c=Math.cos(a),s=Math.sin(a);return [c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1];}
  const eye=[-14,23,24], backward=norm(eye), ordinaryRight=norm(cross([0,1,0],backward)), ordinaryUp=cross(backward,ordinaryRight);
  // Front three-quarter view: tail upper-left, nose lower-right, broad swept wing across the title.
  const right=ordinaryRight, up=ordinaryUp;
  const view=[right[0],up[0],backward[0],0,right[1],up[1],backward[1],0,right[2],up[2],backward[2],0,-dot(right,eye),-dot(up,eye),-dot(backward,eye),1];
  function ortho(w,h){const near=.1,far=100;return [2/w,0,0,0,0,2/h,0,0,0,0,-2/(far-near),0,0,0,-(far+near)/(far-near),1];}
  let width=1,height=1,viewWidth=15.1,viewHeight=10,projectionView=identity();
  let progress=0,targetProgress=0,pointerX=0,pointerY=0,targetX=0,targetY=0;
  let visible=true,queued=false,disposed=false,contextLost=false;
  const vertexCount=vertices.length/11;
  canvas.dataset.webglReady='true';canvas.dataset.meshTriangles=String(vertexCount/3);canvas.dataset.renderEngine='native-webgl';
  canvas.setAttribute('aria-hidden','true');canvas.style.display='block';canvas.style.width='100%';canvas.style.height='100%';

  function measure(){
    const r=stage.getBoundingClientRect();width=Math.max(1,Math.round(r.width));height=Math.max(1,Math.round(r.height));
    const ratio=Math.min(window.devicePixelRatio||1,1.5);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);gl.viewport(0,0,canvas.width,canvas.height);
    viewWidth=width<=600?11.2:15.1;viewHeight=viewWidth*height/width;
    projectionView=multiply(ortho(viewWidth,viewHeight),view);
    requestRender();
  }
  function scrollProgress(){
    const rect=hero.getBoundingClientRect();const travel=Math.max(1,rect.height-window.innerHeight);
    targetProgress=clamp(-rect.top/travel,0,1);requestRender();
  }
  function draw(p,px,py){
    const motion=reducedMotion.matches?0:p;
    const scaleOverride=parseFloat(canvas.dataset.aircraftScale||'.86')||1;
    const scale=(1.0+motion*.12)*scaleOverride;
    let model=multiply(rotationY(-.07+motion*.62+px*.035),multiply(rotationZ(-.025+motion*.19+py*.025),rotationX(.02+Math.sin(motion*Math.PI)*.14)));
    for(let i=0;i<12;i++)model[i]*=scale;
    const sx=((width<=600?.10:.08)+motion*.28)*viewWidth,sy=((width<=600?.07:-.10)+motion*.34)*viewHeight;
    model[12]=right[0]*sx+up[0]*sy;model[13]=right[1]*sx+up[1]*sy;model[14]=right[2]*sx+up[2]*sy;
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(uniforms.model,false,new Float32Array(model));
    gl.uniformMatrix4fv(uniforms.viewProjection,false,new Float32Array(projectionView));
    gl.uniform3fv(uniforms.camera,new Float32Array(eye));
    const keyLight=norm([.38,.86,.34]);
    gl.uniform3fv(uniforms.localLight,new Float32Array(norm([dot(model.slice(0,3),keyLight),dot(model.slice(4,7),keyLight),dot(model.slice(8,11),keyLight)])));
    gl.drawArrays(gl.TRIANGLES,0,vertexCount);
  }
  function render(){
    queued=false;if(disposed||contextLost||!visible||document.hidden)return;
    const staticMode=reducedMotion.matches;
    progress=staticMode?0:mix(progress,targetProgress,.11);
    pointerX=staticMode?0:mix(pointerX,targetX,.075);pointerY=staticMode?0:mix(pointerY,targetY,.075);
    draw(progress,pointerX,pointerY);
    if(!staticMode&&(Math.abs(progress-targetProgress)>.0003||Math.abs(pointerX-targetX)>.001||Math.abs(pointerY-targetY)>.001))requestRender();
  }
  function requestRender(){if(queued||disposed||contextLost||!visible||document.hidden)return;queued=true;requestAnimationFrame(render);}
  function pointer(event){if(reducedMotion.matches||event.pointerType==='touch')return;const r=stage.getBoundingClientRect();targetX=clamp((event.clientX-r.left)/r.width*2-1,-1,1);targetY=clamp((event.clientY-r.top)/r.height*2-1,-1,1);requestRender();}
  function pointerLeave(){targetX=0;targetY=0;requestRender();}
  const resizeObserver=new ResizeObserver(measure);resizeObserver.observe(stage);
  const visibilityObserver=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){scrollProgress();requestRender();}},{rootMargin:'80px'});visibilityObserver.observe(hero);
  window.addEventListener('scroll',scrollProgress,{passive:true});window.addEventListener('resize',measure,{passive:true});
  stage.addEventListener('pointermove',pointer,{passive:true});stage.addEventListener('pointerleave',pointerLeave,{passive:true});
  document.addEventListener('visibilitychange',requestRender);reducedMotion.addEventListener('change',requestRender);
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();contextLost=true;canvas.dataset.webglReady='false';});
  measure();scrollProgress();draw(0,0,0);
  window.AircraftScene={
    renderAt:function(p){progress=targetProgress=clamp(Number(p)||0,0,1);draw(progress,0,0);},
    getStats:function(){return {triangles:vertexCount/3,vertices:vertexCount,engine:'native-webgl',width:canvas.width,height:canvas.height};},
    dispose:function(){disposed=true;resizeObserver.disconnect();visibilityObserver.disconnect();window.removeEventListener('scroll',scrollProgress);window.removeEventListener('resize',measure);stage.removeEventListener('pointermove',pointer);stage.removeEventListener('pointerleave',pointerLeave);document.removeEventListener('visibilitychange',requestRender);reducedMotion.removeEventListener('change',requestRender);gl.deleteBuffer(buffer);gl.deleteProgram(program);}
  };
})();
