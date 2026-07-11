
from __future__ import annotations

import math
from pathlib import Path
import pandas as pd
import numpy as np

ROOT = Path(r"C:\Users\white\OneDrive\Documents\New project 2")
DATA = ROOT / "SPYPROWEB-live-recovered" / "outputs" / "control_grid" / "bars_2026.csv"
OUT = ROOT / "SPYPROWEB-live-recovered" / "outputs" / "control_grid" / "gap_family_usage"
OUT.mkdir(parents=True, exist_ok=True)

SLOPE_PER_MIN = 1.04 / 60.0
BAND = 34.0
TOL = 6.0
MOVE = 17.0
HORIZON_MIN = 120
RTH_START = 8*60 + 30   # CT
RTH_END = 15*60         # CT, BlackBull/RTH working window used in our studies
# For high anchors use 12-2 CT when available, otherwise RTH high fallback.
HI_WIN_START = 12*60
HI_WIN_END = 14*60

def nearest_shelf(price, minute_bar, anchors, family):
    best = None
    for a in anchors:
        if family == 'high_desc':
            base = a['price'] - SLOPE_PER_MIN * (minute_bar - a['bar'])
        else:
            base = a['price'] + SLOPE_PER_MIN * (minute_bar - a['bar'])
        raw = round((price - base) / BAND)
        for idx in range(int(raw)-1, int(raw)+2):
            shelf = base + idx * BAND
            dist = price - shelf
            rec = {**a, 'family': family, 'shelf_index': idx, 'shelf': shelf, 'dist': dist, 'abs_dist': abs(dist)}
            if best is None or rec['abs_dist'] < best['abs_dist']:
                best = rec
    return best

