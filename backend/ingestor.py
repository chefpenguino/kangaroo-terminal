import asyncio
import json
from datetime import datetime, time
import pytz
from sqlalchemy.orm import Session # type: ignore
from database import SessionLocal
import models
from scraper import ASXScraper
import yfinance as yf # type: ignore

# sydney timezone

SYDNEY_TZ = pytz.timezone("Australia/Sydney")

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
                # self-healing: if sector is missing for some reason, fix it
                if not stock.sector or stock.sector == "Unknown":
                     print(f"[+] fixing missing sector for {item['ticker']}...")
                     stock.sector = get_sector_info(item['ticker'])

                stock.price = p_val
                stock.change_amount = c_val
                stock.change_percent = item['change_percent']
                stock.market_cap = item['market_cap']
                stock.volume = item['volume']
                stock.last_updated = datetime.utcnow()
        
        db.commit()
    except Exception as e:
        print(f"db error: {e}")
    finally:
        db.close()

async def run_market_engine():
    """main loop w/ check for market open"""
    print("[🦘] market engine started")
    
    while True:
        if is_market_open():
            print("[🦘] the market is open, starting scraper..")
            
            # start scraper only when required
            scraper = ASXScraper()
            await scraper.start()
            
            previous_snapshot = ""
            
            try:
                # inner loop: runs while market is open
                while is_market_open():
                    # get the current state of the table 
                    data = await scraper.get_current_data()
                    
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

                    # 4. wait 1s
                    await asyncio.sleep(1)
                
                print("\n[🦘] the market just closed, stopping scraper..")
                
            except Exception as e:
                print(f"engine crash: {e}")
            finally:
                # kill chromium process
                await scraper.stop()
                
        else:
            # market is closed
            now = datetime.now(SYDNEY_TZ).strftime("%H:%M:%S")
            print(f"[💤] market closed ({now}). checking again in 60s...")
            await asyncio.sleep(60)