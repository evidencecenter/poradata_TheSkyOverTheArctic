"""Шаг 3. Цены: медианная минимальная цена за 30/14/3 дня до вылета по маршрутам,
цена километра на малых и магистральных линиях, сезонность цен."""
import json, math, pathlib, pandas as pd, numpy as np
ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW, OUT = ROOT/'data/raw', ROOT/'data/processed'
ap = pd.read_csv(OUT/'airports.csv').set_index('iata')
def load_flights(OUT):
    """Читает очищенное расписание: pkl (локальный кэш) или csv.gz из репозитория."""
    import pandas as pd
    if (OUT/'flights_clean.pkl').exists(): return pd.read_pickle(OUT/'flights_clean.pkl')
    fl = pd.read_csv(OUT/'flights_clean.csv.gz', parse_dates=['departure_date','scheduled_departure_local','scheduled_departure_utc','scheduled_arrival_local','scheduled_arrival_utc'])
    for c in ['origin_azrf','destination_azrf','both_azrf','soviet','unpaved','ac_filled']: fl[c] = fl[c].astype(bool)
    return fl
fl = load_flights(OUT)
metrics = json.load(open(OUT/'metrics.json'))
root_arctic = set(metrics['classification']['root_arctic'])
LOCAL = set(metrics['classification']['local'])

pr = pd.read_excel(RAW/'min_prices_direct_ru_arctic.xlsx')
pr['departure_date'] = pd.to_datetime(pr.departure_date); pr['observation_date'] = pd.to_datetime(pr.observation_date)
for c in ['origin', 'destination']:
    pr[c] = pr[c].astype(str).str.strip()
W0, W1 = pd.Timestamp('2025-10-01'), pd.Timestamp('2026-09-30')
p = pr[(pr.departure_date >= W0) & (pr.departure_date <= W1)].copy()
p['month'] = p.departure_date.dt.to_period('M').astype(str)

def gc_km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, [ap.lat[a], ap.lon[a], ap.lat[b], ap.lon[b]])
    h = math.sin((la2-la1)/2)**2 + math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 6371.0088*2*math.asin(math.sqrt(h))
SMALL_CLASSES = {'Г', 'Д', 'Е'}
def is_small(a, b):
    return ap.klass[a] in SMALL_CLASSES or ap.klass[b] in SMALL_CLASSES

# рейсы по расписанию в том же окне (для счётчика вылетов и типа ВС)
fw = fl[(fl.departure_date >= W0) & (fl.departure_date <= W1)]
sched = fw.groupby(['origin_airport_iata', 'destination_airport_iata']).agg(flights=('seats', 'size'), seats=('seats', 'sum'))
fam = fw[fw.family.notna()].groupby(['origin_airport_iata', 'destination_airport_iata', 'family']).size().reset_index(name='n')
fam = fam.sort_values('n', ascending=False).drop_duplicates(['origin_airport_iata', 'destination_airport_iata']).set_index(['origin_airport_iata', 'destination_airport_iata']).family

g = p.groupby(['origin', 'destination'])
routes = g.agg(n_dates=('departure_date', 'nunique'), n_obs=('min_price', 'size'),
               p30=('price_depth_30', 'median'), p14=('price_depth_14', 'median'), p3=('price_depth_3', 'median'),
               n30=('price_depth_30', 'count'), n14=('price_depth_14', 'count'), n3=('price_depth_3', 'count'),
               pmin_mean=('min_price', 'mean'), pmin_med=('min_price', 'median')).reset_index()
routes['dist_km'] = [round(gc_km(a, b)) for a, b in zip(routes.origin, routes.destination)]
routes['small'] = [is_small(a, b) for a, b in zip(routes.origin, routes.destination)]
routes['flights'] = [int(sched.flights.get((a, b), 0)) for a, b in zip(routes.origin, routes.destination)]
routes['family'] = [fam.get((a, b), None) for a, b in zip(routes.origin, routes.destination)]
routes['rub_km'] = (routes.p30 / routes.dist_km).round(2)
routes['rub_km3'] = (routes.p3 / routes.dist_km).round(2)
routes['origin_azrf'] = routes.origin.map(ap.azrf); routes['destination_azrf'] = routes.destination.map(ap.azrf)
routes['origin_name'] = routes.origin.map(ap.city_ru); routes['destination_name'] = routes.destination.map(ap.city_ru)
routes['ratio_3_30'] = (routes.p3 / routes.p30).round(3)
routes['ratio_14_30'] = (routes.p14 / routes.p30).round(3)
# отбор: больше 10 вылетов за год (по расписанию, либо по датам с ценой для маршрутов вне расписания)
routes['eligible'] = ((routes.flights > 10) | ((routes.flights == 0) & (routes.n_dates > 10))) & routes.p30.notna()
el = routes[routes.eligible]
summary = {}
for name, sub in [('small', el[el.small]), ('trunk', el[~el.small])]:
    summary[name] = {'routes': int(len(sub)), 'rub_km_mean': round(float(sub.rub_km.mean()), 1), 'rub_km_median': round(float(sub.rub_km.median()), 1),
                     'rub_km_wmean': round(float((sub.p30 * sub.flights.clip(lower=1)).sum() / (sub.dist_km * sub.flights.clip(lower=1)).sum()), 1),
                     'p30_median': round(float(sub.p30.median())), 'dist_median': round(float(sub.dist_km.median()))}
