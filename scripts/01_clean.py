"""Шаг 1. Очистка данных Aviastats: нормализация названий, дедупликация записей одного рейса,
заполнение пропусков по типу ВС, восстановление местного времени и UTC, разметка аэропортов по реестру."""
import re, sys, pathlib, pandas as pd, numpy as np
ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW, OUT = ROOT/'data/raw', ROOT/'data/processed'
OUT.mkdir(parents=True, exist_ok=True)

def fix_mojibake(s):
    if not isinstance(s, str): return s
    if re.search(r'[РС][\x80-\xffЀ-ӿ]', s):
        try: return s.encode('cp1251').decode('utf-8')
        except Exception: return s
    return s

def norm(s):
    if not isinstance(s, str): return s
    return re.sub(r'\s+', ' ', s.replace(' ',' ')).strip()

# ---------- реестр аэродромов ----------
reg = pd.read_excel(RAW/'reestr_aerodromov_azrf.xlsx', sheet_name='Аэропорты').dropna(subset=['IATA'])
reg['IATA'] = reg['IATA'].astype(str).str.strip()
ll = reg['Координаты'].astype(str).str.split(',', expand=True)
reg['lat'] = pd.to_numeric(ll[0], errors='coerce'); reg['lon'] = pd.to_numeric(ll[1], errors='coerce')
reg['azrf'] = reg['АЗРФ'].astype(str).str.strip().str.lower().eq('да')
reg['marker'] = reg['Маркер'].fillna('')
reg.loc[reg['IATA'] == 'MSQ', 'marker'] = ''   # Минск не входит в группу «Москва и Петербург»
reg['klass'] = reg['Класс'].astype(str).str.strip().replace({'nan': ''})
reg['name_ru'] = reg['Наименование'].map(norm)
reg['city_ru'] = reg['name_ru'].str.replace(r'\s*\(.*\)\s*', '', regex=True).str.strip()
CITY_KEY = {'SVO':'MOW','DME':'MOW','VKO':'MOW','ZIA':'MOW','KJA':'KJA','KCY':'KJA','ARH':'ARH','VKV':'ARH'}
reg['city_key'] = reg['IATA'].map(lambda x: CITY_KEY.get(x, x))
reg.loc[reg.IATA=='ZIA','city_ru'] = 'Москва'
reg.loc[reg.IATA=='KCY','city_ru'] = 'Красноярск'
airports = reg[['IATA','ICAO','name_ru','city_ru','city_key','Регион','azrf','marker','klass','lat','lon','Тип','Комментарий']].rename(
    columns={'IATA':'iata','ICAO':'icao','Регион':'region','Тип':'type','Комментарий':'comment'})
airports.to_csv(OUT/'airports.csv', index=False)

# ---------- расписание ----------
fl = pd.read_excel(RAW/'flights_ru_arctic.xlsx')
for c in ['aircraft_name','origin_airport_name','destination_airport_name','airline_name','operating_airline_name','origin_city_name','destination_city_name']:
    fl[c] = fl[c].map(fix_mojibake).map(norm)
fl['airline_name'] = fl['airline_name'].str.replace(r'\s*\([A-Z0-9]{2}\)$', '', regex=True)
n_raw = len(fl)
fl['departure_date'] = pd.to_datetime(fl['departure_date'])
for c in ['scheduled_departure_local','scheduled_departure_utc','scheduled_arrival_local','scheduled_arrival_utc']:
    fl[c] = pd.to_datetime(fl[c])

