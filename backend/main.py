from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_, func # type: ignore
from sqlalchemy.orm import Session # type: ignore
from database import engine, get_db, SessionLocal
from ingestor import run_market_engine, is_market_open, get_engine_status
from scanner_engine import scan_market
import models
import asyncio
import yfinance as yf # type: ignore
import pandas as pd
import numpy as np 
import feedparser # type: ignore 
import re 
import urllib.parse
import requests
from openai import OpenAI, AsyncOpenAI
import os
import json
from datetime import datetime
from agent_tools import AVAILABLE_TOOLS, get_current_time
from pydantic import BaseModel # Add this at top if missing
from dotenv import load_dotenv
import logging

# suppress noise from polling endpoints
class PollingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        # noisy endpoints to suppress
        noisy_endpoints = ["/account", "/watchlist", "/transactions", "/alerts/triggered", "/scraper-status", "/stocks", "/global-markets"]
        return not any(endpoint in msg for endpoint in noisy_endpoints)

logging.getLogger("uvicorn.access").addFilter(PollingFilter())
from newspaper import Article, Config  # type: ignore
from readability import Document # type: ignore
from contextlib import asynccontextmanager
from playwright.async_api import async_playwright
from stream_utils import set_stream_queue 
from stream_utils import set_stream_queue 
import briefing 
import filings 

load_dotenv()
HACKCLUB_API_KEY = os.getenv("HACKCLUB_API_KEY")

if not HACKCLUB_API_KEY:
    print("warning - HACKCLUB_API_KEY isn't set") 

client = OpenAI(
    base_url="https://ai.hackclub.com/proxy/v1",
    api_key=HACKCLUB_API_KEY
)

async_client = AsyncOpenAI(
    base_url="https://ai.hackclub.com/proxy/v1",
    api_key=HACKCLUB_API_KEY
)

# create tables upon startup
models.Base.metadata.create_all(bind=engine)

# global scan cache
SCAN_CACHE = []
LAST_SCAN_TIME = None

# briefing cache (1 hour expiry)
BRIEFING_CACHE = {
    "data": None,
    "timestamp": 0
}




async def alert_monitor_task():
    """
    background loop that checks active alerts every 10 seconds
    """
    print("🔔 [Alerts] Monitor starting...")
    while True:
        try:
            # create dedicated session
            db = SessionLocal()
            try:
                active_alerts = db.query(models.Alert).filter(models.Alert.status == "ACTIVE").all()
                
                if active_alerts:
                    # tickers to check
                    tickers = list(set([a.ticker for a in active_alerts]))
                    
                    for ticker in tickers:
                        # fetch price
                        try:
                            t_obj = yf.Ticker(f"{ticker}.AX")
                            current_price = t_obj.fast_info['last_price']
                        except:
                            # fallback
                            try:
                                current_price = t_obj.history(period='1d')['Close'].iloc[-1]
                            except:
                                print(f"⚠️ [Alerts] failed to fetch price for {ticker}")
                                continue
                        
                        # check conditions
                        relevant_alerts = [a for a in active_alerts if a.ticker == ticker]
                        for alert in relevant_alerts:
                            triggered = False
                            if alert.condition == "ABOVE" and current_price >= alert.target_price:
                                triggered = True
                            elif alert.condition == "BELOW" and current_price <= alert.target_price:
                                triggered = True
                                
                            if triggered:
                                print(f"🚨 [Alerts] triggered: {alert.ticker} is {alert.condition} {alert.target_price} (Current: {current_price})")
                                alert.status = "TRIGGERED"
                                db.commit()
                                
            finally:
                db.close()

            await asyncio.sleep(10) # check every 10s
            
        except Exception as e:
            print(f"[Alerts] monitor error: {e}")
            await asyncio.sleep(10)

async def scanner_background_task():
    """
    background loop that updates the market scan every 15 minutes.
    this prevents the /scanner/run endpoint from hanging.
    """
    global SCAN_CACHE
    global LAST_SCAN_TIME
    
    while True:
        try:
            print("🔄 [Background] starting market scan...")
            # create dedicated session
            db = SessionLocal()
            try:
                stocks = db.query(models.Stock).all()
                if not stocks:
                    print("⚠️ [Background] no stocks found to scan.")
                    await asyncio.sleep(60) 
                    continue

                tickers = [f"{s.ticker}.AX" for s in stocks]
                results = scan_market(tickers)
                
                # update cache
                SCAN_CACHE = sorted(results, key=lambda x: x.get('score', 0), reverse=True)
                LAST_SCAN_TIME = datetime.now()
                print(f"✅ [Background] scan complete. {len(SCAN_CACHE)} signals found.")
                
            finally:
                db.close()
                
            # sleep for 15m
            await asyncio.sleep(900)
            
        except Exception as e:
            print(f"[Background] scanner failed: {e}")
            await asyncio.sleep(60) # retry in 1m upon fail

@asynccontextmanager
async def lifespan(app: FastAPI):
    # start the scraper in the background
    print("[🦘] kangaroo engine starting...")
    scraper_task = asyncio.create_task(run_market_engine())
    scanner_task = asyncio.create_task(scanner_background_task())
    alerts_task = asyncio.create_task(alert_monitor_task())
    
    yield  # runs here
    
    # ensure shutdown - scraper prkoperly cancelled upon ctrl+c press
    print("[🦘] kangaroo engine shutting down...")
    scraper_task.cancel()
    scanner_task.cancel()
    alerts_task.cancel()
    try:
        await scraper_task
        await scanner_task
        await alerts_task
    except asyncio.CancelledError:
        pass # cancelled successfully

app = FastAPI(lifespan=lifespan)

# cors - allows Next.js frontend to talk to backend 
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "kangaroo engine running"}

@app.get("/market-status")
async def get_market_status():
    """returns whether the asx is currently open"""
    return {"is_open": is_market_open()}

@app.get("/scraper-status")
async def get_scraper_status_endpoint():
    """returns the internal status of the scraper engine"""
    return get_engine_status()

@app.get("/stocks")
def get_stocks(db: Session = Depends(get_db)):
    # returns stocks sorted by market cap (biggest first)
    return db.query(models.Stock).order_by(models.Stock.market_cap.desc()).all()

@app.get("/search")
def search_stocks(q: str, db: Session = Depends(get_db)):
    """
    Search stocks by Ticker or Name.
    Case insensitive. Limits to 5 results for dropdown.
    """
    if not q:
        return []
    
    # ilike is case-insensitive
    results = db.query(models.Stock).filter(
        or_(
            models.Stock.ticker.ilike(f"%{q}%"),
            models.Stock.name.ilike(f"%{q}%")
        )
    ).limit(5).all()
    
    return results

@app.get("/stock/{ticker}")
def get_stock(ticker: str, db: Session = Depends(get_db)):
    stock = db.query(models.Stock).filter(models.Stock.ticker == ticker.upper()).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")
    return stock

