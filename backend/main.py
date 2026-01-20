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
import google.genai as genai # type: ignore
import os
from datetime import datetime
from pydantic import BaseModel # Add this at top if missing
from dotenv import load_dotenv
from newspaper import Article, Config  # type: ignore
from readability import Document # type: ignore
from contextlib import asynccontextmanager
from playwright.async_api import async_playwright

load_dotenv()
GENAI_KEY = os.getenv("GEMINI_API_KEY")

if not GENAI_KEY:
    print("warning - GEMINI_API_KEY isn't set") 

client = genai.Client(api_key=GENAI_KEY)

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

        response = client.models.generate_content( # gemini-3-pro reasoning would be better but no $$, find a better free model later
            model='gemini-3-flash-preview',        # maybe look into the AI hackatime thing
            contents=prompt
        )

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

class Transaction(BaseModel):
    ticker: str
    shares: int
    price: float

@app.post("/portfolio/add")
def add_holding(tx: Transaction, db: Session = Depends(get_db)):
    """simulated trading"""
    # check if we already own it
    existing = db.query(models.Holding).filter(models.Holding.ticker == tx.ticker.upper()).first()
    
    if existing:
        # calculate new weighted average cost
        total_cost = (existing.shares * existing.avg_cost) + (tx.shares * tx.price)
        total_shares = existing.shares + tx.shares
        existing.shares = total_shares
        existing.avg_cost = total_cost / total_shares
    else:
        new_holding = models.Holding(
            ticker=tx.ticker.upper(),
            shares=tx.shares,
            avg_cost=tx.price
        )
        db.add(new_holding)
    
    db.commit()
    return {"message": "Trade executed"}

@app.delete("/portfolio/{ticker}")
def delete_holding(ticker: str, db: Session = Depends(get_db)):
    """Simulate selling all shares"""
    db.query(models.Holding).filter(models.Holding.ticker == ticker.upper()).delete()
    db.commit()
    return {"message": "Position closed"}

@app.get("/portfolio")
def get_portfolio(db: Session = Depends(get_db)):
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
def get_portfolio_analytics(db: Session = Depends(get_db)):
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
def get_portfolio_risk(db: Session = Depends(get_db)):
    """
    Calculates Portfolio Beta and Correlation Matrix.
    This is computationally expensive, so it might take a few seconds.
    """
    try:
        holdings = db.query(models.Holding).all()
        if not holdings:
            return {"error": "No holdings to analyze"}

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
        returns = data.pct_change().dropna()
        
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
def get_account(db: Session = Depends(get_db)):
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
def execute_trade(order: Order, db: Session = Depends(get_db)):
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
        stock.last_updated = datetime.utcnow()

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
def get_transactions(db: Session = Depends(get_db)):
    """Get the last 20 trades for the status bar"""
    return db.query(models.TransactionHistory).order_by(models.TransactionHistory.timestamp.desc()).limit(20).all()

# backtesting stuff 

class BacktestRequest(BaseModel):
    ticker: str
    strategy: str # "SMA_CROSS", "RSI_REVERSAL"
    initial_capital: float = 10000.0
    # strategy parameters
    param1: int = 50  # eg short window / lower RSI
    param2: int = 200 # eg long window / upper RSI

