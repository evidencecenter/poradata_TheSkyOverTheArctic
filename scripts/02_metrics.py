"""Шаг 2. Показатели по выполненным рейсам 2025 года: структура сети, кусты, хабы,
сезонность, парк ВС, связность корневых аэропортов, индекс крюка."""
import json, math, heapq, itertools, pathlib, pandas as pd, numpy as np
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT/'data/processed'
def load_flights(OUT):
    """Читает очищенное расписание: pkl (локальный кэш) или csv.gz из репозитория."""
    import pandas as pd
    if (OUT/'flights_clean.pkl').exists(): return pd.read_pickle(OUT/'flights_clean.pkl')
    fl = pd.read_csv(OUT/'flights_clean.csv.gz', parse_dates=['departure_date','scheduled_departure_local','scheduled_departure_utc','scheduled_arrival_local','scheduled_arrival_utc'])
    for c in ['origin_azrf','destination_azrf','both_azrf','soviet','unpaved','ac_filled']: fl[c] = fl[c].astype(bool)
    return fl
fl = load_flights(OUT)
ap = pd.read_csv(OUT/'airports.csv').set_index('iata')

CITY_MAIN = {'MOW': 'SVO', 'KJA': 'KJA', 'ARH': 'ARH'}
def coord(a):
    a = CITY_MAIN.get(a, a)
    return ap.lat[a], ap.lon[a]
def gc_km(a, b):
    (la1, lo1), (la2, lo2) = coord(a), coord(b)
    la1, lo1, la2, lo2 = map(math.radians, [la1, lo1, la2, lo2])
    h = math.sin((la2-la1)/2)**2 + math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 6371.0088*2*math.asin(math.sqrt(h))

f = fl[fl.year == 2025].copy()                      # выполненные рейсы 15.01–31.12.2025
f['touch_azrf'] = f.origin_azrf | f.destination_azrf
assert f.touch_azrf.all()
f['dist_km'] = [gc_km(a, b) for a, b in zip(f.origin_airport_iata, f.destination_airport_iata)]
f['seat_km'] = f.seats * f.dist_km
# «другой конец» для рейса, касающегося АЗРФ
f['arctic_end'] = np.where(f.origin_azrf, f.origin_airport_iata, f.destination_airport_iata)
f['other_end'] = np.where(f.origin_azrf, f.destination_airport_iata, f.origin_airport_iata)
f['other_city'] = f.other_end.map(ap.city_key)
ROOT_OUTSIDE = {'YKS', 'KJA', 'KCY', 'GDX', 'CEE', 'PYJ'}
# предварительная классификация: узловые = топ-5 вне АЗРФ (без корней кустов) по местам/рейсам/направлениям
_ext = f[~f.both_azrf]
_by = _ext.groupby('other_end').agg(seats=('seats', 'sum'), flights=('seats', 'size'))
_by['directions'] = _ext.groupby('other_end').apply(lambda d: d[['arctic_end']].drop_duplicates().shape[0])
_cand = _by.drop(index=[i for i in _by.index if i in ROOT_OUTSIDE])
HUBS = set()
for c in ['seats', 'flights', 'directions']:
    HUBS |= set(_cand[c].nlargest(5).index)
_direct = f.groupby(['origin_airport_iata', 'destination_airport_iata']).size()
nbrs = {}
for (a, b), n in _direct.items():
    nbrs.setdefault(a, set()).add(b); nbrs.setdefault(b, set()).add(a)
arctic = [a for a in ap.index if ap.azrf[a] and a in set(f.origin_airport_iata) | set(f.destination_airport_iata)]
root_arctic = {a for a in arctic if nbrs.get(a, set()) & HUBS}
local = [a for a in arctic if a not in root_arctic]
LOCAL = set(local)
# местная сеть: оба конца в АЗРФ, либо местный аэропорт — корень куста вне АЗРФ
f['local_net'] = f.both_azrf | (f.arctic_end.isin(LOCAL) & f.other_end.isin(ROOT_OUTSIDE))
# сеть кустов: то же плюс рейсы между корневыми аэропортами АЗРФ и корнями вне АЗРФ
f['cluster_net'] = f.both_azrf | f.other_end.isin(ROOT_OUTSIDE)
def group_of(row):
    if row.local_net: return 'АЗРФ'
    m = ap.marker[row.other_end]
    return 'Столицы' if m == 'Столица' else ('Курорты' if m == 'Курорт' else 'Остальные вне АЗРФ')
