import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
HACKCLUB_API_KEY = os.getenv("HACKCLUB_API_KEY")

client = OpenAI(
    base_url="https://ai.hackclub.com/proxy/v1",
    api_key=HACKCLUB_API_KEY
)

def generate_briefing_content(data):
    """
    generates the executive briefing w/ google gemini
    """
    
    # context data
    context_str = f"""
    TIMESTAMP: {data.get('timestamp')}
    
    GLOBAL MARKETS (The Overnight Wrap):
    {data.get('global_markets')}
    
    MY PORTFOLIO (Holdings):
    {data.get('portfolio')}
    
    WATCHLIST (Stocks I'm watching):
    {data.get('watchlist')}
    
    MARKET MOVERS (Top Gainers/Losers Today):
    {data.get('movers')}
    
    UPCOMING EVENTS (Calendar):
    {data.get('calendar')}
    
    ALGO SIGNALS (Technical Indicators):
    {data.get('signals')}
    
    LATEST NEWS HEADLINES (Portfolio & Watchlist):
    {data.get('news')}
    """

    # construct the prompt
    prompt = f"""
    You are the Chief Investment Officer (CIO) of a boutique hedge fund in Sydney. 
    Your client is a sophisticated investor.
    Write a "Morning Executive Briefing" for them based on the provided market data.
    
    CONTEXT DATA:
    {context_str}
    
    ### INSTRUCTIONS
    Write a concise, high-impact newsletter. 
    Use a professional, insightful, yet slightly "hedge fund insider" tone.
    Do not be generic. specific insights > general observations.
    
    REQUIRED SECTIONS (Output strictly in JSON format):
    
    1. "overnight_wrap": HTML content. Summary of US/Global lead-ins and what it means for the ASX open.
    2. "portfolio_impact": HTML content. specific comments on how global moves/news might hit their specific holdings. ONE sentence per holding is good.
    3. "action_items": HTML content. 3-5 bullet points on what to watch today (earnings, signals, big moves).
    4. "vibe": Plain text. A 1-sentence "vibe check" for the day (e.g. "Defensive positioning recommended as tech sells off").
    
    ### FORMATTING
    - For the HTML fields, use <h3>, <p>, <ul>, <li>, <strong> tags. 
    - DO NOT use markdown backticks in the JSON values.
    - Return RAW JSON.
    """

    try:
        response = client.chat.completions.create(
            model="google/gemini-3-pro-preview",
            messages=[
                {"role": "system", "content": "You are a financial analyst engine that outputs raw JSON."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"}
        )
        
        return response.choices[0].message.content
        
    except Exception as e:
        print(f"Briefing Generation Error: {e}")
        return '{"error": "Failed to generate briefing."}'