# один физический рейс = время вылета UTC + пара аэропортов (несколько авиакомпаний продают один рейс под разными номерами)
key = ['scheduled_departure_utc','origin_airport_iata','destination_airport_iata']
fl['year'] = fl.departure_date.dt.year
route_airline_n = fl.groupby(['year','origin_airport_iata','destination_airport_iata','airline_iata']).size().rename('ra_n')
fl = fl.join(route_airline_n, on=['year','origin_airport_iata','destination_airport_iata','airline_iata'])
fl['has_ac'] = fl.aircraft_code.notna().astype(int)
fl['dup_n'] = fl.groupby(key)['flight_number'].transform('size')
fl['all_numbers'] = fl.groupby(key)['flight_number'].transform(lambda s: '|'.join(sorted(set(s))))
fl['all_airlines'] = fl.groupby(key)['airline_iata'].transform(lambda s: '|'.join(sorted(set(s))))
fl = fl.sort_values(key+['has_ac','ra_n'], ascending=[True,True,True,False,False]).drop_duplicates(key, keep='first')
n_dedup = len(fl)

# заполнение пропусков по типу ВС: по номеру рейса на маршруте, затем по авиакомпании на маршруте
def mode(s):
    s = s.dropna()
    return s.mode().iloc[0] if len(s) else np.nan
miss0 = fl.aircraft_code.isna().sum()
for grp in [['flight_number','origin_airport_iata','destination_airport_iata'], ['airline_iata','origin_airport_iata','destination_airport_iata']]:
    m = fl.groupby(grp)['aircraft_code'].agg(mode).rename('ac_fill')
    fl = fl.join(m, on=grp)
    fl['ac_filled'] = fl.aircraft_code.isna() & fl.ac_fill.notna()
    fl.loc[fl.ac_filled, 'aircraft_code'] = fl.loc[fl.ac_filled, 'ac_fill']
    fl = fl.drop(columns=['ac_fill'])
# имя ВС и места по коду (мода на маршруте у авиакомпании, иначе глобальная)
ac_name = fl.dropna(subset=['aircraft_name']).groupby('aircraft_code')['aircraft_name'].agg(mode)
fl['aircraft_name'] = fl['aircraft_name'].fillna(fl['aircraft_code'].map(ac_name))
for col in ['seats_capacity_min','seats_capacity_max']:
    m1 = fl.dropna(subset=[col]).groupby(['airline_iata','aircraft_code'])[col].agg(mode).rename('f1')
    m2 = fl.dropna(subset=[col]).groupby('aircraft_code')[col].agg(mode).rename('f2')
    fl = fl.join(m1, on=['airline_iata','aircraft_code']).join(m2, on='aircraft_code')
    fl[col] = fl[col].fillna(fl['f1']).fillna(fl['f2']); fl = fl.drop(columns=['f1','f2'])
miss1 = fl.aircraft_code.isna().sum()

# семейства ВС
FAMILY = {'SU9':'SSJ 100','320':'Airbus A320','32A':'Airbus A320','32B':'Airbus A320','32N':'Airbus A320','319':'Airbus A320','321':'Airbus A320',
 '738':'Boeing 737','73H':'Boeing 737','73E':'Boeing 737','73W':'Boeing 737','735':'Boeing 737','734':'Boeing 737','737':'Boeing 737','7M8':'Boeing 737','B38M':'Boeing 737','733':'Boeing 737','739':'Boeing 737','73G':'Boeing 737',
 'CR2':'CRJ 100/200','CRJ':'CRJ 100/200','AN4':'Ан-24','A26':'Ан-26','YK2':'Як-42','E70':'Embraer E-Jet','E75':'Embraer E-Jet','E90':'Embraer E-Jet','E95':'Embraer E-Jet',
 'DH3':'DHC-8','DH4':'DHC-8','AT4':'ATR 42/72','AT5':'ATR 42/72','AT7':'ATR 42/72','773':'Boeing 777','77W':'Boeing 777','75W':'Boeing 757','744':'Boeing 747','332':'Airbus A330','333':'Airbus A330','MIH':'Ми-8'}
fl['family'] = fl.aircraft_code.map(FAMILY)
unknown = fl.loc[fl.aircraft_code.notna() & fl.family.isna(), 'aircraft_code'].unique()
assert len(unknown)==0, unknown
SOVIET = {'Ан-24','Ан-26','Як-42','Ми-8'}
UNPAVED = {'Ан-24','Ан-26','ATR 42/72','DHC-8','Ми-8'}
fl['soviet'] = fl.family.isin(SOVIET); fl['unpaved'] = fl.family.isin(UNPAVED)
fl['seats'] = fl['seats_capacity_max']

