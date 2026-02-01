<br />

<!-- PROJECT LOGO -->
<div align="center">
  <img src="frontend/public/assets/circle.png" alt="Kangaroo Terminal Logo" width="160" height="160"> 
  <h1 style="font-size: 3rem; margin-top: 10px;">Kangaroo Terminal</h1>
  
  <p>
    <strong>The Cozy Financial Intelligence Engine for the ASX.</strong>
  </p>

  <p>
    <a href="#-the-problem">The Problem</a> •
    <a href="#-the-solution">The Solution</a> •
    <a href="#-tech-stack">Tech Stack</a>
  </p>
</div>

---

## 🧸 About The Project

**Kangaroo Terminal** is a "Bloomberg Terminal" alternative designed specifically for the Australian market - but without the intimidation factor. 

We believe financial data shouldn't look like a sci-fi hacker movie. It should be accessible, friendly, and easy to understand. Kangaroo Terminal bridges the gap between raw data and actionable insight by combining real-time market data by providing detailed analysis and AI-powered assistance, all wrapped in a **cozy, distraction-free interface** (unlike the traditional Bloomberg Terminal interface, which has poor UX and is inaccessible).

## 🎯 The Problem
Institutional investors pay **$24,000/year** for terminals that aggregate data and news. Meanwhile, university students and retail investors are left digging through scattered PDFs on the ASX website, confusing Yahoo Finance charts, and messy spreadsheets. The data is there, but the user experience is hostile and irritating. Kangaroo Terminal aims to demoratise **Context**, now just showing you that a price moved, but telling you *why* it moved, *who* is buying, and *what* the risks are.

## ⚡ The Solution
A unified, friendly dashboard that provides:
#### Agentic Intelligence
1. A **conversational AI agent** (powered by `browser-use`) that can autonomously browse the live internet to research news, rumours, and macroeconomic events. 
2. A **'why' engine**, which automatically scans charts for area of volatility and dispatches AI agents to find and display the news event(s) which caused spikes or drops in price, inspired by Tradingview's news bubbles.
3. **Document Intelligence**, scraping and summarising ASX200 company PDF filings (annual reports, etc) into actionable insights.

#### Analysis Tools
1. A **Cycle Engine**, dispaying Interactive Relative Rotation Graphs (RRG) to visualise momentum between sectors. 
2. An **'Arena' Mode**, serving as a comparison engine which analyses performance & fundamentals b/w any two assets.
3. A **'Signal Hunter'**, scanning the market in real-time to detect technical setups (Golden Cross, RSI Extremes) and whale activity.
4. Interactive Discounted Cash Flow (DCF) models.

#### Portfolio Management
1. **Paper Trading (OMS)** - a full-fledged paper trading system with proper order management, supporting limit, market and stop orders.
2. A **'Risk Engine'**, calculating portfolio beta, correlation matrices and orders in real-time.
3. A **Time Machine**, benchmarking the portfolio against ~1y prior to analyse diversification and sensitivty to risk.

## 🛠 Tech Stack

### Frontend
- **Framework:** Next.js 15 (App Router / React 19)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + Framer Motion 
- **Charts:** Lightweight Charts (TradingView) & Recharts

### Backend
- **Engine:** Python 3.12+ (FastAPI)
- **Intelligence:** Google Gemini 3 Flash & Pro *(via https://ai.hackaclub.com)*
- **'Agentic' AI:** Browser-use & Playwright (Autonomous Web Navigation)
- **Data Engineering:** yFinance, Pandas, NumPy, SQLAlchemy
- **Data Sources:** yfinance, Newspaper3k, Feedparser, and custom scrapers
---

<div align="center">
  <p><em>Built with 🧡 by <b>chefpenguino</b> for the Hack Club Flavortown challenge</em></p>
</div>

<!-- HACK CLUB BRANDING -->
<br />

<div align="center">
  <a href="https://hackclub.com/">
    <img src="https://assets.hackclub.com/flag-standalone.svg" alt="Hack Club" width="150" />
  </a>
</div>