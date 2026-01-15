from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_ # type: ignore
from sqlalchemy.orm import Session # type: ignore
from database import engine, get_db
from ingestor import run_market_engine, is_market_open
import models
import asyncio
import yfinance as yf # type: ignore
import pandas as pd
import feedparser # type: ignore 
import re 
import urllib.parse
import requests
from newspaper import Article, Config  # type: ignore
from readability import Document # type: ignore
from contextlib import asynccontextmanager
from playwright.async_api import async_playwright

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