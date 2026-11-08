"""Шаг 4b. Дополнительные расчёты для лендинга:
- время в пути по расписанию между аэропортами АЗРФ (до двух пересадок);
- дни без вылетов и самый долгий перерыв по каждому аэропорту АЗРФ;
- чувствительность «регулярной связи» к порогу числа недель;
- цена при равном расстоянии (малые борта против магистральных), конкуренция на маршрутах;
- цена билета в рабочих днях при средней зарплате в регионе;
- загрузка рейсов по пассажиропотоку Мурманска и Апатитов;
- сутки рейсов для анимации; аэродромы АЗРФ из реестра, которых нет в данных.
Результат: data/processed/extra.json (подключается в 05_build_site_data.py)."""
import json, math, bisect, pathlib, itertools, collections
import numpy as np, pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT, RAW = ROOT/'data/processed', ROOT/'data/raw'


def load_flights(OUT):
    if (OUT/'flights_clean.pkl').exists(): return pd.read_pickle(OUT/'flights_clean.pkl')
    fl = pd.read_csv(OUT/'flights_clean.csv.gz', parse_dates=['departure_date', 'scheduled_departure_local', 'scheduled_departure_utc', 'scheduled_arrival_local', 'scheduled_arrival_utc'])
    for c in ['origin_azrf', 'destination_azrf', 'both_azrf', 'soviet', 'unpaved', 'ac_filled', 'arr_imputed']: fl[c] = fl[c].astype(bool)
    return fl


fl = load_flights(OUT)
ap = pd.read_csv(OUT/'airports.csv').set_index('iata')
M = json.load(open(OUT/'metrics.json'))
cls = M['classification']
ARCTIC = sorted(M['airport_profiles'].keys())                 # 36 аэропортов АЗРФ с рейсами
ROOTS = sorted(cls['root_arctic'])
LOCAL = set(cls['local']); ROOT_OUT = set(cls['root_outside'])
P0, P1 = pd.Timestamp('2025-10-01'), pd.Timestamp('2026-09-30')     # тот же период, что в 02_metrics и 03_prices
f = fl[(fl.departure_date >= P0) & (fl.departure_date <= P1)].copy()
f['week'] = ((f.departure_date - P0).dt.days // 7).clip(upper=51)
N_DAYS = (P1 - P0).days + 1
extra = {'period_days': N_DAYS}


def gc_km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, [ap.lat[a], ap.lon[a], ap.lat[b], ap.lon[b]])
    h = math.sin((la2-la1)/2)**2 + math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 6371.0088*2*math.asin(math.sqrt(h))


# ---------------------------------------------------------------- 1. время в пути (CSA)
# Время вылета и прилёта восстановлено на шаге 1 (местное время в выгрузке записано как московское).
A = f[['origin_airport_iata', 'destination_airport_iata', 'origin_city', 'destination_city', 'scheduled_departure_utc', 'scheduled_arrival_utc',
       'scheduled_departure_local', 'scheduled_arrival_local', 'departure_date', 'flight_number']].copy()
A['dep'] = (A.scheduled_departure_utc - P0).dt.total_seconds().div(60).round().astype(int)
A['arr'] = (A.scheduled_arrival_utc - P0).dt.total_seconds().div(60).round().astype(int)
A['dur'] = A.arr - A.dep
bad = (A.dur <= 0) | (A.dur > 16*60)
print('рейсов с неправдоподобной длительностью (исключены из расчёта времени):', int(bad.sum()))
A = A[~bad].sort_values(['dep', 'arr']).reset_index(drop=True)
APS = sorted(set(A.origin_airport_iata) | set(A.destination_airport_iata)); AI = {a: i for i, a in enumerate(APS)}
city_of = {a: (A.loc[A.origin_airport_iata == a, 'origin_city'].iloc[0] if (A.origin_airport_iata == a).any() else A.loc[A.destination_airport_iata == a, 'destination_city'].iloc[0]) for a in APS}
sib = {AI[a]: [AI[b] for b in APS if b != a and city_of[b] == city_of[a]] for a in APS}
O = A.origin_airport_iata.map(AI).to_numpy(); Dd = A.destination_airport_iata.map(AI).to_numpy()
DEP = A.dep.to_numpy(); ARR = A.arr.to_numpy(); FN = A.flight_number.to_numpy(); N = len(A)
DATE = A.departure_date.dt.strftime('%Y-%m-%d').to_numpy()
# сквозные рейсы с промежуточной посадкой: тот же номер, вылет из пункта прилёта не позже чем через 4 часа
pred = np.full(N, -1)
last_arr = {}
order_arr = np.argsort(ARR, kind='stable')
# для каждого рейса j ищем рейс i с тем же номером, прилетевший в пункт вылета j за 0–240 минут до вылета
by_key = collections.defaultdict(list)
for i in range(N): by_key[(FN[i], Dd[i])].append((ARR[i], i))
for k in by_key: by_key[k].sort()
for j in range(N):
    lst = by_key.get((FN[j], O[j]))
    if not lst: continue
    pos = bisect.bisect_right(lst, (DEP[j], 10**12)) - 1
    if pos >= 0 and DEP[j] - lst[pos][0] <= 240: pred[j] = lst[pos][1]