f['group'] = f.apply(group_of, axis=1)
report = {}

# ---------- 1. доли внутри АЗРФ / столицы / курорты ----------
shares = {}
for metric, col in [('seats', 'seats'), ('flights', None)]:
    s = f.groupby('group')[col].sum() if col else f.groupby('group').size()
    shares[metric] = (s / s.sum()).round(4).to_dict()
# направлений (направленные маршруты аэропорт-аэропорт) по группам
rt = f.groupby(['origin_airport_iata', 'destination_airport_iata', 'group']).size().reset_index()
s = rt.groupby('group').size(); shares['routes'] = (s / s.sum()).round(4).to_dict()
report['shares'] = shares
print('ДОЛИ (места/рейсы/маршруты):', shares)
print('  дека: места АЗРФ 5%, столицы 60%, курорты 6%, остальные 29%; рейсы 11/52/5/32')

report['shares_strict'] = {'seats': round(float(f[f.both_azrf].seats.sum()/f.seats.sum()),4), 'flights': round(float(f.both_azrf.mean()),4)}
print('строго внутри АЗРФ (оба конца в АЗРФ):', report['shares_strict'])
# ---------- 2. узловые аэропорты (вне АЗРФ, топ-5 по местам, рейсам или направлениям) ----------
ext = f[~f.both_azrf]
by_city = ext.groupby('other_city').agg(seats=('seats', 'sum'), flights=('seats', 'size'))
by_city['directions'] = ext.groupby('other_city').apply(lambda d: d[['arctic_end']].drop_duplicates().shape[0])
hub_cities = set()
for c in ['seats', 'flights', 'directions']:
    hub_cities |= set(by_city[c].nlargest(5).index)
# по аэропортам (для Москвы отдельно)
by_ap = ext.groupby('other_end').agg(seats=('seats', 'sum'), flights=('seats', 'size'))
by_ap['directions'] = ext.groupby('other_end').apply(lambda d: d[['arctic_end']].drop_duplicates().shape[0])
hub_airports = set()
for c in ['seats', 'flights', 'directions']:
    hub_airports |= set(by_ap[c].nlargest(5).index)
print('узловые (города):', sorted(hub_cities), '\nузловые (аэропорты):', sorted(hub_airports))
total_seats = f.seats.sum(); total_flights = len(f)
hubshare = by_ap.assign(seat_share=(by_ap.seats/total_seats).round(4), flight_share=(by_ap.flights/total_flights).round(4)).sort_values('seats', ascending=False)
hubshare['name'] = [ap.name_ru[i] for i in hubshare.index]
report['hub_shares'] = hubshare.head(12).reset_index().rename(columns={'other_end': 'iata'}).to_dict('records')
print(hubshare.head(10)[['name', 'seat_share', 'flight_share', 'directions']])

# ---------- 3. корневые и местные аэропорты, кусты ----------
# По методике ПОРА: корни кустов вне АЗРФ — Якутск, Красноярск (с Черемшанкой), Магадан, Череповец, Полярный;
# узловые — аэропорты вне АЗРФ (не корни кустов) из топ-5 хотя бы по одному показателю.
print('узловые аэропорты (топ-5 без корней кустов):', sorted(HUBS))
root_outside = {b for a in local for b in nbrs.get(a, set()) if not ap.azrf[b]}
print('корни вне АЗРФ по данным:', sorted(root_outside), ' ожидание:', sorted(ROOT_OUTSIDE))
# все связи местных аэропортов с «большой землёй» должны вести только к корням вне АЗРФ
roots = root_arctic | root_outside
clusters = {r: sorted(a for a in local if r in nbrs.get(a, set())) for r in roots}
multi = [a for a in local if len({ap.city_key[r] for r in roots if r in nbrs.get(a, set())}) > 1]
print('корневые в АЗРФ:', sorted(ap.name_ru[a] for a in root_arctic))
print('корневые вне АЗРФ:', sorted(ap.name_ru[a] for a in root_outside))
print('местные:', len(local), 'в нескольких кустах:', [ap.name_ru[a] for a in multi])
report['classification'] = {'hubs': sorted(HUBS), 'root_arctic': sorted(root_arctic), 'root_outside': sorted(root_outside), 'local': sorted(local),
                            'clusters': {r: v for r, v in clusters.items() if v}, 'multi_cluster_local': multi}
