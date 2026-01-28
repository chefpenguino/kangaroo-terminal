
import os
import asyncio
from playwright.async_api import async_playwright
from openai import AsyncOpenAI
from dotenv import load_dotenv
import json
import base64
import httpx
import io
import pypdf # type: ignore
from sqlalchemy.orm import Session # type: ignore
from models import FilingAnalysis

load_dotenv()
HACKCLUB_KEY = os.getenv("HACKCLUB_API_KEY")

async_client = AsyncOpenAI(
    base_url="https://ai.hackclub.com/proxy/v1",
    api_key=HACKCLUB_KEY
)

def score_announcement(title: str) -> tuple[int, str]:
# self-note: this needs to be tested with more tickers, maybe i should add some more keywords later to make this work nicely across all tickers
    """
    score the announcement by relevance (higher = more important)
    prioritises annual reports, results & disclosures
    """
    title_lower = title.lower()
    
    # high value keywords (10 points)
    high_keywords = [
        'annual report', 'appendix 4e', 'appendix 4d', 'fy2', 'hy2',
        'result', 'earnings', 'quarterly activities', 'financial report',
        'full year', 'half year', 'presentation'
    ]
    
    # medium value keywords (5 points)
    medium_keywords = ['guidance', 'dividend', 'agm', 'investor', 'briefing']
    
    # low value / noise keywords (-10 points)
    noise_keywords = [
        'appendix 3', 'notification of cessation', 'change in substantial',
        'update -', 'unquoted securities', 'notification regarding',
        'director transaction', 'initial director'
    ]

    
    score = 0
    reasons = []
    
    for kw in high_keywords:
        if kw in title_lower:
            score += 10
            reasons.append(f"High priority: {kw}")
    
    for kw in medium_keywords:
        if kw in title_lower:
            score += 5
            reasons.append(f"Medium priority: {kw}")
    
    for kw in noise_keywords:
        if kw in title_lower:
            score -= 10
            reasons.append(f"Filtered: {kw}")
    
    if not reasons:
        reason_text = "Standard filing"
    else:
        reason_text = " | ".join(reasons)
    
    return score, reason_text


async def get_recent_filings(ticker: str):
    """
    scrapes the last 5 announcements for a given ticker from marketindex
    """
    print(f"📄 [Filings] scraping docs for {ticker}...")
    
    filings = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        
        try:
            # navigate to the stock page
            url = f"https://www.marketindex.com.au/asx/{ticker.lower()}"
            await page.goto(url, wait_until="domcontentloaded", timeout=60000)
            
            # wait 
            await page.wait_for_timeout(2000)
            
            # enable price sensitive only (reduce noise)
            try:
                price_sensitive_toggle = await page.query_selector("input[type='checkbox']")
                if price_sensitive_toggle:
                    is_checked = await price_sensitive_toggle.is_checked()
                    if not is_checked:
                        await price_sensitive_toggle.click()
                        print("📄 [Filings] enabled 'Price Sensitive only' filter")
                        await page.wait_for_timeout(1500)  # wait for it to apply
            except Exception as e:
                print(f"⚠️ [Filings] could not enable price sensitive filter: {e}")
            
            # wait for announcements section load
            await page.wait_for_selector("a.announcement-pdf-link", timeout=20000)
            
            # get pdf links
            pdf_links = await page.query_selector_all("a.announcement-pdf-link")
            print(f"📄 [Filings] Found {len(pdf_links)} PDF links on page")
            
            # extract 20 filings for scoring
            for link in pdf_links[:20]:
                try:
                    pdf_url = await link.get_attribute("href")
                    
                    if pdf_url:
                        # get parent row to find date and title
                        parent = await link.evaluate_handle("el => el.closest('tr') || el.closest('[class*=\"row\"]') || el.parentElement.parentElement")
                        
                        date_text = ""
                        title_text = ""
                        
                        try:
                            # try to get date from first column
                            date_el = await parent.query_selector("td:first-child, [class*='date'], time")
                            if date_el:
                                date_text = await date_el.inner_text()
                            
                            # try to get title from the main link
                            title_el = await parent.query_selector("a[href*='/announcements/']:not(.announcement-pdf-link)")
                            if title_el:
                                title_text = await title_el.inner_text()
                            
                            # fallback: extract title from pdf url 
                            if not title_text and pdf_url:
                                slug = pdf_url.split("/")[-1]
                                title_text = slug.replace("-", " ").title()
                        except:
                            pass
                        
                        filings.append({
                            "date": date_text.strip() if date_text else "Recent",
                            "title": title_text.strip() if title_text else "Announcement",
                            "url": pdf_url
                        })
                except Exception as e:
                    print(f"Link parse error: {e}")
                    continue
            
            print(f"📄 [Filings] extracted {len(filings)} documents for {ticker}")
            
            # score + sort
            filings_with_scores = []
            for f in filings:
                score, reason = score_announcement(f['title'])
                filings_with_scores.append({
                    **f,
                    "score": score,
                    "score_reason": reason,
                    "filter_status": "included" if score >= 0 else "filtered"
                })
            
            # sort by score (highest first)
            filings_with_scores.sort(key=lambda x: x['score'], reverse=True)
            
            # get top 5 filings 
            top_filings = [f for f in filings_with_scores if f['score'] >= 0][:5]
            
            # Calculate statistics
            total_scanned = len(filings)
            filtered_count = len([f for f in filings_with_scores if f['score'] < 0])
            returned_count = len(top_filings)
            
            # Log scoring results
            print(f"📄 [Filings] Scoring summary for {ticker}:")
            print(f"  Total scanned: {total_scanned}")
            print(f"  Filtered (negative score): {filtered_count}")
            print(f"  Returned: {returned_count}")
            print(f"📄 [Filings] Top {returned_count} material disclosures:")
            for f in top_filings:
                print(f"  [{f['score']:3d}] {f['title'][:60]}... - {f['score_reason']}")
            
        except Exception as e:
            print(f"Scraper Error: {e}")
        finally:
            await browser.close()
    
    # return structured response with metadata
    return {
        "filings": top_filings if 'top_filings' in locals() else [],
        "metadata": {
            "total_scanned": total_scanned if 'total_scanned' in locals() else 0,
            "filtered_count": filtered_count if 'filtered_count' in locals() else 0,
            "returned_count": returned_count if 'returned_count' in locals() else 0,
            "ticker": ticker.upper()
        }
    }