@app.get("/stock/{ticker}/history") 
def get_stock_history(ticker: str, period: str = "1mo", interval: str = "1d"):
    try:
        symbol = f"{ticker.upper()}.AX" if not ticker.endswith(".AX") else ticker.upper()
        
        stock = yf.Ticker(symbol)
        hist = stock.history(period=period, interval=interval)
        hist.reset_index(inplace=True) 
        
        # check for invalid stock
        if hist.empty:
            raise HTTPException(status_code=404, detail="Stock not found or delisted")
        
        # calculate technical indicators
        if len(hist) > 0:
            hist['SMA_50'] = hist['Close'].rolling(window=50).mean()
            hist['SMA_200'] = hist['Close'].rolling(window=200).mean()
            hist['EMA_20'] = hist['Close'].ewm(span=20, adjust=False).mean()
            
            hist['BB_Middle'] = hist['Close'].rolling(window=20).mean()
            std_dev = hist['Close'].rolling(window=20).std()
            hist['BB_Upper'] = hist['BB_Middle'] + (2 * std_dev)
            hist['BB_Lower'] = hist['BB_Middle'] - (2 * std_dev)
            
            hist = hist.replace({float('nan'): None})

        data = []
        for index, row in hist.iterrows():
            if 'Datetime' in row:
                t = int(row['Datetime'].timestamp())
            elif 'Date' in row:
                t = row['Date'].strftime('%Y-%m-%d')
            else:
                continue
            
            data.append({
                "time": t,
                "open": row['Open'],
                "high": row['High'],
                "low": row['Low'],
                "close": row['Close'],
                "volume": row['Volume'],
                "sma50": row.get('SMA_50'),
                "sma200": row.get('SMA_200'),
                "ema20": row.get('EMA_20'),
                "bb_upper": row.get('BB_Upper'),
                "bb_lower": row.get('BB_Lower')
            })
            
        return data

    # re-raise 404s
    except HTTPException as http_e:
        raise http_e
    
    # 500
    except Exception as e:
        print(f"error fetching the history: {e}")
        raise HTTPException(status_code=500, detail="failed to fetch the history")
    
@app.get("/stock/{ticker}/info")
def get_stock_info(ticker: str):
    """gets static company profile data (description, sector, industry, website)"""
    try:
        # .AX for aussie stocks once again
        symbol = f"{ticker.upper()}.AX"
        dat = yf.Ticker(symbol)

        # .info dictionary
        info = dat.info

        return {
            "description": info.get('longBusinessSummary', 'No description available.'),
            "sector": info.get('sector', 'Unknown'),
            "industry": info.get('industry', 'Unknown'),
            "website": info.get('website', 'Unknown'),
            "employees": info.get('fullTimeEmployees', 'Unknown')
        }
    except Exception as e:
        print(f"error fetching info for {ticker}: {e}")
        return {"description": "Profile data unavailable"}

# google news rss feed reader
@app.get("/stock/{ticker}/news")
def get_stock_news(ticker: str):
    try:
        query = f"{ticker} ASX stock news"
        encoded_query = urllib.parse.quote(query)
        rss_url = f"https://news.google.com/rss/search?q={encoded_query}&ceid=AU:en&hl=en-AU&gl=AU"
        
        feed = feedparser.parse(rss_url)
        news_items = []
        
        for entry in feed.entries[:12]:
            # clean title (remove website name)
            title = entry.title
            source_name = entry.source.title if 'source' in entry else ""
            if source_name and title.endswith(f" - {source_name}"):
                 title = title[:-len(f" - {source_name}")]
            
            # clean summary (remove html tags)
            raw_summary = entry.summary if 'summary' in entry else ""
            clean_summary = re.sub('<[^<]+?>', '', raw_summary) 
            
            # get source url to pull favicon later
            source_url = entry.source.get('url', '')
            
            news_items.append({
                "id": entry.id,
                "content": {
                    "title": title,
                    "summary": clean_summary,
                    "pubDate": entry.published,
                    "clickThroughUrl": {
                        "url": entry.link
                    },
                    "provider": {
                        "displayName": source_name,
                        "url": source_url
                    }
                }
            })
            
        return news_items
    except Exception as e:
        print(f"Error fetching Google News: {e}")
        return []

@app.get("/stock/{ticker}/financials")
def get_stock_financials(ticker: str):
    """fetches annual income statement for the stock"""
    try:
        symbol = f"{ticker.upper()}.AX"
        stock = yf.Ticker(symbol)
        
        # get annual income statement
        financials = stock.income_stmt
        
        # clean up data: NaN/Inf -> None
        financials = financials.replace({float('nan'): None, float('inf'): None, float('-inf'): None})
        financials = financials.where(pd.notnull(financials), None)
        
        # convert columns (dates) to strings so JSON can handle them
        financials.columns = [col.strftime('%Y-%m-%d') for col in financials.columns]
        
        # return as a directory
        return financials.to_dict()
    except Exception as e:
        print(f"Error fetching financials: {e}")
        return {}

@app.get("/stock/{ticker}/corporate")
def get_corporate_data(ticker: str):
    """
    fetches dividends, officers, and shareholder ownership
    """
    try:
        symbol = f"{ticker.upper()}.AX"
        stock = yf.Ticker(symbol)
        
        # dividends
        divs = stock.dividends
        div_history = []
        if not divs.empty:
            recent_divs = divs.sort_index(ascending=False).head(10)
            recent_divs = recent_divs.sort_index()
            for date, value in recent_divs.items():
                div_history.append({
                    "date": date.strftime('%Y-%m-%d'),
                    "amount": value
                })

        # company officers
        officers = stock.info.get('companyOfficers', [])
        clean_officers = []
        for o in officers[:5]:
            clean_officers.append({
                "name": o.get('name', 'Unknown'),
                "title": o.get('title', 'Executive'),
                "pay": o.get('totalPay', 0),
                "year_born": o.get('yearBorn', None)
            })

        # ownership data
        ownership = {
            "insiders": 0,
            "institutions": 0,
            "public": 100
        }
        
        try:
            holders = stock.major_holders
            if holders is not None and not holders.empty:
                for index, row in holders.iterrows():
                    label = str(row.iloc[1]) 
                    val = str(row.iloc[0]).replace('%', '') 
                    
                    try:
                        val_float = float(val)
                    except:
                        val_float = 0.0

                    if "insiders" in label.lower():
                        ownership["insiders"] = val_float
                    elif "institutions" in label.lower():
                        ownership["institutions"] = val_float
                
                ownership["public"] = max(0, 100 - ownership["insiders"] - ownership["institutions"])
        except Exception as e:
            print(f"Holders error: {e}")

        # top institutions
        institutions = []
        try:
            inst_df = stock.institutional_holders
            if inst_df is not None and not inst_df.empty:
                for idx, row in inst_df.head(5).iterrows():
                    institutions.append({
                        "holder": row.get('Holder', 'Unknown'),
                        "shares": row.get('Shares', 0),
                        "value": row.get('Value', 0),
                        "percent": (row.get('Shares', 0) / stock.info.get('sharesOutstanding', 1)) * 100
                    })
        except Exception as e:
            print(f"Inst holders error: {e}")

        return {
            "dividends": div_history,
            "officers": clean_officers,
            "ownership": ownership,
            "institutions": institutions
        }

    except Exception as e:
        print(f"Corporate data error: {e}")
        return {"dividends": [], "officers": [], "ownership": {}, "institutions": []}

@app.get("/read-article")
async def read_article(url: str):
    browser = None
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = await context.new_page()
            
            print(f"navigating to: {url}")
            await page.goto(url, timeout=20000)
            
            # wait for redirect angd content load
            try:
                await page.wait_for_load_state("domcontentloaded", timeout=15000)
                if "google.com" in page.url:
                    await page.wait_for_timeout(3000)
            except Exception:
                pass

            final_url = page.url
            html_content = await page.content()
            await browser.close()

            #  newspaper3k for metadata extraction
            article_meta = Article(final_url)
            article_meta.download(input_html=html_content)
            article_meta.parse()

            # readability for actual content
            doc = Document(html_content)
            clean_html = doc.summary() # <div>/<table>/<b> preserved
            clean_title = doc.title()

            return {
                "title": clean_title,
                # fallback to newspaper image if readability doesn't provide one (i think it usually doesn't)
                "top_image": article_meta.top_image,
                "authors": article_meta.authors,
                "publish_date": article_meta.publish_date,
                "html": clean_html
            }

    except Exception as e:
        print(f"error reading the article: {e}")
        if browser:
            await browser.close()
        raise HTTPException(status_code=500, detail="failed to process the article")
    
