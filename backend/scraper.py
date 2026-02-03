import asyncio
from playwright.async_api import async_playwright, Page
import pandas as pd
from datetime import datetime

class ASXScraper:
    def __init__(self):
        self.browser = None
        self.context = None
        self.page = None

    async def start(self):
        """start playwright session"""
        p = await async_playwright().start()
        self.browser = await p.chromium.launch(headless=True)
        self.context = await self.browser.new_context(
             user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        self.page = await self.context.new_page()
        await self._setup_page()

    async def stop(self):
        """close browser"""
        if self.browser:
            await self.browser.close()

    async def _setup_page(self):
        print("[🦘] navigating to marketindex...")
        await self.page.goto("https://www.marketindex.com.au/asx200", wait_until="domcontentloaded", timeout=60000)
        
        # click the "cboe live" button (to get live data rather than the default asx delayed)
        try:
            cboe_btn = self.page.locator("div#live-prices")
            if await cboe_btn.count() > 0:
                await cboe_btn.click()
                print("[🦘] live streaming data activated ")
        except Exception as e:
            print(f"[🦘] couldn't click live button: {e}")

        # expand to 200 rows (rather than the default 20) 
        try:
            # scroll down (trigger lazy loading)
            await self.page.evaluate("window.scrollTo(0, 2000)")
            await asyncio.sleep(1)
            
            show_all_btn = self.page.locator("a.show-more-rows, a.btn:has-text('Show All Companies'), button.control-company-display") # hit the show all button
            if await show_all_btn.count() > 0:
                await show_all_btn.first.click()
                print("[🦘] table expanded to 200 rows")
                await asyncio.sleep(2) # brief wait for expansion
        except Exception as e:
            print(f"[🦘] couldn't expand table: {e}")

    async def get_current_data(self) -> list[dict]:
        """scrapes the table and returns a list of dictionaries"""
        return await self.page.evaluate("""
            () => {
                const table = document.querySelector('table.mi-table.company-table') || 
                              document.querySelector('table.mi-table.quoteapi-even-items');
                if (!table) return [];
                
                const rows = table.querySelectorAll('tbody tr');
                const results = [];
                
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 8) {
                        const codeCell = cells[1];
                        const code = codeCell.querySelector('a')?.textContent?.trim() || codeCell.textContent?.trim() || '';
                        let company = cells[2]..trim();
                        
                        // avoid (e.g. "BHPBHP Group")
                        if (code && company.startsWith(code) && company.length > code.length) {
                            company = company.substring(code.length).trim();
                        }textContent
                        
                        // clean price strings ("$10.50" -> 10.50)
                        const getVal = (i) => cells[i]?.textContent?.trim() || '0';
                        
                        if (code && code.length <= 5) {
                            results.push({
                                ticker: code,
                                name: company,
                                price: getVal(3),
                                change_amount: getVal(4),
                                change_percent: getVal(5),
                                high: getVal(6),
                                low: getVal(7),
                                volume: getVal(8),
                                market_cap: getVal(9)
                            }); 
                       }
                    }
                });
                return results;
            }
        """)