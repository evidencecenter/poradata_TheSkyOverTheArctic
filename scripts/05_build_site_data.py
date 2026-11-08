"""Шаг 5. Сборка данных для страницы: site/data.js (window.DATA)."""
import json, pathlib, pandas as pd, numpy as np
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT, SITE = ROOT/'data/processed', ROOT/'site'
m = json.load(open(OUT/'metrics.json'))
pr = json.load(open(OUT/'prices.json'))
yc = json.load(open(OUT/'yandex_check.json'))
bm = json.load(open(OUT/'basemap.json'))
clean_log = (OUT/'clean_log.txt').read_text()
extra = json.load(open(OUT/'extra.json')) if (OUT/'extra.json').exists() else {}
ap = pd.read_csv(OUT/'airports.csv').set_index('iata')
cls = m['classification']
HUBS = set(cls['hubs']); ROOT_OUT = set(cls['root_outside']); ROOT_A = set(cls['root_arctic']); LOCAL = set(cls['local'])

# узлы: арктические аэропорты (ключ = IATA) и внешние города (ключ = city_key)
nodes = {}
for a, p in m['airport_profiles'].items():
    nodes[a] = {'name': p['city'], 'full': p['name'], 'lat': p['lat'], 'lon': p['lon'], 'azrf': True, 'role': p['role'], 'region': p['region'],
                'klass': p['klass'], 'seats': p['seats'], 'flights': p['flights'], 'n_dest': p['n_dest'], 'roots': p['roots']}
for c, e in m['ext_nodes'].items():
    role = 'rootOut' if e['root'] else ('hub' if e['hub'] else 'ext')
    nodes[c] = {'name': e['name'], 'full': e['name'], 'lat': e['lat'], 'lon': e['lon'], 'azrf': False, 'role': role, 'marker': e['marker'], 'seats': e['seats'], 'flights': e['flights']}
nodes['MOW']['name'] = 'Москва'
# кусты по городам
clusters = {}
for r, locs in cls['clusters'].items():
    key = ap.city_key[r] if r in ap.index else r
    clusters.setdefault(key, set()).update(locs)
clusters = {k: sorted(v) for k, v in clusters.items()}
routes = [{'a': r['a'], 'b': r['b'], 'seats': int(r['seats']), 'flights': int(r['flights']), 'weeks': int(r['weeks']), 'family': r['family'],
           'group': r['group'], 'local': bool(r['local_net']), 'cluster': bool(r['cluster_net']), 'azrf': bool(r['both_azrf']), 'm': r['monthly']} for r in m['routes']]
# крюк: только нужные поля, ключи как есть
detour = {}
for k, v in m['detour'].items():
    rec = {'d': v['direct_km']}
    for t in ['reg', 'all']:
        if v[t]: rec[t] = [v[t]['km'], v[t]['path'], v[t]['ratio']]
    if 'ground' in v: rec['g'] = v['ground']
    if 'note' in v: rec['n'] = v['note']
    detour[k] = rec
prices_routes = [{'o': r['origin'], 'd': r['destination'], 'on': r['origin_name'], 'dn': r['destination_name'], 'km': r['dist_km'], 'p30': r['p30'], 'p14': r['p14'], 'p3': r['p3'],
                  'n30': r['n30'], 'fl': r['flights'], 'fam': r['family'], 'small': bool(r['small']), 'rk': r['rub_km'], 'el': bool(r['eligible']),
                  'oa': bool(r['origin_azrf']), 'da': bool(r['destination_azrf'])} for r in pr['routes']]
subsidies = {  # расчёты ПОРА по перечню Росавиации на 2026 год (из презентации)
    'directions': 58, 'rows': 69, 'pair_flights': 4870, 'inside_azrf': 1, 'inside_route': 'Нарьян-Мар — Архангельск', 'inside_pair_flights': 105,
    'share_external': 0.98, 'by_region': {'ЯНАО': 3084, 'НАО': 1196, 'Мурманская область': 358, 'Коми': 231.5}, 'crj_pair_flights': 1740, 'crj_share': 0.36,
    'other': {'social_dfo': 3, 'social_dfo_price': '8 395–13 860 ₽', 'special_tariffs': 16, 'norilsk': 9, 'norilsk_price': '2 500–6 800 ₽',
              'anadyr_pevek': 5, 'anadyr_pevek_price': '9 000–13 400 ₽', 'nnm_mow': 4000, 'kgd_arh': 5500}}