print('сегментов сквозных рейсов (продолжение без пересадки):', int((pred >= 0).sum()))
MCT_SAME, MCT_CITY, HORIZON, INF = 60, 240, 72*60, 10**12
ARC_I = {AI[a] for a in ARCTIC if a in AI}
daily = collections.defaultdict(dict)    # (o, t) -> {date: (dur, path, kinds)}
dep_idx = collections.defaultdict(list)
for j in range(N): dep_idx[O[j]].append(j)
for o in ARCTIC:
    if o not in AI: continue
    oi = AI[o]
    for i0 in dep_idx[oi]:
        t0 = DEP[i0]
        lab = [dict(), dict(), dict()]             # k пересадок -> {аэропорт: (прилёт, рейс)}
        taken = {i0: (0, -1, 'start')}
        lab[0][Dd[i0]] = (ARR[i0], i0)
        labeled = {Dd[i0]}
        j = i0 + 1
        while j < N and DEP[j] <= t0 + HORIZON:
            u = O[j]; p = pred[j]
            cont = p >= 0 and p in taken
            if not cont and u not in labeled and not any(s in labeled for s in sib[u]):
                j += 1; continue
            best = None
            if cont: best = (taken[p][0], p, 'cont')
            for k in (0, 1):
                if best is not None and best[0] <= k + 1: break
                ready = INF; par = -1
                lb = lab[k].get(u)
                if lb and lb[0] + MCT_SAME < ready: ready, par = lb[0] + MCT_SAME, lb[1]
                for s in sib[u]:
                    lb = lab[k].get(s)
                    if lb and lb[0] + MCT_CITY < ready: ready, par = lb[0] + MCT_CITY, lb[1]
                if ready <= DEP[j]:
                    if best is None or k + 1 < best[0]: best = (k + 1, par, 'board')
                    break
            if best is not None:
                taken[j] = best; v = Dd[j]; kk = best[0]
                cur = lab[kk].get(v)
                if cur is None or ARR[j] < cur[0]: lab[kk][v] = (ARR[j], j); labeled.add(v)
            j += 1
        d0 = DATE[i0]
        for ti in ARC_I:
            if ti == oi: continue
            bestv = None
            for k in range(3):
                lb = lab[k].get(ti)
                if lb and (bestv is None or lb[0] < bestv[0]): bestv = lb
            if bestv is None: continue
            dur = bestv[0] - t0
            key = (o, APS[ti])
            cur = daily[key].get(d0)
            if cur is None or dur < cur[0]:
                # восстановление пути
                path = []; kinds = []; x = bestv[1]
                while x != -1:
                    path.append(int(x)); kinds.append(taken[x][2]); x = taken[x][1]
                daily[key][d0] = (dur, path[::-1], kinds[::-1])


def leg(i):
    r = A.iloc[i]
    return [r.origin_city, r.destination_city, r.scheduled_departure_local.strftime('%H:%M'), r.scheduled_arrival_local.strftime('%H:%M'), r.flight_number,
            r.scheduled_departure_local.strftime('%d.%m'), r.scheduled_arrival_local.strftime('%d.%m')]


def via_of(path, kinds):
    return tuple(A.origin_city.iat[path[n]] for n in range(1, len(path)) if kinds[n] == 'board')


