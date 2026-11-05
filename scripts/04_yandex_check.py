"""Шаг 4. Сверка полноты расписания Aviastats с табло Яндекс Расписаний
(Мурманск, Архангельск, Нарьян-Мар; отдельные даты сентября–октября 2026)."""
import json, pathlib, pandas as pd
ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW, OUT = ROOT/'data/raw', ROOT/'data/processed'
y = pd.read_csv(RAW/'yandex_flights.csv')
y['board_date'] = pd.to_datetime(y.board_date)
y['numbers'] = y.codeshare.fillna(y.flight_number).astype(str).str.replace(' ', '').str.split('|')
y = y[y.flight_number.notna()]
def load_flights(OUT):
    """Читает очищенное расписание: pkl (локальный кэш) или csv.gz из репозитория."""
    import pandas as pd
    if (OUT/'flights_clean.pkl').exists(): return pd.read_pickle(OUT/'flights_clean.pkl')
    fl = pd.read_csv(OUT/'flights_clean.csv.gz', parse_dates=['departure_date','scheduled_departure_local','scheduled_departure_utc','scheduled_arrival_local','scheduled_arrival_utc'])
    for c in ['origin_azrf','destination_azrf','both_azrf','soviet','unpaved','ac_filled']: fl[c] = fl[c].astype(bool)
    return fl
fl = load_flights(OUT)
res = []
for (st, d), grp in y.groupby(['station_iata', 'board_date']):
    a = fl[(fl.departure_date == d) & ((fl.origin_airport_iata == st) | (fl.destination_airport_iata == st))]
    a_nums = set(n for s in a.all_numbers for n in s.split('|'))
    y_nums = [set(n) for n in grp.numbers]
    found = sum(1 for s in y_nums if s & a_nums)
    y_all = set(n for s in y_nums for n in s)
    found_a = sum(1 for s in a.all_numbers if set(s.split('|')) & y_all)
    res.append({'station': st, 'date': str(d.date()), 'yandex': len(grp), 'yandex_in_aviastats': found, 'aviastats': len(a), 'aviastats_in_yandex': found_a})
r = pd.DataFrame(res)
tot = {'yandex_flights': int(r.yandex.sum()), 'yandex_found': int(r.yandex_in_aviastats.sum()), 'aviastats_flights': int(r.aviastats.sum()), 'aviastats_found': int(r.aviastats_in_yandex.sum())}
tot['share_yandex_found'] = round(tot['yandex_found'] / tot['yandex_flights'], 3)
tot['share_aviastats_found'] = round(tot['aviastats_found'] / tot['aviastats_flights'], 3)
print(r.to_string()); print(tot)
# куда летают рейсы Яндекса, которых нет в Aviastats
miss = []
for (st, d), grp in y.groupby(['station_iata', 'board_date']):
    a = fl[(fl.departure_date == d) & ((fl.origin_airport_iata == st) | (fl.destination_airport_iata == st))]
    a_nums = set(n for s in a.all_numbers for n in s.split('|'))
    for _, row in grp.iterrows():
        if not set(row.numbers) & a_nums: miss.append((st, row.counterpart_city, row.flight_number, row.airline_names))
print('не найдены в Aviastats:', pd.Series([f'{m[0]} {m[1]} {m[3]}' for m in miss]).value_counts().head(15))
json.dump({'by_station_date': res, 'totals': tot}, open(OUT/'yandex_check.json', 'w'), ensure_ascii=False, indent=1)
