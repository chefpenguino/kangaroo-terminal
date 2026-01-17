from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_, func # type: ignore
from sqlalchemy.orm import Session # type: ignore
from database import engine, get_db
from ingestor import run_market_engine, is_market_open
import models
import asyncio
import yfinance as yf # type: ignore
import pandas as pd
import numpy as np 
import feedparser # type: ignore 
import re 
import urllib.parse
import requests
import google.generativeai as genai # type: ignore
import os
from dotenv import load_dotenv
from newspaper import Article, Config  # type: ignore
from readability import Document # type: ignore
from contextlib import asynccontextmanager
from playwright.async_api import async_playwright

load_dotenv()
GENAI_KEY = os.getenv  ("GEMINI_API_KEY")

if not GENAI_KEY:
    print("warning - GEMINI_API_KEY isn't set") 

genai.configure(api_key=GENAI_KEY)

# create tables upon startup
models.Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # start the scraper in the background
    print("[🦘] kangaroo engine starting...")
    scraper_task = asyncio.create_task(run_market_engine())
    
    yield  # runs here
    
    # ensure shutdown - scraper prkoperly cancelled upon ctrl+c press
    print("[🦘] kangaroo engine shutting down...")
    scraper_task.cancel()
    try:
        await scraper_task
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
def get_market_status():
    """returns whether the asx is currently open"""
    return {"is_open": is_market_open()}

@app.get("/market-index") # this price might be delayed, self-note to check later if yf is fine as well as the difference between index v futures pricing
def get_market_index():
    try:
        # AXJO is the symbol for S&P/ASX200
        ticker = yf.Ticker("^AXJO")

        info = ticker.fast_info

        price = info.last_price
        prev_close = info.previous_close

        change_amount = price - prev_close
        change_percent = (change_amount / prev_close) * 100

        return {
            "symbol": "ASX 200",
            "price": price,
            "change": change_amount,
            "percent": change_percent
        }
    except Exception as e:
        print(f"Error fetching market index (ASX 200): {e}")
        return {"error": "Unavailable"}


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
    """
    fetches historical data for charting
    periods: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max
    intervals: 1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo
    """
    try:
        # append .AX for australian stocks if its missing
        symbol = f"{ticker.upper()}.AX" if not ticker.endswith(".AX") else ticker.upper()
        
        stock = yf.Ticker(symbol)
        hist = stock.history(period=period, interval=interval)
        
        # reset the index to make date a column
        hist.reset_index(inplace=True)
        
        # format for tradingview lightweight charts
        # needs: { time: '2025-1-14', open: 10, high: 12, low: 9, close: 11 }
        data = []
        for index, row in hist.iterrows():
            
            # handle date formats 
            if 'Datetime' in row:
                # intraday data uses 'Datetime' (requiring unix timestamp) 
                t = int(row['Datetime'].timestamp())
            # daily data uses Date and needs a YYYY-MM-DD string
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
                "volume": row['Volume']
            })
            
        return data
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
def analyse_stock(ticker: str):
    """
    gathers price, news & financials & sends to google gemini to generate a report
    """
    try:
        # gather intelligence
        news = get_stock_news(ticker) # googlenews scraper
        financials = get_stock_financials(ticker) # yfinance fetcher
        info = get_stock_info(ticker)
                
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

        model = genai.GenerativeModel('gemini-3-flash-preview') # gemini-3-pro reasoning would be better but no $$, find a better free model later
                                                                # maybe look into the AI hackatime thing
        response = model.generate_content(prompt)
        
        return {"report": response.text}

    except Exception as e:
        print(f"AI Error: {e}")
        return {"report": "## ⚠️ System Offline\nKangaroo Neural Net could not connect to the mainframe."}
    
@app.get("/stock/{ticker}/valuation")
def get_stock_valuation(ticker: str):
    """
    fetches inputs for dcf model
    - free cash flow
    - acsh and equivalents
    - total debt
    - shares outstanding
    - beta (risk)
    """
    try:
        symbol = f"{ticker.upper()}.AX"
        stock = yf.Ticker(symbol)

        # get cash flow for fcf
        cf = stock.cashflow
        # nans 0 to prevent json error
        cf = cf.fillna(0)
        
        # calculate fcf (recent year
        # free cash flow = total cash from operating activities + capital expenditures
        # capex is negative in yfinance so we add it
        try:
            latest_ocf = cf.loc['Operating Cash Flow'].iloc[0]
            latest_capex = cf.loc['Capital Expenditure'].iloc[0]
            fcf = latest_ocf + latest_capex
        except Exception:
            # fallback if rows missing
            fcf = 0
            
        # get balance sheet (for net debt)
        bs = stock.balance_sheet.fillna(0)
        try:
            total_debt = bs.loc['Total Debt'].iloc[0]
            cash_and_equivalents = bs.loc['Cash And Cash Equivalents'].iloc[0]
        except Exception:
            total_debt = 0
            cash_and_equivalents = 0
            
        # get key stats (shares, price)
        info = stock.info
        shares_outstanding = info.get('sharesOutstanding', 0)
        beta = info.get('beta', 1.0) # default to market risk if missing
        current_price = info.get('currentPrice', 0.0)
        
        return {
            "fcf": fcf,
            "total_debt": total_debt,
            "cash": cash_and_equivalents,
            "shares_outstanding": shares_outstanding,
            "beta": beta,
            "current_price": current_price,
            "currency": info.get('currency', 'AUD')
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
def toggle_watchlist(ticker: str, db: Session = Depends(get_db)):
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