# оценка прямого рейса: время в пути по расписанию на турбовинтовых бортах в зависимости от расстояния (медианы маршрутов за период)
_g = f[~f.arr_imputed].assign(dur=(f.scheduled_arrival_utc - f.scheduled_departure_utc).dt.total_seconds() / 60)
_r = _g.groupby(['origin_airport_iata', 'destination_airport_iata']).agg(dur=('dur', 'median'), fam=('family', lambda s: s.mode().iat[0] if s.notna().any() else None)).reset_index()
_r = _r[_r.fam.isin(['Ан-24', 'Ан-26', 'ATR 42/72', 'DHC-8'])]
_r['km'] = [gc_km(a, b) for a, b in zip(_r.origin_airport_iata, _r.destination_airport_iata)]
BT_B, BT_A = np.polyfit(_r.km, _r.dur, 1)
extra['block_fit'] = {'a_min': round(float(BT_A), 1), 'b_min_per_km': round(float(BT_B), 4), 'n_routes': int(len(_r))}
print('время прямого рейса (турбовинтовые):', extra['block_fit'])
tt = {}
for (o, t), dd in daily.items():
    durs = np.array([v[0] for v in dd.values()]) / 60
    vias = collections.Counter(via_of(v[1], v[2]) for v in dd.values())
    med = float(np.median(durs))
    # пример — день, где время ближе всего к медиане (из самых частых вариантов пересадки)
    top_via = vias.most_common(1)[0][0]
    cand = [(abs(v[0]/60 - med), d, v) for d, v in dd.items() if via_of(v[1], v[2]) == top_via]
    _, dex, vex = min(cand)
    km = gc_km(o, t)
    direct_h = (BT_A + BT_B * km) / 60
    tt[f'{o}-{t}'] = {'days': len(dd), 'med': round(med, 1), 'min': round(float(durs.min()), 1), 'via': list(top_via), 'via_share': round(vias[top_via] / len(dd), 2),
                      'ex': [leg(i) for i in vex[1]], 'ex_date': dex, 'direct_h': round(direct_h, 1), 'extra': round(max(0.0, med - direct_h), 1)}
extra['travel'] = tt
print('пар с маршрутом по расписанию:', len(tt), 'из', len(ARCTIC) * (len(ARCTIC) - 1))
for k in ['NNM-SLY', 'SLY-NNM', 'NSK-NUX', 'NNM-USK', 'MMK-ARH']:
    if k in tt: print(k, {x: tt[k][x] for x in ['days', 'med', 'min', 'via', 'extra']})

# ---------------------------------------------------------------- 1b. куда летят места: непересекающиеся группы
HUB5 = {'TJM', 'UFA', 'SVX', 'OVB', 'KJA'}
f['arctic_end'] = np.where(f.origin_azrf, f.origin_airport_iata, f.destination_airport_iata)
f['other_end'] = np.where(f.origin_azrf, f.destination_airport_iata, f.origin_airport_iata)
f['other_city'] = f.other_end.map(ap.city_key)
f['local_net'] = f.both_azrf | (f.arctic_end.isin(LOCAL) & f.other_end.isin(ROOT_OUT))
def _mix(r):
    if r.local_net: return 'inside'
    m = ap.marker.get(r.other_end)
    if m == 'Столица': return 'capitals'
    if m == 'Курорт': return 'resorts'
    if r.other_city in HUB5: return 'hubs'
    return 'other'
mix = f.assign(g=f.apply(_mix, axis=1)).groupby('g').seats.sum()
extra['dest_mix'] = {k: round(float(v / mix.sum()), 4) for k, v in mix.items()}
print('куда летят места:', extra['dest_mix'])

# ---------------------------------------------------------------- 2. дни без вылетов
iso = {}
for a in ARCTIC:
    dates = sorted(set(f.loc[f.origin_airport_iata == a, 'departure_date'].dt.normalize()))
    s = pd.Series(1, index=pd.DatetimeIndex(dates)).reindex(pd.date_range(P0, P1), fill_value=0)
    gaps = (s == 0).astype(int)
    run = gaps.groupby((gaps != gaps.shift()).cumsum()).transform('sum') * gaps
    nmonth = s.groupby(s.index.month).sum().tolist()
    iso[a] = {'days_dep': int(s.sum()), 'days_none': int(N_DAYS - s.sum()), 'max_gap': int(run.max()),
              'deps': int((f.origin_airport_iata == a).sum()), 'per_week': round((f.origin_airport_iata == a).sum() / (N_DAYS / 7), 1), 'days_by_month': nmonth,
              'bits': ''.join('1' if v else '0' for v in s.to_numpy())}
extra['isolation'] = iso
print('дни без вылетов (топ):', sorted(((v['days_none'], a) for a, v in iso.items()), reverse=True)[:8])

