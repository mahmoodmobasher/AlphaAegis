"""
Options strategy recognizer service for AlphaAegis.
Identifies standard option spreads and multi-leg combinations from list of option legs,
supporting single-spread detection and portfolio partitioning for complex books.
"""

from typing import List, Dict, Any, Optional
from collections import Counter

def recognize_single_strategy(legs: List[Dict[str, Any]]) -> str:

    """
    Recognizes the options strategy from a list of legs.
    Each leg dict must have:
      - sec_type: "STK" or "OPT"
      - option_type: "CALL" or "PUT" (None for STK)
      - action: "BUY" or "SELL"
      - strike: float (None for STK)
      - expiry: str (None for STK, formatted as YYYY-MM-DD)
      - qty: int (absolute position quantity)
    """
    if not legs:
        return "None"

    # Filter stock and option legs
    stock_legs = [l for l in legs if l.get("sec_type") == "STK"]
    option_legs = [l for l in legs if l.get("sec_type") == "OPT"]

    num_stk = len(stock_legs)
    num_opt = len(option_legs)

    # 1. pure stock positions
    if num_stk > 0 and num_opt == 0:
        if num_stk == 1:
            stk = stock_legs[0]
            if stk["action"] == "BUY":
                return "Long Stock"
            else:
                return "Short Stock"
        return "Custom / Unrecognized"

    # Normalize actions and types
    for op in option_legs:
        op["action"] = op["action"].upper()
        op["option_type"] = op["option_type"].upper()

    # Helpers
    def check_ratio(q1, q2, r1, r2):
        # Checks if q1/q2 matches ratio r1/r2
        return q1 * r2 == q2 * r1

    # 2. Stock + Option combinations
    if num_stk == 1 and num_opt > 0:
        stk = stock_legs[0]
        stk_action = stk["action"].upper()
        stk_qty = stk["qty"]

        # Covered Call / Protective Put / Synthetic Put / Collar
        if num_opt == 1:
            opt = option_legs[0]
            # Covered Call: Buy Stock + Sell Call
            if stk_action == "BUY" and opt["option_type"] == "CALL" and opt["action"] == "SELL":
                if stk_qty == opt["qty"] * 100:
                    return "Covered Call"
            # Protective Put: Buy Stock + Buy Put
            if stk_action == "BUY" and opt["option_type"] == "PUT" and opt["action"] == "BUY":
                if stk_qty == opt["qty"] * 100:
                    return "Protective Put"
            # Synthetic Put: Short Stock + Buy Call
            if stk_action == "SELL" and opt["option_type"] == "CALL" and opt["action"] == "BUY":
                if stk_qty == opt["qty"] * 100:
                    return "Synthetic Put"
            # Covered Put: Short Stock + Sell Put
            if stk_action == "SELL" and opt["option_type"] == "PUT" and opt["action"] == "SELL":
                if stk_qty == opt["qty"] * 100:
                    return "Covered Put"

        elif num_opt == 2:
            # Check Collar: Buy Stock + Buy Put (lower) + Sell Call (higher), same expiry
            opt1, opt2 = option_legs[0], option_legs[1]
            if opt1["expiry"] == opt2["expiry"]:
                # Sort options by strike
                opts_by_strike = sorted([opt1, opt2], key=lambda x: x["strike"])
                o_low, o_high = opts_by_strike[0], opts_by_strike[1]

                if stk_action == "BUY":
                    # Collar: Buy Put (lower) + Sell Call (higher)
                    if o_low["option_type"] == "PUT" and o_low["action"] == "BUY" and \
                       o_high["option_type"] == "CALL" and o_high["action"] == "SELL":
                        if stk_qty == o_low["qty"] * 100 and o_low["qty"] == o_high["qty"]:
                            return "Collar"

                # Covered Short Straddle / Strangle
                if o_low["option_type"] == "PUT" and o_low["action"] == "SELL" and \
                   o_high["option_type"] == "CALL" and o_high["action"] == "SELL":
                    if stk_qty == o_low["qty"] * 100 and o_low["qty"] == o_high["qty"]:
                        if o_low["strike"] == o_high["strike"]:
                            return "Covered Short Straddle"
                        else:
                            return "Covered Short Strangle"

        return "Custom / Unrecognized"

    # 3. Pure Options strategies
    if num_stk == 0 and num_opt > 0:
        # Check if all options have same expiry
        expiries = {op["expiry"] for op in option_legs}
        same_expiry = len(expiries) == 1

        if num_opt == 1:
            opt = option_legs[0]
            if opt["option_type"] == "CALL":
                return "Long Call" if opt["action"] == "BUY" else "Short Call"
            else:
                return "Long Put" if opt["action"] == "BUY" else "Short Put"

        elif num_opt == 2:
            if same_expiry:
                # Sort by strike
                opts = sorted(option_legs, key=lambda x: x["strike"])
                o1, o2 = opts[0], opts[1]

                # Check spreads
                if o1["option_type"] == "CALL" and o2["option_type"] == "CALL":
                    # Bull Call: Buy lower, Sell higher
                    if o1["action"] == "BUY" and o2["action"] == "SELL":
                        return "Bull Call Spread"
                    # Bear Call: Sell lower, Buy higher
                    if o1["action"] == "SELL" and o2["action"] == "BUY":
                        return "Bear Call Spread"

                if o1["option_type"] == "PUT" and o2["option_type"] == "PUT":
                    # Bull Put: Buy lower, Sell higher
                    if o1["action"] == "BUY" and o2["action"] == "SELL":
                        return "Bull Put Spread"
                    # Bear Put: Sell higher, Buy lower (which is Buy higher, Sell lower)
                    if o1["action"] == "SELL" and o2["action"] == "BUY":
                        return "Bear Put Spread"

                # Straddle / Strangle / Synthetic Future / Combo / Guts
                types = {o1["option_type"], o2["option_type"]}
                if types == {"CALL", "PUT"}:
                    call_opt = o1 if o1["option_type"] == "CALL" else o2
                    put_opt = o1 if o1["option_type"] == "PUT" else o2

                    if call_opt["strike"] == put_opt["strike"]:
                        # Straddle or Synthetic Future
                        if call_opt["action"] == "BUY" and put_opt["action"] == "BUY":
                            return "Long Straddle"
                        if call_opt["action"] == "SELL" and put_opt["action"] == "SELL":
                            return "Short Straddle"
                        if call_opt["action"] == "BUY" and put_opt["action"] == "SELL":
                            return "Long Synthetic Future"
                        if call_opt["action"] == "SELL" and put_opt["action"] == "BUY":
                            return "Short Synthetic Future"
                    else:
                        # Strangle, Combo, or Guts
                        # Combo / Strangle depends on strike orders
                        # Put strike < Call strike (K_put < K_call):
                        if put_opt["strike"] < call_opt["strike"]:
                            if put_opt["action"] == "BUY" and call_opt["action"] == "BUY":
                                return "Long Strangle"
                            if put_opt["action"] == "SELL" and call_opt["action"] == "SELL":
                                return "Short Strangle"
                            if put_opt["action"] == "SELL" and call_opt["action"] == "BUY":
                                return "Long Combo"
                            if put_opt["action"] == "BUY" and call_opt["action"] == "SELL":
                                return "Short Combo"
                        else:
                            # Put strike > Call strike (K_put > K_call) -> Guts
                            if put_opt["action"] == "BUY" and call_opt["action"] == "BUY":
                                return "Long Guts"
                            if put_opt["action"] == "SELL" and call_opt["action"] == "SELL":
                                return "Short Guts"

                # Ratio Spreads (same expiry, same option type, ratio of quantities e.g. 1:2)
                if o1["option_type"] == o2["option_type"]:
                    opt_type = o1["option_type"]
                    # Call Ratio Spread vs Call Ratio Backspread
                    if opt_type == "CALL":
                        # K1 < K2.
                        # Buy K1, Sell 2x K2: Call Ratio Spread
                        if o1["action"] == "BUY" and o2["action"] == "SELL" and o2["qty"] > o1["qty"]:
                            return "Call Ratio Spread"
                        # Sell K1, Buy 2x K2: Call Ratio Backspread
                        if o1["action"] == "SELL" and o2["action"] == "BUY" and o2["qty"] > o1["qty"]:
                            return "Call Ratio Backspread"
                    else:
                        # Put Ratio Spread vs Put Ratio Backspread
                        # K1 < K2.
                        # Put Ratio Spread: Buy K2, Sell 2x K1 (Buy higher, Sell lower)
                        if o1["action"] == "SELL" and o2["action"] == "BUY" and o1["qty"] > o2["qty"]:
                            return "Put Ratio Spread"
                        # Put Ratio Backspread: Sell K2, Buy 2x K1 (Sell higher, Buy lower)
                        if o1["action"] == "BUY" and o2["action"] == "SELL" and o1["qty"] > o2["qty"]:
                            return "Put Ratio Backspread"

            else:
                # Calendar Spreads (different expiries)
                # Sort by expiry E1 (earlier) < E2 (later)
                opts = sorted(option_legs, key=lambda x: x["expiry"])
                o_near, o_far = opts[0], opts[1]

                if o_near["strike"] == o_far["strike"]:
                    if o_near["option_type"] == "CALL" and o_far["option_type"] == "CALL":
                        if o_near["action"] == "SELL" and o_far["action"] == "BUY":
                            return "Calendar Call Spread"
                    if o_near["option_type"] == "PUT" and o_far["option_type"] == "PUT":
                        if o_near["action"] == "SELL" and o_far["action"] == "BUY":
                            return "Calendar Put Spread"
                else:
                    # Diagonal
                    if o_near["option_type"] == "CALL" and o_far["option_type"] == "CALL":
                        if o_near["action"] == "SELL" and o_far["action"] == "BUY":
                            return "Diagonal Call Spread"
                    if o_near["option_type"] == "PUT" and o_far["option_type"] == "PUT":
                        if o_near["action"] == "SELL" and o_far["action"] == "BUY":
                            return "Diagonal Put Spread"

            return "Custom / Unrecognized"

        elif num_opt == 3:
            if same_expiry:
                opts = sorted(option_legs, key=lambda x: x["strike"])
                o1, o2, o3 = opts[0], opts[1], opts[2]

                all_calls = all(o["option_type"] == "CALL" for o in opts)
                all_puts = all(o["option_type"] == "PUT" for o in opts)

                # Check Butterfly / Broken Wing
                if all_calls or all_puts:
                    # Long Butterfly: Buy K1 (1x), Sell K2 (2x), Buy K3 (1x)
                    # Short Butterfly: Sell K1 (1x), Buy K2 (2x), Sell K3 (1x)
                    is_long_bf = o1["action"] == "BUY" and o2["action"] == "SELL" and o3["action"] == "BUY" and o2["qty"] == 2 * o1["qty"] and o1["qty"] == o3["qty"]
                    is_short_bf = o1["action"] == "SELL" and o2["action"] == "BUY" and o3["action"] == "SELL" and o2["qty"] == 2 * o1["qty"] and o1["qty"] == o3["qty"]

                    interval_equal = abs((o2["strike"] - o1["strike"]) - (o3["strike"] - o2["strike"])) < 0.01

                    if all_calls:
                        if is_long_bf:
                            return "Long Call Butterfly" if interval_equal else "Call Broken Wing"
                        if is_short_bf:
                            return "Short Call Butterfly" if interval_equal else "Inverse Call Broken Wing"
                        
                        # Ladders
                        # Bull Call Ladder: Buy K1, Sell K2, Sell K3
                        if o1["action"] == "BUY" and o2["action"] == "SELL" and o3["action"] == "SELL" and o1["qty"] == o2["qty"] == o3["qty"]:
                            return "Bull Call Ladder"
                        # Bear Call Ladder: Sell K1, Buy K2, Buy K3
                        if o1["action"] == "SELL" and o2["action"] == "BUY" and o3["action"] == "BUY" and o1["qty"] == o2["qty"] == o3["qty"]:
                            return "Bear Call Ladder"

                    if all_puts:
                        if is_long_bf:
                            return "Long Put Butterfly" if interval_equal else "Put Broken Wing"
                        if is_short_bf:
                            return "Short Put Butterfly" if interval_equal else "Inverse Put Broken Wing"
                        
                        # Ladders
                        # Bull Put Ladder: Sell K1, Buy K2, Buy K3 (where K1 < K2 < K3)
                        if o1["action"] == "SELL" and o2["action"] == "BUY" and o3["action"] == "BUY" and o1["qty"] == o2["qty"] == o3["qty"]:
                            return "Bull Put Ladder"
                        # Bear Put Ladder: Buy K1, Sell K2, Sell K3
                        if o1["action"] == "BUY" and o2["action"] == "SELL" and o3["action"] == "SELL" and o1["qty"] == o2["qty"] == o3["qty"]:
                            return "Bear Put Ladder"

                # Check Strip / Strap
                # Strip: Buy 1 Call, Buy 2 Puts (same strike)
                # Strap: Buy 2 Calls, Buy 1 Put (same strike)
                strikes = {o["strike"] for o in opts}
                if len(strikes) == 1:
                    calls = [o for o in opts if o["option_type"] == "CALL"]
                    puts = [o for o in opts if o["option_type"] == "PUT"]
                    if len(calls) == 1 and len(puts) == 1:
                        c_opt, p_opt = calls[0], puts[0]
                        if c_opt["action"] == "BUY" and p_opt["action"] == "BUY":
                            if c_opt["qty"] == 1 and p_opt["qty"] == 2:
                                return "Strip"
                            if c_opt["qty"] == 2 and p_opt["qty"] == 1:
                                return "Strap"

                # Jade Lizard / Reverse Jade Lizard
                # Jade Lizard: Sell OTM Put (K1) + Sell OTM Call (K2) + Buy Call (K3)
                # Reverse Jade Lizard: Buy Put (K1) + Sell Put (K2) + Sell Call (K3)
                puts = [o for o in opts if o["option_type"] == "PUT"]
                calls = [o for o in opts if o["option_type"] == "CALL"]
                if len(puts) == 1 and len(calls) == 2:
                    p = puts[0]
                    c_low = calls[0] if calls[0]["strike"] < calls[1]["strike"] else calls[1]
                    c_high = calls[1] if calls[0]["strike"] < calls[1]["strike"] else calls[0]
                    
                    if p["strike"] < c_low["strike"] < c_high["strike"]:
                        if p["action"] == "SELL" and c_low["action"] == "SELL" and c_high["action"] == "BUY":
                            return "Jade Lizard"

                elif len(puts) == 2 and len(calls) == 1:
                    p_low = puts[0] if puts[0]["strike"] < puts[1]["strike"] else puts[1]
                    p_high = puts[1] if puts[0]["strike"] < puts[1]["strike"] else puts[0]
                    c = calls[0]
                    
                    if p_low["strike"] < p_high["strike"] < c["strike"]:
                        if p_low["action"] == "BUY" and p_high["action"] == "SELL" and c["action"] == "SELL":
                            return "Reverse Jade Lizard"

            return "Custom / Unrecognized"

        elif num_opt == 4:
            if same_expiry:
                opts = sorted(option_legs, key=lambda x: x["strike"])
                o1, o2, o3, o4 = opts[0], opts[1], opts[2], opts[3]

                all_calls = all(o["option_type"] == "CALL" for o in opts)
                all_puts = all(o["option_type"] == "PUT" for o in opts)

                # Condors
                if all_calls:
                    # Long Call Condor: Buy K1, Sell K2, Sell K3, Buy K4
                    if o1["action"] == "BUY" and o2["action"] == "SELL" and o3["action"] == "SELL" and o4["action"] == "BUY":
                        return "Long Call Condor"
                    # Short Call Condor: Sell K1, Buy K2, Buy K3, Sell K4
                    if o1["action"] == "SELL" and o2["action"] == "BUY" and o3["action"] == "BUY" and o4["action"] == "SELL":
                        return "Short Call Condor"

                if all_puts:
                    # Long Put Condor: Buy K1, Sell K2, Sell K3, Buy K4
                    if o1["action"] == "BUY" and o2["action"] == "SELL" and o3["action"] == "SELL" and o4["action"] == "BUY":
                        return "Long Put Condor"
                    # Short Put Condor: Sell K1, Buy K2, Buy K3, Sell K4
                    if o1["action"] == "SELL" and o2["action"] == "BUY" and o3["action"] == "BUY" and o4["action"] == "SELL":
                        return "Short Put Condor"

                # Iron Condor / Iron Butterfly
                puts = [o for o in opts if o["option_type"] == "PUT"]
                calls = [o for o in opts if o["option_type"] == "CALL"]
                if len(puts) == 2 and len(calls) == 2:
                    p_low = puts[0] if puts[0]["strike"] < puts[1]["strike"] else puts[1]
                    p_high = puts[1] if puts[0]["strike"] < puts[1]["strike"] else puts[0]
                    c_low = calls[0] if calls[0]["strike"] < calls[1]["strike"] else calls[1]
                    c_high = calls[1] if calls[0]["strike"] < calls[1]["strike"] else calls[0]

                    if p_low["strike"] < p_high["strike"] <= c_low["strike"] < c_high["strike"]:
                        # If Put side is credit (BUY low, SELL high) and Call side has one BUY, one SELL
                        if p_low["action"] == "BUY" and p_high["action"] == "SELL" and c_low["action"] != c_high["action"]:
                            if p_high["strike"] == c_low["strike"]:
                                return "Iron Butterfly"
                            else:
                                return "Iron Condor"
                        # If Put side is debit (SELL low, BUY high) and Call side has one BUY, one SELL
                        if p_low["action"] == "SELL" and p_high["action"] == "BUY" and c_low["action"] != c_high["action"]:
                            if p_high["strike"] == c_low["strike"]:
                                return "Inverse Iron Butterfly"
                            else:
                                return "Inverse Iron Condor"
            else:
                # Check Double Diagonal
                # Typically: 2 calls + 2 puts with different strikes and expiries
                # 1 Put SELL (shorter), 1 Put BUY (longer)
                # 1 Call SELL (shorter), 1 Call BUY (longer)
                puts = [o for o in option_legs if o["option_type"] == "PUT"]
                calls = [o for o in option_legs if o["option_type"] == "CALL"]
                if len(puts) == 2 and len(calls) == 2:
                    p_near = [p for p in puts if p["expiry"] == min(p["expiry"] for p in puts)]
                    p_far = [p for p in puts if p["expiry"] == max(p["expiry"] for p in puts)]
                    c_near = [c for c in calls if c["expiry"] == min(c["expiry"] for c in calls)]
                    c_far = [c for c in calls if c["expiry"] == max(c["expiry"] for c in calls)]

                    if len(p_near) == 1 and len(p_far) == 1 and len(c_near) == 1 and len(c_far) == 1:
                        pn, pf = p_near[0], p_far[0]
                        cn, cf = c_near[0], c_far[0]
                        if pn["action"] == "SELL" and pf["action"] == "BUY" and cn["action"] == "SELL" and cf["action"] == "BUY":
                            return "Double Diagonal"

            return "Custom / Unrecognized"

    return "Custom / Unrecognized"


