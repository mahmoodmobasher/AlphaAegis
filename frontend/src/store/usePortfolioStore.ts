import { create } from 'zustand';

interface OptionLeg {
  id: string;
  symbol: string;
  strike: number;
  expiration: string;
  type: 'CALL' | 'PUT';
  quantity: number;
  action: 'BUY' | 'SELL';
}

interface PortfolioState {
  activePositions: OptionLeg[];
  spotPrice: number;
  volatility: number;
  aiCommentary: string;
  setActivePositions: (positions: OptionLeg[]) => void;
  setSpotPrice: (price: number) => void;
  setVolatility: (vol: number) => void;
  setAiCommentary: (text: string) => void;
}

export const usePortfolioStore = create<PortfolioState>((set) => ({
  activePositions: [],
  spotPrice: 180.00,
  volatility: 0.28,
  aiCommentary: '',
  setActivePositions: (positions) => set({ activePositions: positions }),
  setSpotPrice: (price) => set({ spotPrice: price }),
  setVolatility: (vol) => set({ volatility: vol }),
  setAiCommentary: (text) => set({ aiCommentary: text }),
}));