# рейсы внутри кустов (корень–ветвь) и между аэропортами АЗРФ

# ---------- 4. сезонность: мест в сутки по месяцам по корневым аэропортам АЗРФ ----------
days = {m: (17 if m == 1 else pd.Period(f'2025-{m:02d}').days_in_month) for m in range(1, 13)}
def monthly_profile(sub):
    s = sub.groupby('month').seats.sum().reindex(range(1, 13), fill_value=0)
    return [round(s[m] / days[m]) for m in range(1, 13)]
season = {}
for a in sorted(root_arctic, key=lambda x: -f[(f.origin_airport_iata == x) | (f.destination_airport_iata == x)].seats.sum()):
    season[a] = monthly_profile(f[(f.origin_airport_iata == a) | (f.destination_airport_iata == a)])
season['__inside_azrf'] = monthly_profile(f[f.both_azrf])
season['__all'] = monthly_profile(f)
report['season_seats_per_day'] = season
# сезонность по группам направлений
report['season_by_group'] = {g: monthly_profile(f[f.group == g]) for g in ['АЗРФ', 'Столицы', 'Курорты', 'Остальные вне АЗРФ']}
# коэффициент вариации и HHI по корневым аэропортам АЗРФ (связи вне АЗРФ)
cvhhi = {}
for a in root_arctic:
    sub = f[((f.origin_airport_iata == a) | (f.destination_airport_iata == a)) & ~f.both_azrf]
    prof = np.array(monthly_profile(sub), dtype=float)
    if sub.seats.sum() == 0 or prof.mean() == 0: continue
    sh = sub.groupby('other_city').seats.sum(); sh = sh / sh.sum()
    cvhhi[a] = {'name': ap.name_ru[a], 'cv': round(prof.std(ddof=0) / prof.mean(), 3), 'hhi': round(float((sh**2).sum()), 3),
                'seats': int(sub.seats.sum()), 'n_dest': int(sh.size), 'top': [(ap.city_ru[c] if c in ap.index else c, round(float(v), 3)) for c, v in sh.nlargest(3).items()]}
report['cv_hhi'] = cvhhi
print(pd.DataFrame(cvhhi).T[['name', 'cv', 'hhi', 'n_dest']].sort_values('cv'))

# ---------- 5. парк ВС на местной сети ----------
ln = f[f.cluster_net & f.family.notna()]
ln_local = f[f.local_net & f.family.notna()]
rt_fam = ln.groupby(['origin_city', 'destination_city', 'family']).seats.sum().reset_index()
# направление считаем по городам без учёта направления полёта
rt_fam['pair'] = rt_fam.apply(lambda r: tuple(sorted([r.origin_city, r.destination_city])), axis=1)
pair_fam = rt_fam.groupby(['pair', 'family']).seats.sum().reset_index()
# семейство направления = по наибольшему числу мест
dom = pair_fam.sort_values('seats', ascending=False).drop_duplicates('pair')
fleet = {}
fam_order = ['Ан-24', 'Ан-26', 'Як-42', 'Ми-8', 'ATR 42/72', 'DHC-8', 'CRJ 100/200', 'Embraer E-Jet', 'SSJ 100', 'Boeing 737', 'Airbus A320']
fleet['directions_by_family'] = dom.family.value_counts().reindex(fam_order, fill_value=0).to_dict()
fleet['seats_by_family'] = ln.groupby('family').seats.sum().reindex(fam_order, fill_value=0).astype(int).to_dict()
fleet['flights_by_family'] = ln.groupby('family').size().reindex(fam_order, fill_value=0).astype(int).to_dict()
n_dir = len(dom)
fleet['n_directions'] = int(n_dir)
# местные линии (без рейсов между корневыми аэропортами)
loc_pairs = {tuple(sorted([a, b])) for a, b in zip(ln_local.origin_city, ln_local.destination_city)}
dom_local = dom[dom.pair.isin(loc_pairs)]
fleet['local'] = {'n_directions': int(len(dom_local)),
    'soviet_directions': int(dom_local.family.isin(['Ан-24', 'Ан-26', 'Як-42', 'Ми-8']).sum()),
    'unpaved_directions': int(dom_local.family.isin(['Ан-24', 'Ан-26', 'ATR 42/72', 'DHC-8', 'Ми-8']).sum()),
    'soviet_share_seats': round(float(ln_local.soviet.astype(int).mul(ln_local.seats).sum() / ln_local.seats.sum()), 4),
    'unpaved_share_seats': round(float(ln_local.unpaved.astype(int).mul(ln_local.seats).sum() / ln_local.seats.sum()), 4),
    'seats': int(ln_local.seats.sum()), 'flights': int(len(ln_local)),
    'directions_by_family': dom_local.family.value_counts().reindex(fam_order, fill_value=0).to_dict(),
    'seats_by_family': ln_local.groupby('family').seats.sum().reindex(fam_order, fill_value=0).astype(int).to_dict()}