def get_partitions(lst):
    if not lst:
        yield []
        return
    first = lst[0]
    for partition in get_partitions(lst[1:]):
        for i in range(len(partition)):
            yield partition[:i] + [partition[i] + [first]] + partition[i+1:]
        yield partition + [[first]]


def recognize_strategy(legs: List[Dict[str, Any]]) -> str:
    """
    Recognizes options strategies, with fallback to partitioning the portfolio 
    into recognized sub-strategies (e.g. Bull Put Spread + Bear Call Spread + Long Put).
    """
    if not legs:
        return "None"
        
    # First, try to recognize as a single strategy
    single_strat = recognize_single_strategy(legs)
    if single_strat not in ["Custom / Unrecognized", "None"]:
        return single_strat
        
    # If not recognized as a single strategy, try partitioning (only for larger complex structures of >= 5 legs)
    active_legs = [l for l in legs if l.get("qty", 0) > 0 or l.get("sec_type") == "STK"]
    if len(active_legs) < 5:
        return single_strat

    # Do not partition if any leg is a stock (to avoid dividing mismatched covered calls, etc.)
    if any(l.get("sec_type") == "STK" for l in active_legs):
        return "Custom / Unrecognized"

    # Avoid partition explosion for very large leg portfolios (limit to N <= 7)
    if len(active_legs) > 7:
        return "Custom / Unrecognized"

    best_score = -999999
    best_strategies = []

    for partition in get_partitions(active_legs):
        score = 0
        strategies = []
        for subset in partition:
            strat_name = recognize_single_strategy(subset)
            if strat_name not in ["Custom / Unrecognized", "None"]:
                # Award points based on subset size + multi-leg bonus
                size = len(subset)
                bonus = 15 if size >= 4 else (10 if size == 3 else (5 if size == 2 else 0))
                # Homogeneity bonus: prefer same option type (all PUTs or all CALLs)
                opt_types = {l.get("option_type") for l in subset if l.get("sec_type") == "OPT"}
                if len(opt_types) <= 1:
                    bonus += 0.5
                score += size * 10 + bonus
                strategies.append(strat_name)
            else:
                # Penalty for unrecognized leg groupings
                if len(subset) == 1:
                    score -= 1
                else:
                    score -= len(subset) * 50
                    
        if score > best_score:
            best_score = score
            best_strategies = strategies

    # Only return partitioned strategies if we found at least one recognized sub-strategy of size >= 2,
    # or if we successfully mapped all active legs to valid sub-strategies.
    if best_score > 0 and best_strategies:
        # Group identical sub-strategies and format output
        counts = Counter(best_strategies)
        formatted_strats = []
        for strat in sorted(counts.keys()):
            count = counts[strat]
            if count > 1:
                formatted_strats.append(f"{count}x {strat}")
            else:
                formatted_strats.append(strat)
        return " + ".join(formatted_strats)

    return "Custom / Unrecognized"