def main():
    df = pd.read_csv(DATA)
    df['ct_dt'] = pd.to_datetime(df['timestamp'], utc=True).dt.tz_convert('America/Chicago')
    df['date'] = df['ct_dt'].dt.date.astype(str)
    df['tod_min'] = df['ct_dt'].dt.hour * 60 + df['ct_dt'].dt.minute
    rth = df[(df['tod_min'] >= RTH_START) & (df['tod_min'] < RTH_END)].copy()
    if rth.empty:
        raise SystemExit('no rth rows')

    day_rows = []
    for d, g in rth.groupby('date', sort=True):
        hiwin = g[(g['tod_min'] >= HI_WIN_START) & (g['tod_min'] < HI_WIN_END)]
        if not hiwin.empty and hiwin['tod_min'].max() >= HI_WIN_END - 1:
            high_src = hiwin
            high_mode = '12-2ct'
        else:
            high_src = g
            high_mode = 'rth_fallback'
        hi_idx = high_src['high'].idxmax()
        lo_idx = g['low'].idxmin()
        day_rows.append({
            'date': d,
            'open': float(g.iloc[0]['open']),
            'close': float(g.iloc[-1]['close']),
            'high': float(g['high'].max()),
            'low': float(g['low'].min()),
            'high_anchor': float(df.loc[hi_idx,'high']),
            'high_bar': int(df.loc[hi_idx,'bar_index']),
            'high_time': df.loc[hi_idx,'ct'],
            'high_mode': high_mode,
            'low_anchor': float(df.loc[lo_idx,'low']),
            'low_bar': int(df.loc[lo_idx,'bar_index']),
            'low_time': df.loc[lo_idx,'ct'],
            'first_bar': int(g.iloc[0]['bar_index']),
            'last_bar': int(g.iloc[-1]['bar_index']),
        })
    daily = pd.DataFrame(day_rows).sort_values('date').reset_index(drop=True)
    daily['prev_close'] = daily['close'].shift(1)
    daily['gap_pts'] = daily['open'] - daily['prev_close']
    def gap_type(x):
        if pd.isna(x): return 'first'
        if x >= 10: return 'gap_up_10+'
        if x <= -10: return 'gap_down_10+'
        if x >= 5: return 'gap_up_5_10'
        if x <= -5: return 'gap_down_5_10'
        return 'flat_under5'
    daily['gap_type'] = daily['gap_pts'].map(gap_type)
    daily['is_gap10'] = daily['gap_type'].isin(['gap_up_10+','gap_down_10+'])
    daily['is_gap5'] = daily['gap_type'] != 'flat_under5'

    events=[]
    # Current indicator concept: a session can use prior completed high anchors and prior completed low anchors.
    for i in range(1, len(daily)):
        drow = daily.iloc[i]
        date = drow['date']
        # Use previous completed days from same week plus inherited previous row. Simple robust test.
        cur_date = pd.Timestamp(date)
        week_start = (cur_date - pd.Timedelta(days=cur_date.weekday())).date().isoformat()
        prev = daily.iloc[:i].copy()
        prev['week_start'] = pd.to_datetime(prev['date']).dt.to_period('W-MON').astype(str)
        # Easier: include last prior day and all current week prior days; enough for family-use test.
        current_week_mask = pd.to_datetime(prev['date']).dt.weekday < cur_date.weekday()
        same_week = prev[pd.to_datetime(prev['date']).dt.to_period('W-SUN') == cur_date.to_period('W-SUN')]
        anchors_src = pd.concat([prev.tail(1), same_week], ignore_index=True).drop_duplicates('date')
        if anchors_src.empty:
            continue
        high_anchors = [{'role':r['date'], 'price':r['high_anchor'], 'bar':int(r['high_bar'])} for _,r in anchors_src.iterrows()]
        low_anchors = [{'role':r['date'], 'price':r['low_anchor'], 'bar':int(r['low_bar'])} for _,r in anchors_src.iterrows()]
        day_bars = rth[rth['date'] == date].reset_index(drop=True)
        if len(day_bars) < 10:
            continue
        # Evaluate touch/reaction events, high family as resistance from highs, low family as support from lows.
        for j,row in day_bars.iloc[:-HORIZON_MIN].iterrows():
            mb=int(row['bar_index'])
            future=day_bars.iloc[j+1:min(len(day_bars), j+1+HORIZON_MIN)]
            if future.empty: continue
            candidates = [
                ('high_desc','resistance',float(row['high']), float(row['high']) - float(future['low'].min()), float(future['high'].max()) - float(row['high'])),
                ('low_asc','support',float(row['low']), float(future['high'].max()) - float(row['low']), float(row['low']) - float(future['low'].min())),
            ]
            for fam,side,price,fav,adv in candidates:
                anchors = high_anchors if fam == 'high_desc' else low_anchors
                ns=nearest_shelf(price, mb, anchors, fam)
                if ns is None or ns['abs_dist'] > TOL or fav < MOVE:
                    continue
                if side == 'resistance':
                    held = row['close'] <= ns['shelf']
                    candle = row['close'] < row['open']
                else:
                    held = row['close'] >= ns['shelf']
                    candle = row['close'] > row['open']
                if not held:
                    continue
                events.append({
                    'date':date, 'time':row['ct'], 'gap_pts':drow['gap_pts'], 'gap_type':drow['gap_type'],
                    'family':fam, 'side':side, 'price':price, 'shelf':ns['shelf'], 'dist':ns['dist'],
                    'role':ns['role'], 'shelf_index':ns['shelf_index'], 'fav':fav, 'adv':adv,
                    'clean_rejection': bool(candle), 'open':row['open'], 'close':row['close'],
                })
    ev=pd.DataFrame(events)
    ev.to_csv(OUT/'gap_family_events.csv', index=False)
    daily.to_csv(OUT/'gap_daily.csv', index=False)
    if ev.empty:
        print('no events')
        return
    # First reaction per day to avoid minute-by-minute overweighting.
    ev['time_dt']=pd.to_datetime(ev['time'])
    first=ev.sort_values(['date','time_dt']).groupby('date', as_index=False).first()
    first.to_csv(OUT/'gap_first_reaction_by_day.csv', index=False)

    def summarize(df, name):
        rows=[]
        for gt,g in df.groupby('gap_type'):
            counts=g['family'].value_counts()
            total=len(g)
            rows.append({
                'sample': name, 'gap_type': gt, 'days_or_events': total,
                'high_desc': int(counts.get('high_desc',0)),
                'low_asc': int(counts.get('low_asc',0)),
                'high_desc_pct': counts.get('high_desc',0)/total if total else np.nan,
                'low_asc_pct': counts.get('low_asc',0)/total if total else np.nan,
                'median_gap': float(g['gap_pts'].median()),
            })
        return rows
    summary=pd.DataFrame(summarize(first,'first_reaction_day') + summarize(ev,'all_reactions'))
    summary.to_csv(OUT/'gap_family_summary.csv', index=False)

    overall=[]
    for label, data in [('first_reaction_day', first), ('all_reactions', ev)]:
        data=data.copy()
        data['gap10'] = data['gap_type'].isin(['gap_up_10+','gap_down_10+'])
        data['gap5'] = ~data['gap_type'].eq('flat_under5')
        for col in ['gap10','gap5']:
            for val,sub in data.groupby(col):
                counts=sub['family'].value_counts(); total=len(sub)
                overall.append({'sample':label,'bucket':f'{col}={val}','n':total,'high_desc':int(counts.get('high_desc',0)),'low_asc':int(counts.get('low_asc',0)),'high_desc_pct':counts.get('high_desc',0)/total,'low_asc_pct':counts.get('low_asc',0)/total})
    overall=pd.DataFrame(overall)
    overall.to_csv(OUT/'gap_family_overall.csv', index=False)
    print('SUMMARY')
    print(summary.to_string(index=False, formatters={'high_desc_pct':'{:.1%}'.format,'low_asc_pct':'{:.1%}'.format,'median_gap':'{:.1f}'.format}))
    print('\nOVERALL')
    print(overall.to_string(index=False, formatters={'high_desc_pct':'{:.1%}'.format,'low_asc_pct':'{:.1%}'.format}))
    print('\nFirst reaction days:', len(first), 'All reactions:', len(ev), 'RTH days:', len(daily))

if __name__ == '__main__':
    main()
