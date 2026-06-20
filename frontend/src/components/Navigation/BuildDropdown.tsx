"use client";

import React, { useState } from "react";
import { X, TrendingUp } from "lucide-react";

export interface StrategyItem {
  id: string;
  name: string;
  outlook: "bullish" | "bearish" | "neutral" | "income" | "directional";
  tags: string[];
  description: string;
  bulletPoints: string[];
  svgType: "call" | "put" | "spread_bull" | "spread_bear" | "straddle" | "strangle" | "condor" | "butterfly" | "lizard" | "naked_short" | "synthetic" | "calendar" | "ratio" | "ladder";
}

interface ColumnData {
  header: string;
  isHeaderStart: boolean;
  colSpan: number;
  categories: {
    title: string;
    items: StrategyItem[];
  }[];
}

const buildMenuData: ColumnData[] = [
  // Column 1: Novice
  {
    header: "Novice",
    isHeaderStart: true,
    colSpan: 1,
    categories: [
      {
        title: "BASIC",
        items: [
          {
            id: "long_call",
            name: "Long Call",
            outlook: "bullish",
            tags: ["Bullish", "Unlimited Profit", "Limited Loss"],
            description: "A simple bullish strategy for beginners. A call option gives you the right to buy the underlying stock at strike price A. Profits from an increase in stock price, with maximum risk capped at the premium paid.",
            bulletPoints: ["Buy a Call at strike A", "Profits from an increase in stock price", "Maximum loss is limited to the premium paid"],
            svgType: "call"
          },
          {
            id: "long_put",
            name: "Long Put",
            outlook: "bearish",
            tags: ["Bearish", "Limited Profit", "Limited Loss"],
            description: "A simple bearish strategy. A put option gives you the right to sell the stock at strike price A. Profits if the stock price decreases, with risk capped at the entry cost.",
            bulletPoints: ["Buy a Put at strike A", "Profits from a decrease in stock price", "Maximum loss is limited to the premium paid"],
            svgType: "put"
          }
        ]
      },
      {
        title: "INCOME",
        items: [
          {
            id: "covered_call",
            name: "Covered Call",
            outlook: "income",
            tags: ["Bullish/Neutral", "Limited Profit", "Limited Loss", "Income"],
            description: "Buy shares of stock and sell an out-of-the-money Call option to collect premium. This generates passive income and provides a small downside buffer, but caps maximum upside.",
            bulletPoints: ["Hold 100 shares of stock", "Sell 1 OTM Call at strike B", "Generates premium income, but limits upside profit"],
            svgType: "spread_bull"
          },
          {
            id: "cash_secured_put",
            name: "Cash-Secured Put",
            outlook: "income",
            tags: ["Bullish/Neutral", "Limited Profit", "Limited Loss", "Income"],
            description: "Sell an OTM Put option while keeping cash collateral. This generates premium income. If the stock drops below the strike, you will buy the stock at a discount.",
            bulletPoints: ["Sell 1 OTM Put at strike A", "Keep cash to purchase shares if assigned", "Earn premium income with a lower cost basis"],
            svgType: "spread_bull"
          }
        ]
      },
      {
        title: "OTHER",
        items: [
          {
            id: "protective_put",
            name: "Protective Put",
            outlook: "neutral",
            tags: ["Bullish", "Unlimited Profit", "Limited Loss"],
            description: "Own shares of stock and buy an ATM Put option. This acts as insurance, guaranteeing you can sell your shares at the strike price if the stock collapses.",
            bulletPoints: ["Hold 100 shares of stock", "Buy 1 Put at strike A", "Protects stock downside with capped risk"],
            svgType: "call"
          }
        ]
      }
    ]
  },
  // Column 2: Intermediate (Left)
  {
    header: "Intermediate",
    isHeaderStart: true,
    colSpan: 2,
    categories: [
      {
        title: "CREDIT SPREADS",
        items: [
          {
            id: "bull_put",
            name: "Bull Put Spread",
            outlook: "bullish",
            tags: ["Bullish/Neutral", "Limited Profit", "Limited Loss"],
            description: "Sell an OTM Put and buy a further OTM Put. Generates premium credit and is profitable if the stock stays above your sold strike.",
            bulletPoints: ["Sell Put B + Buy Put A", "Profits if stock remains stable or rises", "Defined risk credit strategy"],
            svgType: "spread_bull"
          },
          {
            id: "bear_call",
            name: "Bear Call Spread",
            outlook: "bearish",
            tags: ["Bearish/Neutral", "Limited Profit", "Limited Loss"],
            description: "Sell an OTM Call and buy a further OTM Call. Profitable if the stock remains below your sold Call strike at expiration.",
            bulletPoints: ["Sell Call A + Buy Call B", "Profits if stock stays stable or drops", "Defined risk credit strategy"],
            svgType: "spread_bear"
          }
        ]
      },
      {
        title: "NEUTRAL",
        items: [
          {
            id: "iron_butterfly",
            name: "Iron Butterfly",
            outlook: "neutral",
            tags: ["Neutral", "Limited Profit", "Limited Loss"],
            description: "Sell an ATM Put and ATM Call, and buy OTM Put and Call wings. Maximum profit is achieved if the stock pinpoints the center strike at expiration.",
            bulletPoints: ["Buy Put A + Sell Put B + Sell Call B + Buy Call C", "High reward potential if stock stays flat", "Tight profit zone"],
            svgType: "butterfly"
          },
          {
            id: "iron_condor",
            name: "Iron Condor",
            outlook: "neutral",
            tags: ["Neutral", "Limited Profit", "Limited Loss"],
            description: "Sell an OTM Put spread and OTM Call spread. Profits if the stock price remains flat between the two short strikes at expiration.",
            bulletPoints: ["Buy Put A + Sell Put B + Sell Call C + Buy Call D", "Best for low volatility stocks", "Defined risk neutral setup"],
            svgType: "condor"
          },
          {
            id: "long_put_butterfly",
            name: "Long Put Butterfly",
            outlook: "neutral",
            tags: ["Neutral", "Limited Profit", "Limited Loss"],
            description: "Buy one low strike Put, sell two middle strike Puts, and buy one high strike Put. Maximizes value at middle strike with low premium cost.",
            bulletPoints: ["Buy Put A + Sell 2 Puts B + Buy Put C", "Capped risk neutral strategy", "Requires stock to land near Strike B"],
            svgType: "butterfly"
          },
          {
            id: "long_call_butterfly",
            name: "Long Call Butterfly",
            outlook: "neutral",
            tags: ["Neutral", "Limited Profit", "Limited Loss"],
            description: "Buy one low strike Call, sell two middle strike Calls, and buy one high strike Call. A cheap neutral setup.",
            bulletPoints: ["Buy Call A + Sell 2 Calls B + Buy Call C", "Capped risk neutral strategy", "Requires stock to land near Strike B"],
            svgType: "butterfly"
          }
        ]
      },
      {
        title: "CALENDAR SPREADS",
        items: [
          {
            id: "calendar_call",
            name: "Calendar Call Spread",
            outlook: "neutral",
            tags: ["Neutral/Bullish", "Limited Profit", "Limited Loss"],
            description: "Sell a near-term Call and buy a longer-term Call at the same strike. Profits from rapid near-term theta decay.",
            bulletPoints: ["Sell near-term Call A", "Buy long-term Call A", "Profits from accelerated near-term decay"],
            svgType: "calendar"
          },
          {
            id: "calendar_put",
            name: "Calendar Put Spread",
            outlook: "neutral",
            tags: ["Neutral/Bearish", "Limited Profit", "Limited Loss"],
            description: "Sell a near-term Put and buy a longer-term Put at the same strike. A neutral-to-bearish calendar setup.",
            bulletPoints: ["Sell near-term Put A", "Buy long-term Put A", "Profits from accelerated near-term decay"],
            svgType: "calendar"
          },
          {
            id: "diagonal_call",
            name: "Diagonal Call Spread",
            outlook: "bullish",
            tags: ["Bullish/Neutral", "Limited Profit", "Limited Loss"],
            description: "Sell a near-term OTM Call and buy a longer-term ITM Call. A bullish calendar spread with directional tilt.",
            bulletPoints: ["Sell near-term Call B", "Buy long-term Call A (lower strike)", "Bullish bias with income decay"],
            svgType: "spread_bull"
          },
          {
            id: "diagonal_put",
            name: "Diagonal Put Spread",
            outlook: "bearish",
            tags: ["Bearish/Neutral", "Limited Profit", "Limited Loss"],
            description: "Sell a near-term OTM Put and buy a longer-term ITM Put. A bearish calendar spread with directional tilt.",
            bulletPoints: ["Sell near-term Put A", "Buy long-term Put B (higher strike)", "Bearish bias with income decay"],
            svgType: "spread_bear"
          }
        ]
      }
    ]
  },
  // Column 3: Intermediate (Right)
  {
    header: "Intermediate",
    isHeaderStart: false,
    colSpan: 0,
    categories: [
      {
        title: "DEBIT SPREADS",
        items: [
          {
            id: "bull_call",
            name: "Bull Call Spread",
            outlook: "bullish",
            tags: ["Bullish", "Limited Profit", "Limited Loss"],
            description: "Buy a lower strike Call and sell a higher strike Call with the same expiration. This lowers the cost of entry compared to a long call, but caps the maximum profit.",
            bulletPoints: ["Buy Call A + Sell Call B", "Profits from moderate stock increases", "Reduces risk but caps maximum return"],
            svgType: "spread_bull"
          },
          {
            id: "bear_put",
            name: "Bear Put Spread",
            outlook: "bearish",
            tags: ["Bearish", "Limited Profit", "Limited Loss"],
            description: "Buy a higher strike Put and sell a lower strike Put. This lowers the net cost of the bearish trade, but limits the maximum payoff if the stock drops heavily.",
            bulletPoints: ["Buy Put B + Sell Put A", "Profits from moderate stock decreases", "Reduces net debit but caps profits"],
            svgType: "spread_bear"
          }
        ]
      },
      {
        title: "DIRECTIONAL",
        items: [
          {
            id: "inverse_butterfly_put",
            name: "Inverse Iron Butterfly",
            outlook: "directional",
            tags: ["Volatile", "Limited Profit", "Limited Loss"],
            description: "Buy an ATM Put and ATM Call, and sell OTM Put and Call wings. The opposite of an Iron Butterfly; profits from large price movement.",
            bulletPoints: ["Sell Put A + Buy Put B + Buy Call B + Sell Call C", "Profits if stock moves outside wings", "Limited defined risk breakout setup"],
            svgType: "straddle"
          },
          {
            id: "inverse_condor",
            name: "Inverse Iron Condor",
            outlook: "directional",
            tags: ["Volatile", "Limited Profit", "Limited Loss"],
            description: "Buy an OTM Put spread and OTM Call spread. Profits if stock breaks out in either direction beyond the long strikes.",
            bulletPoints: ["Sell Put A + Buy Put B + Buy Call C + Sell Call D", "Profits from high volatility breakout", "Defined maximum risk"],
            svgType: "strangle"
          },
          {
            id: "short_put_butterfly",
            name: "Short Put Butterfly",
            outlook: "directional",
            tags: ["Volatile", "Limited Profit", "Limited Loss"],
            description: "Sell one low strike Put, buy two middle strike Puts, and sell one high strike Put. Profits from high volatility.",
            bulletPoints: ["Sell Put A + Buy 2 Puts B + Sell Put C", "Profits from a major move away from middle strike", "Defined risk"],
            svgType: "straddle"
          },
          {
            id: "short_call_butterfly",
            name: "Short Call Butterfly",
            outlook: "directional",
            tags: ["Volatile", "Limited Profit", "Limited Loss"],
            description: "Sell one low strike Call, buy two middle strike Calls, and sell one high strike Call. Profits if stock moves away from center strike.",
            bulletPoints: ["Sell Call A + Buy 2 Calls B + Sell Call C", "Profits from breakout in either direction", "Capped risk"],
            svgType: "strangle"
          },
          {
            id: "straddle",
            name: "Long Straddle",
            outlook: "directional",
            tags: ["Volatile", "Unlimited Profit", "Limited Loss"],
            description: "Buy an ATM Call and ATM Put. Profits from a large price move in either direction. Unprofitable if stock remains flat.",
            bulletPoints: ["Buy Call A + Buy Put A", "Profits from high stock volatility", "Maximum loss is the combined premiums"],
            svgType: "straddle"
          },
          {
            id: "strangle",
            name: "Long Strangle",
            outlook: "directional",
            tags: ["Volatile", "Unlimited Profit", "Limited Loss"],
            description: "Buy an OTM Call and OTM Put. Cheaper than a straddle, but requires a larger stock move to reach breakeven.",
            bulletPoints: ["Buy Call B + Buy Put A", "Profits from massive stock moves", "Cheaper entry cost than straddle"],
            svgType: "strangle"
          }
        ]
      },
      {
        title: "OTHER",
        items: [
          {
            id: "collar",
            name: "Collar",
            outlook: "bullish",
            tags: ["Bullish/Neutral", "Limited Profit", "Limited Loss"],
            description: "Own shares of stock, buy an OTM Put for protection, and sell an OTM Call to fund the Put purchase. Restricts potential returns but provides a floor.",
            bulletPoints: ["Hold 100 shares of stock", "Buy 1 OTM Put + Sell 1 OTM Call", "Creates a bracket boundary for the trade"],
            svgType: "spread_bull"
          }
        ]
      }
    ]
  },
  // Column 4: Advanced (Left)
  {
    header: "Advanced",
    isHeaderStart: true,
    colSpan: 2,
    categories: [
      {
        title: "NAKED",
        items: [
          {
            id: "short_put",
            name: "Short Put",
            outlook: "bullish",
            tags: ["Bullish/Neutral", "Limited Profit", "High Loss"],
            description: "Sell a naked Put option. Collects high premium but carries significant downside risk if the stock collapses.",
            bulletPoints: ["Sell 1 Put at strike A", "Profits if stock stays above A", "High risk of assignment"],
            svgType: "naked_short"
          },
          {
            id: "short_call",
            name: "Short Call",
            outlook: "bearish",
            tags: ["Bearish/Neutral", "Limited Profit", "Unlimited Loss"],
            description: "Sell a naked Call option. Highly risky strategy that profits if stock drops or stays flat. Carries unlimited risk if stock spikes.",
            bulletPoints: ["Sell 1 Call at strike B", "Profits if stock stays below B", "Extreme risk from upside spikes"],
            svgType: "naked_short"
          }
        ]
      },
      {
        title: "NEUTRAL",
        items: [
          {
            id: "short_straddle",
            name: "Short Straddle",
            outlook: "neutral",
            tags: ["Neutral", "Limited Profit", "Unlimited Loss"],
            description: "Sell an ATM Call and ATM Put. Extremely high risk. Profits if the stock remains perfectly flat and volatility declines.",
            bulletPoints: ["Sell Call A + Sell Put A", "Maximum profit is credit received", "Unlimited loss potential on moves"],
            svgType: "naked_short"
          },
          {
            id: "short_strangle",
            name: "Short Strangle",
            outlook: "neutral",
            tags: ["Neutral", "Limited Profit", "Unlimited Loss"],
            description: "Sell an OTM Call and OTM Put. Wider profit zone than short straddle, but still carries high leverage risk.",
            bulletPoints: ["Sell Call B + Sell Put A", "Profits if stock remains stable in range", "High tail risk"],
            svgType: "naked_short"
          },
          {
            id: "long_call_condor",
            name: "Long Call Condor",
            outlook: "neutral",
            tags: ["Neutral", "Limited Profit", "Limited Loss"],
            description: "Buy Call A, Sell Call B, Sell Call C, Buy Call D. Offers a wider profit zone than a butterfly spread.",
            bulletPoints: ["Buy Call A + Sell Call B + Sell Call C + Buy Call D", "Wider neutral sweet spot", "Defined max loss"],
            svgType: "condor"
          },
          {
            id: "long_put_condor",
            name: "Long Put Condor",
            outlook: "neutral",
            tags: ["Neutral", "Limited Profit", "Limited Loss"],
            description: "Buy Put A, Sell Put B, Sell Put C, Buy Put D. Defined risk neutral condor structured with puts.",
            bulletPoints: ["Buy Put A + Sell Put B + Sell Put C + Buy Put D", "Wide flat payoff top", "Defined risk profile"],
            svgType: "condor"
          }
        ]
      },
      {
        title: "RATIO SPREADS",
        items: [
          {
            id: "call_ratio_backspread",
            name: "Call Ratio Backspread",
            outlook: "bullish",
            tags: ["Bullish/Volatile", "Unlimited Profit", "Limited Loss"],
            description: "Sell a lower strike Call and buy two higher strike Calls. Profitable if stock surges heavily or collapses; unprofitable on moderate increases.",
            bulletPoints: ["Sell 1 Call A + Buy 2 Calls B", "Unlimited upside breakout profit", "Double long calls offset short call"],
            svgType: "ratio"
          },
          {
            id: "put_broken_wing",
            name: "Put Broken Wing",
            outlook: "bullish",
            tags: ["Bullish/Neutral", "Limited Profit", "Limited Loss"],
            description: "A butterfly spread with uneven wings. Eliminates upside risk when structured for a credit, leaving downside risk.",
            bulletPoints: ["Buy Put A + Sell 2 Puts B + Buy Put C (farther OTM)", "No risk to the upside", "High reward at center strike"],
            svgType: "lizard"
          },
          {
            id: "inverse_call_broken_wing",
            name: "Inverse Call Broken Wing",
            outlook: "bullish",
            tags: ["Bullish", "Limited Profit", "Limited Loss"],
            description: "Unequal wings call butterfly structured to profit on bullish breakout while containing risk.",
            bulletPoints: ["Sell Call A + Buy 2 Calls B + Sell Call C (unequal)", "Bullish bias butterfly variant"],
            svgType: "spread_bull"
          },
          {
            id: "put_ratio_backspread",
            name: "Put Ratio Backspread",
            outlook: "bearish",
            tags: ["Bearish/Volatile", "Unlimited Profit", "Limited Loss"],
            description: "Sell a higher strike Put and buy two lower strike Puts. Highly profitable if the stock falls sharply.",
            bulletPoints: ["Sell 1 Put B + Buy 2 Puts A", "High profit on crash", "Cheaper entry or credit entry"],
            svgType: "ratio"
          },
          {
            id: "call_broken_wing",
            name: "Call Broken Wing",
            outlook: "bearish",
            tags: ["Bearish/Neutral", "Limited Profit", "Limited Loss"],
            description: "A Call butterfly with unequal strike widths. No downside risk if entered for credit; carries upside risk.",
            bulletPoints: ["Buy Call A + Sell 2 Calls B + Buy Call C (unequal width)", "Zero risk if stock declines", "Peak payout at B"],
            svgType: "lizard"
          },
          {
            id: "inverse_put_broken_wing",
            name: "Inverse Put Broken Wing",
            outlook: "bearish",
            tags: ["Bearish", "Limited Profit", "Limited Loss"],
            description: "Bearish bias butterfly variant configured to cap losses while leaving directional upside open.",
            bulletPoints: ["Sell Put A + Buy 2 Puts B + Sell Put C (unequal)"],
            svgType: "spread_bear"
          }
        ]
      }
    ]
  },
  // Column 5: Advanced (Right)
  {
    header: "Advanced",
    isHeaderStart: false,
    colSpan: 0,
    categories: [
      {
        title: "INCOME",
        items: [
          {
            id: "covered_short_straddle",
            name: "Covered Short Straddle",
            outlook: "income",
            tags: ["Neutral/Income", "Limited Profit", "High Loss"],
            description: "Hold 100 shares of stock and sell an ATM Call and ATM Put. Generates extremely high premium income.",
            bulletPoints: ["Hold 100 shares of stock", "Sell 1 ATM Call + Sell 1 ATM Put", "High income buffer with substantial risk"],
            svgType: "lizard"
          },
          {
            id: "covered_short_strangle",
            name: "Covered Short Strangle",
            outlook: "income",
            tags: ["Neutral/Income", "Limited Profit", "High Loss"],
            description: "Hold 100 shares of stock and sell an OTM Call and OTM Put. Wider safety margin than covered short straddle.",
            bulletPoints: ["Hold 100 shares of stock", "Sell 1 OTM Call + Sell 1 OTM Put", "Generates double premium buffers"],
            svgType: "lizard"
          }
        ]
      },
      {
        title: "DIRECTIONAL",
        items: [
          {
            id: "short_call_condor",
            name: "Short Call Condor",
            outlook: "directional",
            tags: ["Volatile", "Limited Profit", "Limited Loss"],
            description: "Sell Call A, Buy Call B, Buy Call C, Sell Call D. Profits if the stock moves outside the condor wings.",
            bulletPoints: ["Sell Call A + Buy Call B + Buy Call C + Sell Call D", "Volatility breakout strategy", "Defined max risk"],
            svgType: "strangle"
          },
          {
            id: "short_put_condor",
            name: "Short Put Condor",
            outlook: "directional",
            tags: ["Volatile", "Limited Profit", "Limited Loss"],
            description: "Sell Put A, Buy Put B, Buy Put C, Sell Put D. Inverted neutral condor configured with puts.",
            bulletPoints: ["Sell Put A + Buy Put B + Buy Put C + Sell Put D", "Volatility breakout setup", "Defined max risk"],
            svgType: "strangle"
          }
        ]
      },
      {
        title: "LADDERS",
        items: [
          {
            id: "bull_call_ladder",
            name: "Bull Call Ladder",
            outlook: "neutral",
            tags: ["Bullish/Neutral", "Limited Profit", "Unlimited Loss"],
            description: "Buy Call A, Sell Call B, and Sell Call C at higher strikes. Delivers credit/debit savings but has naked upside risk.",
            bulletPoints: ["Buy Call A + Sell Call B + Sell Call C", "Bullish structure with naked call top", "Unlimited risk if stock spikes"],
            svgType: "ladder"
          },
          {
            id: "bear_call_ladder",
            name: "Bear Call Ladder",
            outlook: "directional",
            tags: ["Bearish/Volatile", "Unlimited Profit", "Limited Loss"],
            description: "Sell Call A, Buy Call B, and Buy Call C. Reverse of bull call ladder; profits from massive upward breakout.",
            bulletPoints: ["Sell Call A + Buy Call B + Buy Call C", "Directional breakout play", "Defined risk on downside"],
            svgType: "ladder"
          },
          {
            id: "bull_put_ladder",
            name: "Bull Put Ladder",
            outlook: "directional",
            tags: ["Bullish/Volatile", "Unlimited Profit", "Limited Loss"],
            description: "Sell Put C, Buy Put B, and Buy Put A at lower strikes. Directional breakout play using puts.",
            bulletPoints: ["Sell Put C + Buy Put B + Buy Put A", "Profits on major downward crash", "Defined upside risk"],
            svgType: "ladder"
          },
          {
            id: "bear_put_ladder",
            name: "Bear Put Ladder",
            outlook: "neutral",
            tags: ["Bearish/Neutral", "Limited Profit", "Unlimited Loss"],
            description: "Buy Put C, Sell Put B, and Sell Put A. Bearish bias setup with naked downside put risk.",
            bulletPoints: ["Buy Put C + Sell Put B + Sell Put A", "Downside risk below lower strike", "Capped upside return"],
            svgType: "ladder"
          }
        ]
      },
      {
        title: "OTHER",
        items: [
          {
            id: "jade_lizard",
            name: "Jade Lizard",
            outlook: "bullish",
            tags: ["Bullish/Neutral", "Limited Profit", "Limited Loss"],
            description: "Sell an OTM Put, Sell an OTM Call, and Buy a higher OTM Call. The total credit received exceeds the width of the call spread, eliminating upside risk.",
            bulletPoints: ["Sell Put A + Sell Call B + Buy Call C", "No upside risk if credit > spread width", "Best in high implied volatility"],
            svgType: "lizard"
          },
          {
            id: "reverse_jade_lizard",
            name: "Reverse Jade Lizard",
            outlook: "bearish",
            tags: ["Bearish/Neutral", "Limited Profit", "Limited Loss"],
            description: "Sell an OTM Call, Sell an OTM Put, and Buy a lower OTM Put. Eliminates downside risk while collecting net premium credit.",
            bulletPoints: ["Sell Call C + Sell Put B + Buy Put A", "No downside risk if credit > spread width", "Collects premium with bearish bias"],
            svgType: "lizard"
          }
        ]
      }
    ]
  },
  // Column 6: Expert
  {
    header: "Expert",
    isHeaderStart: true,
    colSpan: 1,
    categories: [
      {
        title: "RATIO SPREADS",
        items: [
          {
            id: "call_ratio_spread",
            name: "Call Ratio Spread",
            outlook: "bullish",
            tags: ["Neutral/Bullish", "Limited Profit", "Unlimited Loss"],
            description: "Buy 1 Call at strike A and Sell 2 Calls at strike B. Highly profitable if stock lands exactly at B, but unlimited risk to the upside.",
            bulletPoints: ["Buy 1 Call A + Sell 2 Calls B", "Maximum profit at strike B", "Naked upside call exposure"],
            svgType: "ladder"
          },
          {
            id: "put_ratio_spread",
            name: "Put Ratio Spread",
            outlook: "bearish",
            tags: ["Neutral/Bearish", "Limited Profit", "High Loss"],
            description: "Buy 1 Put at strike B and Sell 2 Puts at strike A. Profits if stock lands at A; high risk if stock crashes.",
            bulletPoints: ["Buy 1 Put B + Sell 2 Puts A", "Peak profit at strike A", "Substantial downside risk"],
            svgType: "ladder"
          }
        ]
      },
      {
        title: "SYNTHETIC",
        items: [
          {
            id: "long_synthetic_future",
            name: "Long Synthetic Future",
            outlook: "bullish",
            tags: ["Bullish", "Unlimited Profit", "Unlimited Loss"],
            description: "Buy an ATM Call and Sell an ATM Put. Mimics owning 100 shares of stock directly with almost zero premium cost.",
            bulletPoints: ["Buy 1 Call A + Sell 1 Put A", "Virtually identical payoff to long stock", "Zero premium outlay"],
            svgType: "synthetic"
          },
          {
            id: "short_synthetic_future",
            name: "Short Synthetic Future",
            outlook: "bearish",
            tags: ["Bearish", "Unlimited Profit", "Unlimited Loss"],
            description: "Sell an ATM Call and Buy an ATM Put. Mimics shorting 100 shares of stock directly.",
            bulletPoints: ["Sell 1 Call A + Buy 1 Put A", "Virtually identical payoff to short stock", "Capital efficient short stance"],
            svgType: "synthetic"
          },
          {
            id: "synthetic_put",
            name: "Synthetic Put",
            outlook: "bearish",
            tags: ["Bearish", "Unlimited Profit", "Limited Loss"],
            description: "Short 100 shares of stock and Buy 1 ATM Call. Protects the short stock position against upside spikes.",
            bulletPoints: ["Short 100 shares + Buy 1 Call A", "Equivalent to a Long Put", "Hedging strategy for short stock"],
            svgType: "put"
          }
        ]
      },
      {
        title: "ARBITRAGE",
        items: [
          {
            id: "long_combo",
            name: "Long Combo",
            outlook: "bullish",
            tags: ["Bullish", "Unlimited Profit", "Unlimited Loss"],
            description: "Sell an OTM Put and Buy an OTM Call. Synthetically replicates long stock with lower collateral requirements.",
            bulletPoints: ["Sell 1 Put A + Buy 1 Call B", "Bullish directional strategy", "Capital efficient synthetic position"],
            svgType: "synthetic"
          },
          {
            id: "short_combo",
            name: "Short Combo",
            outlook: "bearish",
            tags: ["Bearish", "Unlimited Profit", "Unlimited Loss"],
            description: "Buy an OTM Put and Sell an OTM Call. Replicates a short stock position.",
            bulletPoints: ["Buy 1 Put A + Sell 1 Call B", "Bearish directional setup", "Defined bounds before leverage"],
            svgType: "synthetic"
          }
        ]
      },
      {
        title: "OTHER",
        items: [
          {
            id: "strip",
            name: "Strip",
            outlook: "bearish",
            tags: ["Bearish/Volatile", "Unlimited Profit", "Limited Loss"],
            description: "Buy 1 ATM Call and 2 ATM Puts. A neutral-to-bearish volatility strategy that profits more from downward moves.",
            bulletPoints: ["Buy 1 Call A + Buy 2 Puts A", "Biased straddle structure", "Favors rapid downward drops"],
            svgType: "straddle"
          },
          {
            id: "strap",
            name: "Strap",
            outlook: "bullish",
            tags: ["Bullish/Volatile", "Unlimited Profit", "Limited Loss"],
            description: "Buy 2 ATM Calls and 1 ATM Put. A neutral-to-bullish volatility strategy that profits more from upward moves.",
            bulletPoints: ["Buy 2 Calls A + Buy 1 Put A", "Biased straddle structure", "Favors rapid upward spikes"],
            svgType: "straddle"
          },
          {
            id: "guts",
            name: "Long Guts",
            outlook: "directional",
            tags: ["Volatile", "Unlimited Profit", "Limited Loss"],
            description: "Buy an ITM Call and ITM Put. Similar to a straddle but more expensive with high probability of expiration value.",
            bulletPoints: ["Buy Call A + Buy Put B (ITM strikes)", "High cost volatility play", "Requires breakout away from strikes"],
            svgType: "straddle"
          },
          {
            id: "short_guts",
            name: "Short Guts",
            outlook: "neutral",
            tags: ["Neutral", "Limited Profit", "Unlimited Loss"],
            description: "Sell an ITM Call and ITM Put. Extremely high premium credit collected; carries massive directional risks.",
            bulletPoints: ["Sell Call A + Sell Put B (ITM strikes)", "High initial premium credit", "Substantial danger from breakouts"],
            svgType: "naked_short"
          },
          {
            id: "double_diagonal",
            name: "Double Diagonal",
            outlook: "neutral",
            tags: ["Neutral", "Limited Profit", "Limited Loss"],
            description: "Buy OTM long-term Call/Put and Sell nearer-term OTM Call/Put. Profitable if stock trades within a range.",
            bulletPoints: ["Buy long-term Put A/Call D", "Sell near-term Put B/Call C", "Range bound income setup"],
            svgType: "condor"
          }
        ]
      }
    ]
  }
];