# ---------- время вылета и прилёта ----------
# В столбцах «UTC» выгрузки на самом деле местное время по расписанию, а столбцы «местное время» получены из них
# прибавлением пояса аэропорта. Поэтому рейс Норильск → Москва по выгрузке длится 30 минут, а Москва → Норильск —
# больше 8 часов: длительность считается как разность местных времён. Признаки:
#  - на табло Яндекса в Архангельске, Мурманске и Нарьян-Маре местное время рейсов совпадает со столбцом «UTC»;
#  - у рейсов туда-обратно разница длительностей равна двойной разнице поясов, а разворот самолёта
#    в аэропорту назначения по этим часам занимает обычные 40–100 минут;
#  - вылеты из Москвы и Петербурга в столбце «UTC» затихают в 4–5 часов — это ночное затишье по местному времени.
# Дата вылета в выгрузке — дата «UTC + 3 часа», то есть у поздних вечерних рейсов она уже следующая; пересчитываем по местному времени.
# Восстанавливаем: местное время = столбец «UTC»; UTC = местное время − пояс аэропорта.
ap = airports.set_index('iata')
off_dep = (fl.scheduled_departure_local - fl.scheduled_departure_utc).dt.total_seconds().div(60).round()
off_arr = (fl.scheduled_arrival_local - fl.scheduled_arrival_utc).dt.total_seconds().div(60).round()
TZ = off_dep.groupby(fl.origin_airport_iata).agg(lambda s: s.mode().iat[0]).combine_first(
     off_arr.groupby(fl.destination_airport_iata).agg(lambda s: s.mode().iat[0]))
# пояса, которые в выгрузке указаны неверно (закон «Об исчислении времени»; подтверждается рейсами туда-обратно):
# Депутатский и Усть-Куйга (Усть-Янский улус) — UTC+10, Саккырыр (Эвено-Бытантайский улус) — UTC+9, Барнаул — UTC+7
TZ_FIX = {'DPT': 600, 'UKG': 600, 'SUK': 540, 'BAX': 420}
TZ.update(pd.Series(TZ_FIX, dtype=float))
assert (fl.departure_date.dt.normalize() == (fl.scheduled_departure_utc + pd.Timedelta(hours=3)).dt.normalize()).all()
assert fl.origin_airport_iata.map(TZ).notna().all() and fl.destination_airport_iata.map(TZ).notna().all()
n_shift = int(((fl.origin_airport_iata.map(TZ) != 180) | (fl.destination_airport_iata.map(TZ) != 180)).sum())
fl['scheduled_departure_local'] = fl.scheduled_departure_utc
fl['scheduled_arrival_local'] = fl.scheduled_arrival_utc
fl['scheduled_departure_utc'] = fl.scheduled_departure_local - pd.to_timedelta(fl.origin_airport_iata.map(TZ), unit='m')
fl['scheduled_arrival_utc'] = fl.scheduled_arrival_local - pd.to_timedelta(fl.destination_airport_iata.map(TZ), unit='m')
n_date = int((fl.departure_date.dt.normalize() != fl.scheduled_departure_local.dt.normalize()).sum())
fl['departure_date'] = fl.scheduled_departure_local.dt.normalize()
fl['year'] = fl.departure_date.dt.year
airports['tz_utc_min'] = airports.iata.map(TZ)
airports.to_csv(OUT/'airports.csv', index=False)

# оставшееся невозможное время полёта (прилёт раньше вылета, дольше 16 часов или быстрее 950 км/ч с учётом 15 минут
# на взлёт и посадку). Это не физические рейсы: выгрузка показывает то, на что продают билеты, и стыковку под одним номером
# (например, Казань — Норильск через Петербург двумя самолётами разных авиакомпаний) записывает как один рейс.
# Такие записи исключаем.
def _km(a, b):
    la1, lo1, la2, lo2 = map(np.radians, [ap.lat.get(a, np.nan), ap.lon.get(a, np.nan), ap.lat.get(b, np.nan), ap.lon.get(b, np.nan)])
    h = np.sin((la2-la1)/2)**2 + np.cos(la1)*np.cos(la2)*np.sin((lo2-lo1)/2)**2
    return 6371.0088*2*np.arcsin(np.sqrt(h))
