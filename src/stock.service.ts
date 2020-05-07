import * as https from 'https';

const finnhubToken: string = process.env.FINNHUB_TOKEN;

interface Quote {
  c: number, // Current price
  h: number, // High price of the day
  l: number, // Low price of the day
  o: number, // Open price of the day
  pc: number, // Previous close price
  t: number // Time
}

interface Consensus {
  symbol: string,
  targetHigh: number,
  targetLow: number,
  targetMean: number,
  targetMedian: number,
  lastUpdated: string // Time
}

const targetPriceCache: { [symbol: string]: number } = {};

export function getCurrentPrice(symbol: string): Promise<{ symbol: string, price: number }> {
  return request<Quote>(`https://finnhub.io/api/v1/quote?symbol=${ symbol }&token=${ finnhubToken }`)
    .then(data => ({ symbol, price: data.c }))
    .catch(() => ({ symbol, price: undefined }));
}

function getPriceTarget(symbol: string): Promise<{ symbol: string, price: number }> {
  if (targetPriceCache[symbol]) {
    return Promise.resolve({ symbol, price: targetPriceCache[symbol] });
  }
  return request<Consensus>(`https://finnhub.io/api/v1/stock/price-target?symbol=${ symbol }&token=${ finnhubToken }`)
    .then(data => {
      targetPriceCache[symbol] = data.targetMean;
      return { symbol, price: data.targetMean };
    })
    .catch(() => ({ symbol, price: undefined }));
}

function request<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https.get(url, response => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => data === '‌Symbol not supported' ? reject(data) : resolve((JSON.parse(data))));
    });
  })
}

export function getCurrentPrices(symbols: string[]): Promise<({ symbol: string, price: number })[]> {
  return Promise.all(symbols.map(symbol => getCurrentPrice(symbol)));
}

export function getPriceTargets(symbols: string[]): Promise<({ symbol: string, price: number })[]> {
  return Promise.all(symbols.map(symbol => getPriceTarget(symbol)));
}