async def analyse_pdf(pdf_url: str, ticker: str, db: Session):
    """
    downloads the pdf, extracts text & analyses using gemini
    """  
    # self-note: right now this is being sent to the llm as text because because gemini's native pdf processing [..]
    # doesn't work under hackclub proxy for some odd reason.
    
    # check cache
    try:
        cached = db.query(FilingAnalysis).filter(FilingAnalysis.pdf_url == pdf_url).first()
        if cached:
            print(f"✅ [Filings] serving analysis from cache for {ticker}")
            return {
                "guidance": cached.guidance,
                "risks": json.loads(cached.risks_json),
                "sentiment_score": cached.sentiment_score,
                "sentiment_reasoning": cached.sentiment_reasoning,
                "summary": json.loads(cached.summary_json)
            }
    except Exception as e:
        print(f"⚠️ [Filings] cache lookup failed: {e}")

    print(f"🧠 [Filings] downloading pdf for analysis: {pdf_url}")
    
    # download pdf
    pdf_text = ""
    try:
        async with httpx.AsyncClient() as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://www.marketindex.com.au/",
                "Accept": "application/pdf,application/octet-stream,*/*"
            }
            resp = await client.get(pdf_url, headers=headers, follow_redirects=True, timeout=30.0)
            
            if resp.status_code == 200:
                # extract text
                with io.BytesIO(resp.content) as f:
                    reader = pypdf.PdfReader(f)
                    for page in reader.pages[:10]: # limit to first 10 pages for the sake of context window (i haven't actually checked context limits, self-note to properly check later)
                        pdf_text += page.extract_text() + "\n"
                
                print(f"📄 [Text Extraction] extracted {len(pdf_text)} chars from {len(reader.pages)} pages")
                if len(pdf_text) < 100:
                    print(f"⚠️ [Warning] very little text extracted: '{pdf_text[:200]}'")
                else:
                    print(f"📄 [Sample]: {pdf_text[:300]}...")
            else:
                return {
                    "guidance": f"Download failed (Status {resp.status_code})",
                    "risks": ["Could not access source file"],
                    "sentiment_score": 0,
                    "sentiment_reasoning": "Download Error",
                    "summary": ["N/A"]
                }
    except Exception as e:
        print(f"Download/Extraction Error: {e}")
        return {
            "guidance": "Extraction error",
            "risks": [str(e)],
            "sentiment_score": 0,
            "sentiment_reasoning": "PDF processing failed",
            "summary": ["N/A"]
        }

    # analyse with gemini
    prompt = f"""
    You are an expert Investment Banker doing due diligence on {ticker}.
    Review this official announcement text below.
    
    --- DOCUMENT TEXT START ---
    {pdf_text[:30000]} 
    --- DOCUMENT TEXT END ---
    
    ### EXTRACT THE FOLLOWING INTELLIGENCE:
    
    1. **GUIDANCE**: Any quantitative forward-looking statements (Revenue, EBITDA, etc). If none, state "No explicit guidance".
    2. **KEY RISKS / RED FLAGS**: Look for "headwinds", "challenges", "regulatory issues", "margin compression".
    3. **SENTIMENT SCORE**: 0 (Panic) to 100 (Euphoric). Base this on the CEO's tone and the financial data presented.
    4. **SENTIMENT REASONING**: A 1-sentence justification for the score.
    5. **EXECUTIVE SUMMARY**: A concise, 3-bullet point summary of the document's core message.
    
    ### FORMAT
    Return strictly a JSON object with keys: "guidance", "risks", "sentiment_score" (int), "sentiment_reasoning", "summary" (list of strings).
    """

    try:
        response = await async_client.chat.completions.create(
            model="google/gemini-3-pro-preview", 
            messages=[{"role": "user", "content": prompt}]
        )
        
        content = response.choices[0].message.content
        print(f"📄 [AI Raw Response]: {content[:200]}...") 
        
        clean_content = content.replace("```json", "").replace("```", "").strip()
        start = clean_content.find("{")
        end = clean_content.rfind("}")
        if start != -1 and end != -1:
            clean_content = clean_content[start:end+1]
            
        result = json.loads(clean_content)
        
        #  save to cache
        try:
            new_cache = FilingAnalysis(
                pdf_url=pdf_url,
                ticker=ticker,
                guidance=result.get("guidance", ""),
                risks_json=json.dumps(result.get("risks", [])),
                sentiment_score=result.get("sentiment_score", 50),
                sentiment_reasoning=result.get("sentiment_reasoning", ""),
                summary_json=json.dumps(result.get("summary", []))
            )
            db.merge(new_cache) 
            db.commit()
            print(f"✅ [Filings] analysis cached for {ticker}")
        except Exception as e:
            print(f"⚠️ [Filings] failed to cache analysis: {e}")
            db.rollback()

        return result

    except Exception as e:
        print(f"Analysis Error: {e}")
        return {
            "guidance": "Analysis failed.",
            "risks": [str(e)],
            "sentiment_score": 50,
            "sentiment_reasoning": "AI Error",
            "summary": ["Could not parse response."]
        }

