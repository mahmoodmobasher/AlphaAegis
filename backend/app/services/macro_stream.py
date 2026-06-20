import asyncio
import random
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

async def start_macro_stream_worker(redis_url: str):
    logger.info("Macro Ingestion Service worker started.")
    try:
        redis_client = aioredis.from_url(redis_url, decode_responses=True)
        while True:
            # Sleep for 30 seconds between headlines
            await asyncio.sleep(30.0)
            
            headline_data = random.choice(HEADLINES)
            event_payload = {
                "headline": headline_data["text"],
                "sentiment": headline_data["sentiment"],
                "iv_adj": headline_data["iv_adj"],
                "spot_shock": headline_data["spot_shock"],
                "timestamp": datetime.utcnow().isoformat()
            }
            
            try:
                await redis_client.publish("macro:feed:raw", json.dumps(event_payload))
                logger.info(f"Published macro event: {headline_data['text']}")
            except Exception as e:
                logger.error(f"Error publishing macro event to Redis: {e}")
                
    except asyncio.CancelledError:
        logger.info("Macro Ingestion Service worker stopped.")
    except Exception as e:
        logger.error(f"Macro Ingestion Service encountered error: {e}")