# ---------------------------------------------------------------- 3. чувствительность порога регулярности
wk = f.groupby(['origin_airport_iata', 'destination_airport_iata']).week.nunique()
fx = f[['origin_airport_iata', 'destination_airport_iata', 'scheduled_departure_utc', 'scheduled_arrival_utc', 'week']].copy()
dirw = {}
for a, b in itertools.permutations(ROOTS, 2):
    direct_w = int(wk.get((a, b), 0))
    first = fx[fx.origin_airport_iata == a]; second = fx[fx.destination_airport_iata == b]
    best = 0
    for x in set(first.destination_airport_iata) & set(second.origin_airport_iata):
        l1 = first[first.destination_airport_iata == x][['scheduled_arrival_utc', 'week']].sort_values('scheduled_arrival_utc')
        l2 = second[second.origin_airport_iata == x][['scheduled_departure_utc']].sort_values('scheduled_departure_utc')
        if l1.empty or l2.empty: continue
        l1 = l1.assign(earliest=l1.scheduled_arrival_utc + pd.Timedelta('1h'))
        m = pd.merge_asof(l1, l2, left_on='earliest', right_on='scheduled_departure_utc', direction='forward', tolerance=pd.Timedelta('11h'))
        best = max(best, m[m.scheduled_departure_utc.notna()].week.nunique())
    dirw[(a, b)] = max(direct_w, best)
sens = []
for thr in range(26, 53):
    n = sum(1 for a, b in itertools.combinations(ROOTS, 2) if dirw[(a, b)] >= thr and dirw[(b, a)] >= thr)
    sens.append([thr, n])
extra['sensitivity'] = sens
print('чувствительность:', sens)
assert dict(sens)[47] == M['root_connectivity']['connected'], 'порог 47 должен воспроизводить основной расчёт'
extra['pair_weeks'] = {f'{a}-{b}': [dirw[(a, b)], dirw[(b, a)]] for a, b in itertools.combinations(ROOTS, 2)}

# ---------------------------------------------------------------- 4. цены при равном расстоянии
R = pd.read_csv(OUT/'price_routes.csv')
el = R[R.eligible == True].copy()
el['lp'] = np.log(el.p30); el['ld'] = np.log(el.dist_km); el['s'] = el.small.astype(int)
fits = {}
for name, sub in [('small', el[el.small]), ('trunk', el[~el.small])]:
    b1, b0 = np.polyfit(sub.ld, sub.lp, 1)
    fits[name] = {'a': round(float(b0), 4), 'b': round(float(b1), 4), 'kmin': int(sub.dist_km.min()), 'kmax': int(sub.dist_km.max()), 'n': int(len(sub))}
X = np.column_stack([np.ones(len(el)), el.ld, el.s]); y = el.lp.to_numpy()
beta = np.linalg.lstsq(X, y, rcond=None)[0]; res = y - X @ beta
s2 = (res**2).sum() / (len(y) - X.shape[1]); se = np.sqrt(np.diag(s2 * np.linalg.inv(X.T @ X)))
reg = {'mult': round(float(np.exp(beta[2])), 2), 'lo': round(float(np.exp(beta[2] - 1.96*se[2])), 2), 'hi': round(float(np.exp(beta[2] + 1.96*se[2])), 2), 'elasticity': round(float(beta[1]), 2)}
# сопоставление: для каждого маршрута малых бортов — магистральные маршруты с расстоянием ±20 %
trunk = el[~el.small]
ratios = []
for _, r in el[el.small].iterrows():
    tw = trunk[(trunk.dist_km >= r.dist_km*0.8) & (trunk.dist_km <= r.dist_km*1.2)]
    if len(tw) >= 3: ratios.append(r.p30 / tw.p30.median())
ratios = np.array(ratios)
match = {'n': int(len(ratios)), 'median': round(float(np.median(ratios)), 1), 'q1': round(float(np.quantile(ratios, .25)), 1), 'q3': round(float(np.quantile(ratios, .75)), 1)}
bins = []
for lo, hi in [(0, 500), (500, 1000), (1000, 2000), (2000, 8000)]:
    sb = el[(el.dist_km > lo) & (el.dist_km <= hi)]
    row = {'lo': lo, 'hi': hi, 'n_small': int(sb.small.sum()), 'n_trunk': int((~sb.small).sum())}
    if row['n_small']: row['rk_small'] = round(float(sb[sb.small].rub_km.median()), 1)
    if row['n_trunk']: row['rk_trunk'] = round(float(sb[~sb.small].rub_km.median()), 1)
    if row['n_small'] >= 10 and row['n_trunk'] >= 10: row['ratio'] = round(row['rk_small'] / row['rk_trunk'], 1)
    bins.append(row)
