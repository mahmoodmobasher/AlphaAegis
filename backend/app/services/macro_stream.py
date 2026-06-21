import asyncio
import json
import logging
from datetime import datetime
import redis.asyncio as aioredis

logger = logging.getLogger("uvicorn.error")

HEADLINES = [
    {"text": "FOMC Statement: Fed signals hawkish stance, expects rates to remain high for longer", "sentiment": -0.6, "iv_adj": 3.0, "spot_shock": -2.5},
    {"text": "CPI Print: Core Inflation cooler than expected at 3.1%, market risk sentiment rallies", "sentiment": 0.8, "iv_adj": -2.0, "spot_shock": 2.0},
    {"text": "Geopolitical Tension: Global energy supply chains face sudden disruption concerns", "sentiment": -0.5, "iv_adj": 4.5, "spot_shock": -1.5},
    {"text": "Retail Sales: Consumer spending remains resilient, beating consensus estimates", "sentiment": 0.5, "iv_adj": -1.0, "spot_shock": 1.2},
    {"text": "Jobless Claims: Labor market remains tight, adding to inflation concerns", "sentiment": -0.3, "iv_adj": 1.5, "spot_shock": -0.8},
    {"text": "Tech Volatility: Semiconductor supplier flags raw material shortages", "sentiment": -0.4, "iv_adj": 2.5, "spot_shock": -1.8}
]

FEEDS = {
    "yahoo": "https://finance.yahoo.com/news/rssindex",
    "cnbc": "https://search.cnbc.com/rs/search/combinedseo.xml?partnerId=2",
    "marketwatch": "https://feeds.a.dj.com/rss/marketwatch/topstories"
}

# Deduplication store
seen_links = set()

def analyze_sentiment(title: str):
    """
    Analyzes sentiment of the headline based on keywords and determines pro-forma shocks.
    Returns: (sentiment_score, iv_adjustment, spot_shock)
    """
    title_lower = title.lower()
    positive_words = ["inflation cooler", "rate cut", "rate cuts", "rally", "rallies", "surge", "surges", "beat", "beats", "growth", "gain", "gains", "rebound", "rebounds", "bullish", "optimism", "soar", "soars"]
    negative_words = ["hawkish", "rate hike", "rate hikes", "drop", "drops", "fall", "falls", "correction", "downturn", "geopolitical", "tension", "inflation rise", "inflation rising", "disruption", "concern", "concerns", "bearish", "pessimism", "plunge", "plunges", "slump", "slumps"]
    
    score = 0.0
    for word in positive_words:
        if word in title_lower:
            score += 0.4
    for word in negative_words:
        if word in title_lower:
            score -= 0.4
            
    score = max(-1.0, min(1.0, score))
    
    if score > 0:
        iv_adj = -2.0 * score
        spot_shock = 2.0 * score
    elif score < 0:
        iv_adj = 4.0 * abs(score)
        spot_shock = -3.0 * abs(score)
    else:
        iv_adj = 0.0
        spot_shock = 0.0
        
    return score, iv_adj, spot_shock

async def fetch_and_emit_feed(url: str, redis_client: aioredis.Redis, name: str):
    import feedparser
    try:
        loop = asyncio.get_event_loop()
        # Parse the RSS feed in an executor to avoid blocking the asyncio event loop
        feed = await loop.run_in_executor(None, feedparser.parse, url)
        
        if not feed or not feed.entries:
            logger.warning(f"No RSS feed entries parsed from {name} ({url})")
            return
            
        # Process the top 3 items to avoid spamming the channel on initial run/updates
        for entry in feed.entries[:3]:
            title = entry.get("title")
            link = entry.get("link") or title
            if not title:
                continue
                
            global seen_links
            if link in seen_links:
                continue
                
            seen_links.add(link)
            # Prevent unbounded growth of memory
            if len(seen_links) > 2000:
                seen_links = set(list(seen_links)[-1000:])
                
            sentiment, iv_adj, spot_shock = analyze_sentiment(title)
            event_payload = {
                "headline": title,
                "sentiment": sentiment,
                "iv_adj": iv_adj,
                "spot_shock": spot_shock,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            payload_str = json.dumps(event_payload)
            # Emit to alphaaegis-macro-events as requested, and fallback channel macro:feed:raw
            await redis_client.publish("alphaaegis-macro-events", payload_str)
            await redis_client.publish("macro:feed:raw", payload_str)
            logger.info(f"Published RSS macro event from {name}: {title} (Sentiment: {sentiment})")
    except Exception as e:
        logger.error(f"Error fetching or parsing RSS feed '{name}': {e}")

async def start_macro_stream_worker(redis_url: str):
    logger.info("Macro Ingestion Service RSS feed aggregator started.")
    try:
        redis_client = aioredis.from_url(redis_url, decode_responses=True)
        while True:
            # Gather all feed requests concurrently using gather to avoid waiting sequentially
            tasks = [
                fetch_and_emit_feed(url, redis_client, name)
                for name, url in FEEDS.items()
            ]
            await asyncio.gather(*tasks, return_exceptions=True)
            # Poll feeds every 60 seconds
            await asyncio.sleep(60.0)
    except asyncio.CancelledError:
        logger.info("Macro Ingestion Service RSS feed aggregator stopped.")
    except Exception as e:
        logger.error(f"Macro Ingestion Service RSS feed aggregator encountered error: {e}")