fl['dur_min'] = (fl.scheduled_arrival_utc - fl.scheduled_departure_utc).dt.total_seconds() / 60
km_all = np.array([_km(a, b) for a, b in zip(fl.origin_airport_iata, fl.destination_airport_iata)])
bad = (fl.dur_min <= 0) | (fl.dur_min > 16*60) | (fl.dur_min < 15 + km_all*60/950)
n_bad = int(bad.sum())
fl = fl[~bad.to_numpy()].drop(columns=['dur_min']).copy()
fl['arr_imputed'] = False   # столбец оставлен для совместимости со следующими шагами

# Рейс с промежуточной посадкой выгрузка записывает дважды. Нарьян-Мар → Махачкала → Сочи — это записи
# Нарьян-Мар → Махачкала и Нарьян-Мар → Сочи с одним номером и временем вылета. Обратный рейс — записи Сочи → Нарьян-Мар
# и Махачкала → Нарьян-Мар с одним номером и временем прилёта. Самолёт один, поэтому в подсчётах рейсов и мест
# такой рейс идёт одной записью — до конечного пункта (stop_dup = True у остальных записей). Для связности и времени
# в пути нужны все записи: билет продают на каждую. Роли: through — запись от начального до конечного пункта,
# stage — участок до посадки или после неё, dup — ещё одна запись того же рейса (тот же рейс в двух аэропортах
# одного города, например Емельяново и Черемшанка в Красноярске, или две версии времени вылета).
fl = fl.reset_index(drop=True)
_x = fl[['all_numbers', 'origin_airport_iata', 'destination_airport_iata', 'scheduled_departure_local', 'scheduled_arrival_local',
         'scheduled_departure_utc', 'scheduled_arrival_utc']].copy()
_x['rid'] = _x.index
_x['num'] = _x.all_numbers.str.split('|'); _x = _x.explode('num')
_roles = {}
for _key, _other, _t, _stage_last in [(['num', 'origin_airport_iata', 'scheduled_departure_local'], 'destination_airport_iata', 'scheduled_arrival_utc', False),
                                       (['num', 'destination_airport_iata', 'scheduled_arrival_local'], 'origin_airport_iata', 'scheduled_departure_utc', True)]:
    _g = _x[_x.groupby(_key)[_other].transform('nunique') > 1]
    _freq = _x.groupby(_key[:2] + [_other]).size()
    for _k, _d in _g.groupby(_key):
        _d = _d.assign(_n=[_freq.get((_k[0], _k[1], o), 0) for o in _d[_other]]).sort_values([_t, '_n', _other], ascending=[True, False, True])
        if _d[_other].map(ap.city_key).nunique() == 1 or _d[_t].nunique() == 1:
            # дубль: оставляем аэропорт, который чаще встречается у этого номера
            _keep = {_d.sort_values(['_n', _t, _other], ascending=[False, True, True]).rid.iloc[0]: 'keep'}
        else:
            _first, _last = _d[_d[_t] == _d[_t].iloc[0]].rid.iloc[0], _d[_d[_t] == _d[_t].iloc[-1]].rid.iloc[0]
            # вылеты: раньше всех прилетает участок до посадки; прилёты: позже всех вылетает участок после посадки
            _keep = {_first: 'stage', _last: 'through'} if not _stage_last else {_first: 'through', _last: 'stage'}
        for _r in _d.rid: _roles.setdefault(_r, set()).add(_keep.get(_r, 'dup'))
def _role(s):
    if 'dup' in s: return 'dup'
    s = s - {'keep'}
    if not s: return ''
    if s == {'stage', 'through'}: return 'conflict'
    return next(iter(s))
