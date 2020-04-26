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

export function getCurrentPrice(symbol: string): Promise<number | '‌Symbol not supported'> {
  return new Promise(resolve => {
    https.get(`https://finnhub.io/api/v1/quote?symbol=${ symbol }&token=${ finnhubToken }`, response => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => data === '‌Symbol not supported' ? resolve(data) : resolve((JSON.parse(data) as Quote).c));
    });
  })
}
