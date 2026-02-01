import yfinance as yf # type: ignore
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

# default asx sector indices
SECTOR_MAPPING = {
    "Financials": "^AXFJ",
    "Materials": "^AXMJ",
    "Health Care": "^AXHJ",
    "Real Estate": "^AXRE",
    "Info Tech": "^AXIJ",
    "Energy": "^AXEJ",
    "Discretionary": "^AXDJ",
    "Staples": "^AXSJ",
    "Telecom": "^AXTJ",
    "Utilities": "^AXUJ"
}

# cache to prevent yahoo rate limiting
CACHE = {
    "data": None,
    "timestamp": None
}

def calculate_rrg(tickers=None, benchmark="^AXJO", period="6mo", step=5, tail_length=10):
    """
    calculates rrg (relative rotation graph) coordinates.
    
    tickers : list of ticker symbols
    benchmark : benchmark ticker
    period : history period
    step : interval between tail points (1=daily, 5=weekly)
    tail_length : number of points in the tail
    """
    global CACHE

    # check if defaults are requested and cache is valid
    is_default_request = (tickers is None) and (step == 5) and (tail_length == 10)
    
    if is_default_request:
        if CACHE["data"] and CACHE["timestamp"]:
            # 1h cache
            if (datetime.now() - CACHE["timestamp"] < timedelta(hours=1)):
                return CACHE["data"]

    if tickers is None:
        # use sector dict values
        target_tickers = list(SECTOR_MAPPING.values())
        reverse_map = {v: k for k, v in SECTOR_MAPPING.items()}
    else:
        target_tickers = tickers
        reverse_map = {}

    # fetch data for all tickers + benchmark
    all_symbols = target_tickers + [benchmark]
    
    # stringify for yf
    tickers_str = " ".join(all_symbols)
    
    try:
        data = yf.download(tickers_str, period=period, progress=False)['Close']
    except Exception as e:
        print(f"error fetching data: {e}")
        return []

    if data.empty:
        return []

    # clean data (ffill to handle missing days)
    data = data.ffill().dropna()
    
    if benchmark not in data.columns:
        print(f"benchmark {benchmark} data missing")
        return []

    results = []

    # calculate rrg for each ticker
    for ticker in target_tickers:
        if ticker not in data.columns:
            continue
            
        # calculate relative strength (price / indexprice)
        rs = data[ticker] / data[benchmark]
        
        # calculate rs-ratio (x-axis)
        # normalise: divide by 100-day ma of rs
        # multiply by 100 to center around 100
        rs_mean = rs.rolling(window=100).mean()
        rs_ratio = 100 * (rs / rs_mean)
        
        # calculate rs-momentum (y-axis)
        # rate of change of rs-ratio
        # generic: ((current - prev) / prev) * 100
        rs_momentum = 100 * ((rs_ratio / rs_ratio.shift(10)) - 1)
        
        # combine into dataframe to slice
        df_ticker = pd.DataFrame({
            "ratio": rs_ratio,
            "momentum": rs_momentum
        }).dropna()
        
        if df_ticker.empty:
            continue
            
        # ensure we have enough data for the requested tail
        required_days = step * tail_length
        tail_data = df_ticker.tail(required_days + 5) # +buffer
        
        iloc_indices = range(len(tail_data) - 1, -1, -step) # backwards every `step`
        selected_indices = sorted(list(iloc_indices))
        
        comet_tail = []
        for idx in selected_indices:
            row = tail_data.iloc[idx]
            date = tail_data.index[idx]
            comet_tail.append({
                "x": round(float(row["ratio"]), 2),
                "y": round(float(row["momentum"]), 2),
                "date": date.strftime("%Y-%m-%d")
            })
            
        # limit to exactly requested length 
        comet_tail = comet_tail[-tail_length:]
        
        name = reverse_map.get(ticker, ticker)
        
        results.append({
            "ticker": ticker,
            "name": name,
            "tail": comet_tail,
            "current_x": comet_tail[-1]["x"] if comet_tail else 0, # head x
            "current_y": comet_tail[-1]["y"] if comet_tail else 0, # head y
        })
    
    # update cache if using defaults
    if is_default_request:
        CACHE["data"] = results
        CACHE["timestamp"] = datetime.now()
        
    return results

if __name__ == "__main__":
    # test
    res = calculate_rrg()
    print(res[:1])
