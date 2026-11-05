import json, math
from shapely.geometry import shape, mapping, Polygon, MultiPolygon, LineString
from shapely.ops import unary_union
NE='/tmp/claude-0/-home-claude/ef72c7c1-0041-5390-af48-6ecc9dd4c7ec/scratchpad/ne/'
c10=json.load(open(NE+'ne_10m_admin_0_countries_rus.geojson'))
a1=json.load(open(NE+'ne_10m_admin_1_states_provinces.geojson'))
c50=json.load(open(NE+'ne_50m_admin_0_countries.geojson'))
# --- projection: conic equal-area (Albers), parallels 50,70, central meridian 100E ---
PHI1,PHI2,LAM0=math.radians(50),math.radians(70),100.0
n=(math.sin(PHI1)+math.sin(PHI2))/2
C=math.cos(PHI1)**2+2*n*math.sin(PHI1)
rho0=math.sqrt(C-2*n*math.sin(0))/n
def proj(lon,lat):
    lam=math.radians(lon-LAM0); phi=math.radians(lat)
    # wrap lam to [-pi,pi]
    while lam>math.pi: lam-=2*math.pi
    while lam<-math.pi: lam+=2*math.pi
    rho=math.sqrt(C-2*n*math.sin(phi))/n
    th=n*lam
    return rho*math.sin(th), rho0-rho*math.cos(th)
# fit: bounds of Russia + margin
W,H=1000,560
def fit(polys):
    xs=[];ys=[]
    for p in polys:
        for x,y in p: xs.append(x); ys.append(y)
    return min(xs),min(ys),max(xs),max(ys)
rus=[f for f in c10['features'] if f['properties']['ADM0_A3']=='RUS'][0]
ukr_a1=[f for f in a1['features'] if f['properties']['adm0_a3']=='UKR']
names=[f['properties']['name'] for f in ukr_a1]
print(sorted(names))
new4=[f for f in ukr_a1 if f['properties']['name'] in ("Donets'k","Luhans'k","Zaporizhzhya","Kherson")]
crimea=[f for f in ukr_a1 if f['properties']['name'] in ("Crimea","Sevastopol'")]
print('new4',[f['properties']['name'] for f in new4],'crimea',[f['properties']['name'] for f in crimea])
rus_geom=unary_union([shape(rus['geometry'])]+[shape(f['geometry']).buffer(0) for f in new4])
rus_a1=[f for f in a1['features'] if f['properties']['adm0_a3']=='RUS']+new4+crimea
print('rus admin1', len(rus_a1))
import collections
print(len(rus_a1))
# other countries (50m) except RUS and UKR; UKR from admin1 minus new4/crimea
others=[shape(f['geometry']) for f in c50['features'] if f['properties']['ADM0_A3'] not in ('RUS','UKR')]
ukr_rest=unary_union([shape(f['geometry']).buffer(0) for f in ukr_a1 if f['properties']['name'] not in ("Donets'k","Luhans'k","Zaporizhzhya","Kherson","Crimea","Sevastopol'")])
others.append(ukr_rest)
# project geometry -> list of rings in projected coords
def proj_geom(geom, tol):
    g=geom.simplify(tol, preserve_topology=True)
    polys=[g] if isinstance(g,Polygon) else list(g.geoms)
    rings=[]
    for p in polys:
        if p.is_empty: continue
        for ring in [p.exterior]+list(p.interiors):
            pts=[proj(x,y) for x,y in ring.coords]
            rings.append(pts)
    return rings
rus_rings=proj_geom(rus_geom,0.06)
minx,miny,maxx,maxy=fit(rus_rings)
print('rus projected bounds', minx,miny,maxx,maxy)
# fit transform with margins
pad=0.02
sx=W*(1-2*pad)/(maxx-minx); sy=H*(1-2*pad)/(maxy-miny); s=min(sx,sy)
tx=(W-s*(maxx-minx))/2 - s*minx; ty=(H-s*(maxy-miny))/2 - s*miny
def T(x,y): return round(s*x+tx,1), round(ty+s*y,1)  # y: projected y grows north; flip
def T(x,y): return round(s*x+tx,1), round(H-(ty+s*y),1)
def path(rings):
    d=[]
    for r in rings:
        pts=[T(x,y) for x,y in r]
        # drop consecutive duplicates
        out=[pts[0]]
        for p in pts[1:]:
            if p!=out[-1]: out.append(p)
        if len(out)<3: continue
        d.append('M'+' '.join(f'{x},{y}' for x,y in out)+'Z')
    return ''.join(d)
