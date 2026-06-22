import pytest
import re
from app.services.macro_stream import MemoryTTLDeduplicator

market_impact_gate_regex = re.compile(
    r'(?:\b[A-Z]{2,5}\b|\([A-Z]{1,5}\))'
    r'|\b(?:fed|fomc|inflation|cpi|gdp|yield|yields|treasury|bonds?|interest\s+rates|warsh|deepseek|rout|china|commodities|gold|settle\s+lower)\b',
    re.IGNORECASE
)

def test_market_impact_gate():
    # Pass cases (Macro / Ticker)
    assert market_impact_gate_regex.search("FOMC Statement: Rates remain unchanged") is not None
    assert market_impact_gate_regex.search("US CPI core inflation rises 0.3%") is not None
    assert market_impact_gate_regex.search("AAPL announces new products") is not None
    assert market_impact_gate_regex.search("NVDA stock jumps") is not None
    assert market_impact_gate_regex.search("Lindblad Expeditions (LIND) reports earnings") is not None
    assert market_impact_gate_regex.search("CrowdStrike (CRWD) announces partnerships") is not None

def test_memory_ttl_deduplicator():
    import time
    dedup = MemoryTTLDeduplicator(ttl_seconds=1) # 1 second TTL for easy testing
    
    h1 = "hash_headline_1"
    h2 = "hash_headline_2"
    
    # First time seen
    assert not dedup.is_duplicate(h1)
    assert not dedup.is_duplicate(h2)
    
    # Second time seen (within TTL window)
    assert dedup.is_duplicate(h1)
    assert dedup.is_duplicate(h2)
    
    # Sleep to expire TTL
    time.sleep(1.1)
    
    # Third time seen (expired TTL window)
    assert not dedup.is_duplicate(h1)