extra['price_fair'] = {'fits': fits, 'reg': reg, 'match': match, 'bins': bins,
                       'dist_median': {'small': int(el[el.small].dist_km.median()), 'trunk': int(el[~el.small].dist_km.median())}}
print('цена при равном расстоянии:', extra['price_fair'])
# пара на одном расстоянии: Саккырыр — Якутск и магистральный маршрут той же длины
suk = el[(el.origin == 'SUK') & (el.destination == 'YKS')].iloc[0]
near = trunk.assign(dd=(trunk.dist_km - suk.dist_km).abs()).query('dd <= 60').sort_values(['flights'], ascending=False)
extra['same_distance'] = {'small': {'o': 'SUK', 'd': 'YKS', 'km': int(suk.dist_km), 'p30': int(suk.p30)},
                          'trunk': [{'o': r.origin, 'd': r.destination, 'on': r.origin_name, 'dn': r.destination_name, 'km': int(r.dist_km), 'p30': int(r.p30), 'fl': int(r.flights)} for _, r in near.head(5).iterrows()]}
print('та же дальность:', extra['same_distance'])

# ---------------------------------------------------------------- 5. конкуренция: число перевозчиков на маршруте
raw = pd.read_excel(RAW/'flights_ru_arctic.xlsx', usecols=['departure_date', 'scheduled_departure_utc', 'origin_airport_iata', 'destination_airport_iata', 'airline_iata', 'operating_airline_iata'])
raw['scheduled_departure_utc'] = pd.to_datetime(raw.scheduled_departure_utc)
raw['op'] = raw.operating_airline_iata.fillna(raw.airline_iata)
phys = raw.groupby(['scheduled_departure_utc', 'origin_airport_iata', 'destination_airport_iata']).agg(
    op=('op', lambda s: s.mode().iat[0]), departure_date=('departure_date', 'first')).reset_index()
phys['departure_date'] = pd.to_datetime(phys.departure_date)
W0, W1 = pd.Timestamp('2025-10-01'), pd.Timestamp('2026-09-30')
pw = phys[(phys.departure_date >= W0) & (phys.departure_date <= W1)]
sh = pw.groupby(['origin_airport_iata', 'destination_airport_iata', 'op']).size().rename('n').reset_index()
sh['share'] = sh.n / sh.groupby(['origin_airport_iata', 'destination_airport_iata']).n.transform('sum')
ncar = sh[sh.share >= 0.1].groupby(['origin_airport_iata', 'destination_airport_iata']).op.nunique().rename('ncar')
el2 = el.merge(ncar, left_on=['origin', 'destination'], right_index=True, how='left')
el2 = el2[el2.ncar.notna()].copy(); el2['mono'] = (el2.ncar == 1).astype(int)
X = np.column_stack([np.ones(len(el2)), el2.ld, el2.s, el2.mono]); y = el2.lp.to_numpy()
beta = np.linalg.lstsq(X, y, rcond=None)[0]; res = y - X @ beta
s2 = (res**2).sum() / (len(y) - X.shape[1]); se = np.sqrt(np.diag(s2 * np.linalg.inv(X.T @ X)))
comp = {'n': int(len(el2)), 'n_mono': int(el2.mono.sum()), 'share_mono': round(float(el2.mono.mean()), 3),
        'n_mono_small': int(el2[el2.small].mono.sum()), 'n_small': int(el2.small.sum()),
        'effect': round(float(np.exp(beta[3]) - 1), 3), 'lo': round(float(np.exp(beta[3] - 1.96*se[3]) - 1), 3), 'hi': round(float(np.exp(beta[3] + 1.96*se[3]) - 1), 3)}
extra['competition'] = comp
extra['route_carriers'] = {f'{r.origin}-{r.destination}': int(r.ncar) for _, r in el2.iterrows()}
print('конкуренция:', comp)

# ---------------------------------------------------------------- 6. цена в рабочих днях
# Среднемесячная начисленная зарплата, август 2026 года, Росстат (по публикации Т—Ж, 29.10.2026)
WAGE = {'Республика Саха (Якутия)': 130483, 'Красноярский край': 109009, 'Республика Коми': 98587, 'Архангельская область': 88842,
        'Ненецкий АО': 140688, 'Ямало-Ненецкий АО': 183636, 'Мурманская область': 121374, 'Чукотский АО': 220010, 'Россия': 103014}
