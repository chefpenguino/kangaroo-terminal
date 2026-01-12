<!-- HACK CLUB BRANDING -->
<br />

<div align="center">
  <a href="https://hackclub.com/">
    <img src="https://assets.hackclub.com/flag-standalone.svg" alt="Hack Club" width="150" />
  </a>
</div>

<br />
<br />

<!-- PROJECT BANNER -->
<div align="center">
  <img src="img/banner-roundcorner.png" alt="Kangaroo Terminal Banner" width="100%" style="border-radius: 10px;">
</div>

<!-- PROJECT LOGO -->
<div align="center">
  <img src="img/square.png" alt="Kangaroo Terminal Logo" width="160" height="160"> 
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

We believe financial data shouldn't look like a sci-fi hacker movie. It should be accessible, friendly, and easy to understand. Kangaroo Terminal bridges the gap between raw data and actionable insight by combining real-time market data by providing detailed analysis and AI-powered assistance, all wrapped in a **cozy, distraction-free interface** (unlike the traditional Bloomberg Terminal interface, which has poor UX).

## 🎯 The Problem
Institutional investors pay **$24,000/year** for terminals that aggregate data and news. Meanwhile, university students and retail investors are left digging through scattered PDFs on the ASX website, confusing Yahoo Finance charts, and messy spreadsheets. The data is there, but the user experience is hostile and irritating.

## ⚡ The Solution
A unified, friendly dashboard that:
1.  **Aggregates Data:** Real-time price, volume, and sector data for ASX listings.
2.  **Parses Documents:** Automatically scrapes and extracts text from ASX PDF announcements (Annual Reports, Updates).
3.  **Analyzes Sentiment:** Uses LLMs (Gemini API) to summarize 200-page reports into key bullet points and risk factors.
4.  **Models Valuation:** Provides interactive DCF (Discounted Cash Flow) sandboxes for students to test valuation assumptions.

## 🛠 Tech Stack

*   **Frontend:** Next.js (React), TypeScript, Tailwind CSS.
*   **Backend:** Python (FastAPI) for data processing and financial logic.
*   **Database:** PostgreSQL (Supabase).
*   **AI/ML:** Gemini API for RAG (Retrieval-Augmented Generation) on financial documents.
*   **Data Sources:** yfinance, ASX official announcements (scraped).

---

<div align="center">
  <p><em>Built with 🧡 by Penguino for the Hack Club Flavortown challenge</em></p>
</div>