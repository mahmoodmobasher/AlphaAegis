import pytest
from app.services.macro_stream import KEYWORDS_PATTERN, TICKER_PATTERN, MemoryTTLDeduplicator

def test_market_impact_gate_keywords():
    # Pass cases (Macro)
    assert KEYWORDS_PATTERN.search("FOMC Statement: Rates remain unchanged") is not None
    assert KEYWORDS_PATTERN.search("US CPI core inflation rises 0.3%") is not None
    assert KEYWORDS_PATTERN.search("Unemployment rate drops to historical lows") is not None
    
    # Pass cases (Corporate/Micro)
    assert KEYWORDS_PATTERN.search("Apple reports record Q1 earnings and revenue") is not None
    assert KEYWORDS_PATTERN.search("CEO resigns after SEC investigation") is not None
    assert KEYWORDS_PATTERN.search("Company plans IPO in next fiscal year") is not None
    assert KEYWORDS_PATTERN.search("Merger and acquisition talks heat up") is not None
    
    # Pass cases (Sectors)
    assert KEYWORDS_PATTERN.search("Semiconductor chip shortages impact production") is not None
    assert KEYWORDS_PATTERN.search("New AI model released by tech giants") is not None
    
    # Fail cases
    assert KEYWORDS_PATTERN.search("Lindblad Expeditions announces new cruise package to Galapagos") is None
    assert KEYWORDS_PATTERN.search("Local park opens new playground for children") is None

def test_market_impact_gate_tickers():
    # Standalone upper ticker
    assert TICKER_PATTERN.search("AAPL announces new products") is not None
    assert TICKER_PATTERN.search("NVDA stock jumps") is not None
    
    # Parenthesis ticker
    assert TICKER_PATTERN.search("Lindblad Expeditions (LIND) reports earnings") is not None
    assert TICKER_PATTERN.search("CrowdStrike (CRWD) announces partnerships") is not None

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
