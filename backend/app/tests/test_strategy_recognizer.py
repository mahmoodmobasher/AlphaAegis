import pytest
from app.services.strategy_recognizer import recognize_strategy

def test_pure_stocks():
    # Long Stock
    assert recognize_strategy([
        {"sec_type": "STK", "action": "BUY", "qty": 100}
    ]) == "Long Stock"
    
    # Short Stock
    assert recognize_strategy([
        {"sec_type": "STK", "action": "SELL", "qty": 100}
    ]) == "Short Stock"

def test_basic_options():
    # Long Call
    assert recognize_strategy([
        {"sec_type": "OPT", "option_type": "CALL", "action": "BUY", "strike": 150.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Long Call"

    # Short Call
    assert recognize_strategy([
        {"sec_type": "OPT", "option_type": "CALL", "action": "SELL", "strike": 150.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Short Call"

    # Long Put
    assert recognize_strategy([
        {"sec_type": "OPT", "option_type": "PUT", "action": "BUY", "strike": 150.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Long Put"

    # Short Put / Cash-Secured Put
    assert recognize_strategy([
        {"sec_type": "OPT", "option_type": "PUT", "action": "SELL", "strike": 150.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Short Put"

def test_stock_option_combos():
    # Covered Call
    assert recognize_strategy([
        {"sec_type": "STK", "action": "BUY", "qty": 100},
        {"sec_type": "OPT", "option_type": "CALL", "action": "SELL", "strike": 160.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Covered Call"

    # Protective Put
    assert recognize_strategy([
        {"sec_type": "STK", "action": "BUY", "qty": 100},
        {"sec_type": "OPT", "option_type": "PUT", "action": "BUY", "strike": 140.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Protective Put"

    # Synthetic Put
    assert recognize_strategy([
        {"sec_type": "STK", "action": "SELL", "qty": 100},
        {"sec_type": "OPT", "option_type": "CALL", "action": "BUY", "strike": 150.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Synthetic Put"

    # Collar
    assert recognize_strategy([
        {"sec_type": "STK", "action": "BUY", "qty": 100},
        {"sec_type": "OPT", "option_type": "PUT", "action": "BUY", "strike": 140.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "CALL", "action": "SELL", "strike": 160.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Collar"

def test_spreads():
    # Bull Call Spread
    assert recognize_strategy([
        {"sec_type": "OPT", "option_type": "CALL", "action": "BUY", "strike": 150.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "CALL", "action": "SELL", "strike": 160.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Bull Call Spread"

    # Bear Call Spread
    assert recognize_strategy([
        {"sec_type": "OPT", "option_type": "CALL", "action": "SELL", "strike": 150.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "CALL", "action": "BUY", "strike": 160.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Bear Call Spread"

    # Bull Put Spread
    assert recognize_strategy([
        {"sec_type": "OPT", "option_type": "PUT", "action": "BUY", "strike": 140.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "PUT", "action": "SELL", "strike": 150.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Bull Put Spread"

    # Bear Put Spread
    assert recognize_strategy([
        {"sec_type": "OPT", "option_type": "PUT", "action": "SELL", "strike": 140.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "PUT", "action": "BUY", "strike": 150.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Bear Put Spread"

def test_butterfly_and_condors():
    # Long Call Butterfly
    assert recognize_strategy([
        {"sec_type": "OPT", "option_type": "CALL", "action": "BUY", "strike": 140.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "CALL", "action": "SELL", "strike": 150.0, "expiry": "2026-07-02", "qty": 2},
        {"sec_type": "OPT", "option_type": "CALL", "action": "BUY", "strike": 160.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Long Call Butterfly"

    # Call Broken Wing
    assert recognize_strategy([
        {"sec_type": "OPT", "option_type": "CALL", "action": "BUY", "strike": 140.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "CALL", "action": "SELL", "strike": 150.0, "expiry": "2026-07-02", "qty": 2},
        {"sec_type": "OPT", "option_type": "CALL", "action": "BUY", "strike": 165.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Call Broken Wing"

    # Iron Condor
    assert recognize_strategy([
        {"sec_type": "OPT", "option_type": "PUT", "action": "BUY", "strike": 130.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "PUT", "action": "SELL", "strike": 140.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "CALL", "action": "SELL", "strike": 160.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "CALL", "action": "BUY", "strike": 170.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Iron Condor"

    # NVDA position (hybrid Iron Condor: put credit spread + call debit spread)
    assert recognize_strategy([
        {"sec_type": "OPT", "option_type": "CALL", "action": "BUY", "strike": 240.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "PUT", "action": "SELL", "strike": 205.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "CALL", "action": "SELL", "strike": 245.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "PUT", "action": "BUY", "strike": 200.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Iron Condor"

    # Iron Butterfly
    assert recognize_strategy([
        {"sec_type": "OPT", "option_type": "PUT", "action": "BUY", "strike": 130.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "PUT", "action": "SELL", "strike": 150.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "CALL", "action": "SELL", "strike": 150.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "CALL", "action": "BUY", "strike": 170.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Iron Butterfly"

def test_neutral_and_synthetic_two_legs():
    # Long Straddle
    assert recognize_strategy([
        {"sec_type": "OPT", "option_type": "CALL", "action": "BUY", "strike": 150.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "PUT", "action": "BUY", "strike": 150.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Long Straddle"

    # Short Straddle
    assert recognize_strategy([
        {"sec_type": "OPT", "option_type": "CALL", "action": "SELL", "strike": 150.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "PUT", "action": "SELL", "strike": 150.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Short Straddle"

    # Long Strangle
    assert recognize_strategy([
        {"sec_type": "OPT", "option_type": "CALL", "action": "BUY", "strike": 160.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "PUT", "action": "BUY", "strike": 140.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Long Strangle"

    # Short Strangle
    assert recognize_strategy([
        {"sec_type": "OPT", "option_type": "CALL", "action": "SELL", "strike": 160.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "PUT", "action": "SELL", "strike": 140.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Short Strangle"

    # Long Synthetic Future
    assert recognize_strategy([
        {"sec_type": "OPT", "option_type": "CALL", "action": "BUY", "strike": 150.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "PUT", "action": "SELL", "strike": 150.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Long Synthetic Future"

    # Long Combo
    assert recognize_strategy([
        {"sec_type": "OPT", "option_type": "CALL", "action": "BUY", "strike": 160.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "PUT", "action": "SELL", "strike": 140.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Long Combo"

def test_unrecognized_custom_debugging():
    # A single random option leg with STK leg of mismatch qty
    assert recognize_strategy([
        {"sec_type": "STK", "action": "BUY", "qty": 50},
        {"sec_type": "OPT", "option_type": "CALL", "action": "SELL", "strike": 160.0, "expiry": "2026-07-02", "qty": 2}
    ]) == "Custom / Unrecognized"

    # Three completely random legs
    assert recognize_strategy([
        {"sec_type": "OPT", "option_type": "CALL", "action": "BUY", "strike": 100.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "PUT", "action": "BUY", "strike": 150.0, "expiry": "2026-07-02", "qty": 1},
        {"sec_type": "OPT", "option_type": "CALL", "action": "SELL", "strike": 200.0, "expiry": "2026-07-02", "qty": 1}
    ]) == "Custom / Unrecognized"

    # Empty list
    assert recognize_strategy([]) == "None"


def test_strategy_recognizer_partitioning():
    # 5-leg combination: 65 Put (Buy), 76/80 Bull Put (Buy 76, Sell 80), 75/79 Bear Call (Sell 75, Buy 79)
    legs = [
        {"sec_type": "OPT", "option_type": "PUT", "action": "BUY", "strike": 65.0, "expiry": "2026-06-18", "qty": 1},
        {"sec_type": "OPT", "option_type": "PUT", "action": "SELL", "strike": 80.0, "expiry": "2026-06-18", "qty": 2},
        {"sec_type": "OPT", "option_type": "PUT", "action": "BUY", "strike": 76.0, "expiry": "2026-06-18", "qty": 2},
        {"sec_type": "OPT", "option_type": "CALL", "action": "SELL", "strike": 75.0, "expiry": "2026-06-18", "qty": 2},
        {"sec_type": "OPT", "option_type": "CALL", "action": "BUY", "strike": 79.0, "expiry": "2026-06-18", "qty": 2}
    ]
    
    # This should be partitioned into:
    # - 76/80 Bull Put Spread
    # - 75/79 Bear Call Spread
    # - 65 Long Put
    expected = "Bear Call Spread + Bull Put Spread + Long Put"
    assert recognize_strategy(legs) == expected