fl['stop_role'] = pd.Series({r: _role(s) for r, s in _roles.items()}, dtype=object).reindex(fl.index).fillna('')
assert not (fl.stop_role == 'conflict').any()
fl['stop_dup'] = fl.stop_role.isin(['stage', 'dup'])
n_stop = int((fl.stop_role == 'through').sum()); n_stop_dup = int(fl.stop_dup.sum())

# разметка аэропортов
for side in ['origin','destination']:
    fl[f'{side}_azrf'] = fl[f'{side}_airport_iata'].map(ap.azrf).fillna(False).astype(bool)
    fl[f'{side}_city'] = fl[f'{side}_airport_iata'].map(ap.city_key)
    fl[f'{side}_marker'] = fl[f'{side}_airport_iata'].map(ap.marker)
fl['both_azrf'] = fl.origin_azrf & fl.destination_azrf
fl['week'] = fl.departure_date.dt.isocalendar().week.astype(int)
fl['month'] = fl.departure_date.dt.month
keep = ['departure_date','year','month','week','scheduled_departure_local','scheduled_departure_utc','scheduled_arrival_local','scheduled_arrival_utc',
        'origin_airport_iata','origin_city','origin_azrf','origin_marker','destination_airport_iata','destination_city','destination_azrf','destination_marker','both_azrf',
        'airline_iata','airline_name','flight_number','all_numbers','all_airlines','dup_n','aircraft_code','aircraft_name','family','soviet','unpaved','ac_filled','arr_imputed','seats_capacity_min','seats_capacity_max','seats','stop_role','stop_dup']
fl = fl[keep].sort_values(['departure_date','scheduled_departure_utc']).reset_index(drop=True)
fl.to_csv(OUT/'flights_clean.csv.gz', index=False, compression='gzip')
fl.to_pickle(OUT/'flights_clean.pkl')  # локальный кэш, в репозиторий не попадает
log = f"""Очистка расписания
записей в выгрузке: {n_raw}
физических рейсов после дедупликации: {n_dedup} (удалено дублей: {n_raw-n_dedup})
пропусков по типу ВС до заполнения: {miss0}, после заполнения по номеру рейса и авиакомпании: {miss1}
рейсов с аэропортами вне московского пояса (UTC пересчитано по поясам): {n_shift}
рейсов, у которых дата вылета пересчитана по местному времени: {n_date}
записей с невозможным временем полёта (стыковки под одним номером, исключены): {n_bad}
рейсов после исключения: {len(fl)}
рейсов с промежуточной посадкой: {n_stop}; их повторных записей и дублей одного рейса в двух аэропортах города (в подсчётах не участвуют): {n_stop_dup}
аэропортов: {len(set(fl.origin_airport_iata)|set(fl.destination_airport_iata))}, из них в АЗРФ: {ap.azrf[list(set(fl.origin_airport_iata)|set(fl.destination_airport_iata))].sum()}
городов: {len(set(fl.origin_city)|set(fl.destination_city))}
направленных маршрутов (аэропорт-аэропорт): {fl.groupby(['origin_airport_iata','destination_airport_iata']).ngroups}
направленных маршрутов (город-город): {fl.groupby(['origin_city','destination_city']).ngroups}
рейсов 2025: {(fl.year==2025).sum()}, 2026: {(fl.year==2026).sum()}
"""
print(log); (OUT/'clean_log.txt').write_text(log)
# маршруты в обе стороны
r = set(map(tuple, fl[['origin_airport_iata','destination_airport_iata']].drop_duplicates().values))
both = sum(1 for a,b in r if (b,a) in r)
print('маршрутов с обратным направлением:', both)
# остаточные пропуски ВС: где
m = fl[fl.aircraft_code.isna()]
print(m.groupby(['origin_airport_iata','destination_airport_iata','airline_iata']).size().sort_values(ascending=False).head(15))
print('из них внутри АЗРФ:', m.both_azrf.sum())