WORKDAYS = 21
extra['wages'] = {'values': WAGE, 'workdays': WORKDAYS, 'period': 'август 2026', 'src': 'https://t-j.ru/news/salary-rosstat-2026-10/'}

# ---------------------------------------------------------------- 7. загрузка рейсов: пассажиропоток против мест
# Пассажиропоток в январе–июне 2026 года: Мурманск 690 868, Хибины 131 528 (Минтранс Мурманской области, ABN24, 01.08.2026)
PAX = {'MMK': 690868, 'KVK': 131528}
lf = {}
for a, pax in PAX.items():
    sub = fl[((fl.origin_airport_iata == a) | (fl.destination_airport_iata == a)) & (fl.departure_date >= '2026-01-01') & (fl.departure_date <= '2026-06-30')]
    seats = sub.seats.sum()
    lf[a] = {'pax': pax, 'seats': int(round(seats)), 'load': round(float(pax / seats), 2)}
extra['load_factor'] = {'airports': lf, 'src': 'https://abnews.ru/szfo/news/murmansk/2026/8/1/aeroporty-murmanskoj-oblasti-za-polgoda-perevezli-822-tysyachi-passazhirov'}
print('загрузка:', lf)

# ---------------------------------------------------------------- 8. сутки рейсов для анимации
f['msk_date'] = (f.scheduled_departure_utc + pd.Timedelta('3h')).dt.normalize()
cnt = f.groupby('msk_date').size()
days = {}
for label, month in [('winter', 2), ('summer', 7)]:
    inm = (cnt.index.month == month) & (cnt.index.year == 2026)
    c = cnt[inm & (cnt.index.dayofweek == 2)]
    med = cnt[inm].median()
    day = (c - med).abs().idxmin()
    start = day - pd.Timedelta('3h')                      # 00:00 по Москве в UTC
    end = start + pd.Timedelta('1D')
    sub = f[(f.scheduled_departure_utc < end) & (f.scheduled_arrival_utc > start)]
    rows = []
    for _, r in sub.iterrows():
        o, d = r.origin_airport_iata, r.destination_airport_iata
        local = bool(r.both_azrf) or (o in LOCAL and d in ROOT_OUT) or (d in LOCAL and o in ROOT_OUT)
        rows.append([r.origin_city, r.destination_city, int((r.scheduled_departure_utc - start).total_seconds() // 60), int((r.scheduled_arrival_utc - start).total_seconds() // 60),
                     int(local), int(r.seats)])
    days[label] = {'date': day.strftime('%Y-%m-%d'), 'n': int(c.loc[day]), 'flights': rows}
    print('день для анимации', label, day.date(), 'рейсов', c.loc[day], 'в окне', len(rows))
extra['day'] = days

# ---------------------------------------------------------------- 9. аэродромы АЗРФ из реестра без рейсов в данных
reg = pd.read_excel(RAW/'reestr_aerodromov_azrf.xlsx', sheet_name='Аэропорты', header=0, dtype=str)
reg = reg[reg['Маркер'].fillna('').str.contains('АЗРФ')]
REGULAR = {'Беринговский', 'Залив Креста', 'Купол', 'Лаврентия, залив', 'Марково', 'Провидения, бухта', 'Сабетта', 'Утренний', 'Ямбург'}
miss = []
for _, r in reg.iterrows():
    code = r['IATA'] if isinstance(r['IATA'], str) else None
    if code in M['airport_profiles'] or r['Наименование'] == 'Васьково': continue
    lat, lon = [float(x) for x in r['Координаты'].split(',')]
    miss.append({'name': r['Наименование'].replace(', залив', '').replace(', бухта', ''), 'region': r['Регион'], 'klass': r['Класс'] if isinstance(r['Класс'], str) else None,
                 'lat': lat, 'lon': lon, 'kind': 'airport' if r['Наименование'] in REGULAR else 'local'})
extra['missing'] = miss
extra['registry'] = {'azrf_total': int(len(reg)), 'in_data': len(ARCTIC)}
print('аэродромы АЗРФ вне данных:', len(miss), [m['name'] for m in miss])

json.dump(extra, open(OUT/'extra.json', 'w'), ensure_ascii=False, separators=(',', ':'), default=lambda o: int(o) if isinstance(o, np.integer) else float(o))
print('saved extra.json', (OUT/'extra.json').stat().st_size // 1024, 'KB')
