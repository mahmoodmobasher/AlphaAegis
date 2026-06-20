export function stdNormCDF(x: number): number {
  // Abramowitz & Stegun approximation (accuracy ~ 7.5e-8)
  const p = 0.2316419;
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;

  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  
  // standard normal PDF: 1 / sqrt(2*pi) * exp(-x^2 / 2)
  const pdf = (1.0 / Math.sqrt(2.0 * Math.PI)) * Math.exp(-0.5 * absX * absX);
  const cdf = 1.0 - pdf * (b1 * t + b2 * Math.pow(t, 2) + b3 * Math.pow(t, 3) + b4 * Math.pow(t, 4) + b5 * Math.pow(t, 5));
  
  return x >= 0 ? cdf : 1.0 - cdf;
}

export function stdNormPDF(x: number): number {
  return (1.0 / Math.sqrt(2.0 * Math.PI)) * Math.exp(-0.5 * x * x);
}

export interface BSResult {
  price: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export function calculateBSClient(
  S: number,
  K: number,
  daysToExpiration: number,
  iv: number,
  r: number,
  optionType: "CALL" | "PUT"
): BSResult {
  const T = daysToExpiration / 365.0;
  const sigma = Math.max(iv, 0.0001); // avoid division by zero

  // Expiration boundary case
  if (T <= 0) {
    const intrinsic = optionType === "CALL" ? Math.max(S - K, 0.0) : Math.max(K - S, 0.0);
    const delta = optionType === "CALL" ? (S > K ? 1.0 : 0.0) : (S < K ? -1.0 : 0.0);
    return {
      price: intrinsic,
      delta,
      gamma: 0.0,
      theta: 0.0,
      vega: 0.0,
      rho: 0.0
    };
  }

  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  let price = 0;
  let delta = 0;
  let theta = 0;
  let rho = 0;

  if (optionType === "CALL") {
    price = S * stdNormCDF(d1) - K * Math.exp(-r * T) * stdNormCDF(d2);
    delta = stdNormCDF(d1);
    theta = -(S * stdNormPDF(d1) * sigma) / (2.0 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * stdNormCDF(d2);
    rho = K * T * Math.exp(-r * T) * stdNormCDF(d2);
  } else {
    price = K * Math.exp(-r * T) * stdNormCDF(-d2) - S * stdNormCDF(-d1);
    delta = stdNormCDF(d1) - 1.0;
    theta = -(S * stdNormPDF(d1) * sigma) / (2.0 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * stdNormCDF(-d2);
    rho = -K * T * Math.exp(-r * T) * stdNormCDF(-d2);
  }

  const gamma = stdNormPDF(d1) / (S * sigma * Math.sqrt(T));
  const vega = S * stdNormPDF(d1) * Math.sqrt(T);

  return {
    price,
    delta,
    gamma,
    theta: theta / 365.0, // daily theta
    vega: vega / 100.0,   // vega per 1% change
    rho: rho / 100.0      // rho per 1% change
  };
}
