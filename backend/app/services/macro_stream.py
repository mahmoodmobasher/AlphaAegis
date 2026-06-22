import asyncio
import json
import logging
import re
import hashlib
import time
from collections import OrderedDict
from datetime import datetime
import redis.asyncio as aioredis
import httpx
import os
import types

logger = logging.getLogger("uvicorn.error")

# Quantitative Prompt Template for Ingestion Metrics
MACRO_PROMPT_TEMPLATE = """You are an institutional quantitative risk analyst agent integrated into the AlphaAegis Options Suite.

Analyze the following macroeconomic headline and calculate its pro-forma risk adjustments for a standard retail/institutional options portfolio.

[HEADLINE]
"{headline_text}"

[INSTRUCTIONS]
Evaluate the market impact of this headline and return exactly 4 quantitative fields:
1. "sentiment": A float between -1.00 (extremely bearish/hawkish) and 1.00 (extremely bullish/dovish).
2. "iv_adj": A float representing the estimated percentage point adjustment to near-term Implied Volatility (e.g., 4.5 means +4.5% IV expansion, -2.0 means -2.0% IV crush).
3. "spot_shock": A float representing the immediate percentage shock scenario to tech/semiconductor index equities (e.g., -3.2 means a -3.2% downward market shock).
4. "risk_rationale": A single concise sentence explaining the quantitative rationale behind your numbers.

[OUTPUT SPECIFICATION]
You must output ONLY a valid, raw JSON object. Do not include any conversational pleasantries, markdown prose, or preamble.

JSON Format:
{{
    "sentiment": <float>,
    "iv_adj": <float>,
    "spot_shock": <float>,
    "risk_rationale": "<string>"
}}"""

async def call_local_ollama_risk_model(client: httpx.AsyncClient, headline: str, model_name: str = "glm-4.7-flash") -> dict:
    """
    Queries the local Ollama container registry asynchronously.
    Enforces strict structural JSON parameters at the inference level.
    """
    url = "http://localhost:11434/api/generate"
    prompt = MACRO_PROMPT_TEMPLATE.format(headline_text=headline)
    
    payload = {
        "model": model_name,
        "prompt": prompt,
        "stream": False,
        "format": "json",  # Enforces structural constraints natively
        "options": {
            "temperature": 0.1
        }
    }
    
    try:
        response = await client.post(url, json=payload, timeout=15.0)
        if response.status_code == 200:
            result_json = response.json()
            raw_response_text = result_json.get("response", "").strip()
            
            cleaned_json = clean_json_string(raw_response_text)
            parsed_metrics = json.loads(cleaned_json)
            
            if all(k in parsed_metrics for k in ["sentiment", "iv_adj", "spot_shock"]):
                return parsed_metrics
                
        logger.warning(f"Ollama backend returned status {response.status_code}. Defaulting to fallbacks.")
    except Exception as exc:
        logger.error(f"Error executing inference run on model '{model_name}': {exc}")
        
    return {
        "sentiment": 0.0,
        "iv_adj": 0.0,
        "spot_shock": 0.0,
        "risk_rationale": "Inference server timeout or configuration error. Defaulted to neutral metrics."
    }

def clean_json_string(raw: str) -> str:
    """Strip markdown fences and extract the outermost JSON object."""
    if not raw:
        return raw
    if "```json" in raw:
        raw = raw.split("```json", 1)[1]
        raw = raw.split("```", 1)[0]
    elif "```" in raw:
        raw = raw.split("```", 1)[1]
        raw = raw.split("```", 1)[0]
    
    start = raw.find('{')
    end = raw.rfind('}')
    if start != -1 and end != -1 and end > start:
        raw = raw[start:end+1]
    return raw.strip()

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.3 Safari/537.36",
    "Accept": "application/xml,application/xhtml+xml,text/html;q=0.9,*/*;q=0.8"
}

FEED_SOURCES = {
    "yahoo": "https://finance.yahoo.com/news/rssindex",
    "cnbc": "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    "wsj_markets": "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
    "marketwatch": "https://www.marketwatch.com/rss/topstories"
}

class MemoryTTLDeduplicator:
    def __init__(self, ttl_seconds: int = 600):
        self.ttl = ttl_seconds
        self.cache = OrderedDict()

    def is_duplicate(self, headline_hash: str) -> bool:
        now = time.time()
        while self.cache and next(iter(self.cache.values())) < now - self.ttl:
            self.cache.popitem(last=False)
            
        if headline_hash in self.cache:
            return True
            
        self.cache[headline_hash] = now
        return False

