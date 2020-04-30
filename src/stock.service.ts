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

export function getCurrentPrice(symbol: string): Promise<number | '‌Symbol not supported'> {
  return request<Quote>(`https://finnhub.io/api/v1/quote?symbol=${ symbol }&token=${ finnhubToken }`)
    .then(data => data.c)
    .catch(() => '‌Symbol not supported');
}

export function getPriceTarget(symbol: string): Promise<number | '‌Symbol not supported'> {
  return request<Consensus>(`https://finnhub.io/api/v1/stock/price-target?symbol=${ symbol }&token=${ finnhubToken }`)
    .then(data => data.targetMean)
    .catch(() => '‌Symbol not supported');
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
