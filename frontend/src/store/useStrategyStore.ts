import { create } from "zustand";
import { OptionLeg, OptionType, OptionAction, CalculationResult, User, SavedStrategy } from "../types";

interface StrategyState {
  underlyingSymbol: string;
  underlyingPrice: number;
  impliedVolatility: number;
  riskFreeRate: number;
  legs: OptionLeg[];
  calculationResult: CalculationResult | null;
  isCalculating: boolean;
  
  // Auth state
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  savedStrategies: SavedStrategy[];
  // IB auth state
  ibCredentials: {
    clientId: string | null;
    clientSecret: string | null;
    accessToken: string | null;
    expiresAt: number | null;
  } | null;
  
  // Actions
  setUnderlyingSymbol: (symbol: string) => void;
  setUnderlyingPrice: (price: number) => void;
  setImpliedVolatility: (iv: number) => void;
  setRiskFreeRate: (rate: number) => void;
  addLeg: (leg?: Partial<OptionLeg>) => void;
  removeLeg: (id: string) => void;
  updateLeg: (id: string, updates: Partial<OptionLeg>) => void;
  clearStrategy: () => void;
  setCalculationResult: (result: CalculationResult | null) => void;
  setIsCalculating: (isCalculating: boolean) => void;
  
  // Auth Actions
  login: (token: string, user: User) => void;
  loginWithGoogle: (token: string, user: User) => void;
  logout: () => void;
  setSavedStrategies: (strategies: SavedStrategy[]) => void;
  addSavedStrategy: (strategy: SavedStrategy) => void;
  removeSavedStrategy: (id: number) => void;
  // IB Actions
  setIBCredentials: (clientId: string, clientSecret: string, accessToken: string | null, expiresAt: number | null) => void;
  clearIBCredentials: () => void;
}

const DEFAULT_EXPIRATION = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30); // 30 days from now
  return d.toISOString().split("T")[0];
};

const generateId = () => Math.random().toString(36).substring(2, 11);

// Initialize token & user from localStorage if in browser
const getInitialAuth = () => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("alphaaegis_token");
    const userJson = localStorage.getItem("alphaaegis_user");
    if (token && userJson) {
      try {
        return {
          token,
          user: JSON.parse(userJson),
          isAuthenticated: true
        };
      } catch (e) {
        localStorage.removeItem("alphaaegis_token");
        localStorage.removeItem("alphaaegis_user");
      }
    }
  }
  return { token: null, user: null, isAuthenticated: false };
};

export const useStrategyStore = create<StrategyState>((set) => ({
  underlyingSymbol: "AAPL",
  underlyingPrice: 150.0,
  impliedVolatility: 0.25,
  riskFreeRate: 0.05,
  
  // Start with a default long call to look great instantly
  legs: [
    {
      id: generateId(),
      optionType: "CALL",
      action: "BUY",
      strikePrice: 150.0,
      expirationDate: DEFAULT_EXPIRATION(),
      daysToExpiration: 30,
      quantity: 1,
      premium: 4.5
    }
  ],
  
  calculationResult: null,
  isCalculating: false,
  
  ...getInitialAuth(),
  savedStrategies: [],
  ibCredentials: null,

  setUnderlyingSymbol: (symbol) => set({ underlyingSymbol: symbol.toUpperCase() }),
  
  setUnderlyingPrice: (price) => set({ underlyingPrice: Math.max(0.1, price) }),
  
  setImpliedVolatility: (iv) => set({ impliedVolatility: Math.max(0.01, iv) }),
  
  setRiskFreeRate: (rate) => set({ riskFreeRate: Math.max(0, rate) }),
  
  addLeg: (leg) => set((state) => {
    // Determine standard values based on current state
    const currentPrice = state.underlyingPrice;
    const strike = Math.round(currentPrice / 5) * 5; // Round to nearest 5
    
    const newLeg: OptionLeg = {
      id: generateId(),
      optionType: (leg?.optionType as OptionType) || "CALL",
      action: (leg?.action as OptionAction) || "BUY",
      strikePrice: leg?.strikePrice || strike,
      expirationDate: leg?.expirationDate || DEFAULT_EXPIRATION(),
      daysToExpiration: leg?.daysToExpiration ?? 30,
      quantity: leg?.quantity || 1,
      premium: leg?.premium || 2.5
    };
    
    return { legs: [...state.legs, newLeg] };
  }),
  
  removeLeg: (id) => set((state) => ({
    legs: state.legs.filter((leg) => leg.id !== id)
  })),
  
  updateLeg: (id, updates) => set((state) => ({
    legs: state.legs.map((leg) => {
      if (leg.id !== id) return leg;
      
      const newLeg = { ...leg, ...updates };
      // If expirationDate changed, calculate daysToExpiration
      if (updates.expirationDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const exp = new Date(updates.expirationDate);
        const diffTime = exp.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        newLeg.daysToExpiration = Math.max(0, diffDays);
      }
      return newLeg;
    })
  })),
  
  clearStrategy: () => set({ legs: [] }),
  
  setCalculationResult: (result) => set({ calculationResult: result }),
  
  setIsCalculating: (isCalculating) => set({ isCalculating }),
  
  login: (token, user) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("alphaaegis_token", token);
      localStorage.setItem("alphaaegis_user", JSON.stringify(user));
    }
    set({ token, user, isAuthenticated: true });
  },
  loginWithGoogle: (token, user) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("alphaaegis_token", token);
      localStorage.setItem("alphaaegis_user", JSON.stringify(user));
    }
    set({ token, user, isAuthenticated: true });
  },
  // IB auth actions
  setIBCredentials: (clientId, clientSecret, accessToken, expiresAt) => {
    set({ ibCredentials: { clientId, clientSecret, accessToken, expiresAt } });
  },
  clearIBCredentials: () => {
    set({ ibCredentials: null });
  },
  
  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("alphaaegis_token");
      localStorage.removeItem("alphaaegis_user");
    }
    set({ token: null, user: null, isAuthenticated: false, savedStrategies: [] });
  },
  
  setSavedStrategies: (strategies) => set({ savedStrategies: strategies }),
  
  addSavedStrategy: (strategy) => set((state) => ({
    savedStrategies: [strategy, ...state.savedStrategies]
  })),
  
  removeSavedStrategy: (id) => set((state) => ({
    savedStrategies: state.savedStrategies.filter((s) => s.id !== id)
  }))
}));