@app.get("/stock/{ticker}/analyse")
async def analyse_stock(ticker: str):
    """
    gathers price, news & financials & sends to google gemini to generate a report
    """
    try:
        # gather intelligence
        news = await asyncio.to_thread(get_stock_news, ticker) # googlenews scraper
        financials = await asyncio.to_thread(get_stock_financials, ticker) # yfinance fetcher
        info = await asyncio.to_thread(get_stock_info, ticker)
                
        news_context = []
        for n in news:
            title = n['content']['title']
            date = n['content']['pubDate']
            summary = n['content']['summary']
            news_context.append(f"- [{date}] {title}\n Summary: {summary}")

        news_summary = "\n".join(news_context)

        # format financials
        latest_year = sorted(financials.keys())[-1] if financials else "N/A"
        fin_summary = f"Latest Financials ({latest_year}): {financials[latest_year]}" if financials else "Data Unavailable"

        prompt = f"""
        You are KANGAROO, a ruthless, high-frequency trading AI analyst for the ASX. 
        Analyse {ticker} based on the provided data.
        
        ### COMPANY PROFILE
        {info.get('description', '')}
        
        ### LATEST NEWS HEADLINES
        {news_summary}
        
        ### FINANCIAL DATA
        {fin_summary}
        
        ### INSTRUCTIONS
        Write a concise, executive summary.
        **IMPORTANT: Output your response in clean HTML format (no markdown backticks).** 
        Use <h3> for headers, <p> for paragraphs, <ul>/<li> for lists, and <strong> for emphasis.
        
        Structure:
        1. <h3>Sentiment</h3>: Bullish, Bearish, or Neutral? (Be decisive).
        2. <h3>The Catalyst</h3>: What is the driver?
        3. <h3>Risk Factors</h3>: What is the danger?
        4. <h3>Verdict</h3>: One sentence conclusion.
        
        Keep it professional, data-driven, accurate, and under 200 words.
        """

        response = await async_client.chat.completions.create(
            model="google/gemini-3-pro-preview", 
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        
        return {"report": response.choices[0].message.content}

    except Exception as e:
        print(f"AI Error: {e}")
        return {"report": "## ⚠️ System Offline\nKangaroo Neural Net could not connect to the mainframe."}
    
@app.get("/stock/{ticker}/valuation")
def get_stock_valuation(ticker: str):
    """ 
    fetches inputs for dcf model and analyst targets
    """
    try:
        symbol = f"{ticker.upper()}.AX"
        stock = yf.Ticker(symbol)
        info = stock.info
        
        # get cash flow and balance sheet
        cf = stock.cashflow.fillna(0)
        bs = stock.balance_sheet.fillna(0)
        
        try:
            latest_ocf = cf.loc['Operating Cash Flow'].iloc[0]
            latest_capex = cf.loc['Capital Expenditure'].iloc[0]
            fcf = latest_ocf + latest_capex
        except:
            fcf = 0
            
        try:
            total_debt = bs.loc['Total Debt'].iloc[0]
            cash = bs.loc['Cash And Cash Equivalents'].iloc[0]
        except:
            total_debt = 0
            cash = 0
            
        # get analyst targets
        targets = {
            "low": info.get('targetLowPrice'),
            "high": info.get('targetHighPrice'),
            "mean": info.get('targetMeanPrice'),
            "median": info.get('targetMedianPrice'),
            "recommendation": info.get('recommendationKey', 'none').replace('_', ' ').title()
        }

        return {
            # dcf inputs
            "fcf": fcf,
            "total_debt": total_debt,
            "cash": cash,
            "shares_outstanding": info.get('sharesOutstanding', 0),
            "beta": info.get('beta', 1.0),
            "current_price": info.get('currentPrice', 0.0),
            "currency": info.get('currency', 'AUD'),
            
            # analyst inputs
            "targets": targets
        }

    except Exception as e:
        print(f"Error fetching valuation data: {e}")
        return {"error": "Valuation data unavailable"}

@app.get("/market-movers")
def get_market_movers(db: Session = Depends(get_db)):
    """returns top 5 gainers & losers"""

    all_stocks = db.query(models.Stock).all()
    
    # clean percentage string
    def parse_change(s):
        try:
            return float(s.ticker.replace('%', '').replace(',', '')) if s.change_percent else 0.0
        except:
            try:
                return float(str(s.change_percent).replace('%', ''))
            except:
                return 0.0

    # sort
    sorted_stocks = sorted(all_stocks, key=parse_change, reverse=True)
    
    return {
        "gainers": sorted_stocks[:5],
        "losers": sorted_stocks[-5:][::-1] # reverse to show worst first
    }

@app.get("/sector-performance")
def get_sector_performance(db: Session = Depends(get_db)):
    """
    nested tree: sector -> stocks
    for the heatmap
    """
    all_stocks = db.query(models.Stock).all()
    
    def parse_cap(cap_str):
        if not cap_str: return 0.0
        s = str(cap_str).upper().replace('$', '').replace(',', '')
        try:
            if 'T' in s: return float(s.replace('T', '')) * 1_000_000_000_000
            if 'B' in s: return float(s.replace('B', '')) * 1_000_000_000
            if 'M' in s: return float(s.replace('M', '')) * 1_000_000
            if 'K' in s: return float(s.replace('K', '')) * 1_000
            return float(s)
        except:
            return 0.0

    sectors = {}
    
    for stock in all_stocks:
        # filter junk data
        if not stock.sector or stock.sector == "Unknown":
            continue
        
        # parse numbers
        try:
            change = float(str(stock.change_percent).replace('%', ''))
        except:
            change = 0.0
        
        mcap = parse_cap(stock.market_cap)
        
        # filter out tiny stocks to make the map clean (skip under 100m market cap)
        if mcap < 100_000_000: 
            continue

        if stock.sector not in sectors:
            sectors[stock.sector] = []
        
        # add stock as a child
        sectors[stock.sector].append({
            "name": stock.ticker,
            "size": mcap,       # box size
            "change": change,   # box color
            "fullName": stock.name
        })
    
    # format for recharts
    results = []
    for sec_name, stocks in sectors.items():
        stocks.sort(key=lambda x: x['size'], reverse=True)
        
        # total sector size
        total_sector_size = sum(s['size'] for s in stocks)
        
        results.append({
            "name": sec_name,
            "children": stocks, 
            "size": total_sector_size 
        })
    
    return sorted(results, key=lambda x: x["size"], reverse=True)

@app.post("/stock/{ticker}/toggle-watch")
async def toggle_watchlist(ticker: str, db: Session = Depends(get_db)):
    """star/unstar stock"""
    stock = db.query(models.Stock).filter(models.Stock.ticker == ticker.upper()).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")
    
    stock.is_watched = not stock.is_watched
    db.commit()
    
    return {"is_watched": stock.is_watched}

@app.get("/watchlist")
def get_watchlist(db: Session = Depends(get_db)):
    """returns watched stocks"""
    return db.query(models.Stock).filter(models.Stock.is_watched == True).all()

@app.get("/calendar/upcoming")
def get_upcoming_calendar(db: Session = Depends(get_db)):
    """
    scans watchlist & portfolio for upcoming corporate events (earnings, dividends).
    """
    # gather unique tickers
    watched = db.query(models.Stock).filter(models.Stock.is_watched == True).all()
    holdings = db.query(models.Holding).all()
    
    tickers = set([s.ticker for s in watched] + [h.ticker for h in holdings])
    
    events = []
    today = datetime.now().date()
    
    # scan each ticker
    for ticker in tickers:
        try:
            symbol = f"{ticker}.AX"
            stock = yf.Ticker(symbol)
            cal = stock.calendar
            
            # earnings 
            earnings_date = None
            note = ""
            
            if cal and 'Earnings Date' in cal:
                ed = cal['Earnings Date']
                # handle list
                if isinstance(ed, list) and len(ed) > 0:
                    earnings_date = ed[0]
                elif ed:
                    earnings_date = ed
            
            if earnings_date:
                # ensure it's a date object
                if hasattr(earnings_date, 'date'):
                    earnings_date = earnings_date.date()
                    
                if earnings_date >= today:
                    events.append({
                        "ticker": ticker,
                        "type": "EARNINGS",
                        "date": earnings_date.strftime("%Y-%m-%d"),
                        "note": "Estimated" 
                    })

            # dividends
            ex_div = cal.get('Ex-Dividend Date') if cal else None
            is_estimated = False
            
            # convert to date if needed
            if ex_div and hasattr(ex_div, 'date'):
                ex_div = ex_div.date()
            
            # if there isn't an ex-div date then estimate based on dividend history
            if not ex_div or ex_div < today:
                try:
                    divs = stock.dividends
                    if not divs.empty:
                        last_div_date = divs.index[-1].date()
                        # +6 months (182 days) prediction for interim/final dividend
                        next_est = last_div_date + pd.Timedelta(days=182)
                        if next_est >= today:
                            ex_div = next_est
                            is_estimated = True
                except Exception as e:
                    print(f"  Dividend estimation error for {ticker}: {e}")
                    pass
            
            if ex_div and ex_div >= today:
                events.append({
                    "ticker": ticker,
                    "type": "DIVIDEND",
                    "date": ex_div.strftime("%Y-%m-%d"),
                    "note": "Estimated" if is_estimated else "Confirmed"
                })
                     
        except Exception as e:
            print(f"Calendar scan error for {ticker}: {e}")
            import traceback
            traceback.print_exc()
            continue

    # sort by date (nearest first)
    events.sort(key=lambda x: x['date'])
    
    print(f"[Calendar] Found {len(events)} total events for {len(tickers)} tickers")
    for evt in events[:5]:  # log the first 5 events
        print(f"  - {evt['ticker']}: {evt['type']} on {evt['date']}")
    
    return events

# cache for macro calendar
macro_cache = {
    "data": [],
    "last_updated": datetime.min
}
CACHE_TTL_MINUTES = 30

@app.get("/macro/calendar")
async def get_macro_calendar():
    """
    Fetches economic calendar from ForexFactory XML feed with 30-min caching.
    """
    global macro_cache
    
    # check cache
    now = datetime.now()
    if (now - macro_cache["last_updated"]).total_seconds() < CACHE_TTL_MINUTES * 60:
        if macro_cache["data"]:
            return macro_cache["data"]

    try:
        url = "https://nfs.faireconomy.media/ff_calendar_thisweek.xml"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        response = requests.get(url, timeout=10, headers=headers)
        
        if response.status_code != 200:
            return macro_cache["data"] # return stale cache if error
            
        import xml.etree.ElementTree as ET
        root = ET.fromstring(response.content)
        
        events = []
        # currencies relevant to ASX
        relevant_currencies = ["AUD", "USD", "CNY", "EUR", "JPY"]
        
        for event in root.findall('event'):
            country_el = event.find('country')
            country = country_el.text if country_el is not None else ""
            
            if country in relevant_currencies:
                title_el = event.find('title')
                impact_el = event.find('impact')
                date_el = event.find('date')
                time_el = event.find('time')
                
                title = title_el.text if title_el is not None else "Unknown Event"
                impact = impact_el.text if impact_el is not None else "Low"
                date_str = date_el.text if date_el is not None else ""
                time_str = time_el.text if time_el is not None else ""
                
                # format date to YYYY-MM-DD
                try:
                    dt = datetime.strptime(date_str, "%m-%d-%Y")
                    formatted_date = dt.strftime("%Y-%m-%d")
                except:
                    formatted_date = date_str

                forecast_el = event.find('forecast')
                forecast = forecast_el.text if forecast_el is not None else ""

                events.append({
                    "title": title,
                    "country": country,
                    "date": formatted_date,
                    "time": time_str,
                    "impact": impact,
                    "forecast": forecast
                })
        
        # update cache
        macro_cache["data"] = events
        macro_cache["last_updated"] = now
        
        return events
        
    except Exception as e:
        print(f"Macro calendar error: {e}")
        return []

@app.get("/portfolio")
async def get_portfolio(db: Session = Depends(get_db)):
    """
    returns holdings with live price data and P&L calculations
    """
    holdings = db.query(models.Holding).all()
    results = []
    
    for h in holdings:
        # fetch live price from stock table
        stock = db.query(models.Stock).filter(models.Stock.ticker == h.ticker).first()
        current_price = stock.price if stock else 0.0
        
        # calculate value
        market_value = current_price * h.shares
        cost_basis = h.avg_cost * h.shares
        pnl = market_value - cost_basis
        pnl_percent = (pnl / cost_basis) * 100 if cost_basis > 0 else 0
        
        results.append({
            "id": h.id,
            "ticker": h.ticker,
            "name": stock.name if stock else "Unknown",
            "sector": stock.sector if stock else "Unknown", 
            "shares": h.shares,
            "avg_cost": h.avg_cost,
            "current_price": current_price,
            "market_value": market_value,
            "pnl": pnl,
            "pnl_percent": pnl_percent
        })
        
    return results

@app.get("/portfolio/analytics")
async def get_portfolio_analytics(db: Session = Depends(get_db)):
    """
    returns breakdown of portfolio by sector & asset class
    """
    holdings = db.query(models.Holding).all()
    
    sector_exposure = {}
    total_equity = 0.0
    
    for h in holdings:
        stock = db.query(models.Stock).filter(models.Stock.ticker == h.ticker).first()
        current_price = stock.price if stock else h.avg_cost
        market_value = h.shares * current_price
        
        sector = stock.sector if stock and stock.sector else "Cash/Unknown"
        
        if sector not in sector_exposure:
            sector_exposure[sector] = 0.0
        
        sector_exposure[sector] += market_value
        total_equity += market_value
    
    # calculate percentages
    results = []
    for sec, value in sector_exposure.items():
        results.append({
            "name": sec,
            "value": round(value, 2),
            "percent": round((value / total_equity) * 100, 2) if total_equity > 0 else 0
        })
        
    return sorted(results, key=lambda x: x["value"], reverse=True)

# risk analysis endpoints
@app.get("/portfolio/risk")
async def get_portfolio_risk(db: Session = Depends(get_db)):
    """
    Calculates Portfolio Beta and Correlation Matrix.
    This is computationally expensive, so it might take a few seconds.
    """
    try:
        holdings = db.query(models.Holding).all()
        if not holdings:
            return {"error": "No holdings to analyse"}

        tickers = [h.ticker for h in holdings]
        # add the benchmark (asx200)
        tickers.append("^AXJO")
        
        # add .AX suffix for aussie stocks (except the index)
        yf_tickers = [f"{t}.AX" if not t.startswith("^") else t for t in tickers]
        
        # fetch 1y of history for all assets
        data = yf.download(yf_tickers, period="1y", interval="1d", progress=False)['Close']
        
        if data.empty:
            return {"error": "Could not fetch data"}

        # calculate daily returns (percentage change)
        returns = data.pct_change(fill_method=None).dropna()
        
        # calculate correlation
        corr_matrix = returns.corr()
        
        # format correlation for frontend heatmap
        correlation_data = []
        clean_tickers = [t.replace(".AX", "") for t in tickers] # Remove .AX for display
        
        for i, tick_x in enumerate(clean_tickers):
            # don't show index in correlation map
            if tick_x == "^AXJO": continue
            
            for j, tick_y in enumerate(clean_tickers):
                if tick_y == "^AXJO": continue
                
                # yfinance uses the .AX names in the columns
                col_x = f"{tick_x}.AX" if tick_x != "^AXJO" else "^AXJO"
                col_y = f"{tick_y}.AX" if tick_y != "^AXJO" else "^AXJO"
                
                try:
                    val = corr_matrix.loc[col_x, col_y]
                    correlation_data.append({
                        "x": tick_x,
                        "y": tick_y,
                        "value": round(val, 2)
                    })
                except KeyError:
                    continue

        # calculate portfolio beta 
        # beta = covariance(portfolio, market) / variance(market)
        
        market_returns = returns["^AXJO"]
        portfolio_beta = 0.0
        total_value = 0.0
        
        # calculate current total value to get weights
        holding_values = {}
        for h in holdings:
            # use the last available price in our downloaded data
            try:
                last_price = data[f"{h.ticker}.AX"].iloc[-1]
                val = h.shares * last_price
                holding_values[h.ticker] = val
                total_value += val
            except:
                continue
                
        # weighted beta sum
        stock_betas = []
        for h in holdings:
            if h.ticker not in holding_values: continue
            
            col = f"{h.ticker}.AX"
            # stock beta vs market
            # covariance of stock vs market / varaince of market
            cov = returns[[col, "^AXJO"]].cov().iloc[0, 1]
            var = market_returns.var()
            beta = cov / var
            
            weight = holding_values[h.ticker] / total_value
            portfolio_beta += beta * weight
            
            stock_betas.append({"ticker": h.ticker, "beta": round(beta, 2)})

        return {
            "portfolio_beta": round(portfolio_beta, 2),
            "stock_betas": stock_betas,
            "correlation_matrix": correlation_data,
            "risk_level": "High" if portfolio_beta > 1.3 else "Low" if portfolio_beta < 0.8 else "Moderate"
        }

    except Exception as e:
        print(f"Risk analysis error: {e}")
        return {"error": str(e)}

@app.get("/account")
async def get_account(db: Session = Depends(get_db)):
    # create account if it doesn't exist
    account = db.query(models.Account).first()
    if not account:
        account = models.Account(balance=100000.0)
        db.add(account)
        db.commit()
    
    # calculate total equity (cash + stock value)
    holdings = db.query(models.Holding).all()
    stock_value = 0.0
    for h in holdings:
        stock = db.query(models.Stock).filter(models.Stock.ticker == h.ticker).first()
        current_price = stock.price if stock else h.avg_cost
        stock_value += h.shares * current_price

    return {
        "cash": account.balance,
        "stock_value": stock_value,
        "total_equity": account.balance + stock_value,
        "buying_power": account.balance # for now, 1:1 leverage
    }

class Order(BaseModel):
    ticker: str
    shares: int
    price: float # limit price or current price
    type: str # "BUY" or "SELL"

@app.post("/trade")
async def execute_trade(order: Order, db: Session = Depends(get_db)):
    """
    executes a trade with validation:
    checks market hours
    checks sufficient funds
    updates portfolio cost basis
    updates 'last price' 
    """

    # market always open for the sake of testing; uncomment this later
    # if not is_market_open():
    #     raise HTTPException(status_code=400, detail="Market is Closed. Orders cannot be executed.")

    account = db.query(models.Account).first()
    if not account:
        account = models.Account(balance=100000.0)
        db.add(account)
    
    total_cost = order.shares * order.price

    if order.type == "BUY":
        if account.balance < total_cost:
            raise HTTPException(status_code=400, detail=f"Insufficient Buying Power. Cost: ${total_cost}, Available: ${account.balance}")
        
        # deduct cash
        account.balance -= total_cost
        
        # update holding
        holding = db.query(models.Holding).filter(models.Holding.ticker == order.ticker).first()
        if holding:
            # weighted average cost logic
            current_total_value = holding.shares * holding.avg_cost
            new_total_value = current_total_value + total_cost
            total_shares = holding.shares + order.shares
            
            holding.shares = total_shares
            holding.avg_cost = new_total_value / total_shares
        else:
            new_holding = models.Holding(ticker=order.ticker, shares=order.shares, avg_cost=order.price)
            db.add(new_holding)

    elif order.type == "SELL":
        holding = db.query(models.Holding).filter(models.Holding.ticker == order.ticker).first()
        if not holding or holding.shares < order.shares:
            raise HTTPException(status_code=400, detail="Insufficient Shares")
        
        # add cash
        account.balance += total_cost
        
        # deduct shares
        holding.shares -= order.shares
        if holding.shares == 0:
            db.delete(holding)

    # update the stock price
    # we assume the trade executed at the provided price, so that IS the latest market price.
    stock = db.query(models.Stock).filter(models.Stock.ticker == order.ticker).first()
    if stock:
        stock.price = order.price
        stock.last_updated = datetime.now()

    # record history
    tx = models.TransactionHistory(
        ticker=order.ticker, 
        type=order.type, 
        shares=order.shares, 
        price=order.price
    )
    db.add(tx)
    db.commit()
    
    return {"message": "Order Filled", "new_balance": account.balance}

@app.get("/transactions")
async def get_transactions(db: Session = Depends(get_db)):
    """Get the last 20 trades for the status bar"""
    return db.query(models.TransactionHistory).order_by(models.TransactionHistory.timestamp.desc()).limit(20).all()

@app.get("/global-markets")
def get_global_markets():
    """
    fetches global indicators w/ categories
    """
    # define ticker + name + category   
    config = [
        {"symbol": "^AXJO", "name": "ASX 200", "cat": "Indices"},
        {"symbol": "^GSPC", "name": "S&P 500", "cat": "Indices"},
        {"symbol": "^IXIC", "name": "Nasdaq", "cat": "Indices"},
        
        {"symbol": "^VIX", "name": "VIX (Fear)", "cat": "Macro"},
        {"symbol": "^TNX", "name": "US 10Y Bond", "cat": "Macro"},
        
        {"symbol": "GC=F", "name": "Gold", "cat": "Commodities"},
        {"symbol": "CL=F", "name": "Crude Oil", "cat": "Commodities"},
        {"symbol": "HG=F", "name": "Copper", "cat": "Commodities"},
        
        {"symbol": "AUDUSD=X", "name": "AUD/USD", "cat": "Forex"},
        {"symbol": "BTC-USD", "name": "Bitcoin", "cat": "Crypto"},
    ]
    
    try:
        symbols = [c["symbol"] for c in config]
        data = yf.download(symbols, period="5d", interval="1h", progress=False, threads=False)['Close']
        
        results = []
        
        # iterate through config to maintain order
        # use list() to create a copy to avoid runtime errors during iteration
        for item in list(config):
            symbol = item["symbol"]
            try:
                # handle single vs multi-index dataframes
                series = data[symbol] if len(symbols) > 1 else data
                clean_series = series.dropna()
                
                if clean_series.empty: continue
                    
                current_price = clean_series.iloc[-1]
                prev_close = clean_series.iloc[-2] if len(clean_series) > 1 else current_price
                change = current_price - prev_close
                change_percent = (change / prev_close) * 100 if prev_close != 0 else 0
                
                history = clean_series.tail(24).tolist()
                
                results.append({
                    "symbol": symbol,
                    "name": item["name"],
                    "category": item["cat"], 
                    "price": current_price,
                    "change": change,
                    "change_percent": change_percent,
                    "history": history
                })
            except Exception:
                continue
                
        return results
        
    except Exception as e:
        print(f"Global markets error: {e}")
        return []

@app.get("/compare")
def compare_stocks(t1: str, t2: str):
    """
    fetches side-by-side data for two tickers, calculates winner & correlation
    """
    try:
        def get_data(ticker):
            sym = f"{ticker.upper()}.AX"
            stock = yf.Ticker(sym)
            info = stock.info
            
            # get 1y history for performance calc and correlation
            hist = stock.history(period="1y")
            if hist.empty: return None
            
            start_price = hist['Close'].iloc[0]
            end_price = hist['Close'].iloc[-1]
            perf_1y = ((end_price - start_price) / start_price) * 100
            
            # normalise metrics for radar (0-100)
            # approximations for visualisation
            def norm_pe(pe):
                if not pe: return 50
                if pe < 0: return 20 
                if pe > 100: return 10
                # PE 15 is great (100), PE 50 is bad (30)
                score = 100 - (pe - 10) * 1.5 
                return max(10, min(100, score))

            def norm_growth(g):
                if not g: return 40 # assumed stagnation
                # 30% growth = 100, 0% = 40, -10% = 10
                score = 40 + (g * 100 * 2) 
                return max(10, min(100, score))
            
            def norm_yield(y):
                if not y: return 10
                # 8% yield = 100, 0% = 10
                score = 10 + (y * 100 * 11.25) 
                return max(10, min(100, score))
                
            def norm_debt(d):
                if not d: return 50 # neutral assumption
                # Debt/Eq 0 = 100, 2 = 20
                score = 100 - (d * 40)
                return max(10, min(100, score))

            radar = {
                "Value": norm_pe(info.get('trailingPE')),
                "Growth": norm_growth(info.get('revenueGrowth')),
                "Income": norm_yield(info.get('dividendYield')),
                "Momentum": max(10, min(100, 50 + perf_1y)), 
                "Safety": norm_debt(info.get('debtToEquity'))
            }

            return {
                "ticker": ticker.upper(),
                "name": info.get('longName', ticker),
                "price": info.get('currentPrice', 0),
                "market_cap": info.get('marketCap', 0),
                "pe_ratio": info.get('trailingPE', 0),
                "dividend_yield": info.get('dividendYield', 0), # 0.05
                "profit_margin": info.get('profitMargins', 0),
                "debt_to_equity": info.get('debtToEquity', 0),
                "revenue_growth": info.get('revenueGrowth', 0),
                "performance_1y": perf_1y,
                "history": hist['Close'].tolist(), # for the sparkline/chart
                "dates": hist.index.strftime('%Y-%m-%d').tolist(),
                "radar_data": radar
            }

        data1 = get_data(t1)
        data2 = get_data(t2)
        
        if not data1 or not data2:
            raise HTTPException(status_code=404, detail="One or both stocks not found")

        # calc correlation
        try:
            # fetch as a pair to get aligned index easily
            pair = yf.download([f"{t1}.AX", f"{t2}.AX"], period="6mo", interval="1d", progress=False)['Close']
            pair = pair.dropna()
            # if pair is empty or only 1 col, correlation = fail
            if pair.shape[1] < 2:
                corr_val = 0.0
            else:
                corr_val = pair.corr().iloc[0, 1]
        except:
            corr_val = 0.0
            
        # format correlation object
        corr_desc = "Neutral"
        corr_color = "yellow"
        if corr_val > 0.7:
            corr_desc = "Strong Positive"
            corr_color = "green" # move together
        elif corr_val < -0.5:
             corr_desc = "Inverse"
             corr_color = "red" # hedge potential
        elif 0.3 < corr_val <= 0.7:
            corr_desc = "Moderate"
            corr_color = "yellow"
        else:
             corr_desc = "Uncorrelated"
             corr_color = "yellow"

        # radar data
        radar_subjects = ["Value", "Growth", "Income", "Momentum", "Safety"]
        radar_chart = []
        s1_wins = 0
        s2_wins = 0
        
        for subj in radar_subjects:
            val1 = data1['radar_data'].get(subj, 50)
            val2 = data2['radar_data'].get(subj, 50)
            if val1 > val2: s1_wins += 1
            elif val2 > val1: s2_wins += 1
            
            radar_chart.append({
                "subject": subj,
                "A": val1,
                "B": val2,
                "fullMark": 100
            })
            
        winner = t1 if s1_wins > s2_wins else t2 if s2_wins > s1_wins else "TIE"

        # transform metrics for frontend         
        return {
            "stock_1": {
                "ticker": data1['ticker'],
                "company_name": data1['name'],
                "metrics": {
                    "price": data1['price'],
                    "change": round(data1['performance_1y'], 2), # 1y perf
                    "pe": data1['pe_ratio'],
                    "mkt_cap": data1['market_cap'],
                    "div_yield": data1['dividend_yield'],
                    "profit_margin": data1['profit_margin'],
                    "rev_growth": data1['revenue_growth']
                },
                "history": data1['history'],
                "dates": data1['dates']
            },
            "stock_2": {
                "ticker": data2['ticker'],
                "company_name": data2['name'],
                "metrics": {
                    "price": data2['price'],
                    "change": round(data2['performance_1y'], 2), 
                    "pe": data2['pe_ratio'],
                    "mkt_cap": data2['market_cap'],
                    "div_yield": data2['dividend_yield'],
                    "profit_margin": data2['profit_margin'],
                    "rev_growth": data2['revenue_growth']
                },
                "history": data2['history'],
                "dates": data2['dates']
            },
            "radar_data": radar_chart,
            "correlation": {
                "score": corr_val,
                "description": corr_desc,
                "color": corr_color
            },
            "winner": winner
        }
    except Exception as e:
        print(f"Comparison error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# comparison verdict
class CompareRequest(BaseModel):
    t1: str
    t2: str

@app.post("/compare/ai")
async def compare_ai_verdict(req: CompareRequest):
    """
    1. Fetches fundamentals for both stocks.
    2. Fetches recent news for both.
    3. Asks Gemini to pick a winner based on value, growth, and sentiment.
    """
    try:
        # get data 
        def get_data_internal(ticker):
            sym = f"{ticker.upper()}.AX"
            stock = yf.Ticker(sym)
            info = stock.info
            return {
                "name": info.get('longName', ticker),
                "pe": info.get('trailingPE', "N/A"),
                "yield": info.get('dividendYield', "N/A"),
                "growth": info.get('revenueGrowth', "N/A"),
                "debt": info.get('debtToEquity', "N/A"),
                "description": info.get('longBusinessSummary', '')[:500] + "..." 
            }

        # run synchronous yfinance calls in a thread pool to avoid blocking the event loop
        loop = asyncio.get_event_loop()
        d1 = await loop.run_in_executor(None, get_data_internal, req.t1)
        d2 = await loop.run_in_executor(None, get_data_internal, req.t2)

        # get news (async)
        news1 = (await asyncio.to_thread(get_stock_news, req.t1))[:3]
        news2 = (await asyncio.to_thread(get_stock_news, req.t2))[:3]

        news_summary_1 = "\n".join([f"- {n['content']['title']}" for n in news1])
        news_summary_2 = "\n".join([f"- {n['content']['title']}" for n in news2])

        prompt = f"""
        Act as a Senior Portfolio Manager at a hedge fund. You must decide between two assets for a single position slot.
        Compare **{req.t1}** vs **{req.t2}**.

        ### CONTENDER A: {d1['name']} ({req.t1})
        - Valuation (P/E): {d1['pe']}
        - Yield: {d1['yield']}
        - Growth: {d1['growth']}
        - Profile: {d1['description']}
        - Recent News:\n{news_summary_1}

        ### CONTENDER B: {d2['name']} ({req.t2})
        - Valuation (P/E): {d2['pe']}
        - Yield: {d2['yield']}
        - Growth: {d2['growth']}
        - Profile: {d2['description']}
        - Recent News:\n{news_summary_2}

        ### GOAL
        Determine which stock is the better investment **right now** based on valuation, momentum, and macro risks.
        
        **OUTPUT FORMAT (HTML Only):**
        <div class="space-y-4">
            <h3 class="text-xl font-bold text-white">The Matchup</h3>
            <p>Brief context on the battle (Value vs Growth, or Sector Rivals).</p>

            <div class="grid grid-cols-2 gap-4 my-4">
                <div class="p-3 bg-white/5 rounded-lg border border-white/10">
                    <strong class="text-primary block mb-1">Bull Case for {req.t1}</strong>
                    <p class="text-sm text-gray-300">Why buy A?</p>
                </div>
                <div class="p-3 bg-white/5 rounded-lg border border-white/10">
                    <strong class="text-primary block mb-1">Bull Case for {req.t2}</strong>
                    <p class="text-sm text-gray-300">Why buy B?</p>
                </div>
            </div>

            <h3 class="text-xl font-bold text-white">The Verdict</h3>
            <p><strong>Winner: [PICK A OR B]</strong></p>
            <p>Reasoning for the decision. Be decisive.</p>
        </div>
        """

        response = await async_client.chat.completions.create(
            model="google/gemini-3-pro-preview", 
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        
        return {"report": response.choices[0].message.content}

    except Exception as e:
        print(f"Comparison AI Error: {e}")
        return {"report": "<p>AI Analysis unavailable.</p>"}

# market scanner
@app.get("/scanner/run")
def run_scanner(db: Session = Depends(get_db)):
    """
    Returns latest cached scan results.
    """
    global SCAN_CACHE
    global LAST_SCAN_TIME

    # if cache is empty, wait or return to what we have (*if server started recently)
    if not SCAN_CACHE:
         return []
    
    return SCAN_CACHE

class AlertRequest(BaseModel):
    ticker: str
    target_price: float
    condition: str # "ABOVE", "BELOW", or "REMINDER"
    note: str = None

@app.get("/alerts")
async def get_alerts(db: Session = Depends(get_db)):
    """fetch all alerts (history)"""
    return db.query(models.Alert).order_by(models.Alert.created_at.desc()).all()

@app.get("/alerts/triggered")
async def get_triggered_alerts(db: Session = Depends(get_db)):
    """fetch only triggered alerts (for notifications)"""
    return db.query(models.Alert).filter(models.Alert.status == "TRIGGERED").order_by(models.Alert.created_at.desc()).all()

@app.post("/alerts")
async def create_alert(alert: AlertRequest, db: Session = Depends(get_db)):
    db_alert = models.Alert(
        ticker=alert.ticker.upper(),
        target_price=alert.target_price,
        condition=alert.condition,
        status="ACTIVE",
        note=alert.note
    )
    db.add(db_alert)
    db.commit()
    db.refresh(db_alert)
    return db_alert

@app.delete("/alerts/{alert_id}")
async def delete_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    db.delete(alert)
    db.commit()
    return {"status": "deleted"}


class ChatRequest(BaseModel):
    message: str
    history: list = [] # context [?]

# agentic chat
@app.post("/ai/agent-stream")
async def chat_agent_stream(req: ChatRequest):
    """
    ai agent conversation with browser & financial tool use     
    """
    async def event_generator():
        stream_queue = asyncio.Queue()
        token = set_stream_queue(stream_queue) # bind queue to context

        current_time = get_current_time()
        system_prompt = f"""
        You are Kangaroo, an elite autonomous financial analyst embedded in a professional trading terminal.
        CURRENT TIME: {current_time}
        
        TOOLS AVAILABLE:
        1. get_stock_price(ticker): Live ASX data.
        2. get_company_info(ticker): Sector, PE, Summary.
        3. get_financials(ticker): Revenue, Profit.
        4. browse_web(task): A REAL WEB BROWSER. Use this to find specific analyst price targets, latest rumours, or macro data not in the feed.
        
        ### RESEARCH PROTOCOL (MANDATORY):
        If the user asks for an investment opinion (e.g., "Is BHP a buy?"), you MUST:
        1. Check the **Price** & **Financials** to assess value.
        2. Check **News** for immediate sentiment.
        3. Use **browse_web** to find "Analyst Ratings [Year]" or specific macro drivers (e.g., "Iron Ore Price Outlook").
        4. SYNTHESIZE all this into a data-driven thesis. DO NOT be lazy.
        
        ### OUTPUT FORMAT:
        Your "FINAL ANSWER" must be raw, clean **HTML** (no markdown backticks).
        Use Tailwind classes to match the Kangaroo Terminal aesthetic:
        - Headers: <h3 class="text-xl font-bold text-white mt-4 mb-2">
        - Strong text: <strong class="text-primary">
        - Lists: <ul class="list-disc pl-5 space-y-1 text-gray-300">
        - Paragraphs: <p class="mb-3 text-gray-300 leading-relaxed">
        
        CRITICAL STYLING RULES:
        1. **DO NOT** wrap the entire response in a generic card/container/div. Just output the content elements.
        2. **DO NOT** output internal monologue, "Wait...", or "End thought" text.
        3. **ALWAYS** prefix your final HTML with "FINAL ANSWER:".
        
        Example Final Output:
        FINAL ANSWER:
        <h3 class="text-xl font-bold text-white">Investment Thesis: BHP Group</h3>
        <p class="mb-3 text-gray-300">BHP is currently trading at <strong class="text-primary">$45.20</strong>...</p>

        ### AGENT LOGIC:
        1. Think step-by-step.
        2. If you need data, output:
           THOUGHT: [Reasoning]
           ACTION: tool_name:argument
        3. Wait for the RESULT. 
        4. If a tool fails, try a different approach.
        5. Once you have the answer, output:
           FINAL ANSWER: [Your professional HTML response]
        """

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": req.message}
        ]


        # custom initial status       
        # kinda useless but idk
        mlower = req.message.lower()
        if "buy" in mlower or "sell" in mlower or "stock" in mlower:
            init_msg = "Scanning market data & formulating thesis..."
        elif "search" in mlower or "find" in mlower or "who" in mlower or "what" in mlower:
             init_msg = "Constructing search parameters..."
        elif "analyse" in mlower or "analysis" in mlower:
             init_msg = "Initialising models..."
        else:
             init_msg = "Processing natural language request..."
             
        yield json.dumps({"type": "thought", "content": init_msg}) + "\n"

        # main loop
        for step in range(15):
            try:
                # call llm
                response = await async_client.chat.completions.create(
                    model="google/gemini-3-pro-preview",
                    messages=messages,
                )
                
                ai_text = response.choices[0].message.content.strip()

                if "ACTION:" in ai_text:
                    # parse
                    parts = ai_text.split("ACTION:")
                    thought = parts[0].replace("THOUGHT:", "").strip()
                    action_line = parts[1].strip().split("\n")[0]
                    
                    # send thought to ui
                    if thought:
                        yield json.dumps({"type": "thought", "content": thought}) + "\n"
                    
                    if ":" in action_line:
                        tool_name, tool_arg = action_line.split(":", 1)
                        tool_name = tool_name.strip()
                        tool_arg = tool_arg.strip()
                        
                        yield json.dumps({"type": "action", "content": f"Executing {tool_name}('{tool_arg}')..."}) + "\n"
                        
                        # execute tool
                        if tool_name in AVAILABLE_TOOLS:
                            yield json.dumps({"type": "action", "content": f"Executing {tool_name}..."}) + "\n"
                            
                            # run tool in a separate task so we can poll the queue
                            tool_task = asyncio.create_task(AVAILABLE_TOOLS[tool_name](tool_arg))
                            
                            # while tool is running, check for browser updates
                            while not tool_task.done():
                                try:
                                    msg = await asyncio.wait_for(stream_queue.get(), timeout=0.1)
                                    # yield browser updates directly to frontend
                                    yield json.dumps(msg) + "\n"
                                except asyncio.TimeoutError:
                                    continue
                            
                            #  final result
                            try:
                                tool_result = await tool_task
                            except Exception as tool_err:
                                tool_result = f"Error: {tool_err}"

                            # feed result back to ai
                            messages.append({"role": "assistant", "content": ai_text})
                            messages.append({"role": "user", "content": f"RESULT from {tool_name}: {tool_result}"})
                            
                            # keep stream alive
                            yield json.dumps({"type": "keepalive"}) + "\n"
                        else:
                            messages.append({"role": "user", "content": f"SYSTEM ERROR: Tool '{tool_name}' not found."})
                    else:
                        messages.append({"role": "user", "content": "SYSTEM ERROR: Invalid Action format. Use tool:arg"})

                # final answer
                elif "FINAL ANSWER:" in ai_text:
                    final_msg = ai_text.split("FINAL ANSWER:")[1].strip()
                    yield json.dumps({"type": "final", "content": final_msg}) + "\n"
                    break
                
                # direct answer (*fallback if output is malformed)
                else:
                    clean_text = ai_text
                    # cleanup for "End Thought" leakage
                    if "End thought.START_RESPONSE" in clean_text:
                        clean_text = clean_text.split("End thought.START_RESPONSE")[-1].strip()
                    elif "THOUGHT:" in clean_text and "ACTION:" not in clean_text:
                        # if it has a thought but no action, it might be a malformed final answer 
                        parts = clean_text.split("\n\n")
                        if len(parts) > 1:
                            clean_text = parts[-1]

                    yield json.dumps({"type": "final", "content": clean_text}) + "\n"
                    break

            except Exception as e:
                print(f"Loop Error: {e}")
                yield json.dumps({"type": "error", "content": "Processing error. Retrying..."}) + "\n"
                
    return StreamingResponse(event_generator(), media_type="application/x-ndjson")

@app.get("/briefing/generate")
async def generate_briefing_endpoint(db: Session = Depends(get_db)):
    """
    aggregates relevant data & generates the morning briefing
    """
    global BRIEFING_CACHE
    
    # check cache (3600s = 1 hour)
    current_time = datetime.now().timestamp()
    if BRIEFING_CACHE["data"] and (current_time - BRIEFING_CACHE["timestamp"] < 3600):
        print("📝 [Briefing] serving from cache (expires in {:.0f}m)".format((3600 - (current_time - BRIEFING_CACHE["timestamp"])) / 60))
        return BRIEFING_CACHE["data"]

    try:
        print("📝 [Briefing] generating new report...")
        
        # global markets
        global_markets_task = asyncio.to_thread(get_global_markets)
        
        # watchlist & holdings
        watchlist = await asyncio.to_thread(get_watchlist, db)
        holdings = db.query(models.Holding).all() # This is now sync and fast enough, but could be offloaded too
        portfolio_tickers = [h.ticker for h in holdings]
        
        # calendar & market movers (run sequentially to avoid DB session thread-safety issues, but in threads to keep loop free)
        calendar = await asyncio.to_thread(get_upcoming_calendar, db) 
        movers = await asyncio.to_thread(get_market_movers, db) 
        
        # gather news, top 3 holdings + top 2 watchlist items
        news_tickers = []
        if portfolio_tickers:
            news_tickers.extend(portfolio_tickers[:3])
        if watchlist:
            # avoid dupes
            for w in watchlist[:2]:
                if w.ticker not in news_tickers:
                    news_tickers.append(w.ticker)
                    
        news_tasks = [asyncio.to_thread(get_stock_news, t) for t in news_tickers]
        # gather news + global markets
        results = await asyncio.gather(global_markets_task, *news_tasks)
        global_markets = results[0]
        news_results = results[1:]
        
        # flatten and format news
        news_context = []
        for i, ticker in enumerate(news_tickers):
            items = news_results[i][:2] # take top 2 headlines
            for item in items:
                news_context.append(f"[{ticker}] {item['content']['title']}")
        
        # signal scanner
        scan_tickers = list(set([f"{t.upper()}.AX" for t in portfolio_tickers] + [f"{s.ticker}.AX" for s in watchlist]))
        scanner_results = []
        if scan_tickers:
            # run scanner in thread pool to avoid blocking
            scanner_results = await asyncio.to_thread(scan_market, scan_tickers)
        
        # package data
        data = {
            "timestamp": get_current_time(),
            "global_markets": global_markets,
            "portfolio": [{"ticker": h.ticker, "shares": h.shares, "avg_cost": h.avg_cost} for h in holdings],
            "watchlist": [{"ticker": w.ticker, "price": w.price, "change": w.change_percent} for w in watchlist],
            "calendar": calendar,
            "movers": movers,
            "signals": scanner_results,
            "news": news_context
        }
        
        # generate briefing
        result_json = await asyncio.to_thread(briefing.generate_briefing_content, data)

        try:
            final_data = json.loads(result_json)
            
            # update cache
            BRIEFING_CACHE["data"] = final_data
            BRIEFING_CACHE["timestamp"] = datetime.now().timestamp()
            
            return final_data
        except:
            return {"error": "AI parsing failed", "raw": result_json}
            
    except Exception as e:
        print(f"Briefing Endpoint Error: {e}")
        return {
            "overnight_wrap": "<p>System unavailable.</p>",
            "portfolio_impact": "<p>Briefing engine encountered an error.</p>",
            "action_items": f"<ul><li>Error: {str(e)}</li></ul>",
            "vibe": "System Error"
        }

@app.get("/stock/{ticker}/filings")
async def get_filings_endpoint(ticker: str):
    """
    scrapes recent asx announcements for the ticker using playwright
    """
    return await filings.get_recent_filings(ticker)

class AnalyseRequest(BaseModel):
    url: str
    ticker: str

@app.post("/filings/analyse")
async def analyse_filing_endpoint(req: AnalyseRequest, db: Session = Depends(get_db)):
    """
    analyse filing pdf w/ gemini
    """
    return await filings.analyse_pdf(req.url, req.ticker, db)

class ChatRequest(BaseModel):
    url: str
    history: list
    question: str

@app.post("/filings/chat")
async def chat_filing_endpoint(req: ChatRequest):
    """
    chat with document
    """
    answer = await filings.chat_with_document(req.url, req.history, req.question)
    return {"answer": answer}