print('МЕСТНЫЕ ЛИНИИ:', fleet['local'])
fleet['soviet_share_directions'] = round(float(dom.family.isin(['Ан-24', 'Ан-26', 'Як-42', 'Ми-8']).mean()), 4)
fleet['soviet_share_seats'] = round(float(ln.soviet.astype(int).mul(ln.seats).sum() / ln.seats.sum()), 4)
fleet['unpaved_share_directions'] = round(float(dom.family.isin(['Ан-24', 'Ан-26', 'ATR 42/72', 'DHC-8', 'Ми-8']).mean()), 4)
fleet['unpaved_share_seats'] = round(float(ln.unpaved.astype(int).mul(ln.seats).sum() / ln.seats.sum()), 4)
# любая доля направлений, где советские суда вообще летают
anys = pair_fam[pair_fam.family.isin(['Ан-24', 'Ан-26', 'Як-42', 'Ми-8'])].pair.nunique()
fleet['soviet_any_share_directions'] = round(anys / n_dir, 4)
fleet['directions'] = [{'pair': [ap.city_ru[p[0]] if p[0] in ap.index else p[0], ap.city_ru[p[1]] if p[1] in ap.index else p[1]], 'codes': list(p),
                        'family': r.family, 'seats': int(r.seats), 'local': p in loc_pairs,
                        'families': {k: int(v) for k, v in pair_fam[pair_fam.pair == p].set_index('family').seats.items()}}
                       for p, r in dom.set_index('pair').iterrows()]
report['fleet'] = fleet
print('ПАРК: направлений', n_dir, 'советские', fleet['soviet_share_directions'], 'места', fleet['soviet_share_seats'], '| грунт', fleet['unpaved_share_directions'], fleet['unpaved_share_seats'])
print('  дека: 49% направлений и 19% потока советские; 75% направлений и 42% потока — грунт')
# типы ВС в целом по сети (для галереи)
gal = f[f.family.notna()].groupby('family').agg(flights=('seats', 'size'), seats=('seats', 'sum'), seats_typ=('seats', 'median'))
gal['share_flights'] = (gal.flights / gal.flights.sum()).round(4)
report['fleet_all'] = gal.sort_values('flights', ascending=False).reset_index().to_dict('records')