summary['ratio_mean'] = round(summary['small']['rub_km_mean'] / summary['trunk']['rub_km_mean'], 1)
summary['ratio_median'] = round(summary['small']['rub_km_median'] / summary['trunk']['rub_km_median'], 1)
print('ЦЕНА КИЛОМЕТРА:', summary, '\n  дека: 39 против 9 ₽/км, в 4,5 раза')
# помесячно
p['small'] = [is_small(a, b) for a, b in zip(p.origin, p.destination)]
p['dist_km'] = [gc_km(a, b) for a, b in zip(p.origin, p.destination)]
p['rub_km30'] = p.price_depth_30 / p.dist_km
elig_keys = set(map(tuple, el[['origin', 'destination']].values))
pe = p[[k in elig_keys for k in zip(p.origin, p.destination)]]
rm = pe.dropna(subset=['rub_km30']).groupby(['month', 'small']).rub_km30.median().unstack()
monthly_gap = [{'month': m, 'small': round(float(r.get(True, np.nan)), 1), 'trunk': round(float(r.get(False, np.nan)), 1)} for m, r in rm.iterrows()]
print('помесячный разрыв:', [(x['month'], round(x['small']/x['trunk'],1)) for x in monthly_gap])
# глубина бронирования
bd = el.dropna(subset=['p3', 'p30'])
depth = {}
for name, sub in [('all', bd), ('small', bd[bd.small]), ('trunk', bd[~bd.small])]:
    depth[name] = {'routes': int(len(sub)), 'median_ratio_3_30': round(float(sub.ratio_3_30.median()), 3),
                   'share_up_10': round(float((sub.ratio_3_30 >= 1.1).mean()), 3), 'share_flat': round(float(sub.ratio_3_30.between(0.95, 1.05).mean()), 3),
                   'share_down_5': round(float((sub.ratio_3_30 <= 0.95).mean()), 3)}
print('ГЛУБИНА БРОНИРОВАНИЯ (цена за 3 дня / за 30 дней):', depth)
# сезонность цен с курортов в корневые аэропорты (средняя минимальная цена по всем наблюдениям)
RESORTS = [a for a in ap.index if ap.marker[a] == 'Курорт']
rr = pr[pr.origin.isin(RESORTS) & pr.destination.isin(root_arctic)].copy()
rr['month'] = rr.departure_date.dt.to_period('M').astype(str)
res_month = rr.groupby(['destination', 'month']).min_price.mean().round().unstack()
resort_prices = {d: {m: (None if pd.isna(v) else int(v)) for m, v in row.items()} for d, row in res_month.iterrows()}
# цены из столиц и в столицы по месяцам для корневых (для «моего аэропорта»)
# пропуски
miss = {f'depth_{d}': round(float(pr[f'price_depth_{d}'].isna().mean()), 3) for d in [30, 14, 3]}
totals = {'rows': int(len(pr)), 'routes': int(pr.groupby(['origin', 'destination']).ngroups), 'airports': int(len(set(pr.origin) | set(pr.destination))),
          'arctic_airports': int(sum(ap.azrf.get(a, False) for a in set(pr.origin) | set(pr.destination))),
          'obs_from': str(pr.observation_date.min().date()), 'obs_to': str(pr.observation_date.max().date()),
          'dep_from': str(pr.departure_date.min().date()), 'dep_to': str(pr.departure_date.max().date()), 'missing': miss,
          'depth_median': int(pr.depth.median()), 'eligible_routes': int(len(el))}
print(totals)
# примеры для «двух билетов»
ex = el.sort_values('rub_km')
print('самые дорогие за км:'); print(ex.tail(8)[['origin_name', 'destination_name', 'dist_km', 'p30', 'rub_km', 'flights', 'family']].to_string())
print('самые дешёвые за км:'); print(ex.head(8)[['origin_name', 'destination_name', 'dist_km', 'p30', 'rub_km', 'flights', 'family']].to_string())
# самый дорогой и дешёвый билет вообще
print('медианные цены, топ:'); print(el.sort_values('p30').tail(5)[['origin_name', 'destination_name', 'dist_km', 'p30', 'flights']].to_string())
routes.to_csv(OUT/'price_routes.csv', index=False)
out = {'summary': summary, 'monthly_gap': monthly_gap, 'depth': depth, 'resort_prices': resort_prices, 'totals': totals,
       'routes': routes[routes.p30.notna()].drop(columns=['pmin_mean']).to_dict('records')}
json.dump(out, open(OUT/'prices.json', 'w'), ensure_ascii=False, indent=1, default=lambda o: None if (isinstance(o, float) and np.isnan(o)) else (int(o) if isinstance(o, np.integer) else float(o)))
print('saved prices.json')