out={'W':W,'H':H,'proj':{'phi1':50,'phi2':70,'lam0':100,'n':n,'C':C,'rho0':rho0,'s':s,'tx':tx,'ty':ty}}
out['russia']=path(rus_rings)
from shapely.geometry import box
from shapely.ops import transform as shp_transform
GEO_BOX=unary_union([box(-10,25,180,85), box(-180,25,-120,85)])
SCREEN=box(-5,-5,W+5,H+5)
def to_screen(x,y,z=None):
    px,py=proj(x,y); return T(px,py)
oth=[]
for g in others:
    g=g.buffer(0).intersection(GEO_BOX)
    if g.is_empty or g.geom_type not in ('Polygon','MultiPolygon','GeometryCollection'): continue
    g=g.simplify(0.15, preserve_topology=True)
    polys=[g] if isinstance(g,Polygon) else [q for q in getattr(g,'geoms',[]) if isinstance(q,Polygon)]
    for q in polys:
        try:
            sq=shp_transform(to_screen, q).buffer(0).intersection(SCREEN)
        except Exception: continue
        if sq.is_empty: continue
        sp=[sq] if isinstance(sq,Polygon) else [z for z in getattr(sq,'geoms',[]) if isinstance(z,Polygon)]
        for z in sp:
            rings=[list(z.exterior.coords)]+[list(i.coords) for i in z.interiors]
            d=''
            for r in rings:
                pts=[(round(a,1),round(b,1)) for a,b in r]
                if len(pts)<3: continue
                d+='M'+' '.join(f'{a},{b}' for a,b in pts)+'Z'
            oth.append(d)
out['others']=''.join(oth)
# admin1 borders: as polygons (fill for AZRF tint) and all borders stroke
full={'Murmansk','Nenets','Yamal-Nenets','Chukchi Autonomous Okrug','Chukot'}
part={'Karelia','Komi','Arkhangel\'sk','Krasnoyarsk','Sakha (Yakutia)','Sakha'}
a1paths=[]; full_p=[]; part_p=[]
for f in rus_a1:
    nm=f['properties']['name']; g=shape(f['geometry']).buffer(0)
    p=path(proj_geom(g,0.08))
    a1paths.append(p)
    if nm in full: full_p.append(p)
    if nm in part: part_p.append(p)
print('full found', len(full_p), 'part found', len(part_p))
out['admin1']=''.join(a1paths); out['azrf_full']=''.join(full_p); out['azrf_part']=''.join(part_p)
# arctic circle
pts=[T(*proj(lon,66.5622)) for lon in range(15,191,1)]
out['circle']='M'+' '.join(f'{x},{y}' for x,y in pts)
# graticule light? skip
json.dump(out,open('work/basemap.json','w'),ensure_ascii=False)
import os; print('size', os.path.getsize('work/basemap.json'))
# quick test svg
svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="#fff"/><path d="{out["others"]}" fill="#eceff3"/><path d="{out["russia"]}" fill="#f6f8fb" stroke="#9aa6b5" stroke-width="0.6"/><path d="{out["azrf_part"]}" fill="#dbe9fb"/><path d="{out["azrf_full"]}" fill="#bcd6f5"/><path d="{out["admin1"]}" fill="none" stroke="#fff" stroke-width="0.5"/><path d="{out["circle"]}" fill="none" stroke="#0069D3" stroke-dasharray="4 3" stroke-width="0.8"/></svg>'
open('work/basemap_test.svg','w').write(svg)
# also project test points
for name,(lon,lat) in {'Murmansk':(32.75,68.78),'Anadyr':(177.74,64.73),'Moscow':(37.41,55.97),'Sochi':(39.96,43.45),'Vladivostok':(132.15,43.40),'Kaliningrad':(20.6,54.9)}.items():
    print(name, T(*proj(lon,lat)))