# ---------- 6. регулярность и связность корневых аэропортов АЗРФ ----------
weeks_total = f.week.nunique()
wk = f.groupby(['origin_airport_iata', 'destination_airport_iata']).week.nunique()
REG_W = 47
regular_direct = {k for k, v in wk.items() if v >= REG_W}
ra = sorted(root_arctic)
# транзит с одной пересадкой: вылет из X не раньше чем через 1 ч и не позже чем через 12 ч после прилёта
fx = f[['origin_airport_iata', 'destination_airport_iata', 'scheduled_departure_utc', 'scheduled_arrival_utc', 'week', 'airline_iata']].copy()
conn = {}
for a, b in itertools.permutations(ra, 2):
    if (a, b) in regular_direct:
        conn[(a, b)] = ('direct', 1); continue
    first = fx[fx.origin_airport_iata == a]; second = fx[fx.destination_airport_iata == b]
    mids = set(first.destination_airport_iata) & set(second.origin_airport_iata)
    best = 0; best_single = 0
    for x in mids:
        l1 = first[first.destination_airport_iata == x][['scheduled_arrival_utc', 'week', 'airline_iata']].sort_values('scheduled_arrival_utc')
        l2 = second[second.origin_airport_iata == x][['scheduled_departure_utc', 'airline_iata']].sort_values('scheduled_departure_utc')
        if l1.empty or l2.empty: continue
        l1 = l1.assign(earliest=l1.scheduled_arrival_utc + pd.Timedelta('1h'))   # стыковка от 1 до 12 часов
        m = pd.merge_asof(l1, l2, left_on='earliest', right_on='scheduled_departure_utc', direction='forward', tolerance=pd.Timedelta('11h'), suffixes=('', '_2'))
        m = m[m.scheduled_departure_utc.notna()]
        w = m.week.nunique(); best = max(best, w)
        ws = m[m.airline_iata == m.airline_iata_2].week.nunique(); best_single = max(best_single, ws)
    if best >= REG_W: conn[(a, b)] = ('transit', best)
    else: conn[(a, b)] = ('none', best)
pairs = list(itertools.combinations(ra, 2))
def status(a, b):
    s1, s2 = conn[(a, b)][0], conn[(b, a)][0]
    if s1 == 'direct' and s2 == 'direct': return 'direct'
    if 'none' in (s1, s2): return 'none'
    return 'transit'
st = {p: status(*p) for p in pairs}
n_conn = sum(1 for v in st.values() if v != 'none')
def status_any(a, b):
    s1, s2 = conn[(a, b)][0], conn[(b, a)][0]
    if 'direct' in (s1, s2): return 'direct'
    if 'transit' in (s1, s2): return 'transit'
    return 'none'
st_any = {p: status_any(*p) for p in pairs}
print('  вариант «хотя бы в одну сторону»:', sum(1 for v in st_any.values() if v != 'none'), 'из', len(pairs))
best_w = {p: max(conn[p][1], conn[(p[1], p[0])][1]) for p in pairs}
for thr in [47, 45, 40]:
    print(f'  недель >= {thr}:', sum(1 for p in pairs if best_w[p] >= thr or st[p]=='direct'), 'из', len(pairs))
report['root_connectivity'] = {'n_pairs': len(pairs), 'connected': n_conn, 'share': round(n_conn / len(pairs), 3),
                               'direct': sum(1 for v in st.values() if v == 'direct'), 'roots': ra,
                               'matrix': {f'{a}-{b}': v for (a, b), v in st.items()},
                               'isolated': sorted(a for a in ra if all(st[tuple(sorted([a, b]))] == 'none' for b in ra if b != a))}
print('СВЯЗНОСТЬ корневых (регулярно, ≥47 недель):', n_conn, 'из', len(pairs), round(n_conn / len(pairs), 3), ' дека: 32%')
print('  изолированные:', [ap.name_ru[a] for a in report['root_connectivity']['isolated']])

# ---------- 7. индекс крюка: кратчайший путь по рейсам между всеми аэропортами АЗРФ ----------
GROUND = {('KVK', 'MMK'): 'есть автодорога и железная дорога', ('ARH', 'MMK'): 'есть железная дорога', ('NYM', 'NUX'): 'есть автодорога',
          ('NOJ', 'NUX'): 'есть автодорога и железная дорога', ('NYM', 'SLY'): 'есть автодорога', ('NOJ', 'NYM'): 'есть автодорога',
          ('SLY', 'VKT'): 'есть железная дорога до Лабытнанги', ('NUX', 'SLY'): 'есть автодорога через Надым', ('ARH', 'KVK'): 'есть железная дорога'}
