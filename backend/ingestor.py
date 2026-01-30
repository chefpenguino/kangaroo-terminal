import asyncio
import json
from datetime import datetime, time
import pytz
from sqlalchemy.orm import Session # type: ignore
from database import SessionLocal
import models
from scraper import ASXScraper
import yfinance as yf # type: ignore
from trade_engine import internal_execute_trade

# sydney timezone

SYDNEY_TZ = pytz.timezone("Australia/Sydney")

# global status
ENGINE_STATUS = {
    "status": "Offline",
    "details": "Initializing...",
    "last_run": None,
    "active": False
}

def get_engine_status():
    return ENGINE_STATUS

def is_market_open() -> bool:
    """
    checks if it is currently between 10:00 AM and 4:15 PM sydney time, mon-fri 
    w/ 15 mins buffer to catch the 'closing auction' final price
    """
    now = datetime.now(SYDNEY_TZ)

    # check weekend (5=sat, 6=sun)
    if now.weekday() > 4:
        return False
    
    current_time = now.time()
    market_open = time(10, 0)
    market_close = time(16, 15) # 4:15 PM buffer

    return market_open <= current_time <= market_close

def get_sector_info(ticker: str) -> str:
    """
    fetches sector from yfinance on the fly
    used when a new stock appears in the index
    """
    try:
        # add .AX suffix
        stock = yf.Ticker(f"{ticker}.AX")
        return stock.info.get('sector', 'Unknown')
    except:
        return 'Unknown'

async def clean_price(price_str: str) -> float:
    """
    converts price to float
    for eg '$123.45' or '1,234' to 123.45
    """
    try:
        clean = price_str.replace('$', '').replace(',', '')
        return float(clean)
    except:
        return 0.0
    
async def update_database(data: list[dict]):
    db: Session = SessionLocal()
    try:
        print(f"[🦘] saving {len(data)} stocks to DB...")
        for item in data:
            # check if stock exists
            stock = db.query(models.Stock).filter(models.Stock.ticker == item['ticker']).first()
            
            p_val = await clean_price(item['price'])
            c_val = await clean_price(item['change_amount'])

            if not stock:
                # fetch sector immediately so heatmap works
                print(f"[+] new stock found: {item['ticker']}, fetching sector...")
                sector_name = get_sector_info(item['ticker'])
                
                # create new
                stock = models.Stock(
                    ticker=item['ticker'],
                    name=item['name'],
                    sector=sector_name, # save the fetched sector
                    price=p_val,
                    change_amount=c_val,
                    change_percent=item['change_percent'],
                    market_cap=item['market_cap'],
                    volume=item['volume']
                )
                db.add(stock)
            else:
                # UPDATE EXISTING
                # self-healing: if sector is missing, fix it (but don't loop on 'Unknown' if we already tried)
                if not stock.sector:
                     print(f"[+] fixing missing sector for {item['ticker']}...")
                     stock.sector = get_sector_info(item['ticker'])

                stock.price = p_val
                stock.change_amount = c_val
                stock.change_percent = item['change_percent']
                stock.market_cap = item['market_cap']
                stock.volume = item['volume']
                stock.last_updated = datetime.now()
        
        db.commit()
        
        # after prices update, check if any orders were triggered
        await check_matching_engine(db)

    except Exception as e:
        print(f"db error: {e}")
    finally:
        db.close()

async def check_matching_engine(db: Session):
    """
    checks all pending orders against current market prices
    """
    orders = db.query(models.PendingOrder).filter(models.PendingOrder.status == "PENDING").all()
    if not orders:
        return

    for order in orders:
        stock = db.query(models.Stock).filter(models.Stock.ticker == order.ticker).first()
        if not stock:
            continue
        
        current_price = stock.price
        triggered = False
        
        # execution logic
        if order.order_type == "LIMIT_BUY" and current_price <= order.limit_price:
            triggered = True
        elif order.order_type == "LIMIT_SELL" and current_price >= order.limit_price:
            triggered = True
        elif order.order_type == "STOP_LOSS" and current_price <= order.limit_price:
            triggered = True
            
        if triggered:
            try:
                # convert internal type
                exec_type = "BUY" if "BUY" in order.order_type else "SELL"
                # use the current_price for the fill 
                internal_execute_trade(db, order.ticker, order.shares, current_price, exec_type)
                
                order.status = "FILLED"
                order.filled_at = datetime.now()
                print(f"[✏️] OMS: order filled - {order.order_type} {order.shares} {order.ticker} @ {current_price}")
            except Exception as e:
                print(f"[✏️] OMS: fill failed for {order.ticker} - {e}")
    
    db.commit()

async def run_market_engine():
    """main loop w/ check for market open"""
    print("[🦘] market engine started")
    ENGINE_STATUS["status"] = "Standing By"
    ENGINE_STATUS["active"] = True
    
    while True:
        if is_market_open():
            print("[🦘] the market is open, starting scraper..")
            ENGINE_STATUS["status"] = "Active"
            ENGINE_STATUS["details"] = "Scraping Live Markets"
            
            # start scraper only when required
            scraper = ASXScraper()
            await scraper.start()
            
            previous_snapshot = ""
            
            try:
                # inner loop: runs while market is open
                while is_market_open():
                    # get the current state of the table 
                    data = await scraper.get_current_data()
                    ENGINE_STATUS["last_run"] = datetime.now().isoformat()
                    
                    if data:
                        # serialise to string to compare easily 
                        current_snapshot = json.dumps(data, sort_keys=True)
                        
                        # ONLY SAVE IF somethpchanged 
                        if current_snapshot != previous_snapshot:
                            print(f"[🦘] price update detected! writing to DB...")
                            await update_database(data)
                            previous_snapshot = current_snapshot
                        else:
                            # print a dot so yk it's alive
                            print(".", end="", flush=True)

                    # wait 1s
                    await asyncio.sleep(1)
                
                print("\n[🦘] the market just closed, stopping scraper..")
                ENGINE_STATUS["status"] = "Closed"
                ENGINE_STATUS["details"] = "Market Closed"
                
            except Exception as e:
                print(f"engine crash: {e}")
                ENGINE_STATUS["status"] = "Error"
                ENGINE_STATUS["details"] = str(e)
            finally:
                # kill chromium process
                await scraper.stop()
                
        else:
            # market is closed
            now = datetime.now(SYDNEY_TZ).strftime("%H:%M:%S")
            print(f"[💤] market closed ({now}). checking again in 60s...")
            ENGINE_STATUS["status"] = "Sleeping"
            ENGINE_STATUS["details"] = f"Market Closed (Time: {now})"
            await asyncio.sleep(60)