@app.post("/backtest/run")
def run_backtest(req: BacktestRequest):
    try:
        symbol = f"{req.ticker.upper()}.AX"
        stock = yf.Ticker(symbol)
        # fetch 2y data
        hist = stock.history(period="2y", interval="1d")
        
        if hist.empty:
            raise HTTPException(status_code=404, detail="No data found")
            
        hist['Close'] = hist['Close'].fillna(method='ffill')
        hist['Signal'] = 0 
        
        # GOLDEN CROSS (Trend Following)
        if req.strategy == "SMA_CROSS":
            hist['Short_MA'] = hist['Close'].rolling(window=req.param1).mean()
            hist['Long_MA'] = hist['Close'].rolling(window=req.param2).mean()
            hist['Signal'] = np.where(hist['Short_MA'] > hist['Long_MA'], 1, 0)
            hist['Position'] = hist['Signal'].diff()
            
        # RSI REVERSAL (Mean Reversion)
        elif req.strategy == "RSI_REVERSAL":
            delta = hist['Close'].diff()
            gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
            rs = gain / loss
            hist['RSI'] = 100 - (100 / (1 + rs))
            
            hist['Position'] = 0
            hist.loc[hist['RSI'] < req.param1, 'Position'] = 1  # Buy Oversold
            hist.loc[hist['RSI'] > req.param2, 'Position'] = -1 # Sell Overbought

        # MACD CROSSOVER (Momentum)
        elif req.strategy == "MACD":
            # standard 12-26-9 settings
            ema12 = hist['Close'].ewm(span=12, adjust=False).mean()
            ema26 = hist['Close'].ewm(span=26, adjust=False).mean()
            macd = ema12 - ema26
            signal_line = macd.ewm(span=9, adjust=False).mean()
            
            hist['Signal'] = np.where(macd > signal_line, 1, 0)
            hist['Position'] = hist['Signal'].diff()

        # BOLLINGER BREAKOUT (Volatility)
        elif req.strategy == "BB_BREAKOUT":
            sma20 = hist['Close'].rolling(window=20).mean()
            std = hist['Close'].rolling(window=20).std()
            upper = sma20 + (2 * std)
            lower = sma20 - (2 * std)
            
            hist['Position'] = 0
            # buy when price closes above upper band (breakout)
            hist.loc[hist['Close'] > upper, 'Position'] = 1
            # sell when price closes below moving average (trend ends)
            hist.loc[hist['Close'] < sma20, 'Position'] = -1

        # RATE OF CHANGE (Pure Momentum)
        elif req.strategy == "MOMENTUM":
            # param1 = lookback period (eg 10d)
            hist['ROC'] = hist['Close'].pct_change(periods=req.param1) * 100
            
            hist['Position'] = 0
            # buy if momentum is positive
            hist.loc[hist['ROC'] > 0, 'Position'] = 1
            hist.loc[hist['ROC'] < 0, 'Position'] = -1

        trades = []
        cash = req.initial_capital
        holdings = 0
        equity_curve = []
        peak_equity = req.initial_capital
        max_drawdown = 0.0
        
        for date, row in hist.iterrows():
            price = row['Close']
            signal = row.get('Position', 0)
            
            # execute buy
            if signal == 1 and cash > price:
                shares_to_buy = int(cash // price)
                cost = shares_to_buy * price
                cash -= cost
                holdings += shares_to_buy
                trades.append({
                    "date": date.strftime('%Y-%m-%d'),
                    "type": "BUY",
                    "price": price,
                    "shares": shares_to_buy
                })
            
            # execute sell
            elif signal == -1 and holdings > 0:
                revenue = holdings * price
                cash += revenue
                
                last_buy = next((t for t in reversed(trades) if t['type'] == 'BUY'), None)
                profit = revenue - (last_buy['price'] * holdings) if last_buy else 0
                
                holdings = 0
                trades.append({
                    "date": date.strftime('%Y-%m-%d'),
                    "type": "SELL",
                    "price": price,
                    "shares": 0,
                    "profit": profit
                })
                
            # track metrics
            equity = cash + (holdings * price)
            equity_curve.append({"time": date.strftime('%Y-%m-%d'), "value": equity})
            
            # drawdown calc
            if equity > peak_equity:
                peak_equity = equity
            drawdown = (peak_equity - equity) / peak_equity * 100
            if drawdown > max_drawdown:
                max_drawdown = drawdown

        # final metrics
        final_equity = equity_curve[-1]['value']
        total_return = ((final_equity - req.initial_capital) / req.initial_capital) * 100
        winning_trades = len([t for t in trades if t.get('profit', 0) > 0])
        total_sell_trades = len([t for t in trades if t['type'] == 'SELL'])
        win_rate = (winning_trades / total_sell_trades * 100) if total_sell_trades > 0 else 0
        
        return {
            "final_balance": final_equity,
            "total_return": total_return,
            "trade_count": len(trades),
            "win_rate": win_rate,
            "max_drawdown": max_drawdown, # new metric
            "trades": trades,
            "equity_curve": equity_curve 
        }

    except Exception as e:
        print(f"Backtest error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/global-markets")
def get_global_markets():
    """
    Fetches key global indicators: Indices, Commodities, Forex, Crypto.
    Returns current price + 7-day history for sparklines.
    """
    tickers = {
        # indices
        "^AXJO": "ASX 200",
        "^GSPC": "S&P 500",
        "^IXIC": "Nasdaq",
        "^N225": "Nikkei 225",
        "^FTSE": "FTSE 100",
        
        # commodities
        "GC=F": "Gold",
        "CL=F": "Crude Oil",
        "HG=F": "Copper",
        "SI=F": "Silver",
        
        # forex
        "AUDUSD=X": "AUD/USD",
        "AUDJPY=X": "AUD/JPY",
        
        # crypto
        "BTC-USD": "Bitcoin",
        "ETH-USD": "Ethereum"
    }
    
    try:
        # bulk fetch data
        symbols = list(tickers.keys())
        # period="5d" gives us enough for a sparkline
        data = yf.download(symbols, period="5d", interval="1h", progress=False)
        
        results = []
        
        for symbol, name in tickers.items():
            try:
                # 
                try:
                    series = data['Close'][symbol]
                except KeyError:
                    continue
                    
                # get latest values
                clean_series = series.dropna()
                if clean_series.empty:
                    continue
                    
                current_price = clean_series.iloc[-1]
                prev_close = clean_series.iloc[-2] if len(clean_series) > 1 else current_price
                change = current_price - prev_close
                change_percent = (change / prev_close) * 100
                
                # format history for sparkline (last 20 points to keep payload small)
                history = clean_series.tail(24).tolist()
                
                # categorise
                category = "Indices"
                if "=F" in symbol: category = "Commodities"
                elif "=X" in symbol: category = "Forex"
                elif "-USD" in symbol: category = "Crypto"
                
                results.append({
                    "symbol": symbol,
                    "name": name,
                    "price": current_price,
                    "change": change,
                    "change_percent": change_percent,
                    "history": history,
                    "category": category
                })
            except Exception as e:
                print(f"Skipping {symbol}: {e}")
                continue
                
        return results
        
    except Exception as e:
        print(f"Global markets error: {e}")
        return []