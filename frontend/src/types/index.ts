export type OptionType = "CALL" | "PUT";
export type OptionAction = "BUY" | "SELL";

export interface OptionLeg {
  id: string;
  optionType: OptionType;
  action: OptionAction;
  strikePrice: number;
  expirationDate: string;
  daysToExpiration: number;
  quantity: number;
  premium: number;
}

export interface UnderlyingAsset {
  symbol: string;
  price: number;
  iv: number; // e.g. 0.25 for 25%
  riskFreeRate: number; // e.g. 0.05 for 5%
}

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  position_delta: number;
  position_gamma: number;
  position_theta: number;
  position_vega: number;
  position_rho: number;
}

export interface LegCalculationResult {
  leg_index: number;
  price: number;
  position_value: number;
  greeks: Greeks;
}

export interface CalculationResult {
  legs: LegCalculationResult[];
  net_price: number;
  net_position_value: number;
  net_greeks: Greeks;
}

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface SavedStrategy {
  id: number;
  user_id: number;
  name: string;
  underlying_symbol: string;
  created_at: string;
  legs: Array<{
    id: number;
    strategy_id: number;
    option_type: OptionType;
    action: OptionAction;
    strike_price: number;
    expiration_date: string;
    quantity: number;
    premium: number;
  }>;
}