interface BuildDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStrategy: (presetId: string) => void;
}

export default function BuildDropdown({ isOpen, onClose, onSelectStrategy }: BuildDropdownProps) {
  const [hovered, setHovered] = useState<StrategyItem>(buildMenuData[0].categories[0].items[0]);

  if (!isOpen) return null;

  // Render mini SVG payoff graphs
  const renderMiniGraph = (type: string) => {
    switch (type) {
      case "call":
        return (
          <svg className="w-full h-28 text-indigo-400" viewBox="0 0 200 100">
            <line x1="10" y1="65" x2="190" y2="65" stroke="#334155" strokeWidth="1.5" strokeDasharray="3 3" />
            <line x1="90" y1="10" x2="90" y2="90" stroke="#334155" strokeWidth="1.5" strokeDasharray="3 3" />
            <path d="M 20 65 L 90 65 L 170 15" fill="none" stroke="#00df89" strokeWidth="3" />
            <text x="75" y="85" fill="#64748b" fontSize="8">Strike A</text>
          </svg>
        );
      case "put":
        return (
          <svg className="w-full h-28 text-indigo-400" viewBox="0 0 200 100">
            <line x1="10" y1="65" x2="190" y2="65" stroke="#334155" strokeWidth="1.5" strokeDasharray="3 3" />
            <line x1="110" y1="10" x2="110" y2="90" stroke="#334155" strokeWidth="1.5" strokeDasharray="3 3" />
            <path d="M 30 15 L 110 65 L 180 65" fill="none" stroke="#ff3a60" strokeWidth="3" />
            <text x="95" y="85" fill="#64748b" fontSize="8">Strike A</text>
          </svg>
        );
      case "spread_bull":
        return (
          <svg className="w-full h-28 text-indigo-400" viewBox="0 0 200 100">
            <line x1="10" y1="50" x2="190" y2="50" stroke="#334155" strokeWidth="1.5" strokeDasharray="3 3" />
            <path d="M 20 80 L 80 80 L 140 25 L 180 25" fill="none" stroke="#00df89" strokeWidth="3" />
          </svg>
        );
      case "spread_bear":
        return (
          <svg className="w-full h-28 text-indigo-400" viewBox="0 0 200 100">
            <line x1="10" y1="50" x2="190" y2="50" stroke="#334155" strokeWidth="1.5" strokeDasharray="3 3" />
            <path d="M 20 25 L 60 25 L 130 80 L 180 80" fill="none" stroke="#ff3a60" strokeWidth="3" />
          </svg>
        );
      case "straddle":
        return (
          <svg className="w-full h-28 text-indigo-400" viewBox="0 0 200 100">
            <line x1="10" y1="65" x2="190" y2="65" stroke="#334155" strokeWidth="1.5" strokeDasharray="3 3" />
            <path d="M 30 15 L 100 70 L 170 15" fill="none" stroke="#00df89" strokeWidth="3" />
          </svg>
        );
      case "strangle":
        return (
          <svg className="w-full h-28 text-indigo-400" viewBox="0 0 200 100">
            <line x1="10" y1="65" x2="190" y2="65" stroke="#334155" strokeWidth="1.5" strokeDasharray="3 3" />
            <path d="M 20 15 L 75 70 L 125 70 L 180 15" fill="none" stroke="#00df89" strokeWidth="3" />
          </svg>
        );
      case "condor":
        return (
          <svg className="w-full h-28 text-indigo-400" viewBox="0 0 200 100">
            <line x1="10" y1="50" x2="190" y2="50" stroke="#334155" strokeWidth="1.5" strokeDasharray="3 3" />
            <path d="M 20 80 L 60 80 L 95 30 L 135 30 L 180 80" fill="none" stroke="#00df89" strokeWidth="3" />
          </svg>
        );
      case "butterfly":
        return (
          <svg className="w-full h-28 text-indigo-400" viewBox="0 0 200 100">
            <line x1="10" y1="50" x2="190" y2="50" stroke="#334155" strokeWidth="1.5" strokeDasharray="3 3" />
            <path d="M 20 80 L 80 80 L 100 25 L 120 80 L 180 80" fill="none" stroke="#00df89" strokeWidth="3" />
          </svg>
        );
      case "lizard":
        return (
          <svg className="w-full h-28 text-indigo-400" viewBox="0 0 200 100">
            <line x1="10" y1="50" x2="190" y2="50" stroke="#334155" strokeWidth="1.5" strokeDasharray="3 3" />
            <path d="M 20 80 L 60 80 L 115 35 L 180 35" fill="none" stroke="#00df89" strokeWidth="3" />
          </svg>
        );
      case "naked_short":
        return (
          <svg className="w-full h-28 text-indigo-400" viewBox="0 0 200 100">
            <line x1="10" y1="40" x2="190" y2="40" stroke="#334155" strokeWidth="1.5" strokeDasharray="3 3" />
            <path d="M 20 25 L 100 25 L 180 85" fill="none" stroke="#ff3a60" strokeWidth="3" />
          </svg>
        );
      case "synthetic":
        return (
          <svg className="w-full h-28 text-indigo-400" viewBox="0 0 200 100">
            <line x1="10" y1="50" x2="190" y2="50" stroke="#334155" strokeWidth="1.5" strokeDasharray="3 3" />
            <path d="M 30 85 L 170 15" fill="none" stroke="#00df89" strokeWidth="3" />
          </svg>
        );
      case "calendar":
        return (
          <svg className="w-full h-28 text-indigo-400" viewBox="0 0 200 100">
            <line x1="10" y1="60" x2="190" y2="60" stroke="#334155" strokeWidth="1.5" strokeDasharray="3 3" />
            <path d="M 20 75 Q 100 15 180 75" fill="none" stroke="#00df89" strokeWidth="3" />
          </svg>
        );
      case "ratio":
        return (
          <svg className="w-full h-28 text-indigo-400" viewBox="0 0 200 100">
            <line x1="10" y1="50" x2="190" y2="50" stroke="#334155" strokeWidth="1.5" strokeDasharray="3 3" />
            <path d="M 20 40 L 90 70 L 180 15" fill="none" stroke="#00df89" strokeWidth="3" />
          </svg>
        );
      case "ladder":
        return (
          <svg className="w-full h-28 text-indigo-400" viewBox="0 0 200 100">
            <line x1="10" y1="50" x2="190" y2="50" stroke="#334155" strokeWidth="1.5" strokeDasharray="3 3" />
            <path d="M 20 80 L 80 80 L 110 35 L 140 35 L 180 90" fill="none" stroke="#00df89" strokeWidth="3" />
          </svg>
        );
      default:
        return null;
    }
  };

  const getOutlookColorClass = (outlook: string) => {
    switch (outlook) {
      case "bullish":
        return "text-[#00df89] hover:bg-[#00df89]/10";
      case "bearish":
        return "text-[#ff3a60] hover:bg-[#ff3a60]/10";
      case "income":
        return "text-[#38bdf8] hover:bg-[#38bdf8]/10";
      case "directional":
        return "text-[#e945c7] hover:bg-[#e945c7]/10";
      default:
        return "text-slate-300 hover:bg-slate-800/80";
    }
  };

  return (
    <div className="absolute top-16 left-0 right-0 z-50 bg-[#070c14]/98 backdrop-blur-lg border-b border-slate-900 shadow-2xl p-6 transition duration-200">
      <div className="max-w-7xl mx-auto flex flex-col space-y-6">
        
        {/* Header bar of the dropdown */}
        <div className="flex items-center justify-between border-b border-slate-900 pb-3">
          <h2 className="text-sm font-extrabold text-white flex items-center gap-2 tracking-wide uppercase">
            <span className="p-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-lg">
              <TrendingUp className="h-4 w-4" />
            </span>
            Select Options Strategy
          </h2>
          <button 
            onClick={onClose}
            className="p-1 text-slate-500 hover:text-white hover:bg-slate-900 rounded-lg transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 6-column Strategy Selection Grid with Spans */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-5">
          {buildMenuData.map((col, colIdx) => (
            <div key={colIdx} className="space-y-4">
              
              {/* Main Column Headers (Novice, Intermediate, Advanced, Expert) */}
              {col.isHeaderStart ? (
                <div 
                  className="border-b border-slate-900 pb-1.5"
                  style={{ gridColumn: col.colSpan > 1 ? `span ${col.colSpan}` : "auto" }}
                >
                  <span className="text-xs font-black tracking-widest uppercase text-indigo-400">
                    {col.header}
                  </span>
                </div>
              ) : (
                <div className="h-6 hidden md:block"></div> /* Empty offset spacer for multi-column align */
              )}

              {/* Column Categories */}
              <div className="space-y-4">
                {col.categories.map((cat, catIdx) => (
                  <div key={catIdx} className="space-y-1.5">
                    <span className="text-[9px] font-black text-slate-500 tracking-widest uppercase block">
                      {cat.title}
                    </span>
                    <ul className="space-y-0.5">
                      {cat.items.map((item) => (
                        <li key={item.id}>
                          <button
                            onMouseEnter={() => setHovered(item)}
                            onClick={() => {
                              onSelectStrategy(item.id);
                              onClose();
                            }}
                            className={`w-full text-left px-2 py-1 rounded-lg text-xs font-bold transition flex items-center justify-between ${getOutlookColorClass(item.outlook)} ${
                              hovered.id === item.id ? "bg-slate-900/60 ring-1 ring-slate-800" : ""
                            }`}
                          >
                            <span>{item.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

            </div>
          ))}
        </div>

        {/* Dynamic Payoff Info Panel at the bottom */}
        {hovered && (
          <div className="border-t border-slate-900 pt-5 mt-2 grid grid-cols-1 lg:grid-cols-3 gap-6 bg-[#0c1220]/60 p-4 rounded-xl border border-slate-900 shadow-inner">
            <div className="lg:col-span-2 space-y-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="text-base font-extrabold text-white">{hovered.name}</h3>
                {hovered.tags.map((tag, idx) => (
                  <span 
                    key={idx} 
                    className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${
                      tag.includes("Bullish") 
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                        : tag.includes("Bearish") 
                        ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" 
                        : tag.includes("Neutral")
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                    }`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <p className="text-xs text-text-sub leading-relaxed max-w-2xl">{hovered.description}</p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 bg-[#0a0f1b]/80 p-3 rounded-lg border border-slate-900">
              <div className="flex-1 w-full max-w-[130px]">
                {renderMiniGraph(hovered.svgType)}
              </div>
              <div className="flex-1 text-left space-y-1.5">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Strategy Profile</span>
                <ul className="text-[10px] text-slate-300 space-y-1 list-disc pl-3 leading-snug font-medium">
                  {hovered.bulletPoints.map((bp, idx) => (
                    <li key={idx}>{bp}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