external = {  # внешние факты и источники из презентации
    'an24_fleet': 'около 100 Ан-24 и Ан-26 со средним возрастом около 50 лет', 'an24_src': 'https://www.interfax.ru/russia/929699',
    'gosnii': 'к 2030 году выбудет около четверти парка Ан-24 и Ан-26', 'il114': 'первый серийный Ил-114-300 передадут Второму Архангельскому авиаотряду до конца 2026 года, ещё два — в начале 2027-го (Г. Абраменков, ВЭФ, 02.09.2026)', 'il114_src2': 'https://www.osnmedia.ru/ekonomika/minpromtorg-anonsiroval-peredachu-pervogo-il-114-300-v-2026-godu/',
    'il114_src': 'https://peterburg2.ru/news/il-114-300-oficialno-dopuschen-k-seriynomu-proizvodstvu-v-rossii-239936.html',
    'baikal': 'Минпромторг допускает перенос сертификации «Байкала» (ЛМС-901) на 2027 год (Г. Абраменков, 14.04.2026)', 'baikal_src': 'https://expert.ru/news/v-minpromtorge-dopustili-perenos-srokov-sertifikatsii-samoleta-baykal-na-2027-god',
    'yakutia_need': 'Якутия оценивала потребность в субсидиях на внутренние линии в 3,7 млрд ₽ при собственных 1,2 млрд (2025)', 'yakutia_src': 'https://finance.rambler.ru/business/54113389-polety-vo-sne-i-nayavu/',
    'regions_ask': 'регионы Арктики и ДФО просили 14,8 млрд ₽ на 2023–2024 годы', 'regions_src': 'https://www.interfax.ru/russia/886521',
    's7_pevek': 'на рейсах Новосибирск — Певек около 85 % мест выкупают недропользователи для вахтовиков (S7, 2025)',
    'mstuca': 'МГТУ ГА (2023): столица региона связана с районными центрами, межрайонных рейсов почти нет; причины — низкий платёжеспособный спрос, высокие тарифы, разрозненность перевозчиков', 'mstuca_src': 'https://avia.mstuca.ru/jour/article/download/1986/1288',
    'fees': 'обнуление сборов за взлёт и посадку снизит цены на 20–25 % (Ассоциация малой авиации, 2022)', 'fees_src': 'https://rg.ru/2022/03/31/reg-dfo/kak-novye-pravila-pomogut-razvitiiu-maloj-aviacii-v-iakutii.html',
    'mi8': 'лётный час Ми-8 в Арктике стоит 500–650 тыс. ₽, лёгкого самолёта 60–80 тыс. ₽ (МГТУ ГА)'}
data = {'meta': {'totals': m['totals'], 'prices': pr['totals'], 'yandex': yc['totals'], 'clean_log': clean_log},
        'basemap': bm, 'nodes': nodes, 'routes': routes, 'clusters': clusters, 'classification': cls,
        'shares': m['shares'], 'shares_strict': m['shares_strict'], 'hub_shares': m['hub_shares'],
        'season': m['season_seats_per_day'], 'season_by_group': m['season_by_group'], 'cv_hhi': m['cv_hhi'],
        'fleet': m['fleet'], 'fleet_all': m['fleet_all'], 'connectivity': m['root_connectivity'], 'detour': detour,
        'profiles': m['airport_profiles'], 'prices': {'summary': pr['summary'], 'monthly_gap': pr['monthly_gap'], 'depth': pr['depth'], 'resort': pr['resort_prices'], 'routes': prices_routes},
        'subsidies': subsidies, 'external': external, 'extra': extra}
SITE.mkdir(exist_ok=True)
js = 'window.DATA=' + json.dumps(data, ensure_ascii=False, separators=(',', ':'), default=lambda o: None if (isinstance(o, float) and np.isnan(o)) else (int(o) if isinstance(o, np.integer) else float(o))) + ';'
(SITE/'data.js').write_text(js)
print('data.js', len(js.encode('utf-8'))//1024, 'KB; nodes', len(nodes), 'routes', len(routes), 'detour', len(detour), 'price routes', len(prices_routes))
