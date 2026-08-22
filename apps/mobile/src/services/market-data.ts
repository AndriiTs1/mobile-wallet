const COINGECKO_SIMPLE_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price';

export type MarketSymbol = 'BTC' | 'ETH' | 'USDC' | 'USDT' | 'XAUT';

export type MarketPrice = {
  priceChf: number;
  change24hPercent: number | null;
};

export type MarketPrices = Record<MarketSymbol, MarketPrice>;

const COINGECKO_IDS: Record<MarketSymbol, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDC: 'usd-coin',
  USDT: 'tether',
  XAUT: 'tether-gold',
};

export async function fetchMarketPrices(): Promise<MarketPrices> {
  const ids = Object.values(COINGECKO_IDS).join(',');
  const url = `${COINGECKO_SIMPLE_PRICE_URL}?ids=${ids}&vs_currencies=chf&include_24hr_change=true`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`Failed to reach CoinGecko: ${(error as Error).message}`);
  }

  if (!response.ok) {
    throw new Error(`CoinGecko request failed with status ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('CoinGecko response was not valid JSON');
  }

  if (typeof payload !== 'object' || payload === null) {
    throw new Error('CoinGecko response was not a JSON object');
  }
  const body = payload as Record<string, unknown>;

  const prices = {} as MarketPrices;

  for (const symbol of Object.keys(COINGECKO_IDS) as MarketSymbol[]) {
    const id = COINGECKO_IDS[symbol];
    const entry = body[id];

    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`CoinGecko response is missing data for ${symbol}`);
    }
    const entryRecord = entry as Record<string, unknown>;

    const priceChf = entryRecord.chf;
    if (typeof priceChf !== 'number' || !Number.isFinite(priceChf)) {
      throw new Error(`CoinGecko returned an invalid CHF price for ${symbol}`);
    }

    const change24h = entryRecord.chf_24h_change;
    const change24hPercent =
      typeof change24h === 'number' && Number.isFinite(change24h) ? change24h : null;

    prices[symbol] = { priceChf, change24hPercent };
  }

  return prices;
}