GROUND = {tuple(sorted(k)): v for k, v in GROUND.items()}
NOTES = {('DYR', 'PWE'): 'местные рейсы Чукотавиа между Анадырем и Певеком в выгрузке отсутствуют', ('DYR', 'KPW'): 'местные рейсы Чукотавиа в выгрузке отсутствуют', ('KPW', 'PWE'): 'местные рейсы Чукотавиа в выгрузке отсутствуют'}
NOTES = {tuple(sorted(k)): v for k, v in NOTES.items()}
wk_city = f.groupby(['origin_city', 'destination_city']).week.nunique()
def build(min_weeks):
    G = {}
    for (a, b), w in wk_city.items():
        if w >= min_weeks:
            G.setdefault(a, {})[b] = gc_km(a, b)
    return G
def sp(G, s, t):
    dist = {s: 0}; prev = {}; pq = [(0, s)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == t: break
        if d > dist.get(u, 1e18): continue
        for v, w in G.get(u, {}).items():
            nd = d + w
            if nd < dist.get(v, 1e18): dist[v] = nd; prev[v] = u; heapq.heappush(pq, (nd, v))
    if t not in dist: return None, None
    p = [t]
    while p[-1] != s: p.append(prev[p[-1]])
    return dist[t], p[::-1]
arctic_cities = sorted({ap.city_key[a] for a in arctic})
G_reg, G_all = build(40), build(1)
detour = {}
for a, b in itertools.permutations(arctic_cities, 2):
    direct_km = gc_km(a, b)
    rec = {'direct_km': round(direct_km)}
    for tier, G in [('reg', G_reg), ('all', G_all)]:
        d, p = sp(G, a, b)
        rec[tier] = None if d is None else {'km': round(d), 'path': p, 'transfers': len(p) - 2, 'ratio': round(d / direct_km, 2)}
    g = GROUND.get(tuple(sorted([a, b])))
    if g: rec['ground'] = g
    n = NOTES.get(tuple(sorted([a, b])))
    if n: rec['note'] = n
    if 'BVJ' in (a, b): rec['note'] = 'Бованенково — аэропорт Газпрома, рейсы Газпромавиа для вахтовых смен'
    
    detour[f'{a}-{b}'] = rec
report['detour'] = detour
vals = [v['reg']['ratio'] for v in detour.values() if v['reg']]
print('КРЮК (круглогодичные): пар с путём', len(vals), 'из', len(detour), 'медиана', np.median(vals), 'прямых', sum(1 for v in detour.values() if v['reg'] and v['reg']['transfers'] == 0))

# ---------- 8. маршруты для карты (город-город, 2025) ----------
routes = f.groupby(['origin_city', 'destination_city']).agg(flights=('seats', 'size'), seats=('seats', 'sum'), weeks=('week', 'nunique'), group=('group', 'first'), local_net=('local_net', 'max'), cluster_net=('cluster_net', 'max')).reset_index()
routes['pair'] = routes.apply(lambda r: '|'.join(sorted([r.origin_city, r.destination_city])), axis=1)
und = routes.groupby('pair').agg(flights=('flights', 'sum'), seats=('seats', 'sum'), weeks=('weeks', 'max'), group=('group', 'first'), local_net=('local_net', 'max'), cluster_net=('cluster_net', 'max')).reset_index()
und[['a', 'b']] = und.pair.str.split('|', expand=True)
fam_pair = f[f.family.notna()].groupby([f.apply(lambda r: '|'.join(sorted([r.origin_city, r.destination_city])), axis=1), 'family']).seats.sum().reset_index()
fam_pair.columns = ['pair', 'family', 'seats']
topfam = fam_pair.sort_values('seats', ascending=False).drop_duplicates('pair').set_index('pair').family
und['family'] = und.pair.map(topfam)
und['both_azrf'] = und.a.map(ap.azrf) & und.b.map(ap.azrf)
# месячные места по маршруту (для ползунка)
mp = f.groupby([f.apply(lambda r: '|'.join(sorted([r.origin_city, r.destination_city])), axis=1), 'month']).seats.sum().unstack(fill_value=0).reindex(columns=range(1, 13), fill_value=0)
und['monthly'] = und.pair.map(lambda p: [int(round(mp.loc[p, m] / days[m])) for m in range(1, 13)])
report['routes'] = und.drop(columns='pair').to_dict('records')

# ---------- 9. профили аэропортов АЗРФ ----------
prof = {}
for a in arctic:
    sub = f[(f.origin_airport_iata == a) | (f.destination_airport_iata == a)]
    other = np.where(sub.origin_airport_iata == a, sub.destination_airport_iata, sub.origin_airport_iata)
    oc = pd.Series(other).map(ap.city_key)
    top = sub.assign(oc=oc.values).groupby('oc').seats.sum().sort_values(ascending=False)
    fams = sub[sub.family.notna()].groupby('family').size().sort_values(ascending=False)
    prof[a] = {'name': ap.name_ru[a], 'city': ap.city_ru[a], 'region': ap.region[a], 'klass': ap.klass[a], 'lat': ap.lat[a], 'lon': ap.lon[a],
               'role': 'root' if a in root_arctic else 'local', 'roots': sorted(r for r in roots if r in nbrs.get(a, set())) if a in local else [],
               'flights': int(len(sub)), 'seats': int(sub.seats.sum()), 'n_dest': int(top.size),
               'share_azrf_seats': round(float(sub[sub.local_net].seats.sum() / sub.seats.sum()), 3) if sub.seats.sum() else None,
               'share_azrf_flights': round(float(sub.local_net.mean()), 3),
               'top': [(ap.city_ru[c] if c in ap.index else c, int(v), round(float(v / top.sum()), 3)) for c, v in top.head(5).items()],
               'families': [(k, int(v)) for k, v in fams.head(4).items()],
               'monthly': monthly_profile(sub), 'airlines': int(sub.airline_iata.nunique()),
               'weekly_flights': round(len(sub) / weeks_total, 1)}
report['airport_profiles'] = prof
# узловые и прочие города вне АЗРФ (для карты)
ext_nodes = {}
for c in set(f.origin_city) | set(f.destination_city):
    if c in {ap.city_key[a] for a in arctic}: continue
    sub = f[(f.origin_city == c) | (f.destination_city == c)]
    main = sub.origin_airport_iata.where(sub.origin_city == c, sub.destination_airport_iata).value_counts().index[0]
    ext_nodes[c] = {'name': ap.city_ru[main], 'lat': ap.lat[main], 'lon': ap.lon[main], 'marker': ap.marker[main], 'hub': main in HUBS or c == 'MOW',
                    'root': c in root_outside, 'flights': int(len(sub)), 'seats': int(sub.seats.sum())}
report['ext_nodes'] = ext_nodes

# ---------- 10. сводка ----------
report['totals'] = {'flights_2025': int(len(f)), 'seats_2025': int(f.seats.sum()), 'airports_2025': int(len(set(f.origin_airport_iata) | set(f.destination_airport_iata))),
                    'arctic_airports_2025': len(arctic), 'routes_2025': int(f.groupby(['origin_airport_iata', 'destination_airport_iata']).ngroups),
                    'routes_all': int(fl.groupby(['origin_airport_iata', 'destination_airport_iata']).ngroups), 'airports_all': int(len(set(fl.origin_airport_iata) | set(fl.destination_airport_iata))),
                    'weeks_2025': int(weeks_total), 'airlines_2025': int(f.airline_iata.nunique()),
                    'seat_km_2025': int(f.seat_km.sum()), 'mean_dist_km': round(float(f.dist_km.mean())),
                    'peak_month': int(f.groupby('month').seats.sum().div(pd.Series(days)).idxmax())}
# доля рейсов внутри региона vs между регионами АЗРФ
inside = f[f.both_azrf]
same_region = inside[inside.origin_airport_iata.map(ap.region) == inside.destination_airport_iata.map(ap.region)]
report['totals']['azrf_inside_flights'] = int(len(inside)); report['totals']['azrf_same_region_share'] = round(len(same_region) / len(inside), 3)
print('ИТОГИ:', report['totals'])
json.dump(report, open(OUT/'metrics.json', 'w'), ensure_ascii=False, indent=1, default=lambda o: int(o) if isinstance(o, (np.integer,)) else float(o))
print('saved metrics.json')
