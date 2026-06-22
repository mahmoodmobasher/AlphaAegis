import json
import logging
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from app.services.auth_helpers import get_current_user
from app.models.user import User

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/v1/feeds", tags=["Live Feeds"])

@router.get("/recent", response_model=List[Dict[str, Any]])
async def get_recent_feeds(current_user: User = Depends(get_current_user)):
    """
    Get the most recent macroeconomic headlines streaming into the system.
    Requires authentication.
    """
    from app.main import redis_client, REDIS_URL
    import redis.asyncio as aioredis

    client = redis_client
    if client is None:
        try:
            logger.info("redis_client was None, trying to initialize a temporary client...")
            client = aioredis.from_url(REDIS_URL, decode_responses=True)
            await client.ping()
        except Exception as e:
            logger.error(f"Redis is not available in feeds router: {e}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Redis cache service is not available"
            )

    try:
        cached_items = await client.lrange("macro:feed:cache", 0, 49)
        feeds = []
        for item in cached_items:
            try:
                data = json.loads(item)
                headline = data.get("headline") or data.get("title") or ""
                source = data.get("source") or "unknown"
                timestamp = data.get("timestamp") or ""
                sentiment = data.get("sentiment", 0.0)
                iv_adj = data.get("iv_adj", 0.0)
                spot_shock = data.get("spot_shock", 0.0)
                
                feeds.append({
                    "headline": headline,
                    "source": source,
                    "timestamp": timestamp,
                    "sentiment": sentiment,
                    "iv_adj": iv_adj,
                    "spot_shock": spot_shock
                })
            except Exception as parse_err:
                logger.error(f"Error parsing cached feed item: {parse_err}")
                continue
        return feeds
    except Exception as e:
        logger.error(f"Failed to retrieve feeds from Redis: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to query feeds cache: {str(e)}"
        )
