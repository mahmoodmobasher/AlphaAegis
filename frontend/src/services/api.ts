const API_BASE_URL = "http://localhost:8000/api";

export async function apiRequest(
  endpoint: string,
  options: RequestInit = {},
  token: string | null = null
) {
  const headers = new Headers(options.headers || {});
  
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = "API Request failed";
    try {
      const errJson = await response.json();
      errorDetail = errJson.detail || errorDetail;
    } catch (_) {}
    throw new Error(errorDetail);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const authApi = {
  register: async (email: string, password: string, fullName: string) => {
    return apiRequest("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, full_name: fullName }),
    });
  },

  login: async (email: string, password: string) => {
    const formData = new URLSearchParams();
    formData.append("username", email);
    formData.append("password", password);

    return apiRequest("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });
  },

  getMe: async (token: string) => {
    return apiRequest("/auth/me", {}, token);
  },
  googleLogin: async (id_token: string) => {
    return apiRequest('/auth/google', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token }),
    });
  },
};

export const strategyApi = {
  save: async (
    token: string,
    name: string,
    underlyingSymbol: string,
    legs: any[]
  ) => {
    const payload = {
      name,
      underlying_symbol: underlyingSymbol,
      legs: legs.map((l) => ({
        option_type: l.optionType,
        action: l.action,
        strike_price: l.strikePrice,
        expiration_date: l.expirationDate,
        quantity: l.quantity,
        premium: l.premium,
      })),
    };
    return apiRequest("/strategies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, token);
  },

  list: async (token: string) => {
    return apiRequest("/strategies", {}, token);
  },

  delete: async (token: string, strategyId: number) => {
    return apiRequest(`/strategies/${strategyId}`, {
      method: "DELETE",
    }, token);
  },

  calculate: async (
    underlyingSymbol: string,
    underlyingPrice: number,
    iv: number,
    riskFreeRate: number,
    legs: any[]
  ) => {
    const payload = {
      underlying_symbol: underlyingSymbol,
      underlying_price: underlyingPrice,
      implied_volatility: iv,
      risk_free_rate: riskFreeRate,
      legs: legs.map((l) => ({
        option_type: l.optionType,
        action: l.action,
        strike_price: l.strikePrice,
        expiration_date: l.expirationDate,
        quantity: l.quantity,
        premium: l.premium,
        days_to_expiration: l.daysToExpiration,
      })),
    };
    return apiRequest("/strategies/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },
};

export const portfolioApi = {
  getPortfolio: async (token: string) => {
    return apiRequest("/portfolio", {}, token);
  },

  savePosition: async (
    token: string,
    name: string,
    underlyingSymbol: string,
    entryPrice: number,
    quantity: number,
    legs: any[]
  ) => {
    const payload = {
      name,
      underlying_symbol: underlyingSymbol,
      entry_price: entryPrice,
      quantity,
      legs: legs.map((l) => ({
        option_type: l.optionType,
        action: l.action,
        strike_price: l.strikePrice,
        expiration_date: l.expirationDate,
        quantity: l.quantity,
        premium: l.premium,
      })),
    };
    return apiRequest("/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, token);
  },

  deletePosition: async (token: string, positionId: number) => {
    return apiRequest(`/portfolio/${positionId}`, {
      method: "DELETE",
    }, token);
  },

  getWatchlist: async (token: string) => {
    return apiRequest("/portfolio/watchlists", {}, token);
  },

  addWatchlist: async (token: string, symbol: string) => {
    return apiRequest("/portfolio/watchlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    }, token);
  },

  deleteWatchlist: async (token: string, symbol: string) => {
    return apiRequest(`/portfolio/watchlists/${symbol}`, {
      method: "DELETE",
    }, token);
  },

  getNotes: async (token: string, symbol: string) => {
    return apiRequest(`/portfolio/notes/${symbol}`, {}, token);
  },

  addNote: async (token: string, symbol: string, noteText: string) => {
    return apiRequest("/portfolio/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, note_text: noteText }),
    }, token);
  },

  snapshotIbPortfolio: async (
    configId: number,
    token: string,
    positions?: any[],
    netLiquidation?: number,
    totalCashValue?: number,
    buyingPower?: number,
    maintMarginReq?: number
  ) => {
    let url = `/portfolio/snapshot-ib?config_id=${configId}`;
    if (netLiquidation !== undefined && netLiquidation !== null) {
      url += `&net_liquidation=${netLiquidation}`;
    }
    if (totalCashValue !== undefined && totalCashValue !== null) {
      url += `&total_cash_value=${totalCashValue}`;
    }
    if (buyingPower !== undefined && buyingPower !== null) {
      url += `&buying_power=${buyingPower}`;
    }
    if (maintMarginReq !== undefined && maintMarginReq !== null) {
      url += `&maint_margin_req=${maintMarginReq}`;
    }
    return apiRequest(url, {
      method: "POST",
      headers: positions ? { "Content-Type": "application/json" } : undefined,
      body: positions ? JSON.stringify(positions) : undefined,
    }, token);
  },
};
export const ibApi = {
  setConfig: async (config: any, token: string | null = null) => {
    // POST to the configs collection
    return apiRequest('/ib/configs/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }, token);
  },
  getConfig: async (token: string | null = null) => {
    // Retrieve list of configs and return the first one (user has one config)
    const configs = await apiRequest('/ib/configs/', {}, token);
    return configs && configs.length > 0 ? configs[0] : null;
  },
  listConfigs: async (token: string | null = null) => {
    return apiRequest('/ib/configs/', {}, token);
  },
  deleteConfig: async (configId: number, token: string | null = null) => {
    return apiRequest(`/ib/configs/${configId}`, {
      method: 'DELETE',
    }, token);
  },
  testConnection: async (configId: number, token: string | null = null) => {
    return apiRequest(`/ib/test?config_id=${configId}`, {}, token);
  },
  getOptionChain: async (symbol: string, configId: number | null = null, token: string | null = null) => {
    const url = configId 
      ? `/ib/option-chain?symbol=${encodeURIComponent(symbol)}&config_id=${configId}`
      : `/ib/option-chain?symbol=${encodeURIComponent(symbol)}`;
    return apiRequest(url, {}, token);
  },
  getIbPortfolio: async (configId: number, token: string | null = null) => {
    return apiRequest(`/ib/portfolio?config_id=${configId}`, {}, token);
  },
};

export const riskApi = {
  analyzePortfolio: async (payload: any, token: string | null = null) => {
    return apiRequest("/portfolio/risk-analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, token);
  },
};

export const agentsApi = {
  getDebate: async (payload: any, token: string | null = null) => {
    return apiRequest("/agents/debate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, token);
  },
  sendCommand: async (query: string, token: string | null = null) => {
    return apiRequest("/agents/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    }, token);
  },
};