in_memory_dedup = MemoryTTLDeduplicator(ttl_seconds=600)
seen_links = set()

async def fetch_and_emit_feed(client: httpx.AsyncClient, url: str, redis_client: aioredis.Redis, name: str):
    import feedparser
    try:
        try:
            response = await client.get(url, headers=HEADERS, follow_redirects=True)
        except Exception as get_exc:
            logger.error(f"Error executing HTTP GET request for RSS feed '{name}' ({url}): {get_exc}")
            return
        
        if response.status_code != 200:
            logger.error(f"Failed to fetch RSS feed '{name}' from {url}. Status code: {response.status_code}")
            return
        
        response_text = response.text
        print(f"📡 Feed Wire: '{name}' | Status: {response.status_code} | Bytes Received: {len(response_text)}")

        loop = asyncio.get_event_loop()
        feed = await loop.run_in_executor(None, feedparser.parse, response_text)
        
        if not feed or not feed.entries:
            logger.warning(f"No RSS feed entries parsed from {name} ({url})")
            return
            
        entries = feed.entries
        print(f"🔍 Scraped {len(entries)} raw entries from '{name}' wire.")
        
        for entry in entries[:25]:
            raw_title = entry.get("title")
            if not raw_title:
                continue
                
            title_clean = raw_title.strip()
            print(f"📰 Processing: Source: {name} | Headline: {title_clean}")

            title_hash = hashlib.md5(title_clean.encode('utf-8')).hexdigest()
            lock_key = f"macro:feed:seen:{title_hash}"

            is_new = False
            if redis_client:
                try:
                    set_result = await redis_client.set(lock_key, "1", ex=600, nx=True)
                    if set_result:
                        is_new = True
                except Exception as re:
                    logger.error(f"Error checking duplicate in Redis: {re}")
                    is_new = not in_memory_dedup.is_duplicate(title_hash)
            else:
                is_new = not in_memory_dedup.is_duplicate(title_hash)

            if not is_new:
                continue

            link = entry.get("link") or title_clean
            global seen_links
            if link in seen_links:
                continue
                
            seen_links.add(link)
            if len(seen_links) > 2000:
                seen_links = set(list(seen_links)[-1000:])
                
            # Invoke Local Ollama Layer with GLM-4.7-Flash
            metrics = await call_local_ollama_risk_model(client, title_clean, model_name="glm-4.7-flash")

            event_payload = {
                "headline": title_clean,
                "source": name,
                "timestamp": datetime.utcnow().isoformat(),
                "sentiment": float(metrics.get("sentiment", 0.0)),
                "iv_adj": float(metrics.get("iv_adj", 0.0)),
                "spot_shock": float(metrics.get("spot_shock", 0.0)),
                "risk_rationale": metrics.get("risk_rationale", "")
            }
            
            payload_str = json.dumps(event_payload)
            
            await redis_client.publish("macro:feed:raw", payload_str)
            await redis_client.lpush("macro:feed:cache", payload_str)
            await redis_client.ltrim("macro:feed:cache", 0, 199)
            
            logger.info(f"Published RSS macro event from {name}: {title_clean}")
            
    except Exception as e:
        logger.error(f"Error fetching or parsing RSS feed '{name}': {e}")

async def poll_all_feeds_matrix(client: httpx.AsyncClient, redis_client: aioredis.Redis):
    tasks = [
        fetch_and_emit_feed(client, url, redis_client, name)
        for name, url in FEED_SOURCES.items()
    ]
    await asyncio.gather(*tasks, return_exceptions=True)

async def start_macro_stream_worker(redis_url: str):
    try:
        redis_client = aioredis.from_url(redis_url, decode_responses=True)
        async with httpx.AsyncClient(timeout=10.0) as client:
            await poll_all_feeds_matrix(client, redis_client)
    except Exception as e:
        logger.error(f"Macro Ingestion Service iteration failed: {e}")
    finally:
        if 'redis_client' in locals():
            await redis_client.aclose()

async def main_loop():
    while True:
        try:
            print("📡 Aggregator loop awakening: Polling all macro endpoints concurrently...")
            await start_macro_stream_worker(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
        except Exception as e:
            logger.error(f"Ingestion error in main loop: {e}")
        print("💤 Iteration complete. Sleeping for 60 seconds...")
        await asyncio.sleep(60)

if __name__ == "__main__":
    asyncio.run(main_loop())