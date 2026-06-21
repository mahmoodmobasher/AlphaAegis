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
    
    prompt = f"""You are a financial options risk analysis agent.
Analyze the following macroeconomic news headline: "{headline}"
Evaluate its sentiment and risk parameters.
Output exactly a strict, unformatted JSON dictionary containing exactly these keys:
- "sentiment": A float between -1.0 (extreme bearish/panic) and +1.0 (extreme bullish/risk-on)
- "iv_adj": Volatility percentage shift as a float (e.g. 0.025 for +2.5% premium pump, -0.012 for -1.2% dump)
- "spot_shock": Price movement percentage shift as a float (e.g. -0.018 for -1.8% drop, 0.015 for +1.5% rally)

Return ONLY the raw JSON structure. No markdown blocks, no wrapping, no headers.
Example:
{{"sentiment": 0.4, "iv_adj": -0.01, "spot_shock": 0.015}}
"""

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            payload = {
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.1  # low temperature for high determinism
                }
            }
            # Enforce JSON mode if model supports it
            try:
                payload["format"] = "json"
            except Exception:
                pass

            response = await client.post(OLLAMA_URL, json=payload)
            if response.status_code == 200:
                result = response.json()
                text = result.get("response", "").strip()
                # Parse text response as JSON
                try:
                    data = json.loads(text)
                    # Force values to float and validate structure
                    sentiment = float(data.get("sentiment", 0.0))
                    iv_adj = float(data.get("iv_adj", 0.0))
                    spot_shock = float(data.get("spot_shock", 0.0))
                    
                    logger.info(f"Ollama successfully parsed sentiment metrics for: '{headline}' -> sentiment={sentiment}")
                    return {
                        "sentiment": sentiment,
                        "iv_adj": iv_adj,
                        "spot_shock": spot_shock
                    }
                except (json.JSONDecodeError, ValueError) as je:
                    logger.warning(f"Ollama output was not valid JSON: '{text}'. Error: {je}")
            else:
                logger.warning(f"Ollama server returned status code {response.status_code}")
    except (httpx.ConnectError, httpx.TimeoutException) as ne:
        # Fallback silently to prevent blocking the async event loop if Ollama daemon is offline/not running
        logger.debug(f"Ollama client connection failed (Ollama service might be offline): {ne}")
    except Exception as e:
        logger.error(f"Unexpected error in Ollama sentiment analysis: {e}")
        
    return default_response