async def chat_with_document(pdf_url: str, history: list, question: str):
    """
    chat with the document (context-aware)
    """
    
    # download & extract text
    pdf_text = ""
    try:
        async with httpx.AsyncClient() as client:
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
            resp = await client.get(pdf_url, headers=headers, follow_redirects=True, timeout=30.0)
            if resp.status_code == 200:
                with io.BytesIO(resp.content) as f:
                    reader = pypdf.PdfReader(f)
                    for page in reader.pages[:10]: 
                        pdf_text += page.extract_text() + "\n"
            else:
                return f"Error: Could not download document (Status {resp.status_code})"
    except Exception as e:
        return f"Error downloading/extracting document: {e}"
    
    messages = [
        {
            "role": "system",
            "content": f"You are a financial analyst assistant. Answer the user's question based strictly on the provided document context below.\n\n--- DOCUMENT CONTEXT ---\n{pdf_text[:30000]}\n--- END CONTEXT ---\n\nBe concise and professional."
        }
    ]
    
    # append chat history (limit last 6 messages)
    clean_history = []
    for msg in history[-6:]:
        if isinstance(msg.get("content"), list):
             clean_history.append({"role": msg["role"], "content": "Context provided in system prompt."})
        else:
             clean_history.append(msg)

    messages.extend(clean_history)
    
    messages.append({"role": "user", "content": question})

    try:
        response = await async_client.chat.completions.create(
            model="google/gemini-3-flash-preview",
            messages=messages
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Error: {e}"
