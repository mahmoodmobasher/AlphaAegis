import json
import logging
import httpx
from typing import Dict, Any

logger = logging.getLogger("uvicorn.error")

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
MODEL_NAME = "llama3"  # High-performance financial sentiment model

async def analyze_sentiment_with_ollama(headline: str) -> Dict[str, Any]:
    """
    Asynchronously queries a local Ollama instance running llama3 to analyze headline sentiment
    and output strict pro-forma shock metrics. Falls back to 0.0 default metrics on error/timeout.
    """
    default_response = {
        "sentiment": 0.0,
        "iv_adj": 0.0,
        "spot_shock": 0.0
    }
    
    prompt = f"""Analyze the macroeconomic sentiment of the provided headline. You must respond with a raw JSON object containing exactly three numeric keys: 'sentiment' (float from -1.0 to 1.0), 'iv_adj' (float representing volatility impact), and 'spot_shock' (float representing index price movement). Do not wrap the JSON in markdown code blocks or add any trailing commentary text.
Headline: "{headline}"
"""

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            payload = {
                "model": MODEL_NAME,
                "prompt": prompt,
                "format": "json",
                "stream": False,
                "options": {
                    "temperature": 0.0
                }
            }

            response = await client.post(OLLAMA_URL, json=payload)
            if response.status_code == 200:
                result = response.json()
                raw_response = result.get("response", "").strip()
                # Strip away markdown code fences if present
                if raw_response.startswith("```json"):
                    raw_response = raw_response.split("```json")[1].split("```")[0].strip()
                elif raw_response.startswith("```"):
                    raw_response = raw_response.split("```")[1].split("```")[0].strip()

                try:
                    parsed_metrics = json.loads(raw_response)
                    sentiment = float(parsed_metrics.get("sentiment", 0.0))
                    iv_adj = float(parsed_metrics.get("iv_adj", 0.0))
                    spot_shock = float(parsed_metrics.get("spot_shock", 0.0))
                    
                    logger.info(f"Ollama successfully parsed sentiment metrics for: '{headline}' -> sentiment={sentiment}")
                    return {
                        "sentiment": sentiment,
                        "iv_adj": iv_adj,
                        "spot_shock": spot_shock
                    }
                except (json.JSONDecodeError, ValueError) as je:
                    logger.warning(f"Ollama output was not valid JSON: '{raw_response}'. Error: {je}")
            else:
                logger.warning(f"Ollama server returned status code {response.status_code}")
    except (httpx.ConnectError, httpx.TimeoutException) as ne:
        # Fallback silently to prevent blocking the async event loop if Ollama daemon is offline/not running
        logger.debug(f"Ollama client connection failed (Ollama service might be offline): {ne}")
    except Exception as e:
        logger.error(f"Unexpected error in Ollama sentiment analysis: {e}")
        
    return default_response
