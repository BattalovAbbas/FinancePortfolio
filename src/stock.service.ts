import * as https from 'https';
import { dateToString } from './helpers';
const limiter = require('simple-rate-limiter');

const finnhubToken: string = process.env.FINNHUB_TOKEN;

const secondBatch = limiter(function(path: string, resolve: (result: any) => void, reject: (result: any) => void) {
  https.get(`https://finnhub.io/api/v1/${ path }&token=${ finnhubToken }`, response => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => data === '‌Symbol not supported' ? reject(data) : resolve((JSON.parse(data))));
  });
}).to(15).per(1000); // finnhub allows 30 request in second, we limit 15 request in second.

const batch = limiter(function(path: string, resolve: (result: any) => void, reject: (result: any) => void) {
  secondBatch(path, resolve, reject);
}).to(40).per(60 * 1000); // finnhub allows 60 request / 60 second, we limit 40 request / 60 second.

interface Quote {
  c: number; // Current price
  h: number; // High price of the day
  l: number; // Low price of the day
  o: number; // Open price of the day
  pc: number; // Previous close price
  t: number; // Time
}

interface Consensus {
  symbol: string;
  targetHigh: number;
  targetLow: number;
  targetMean: number;
  targetMedian: number;
  lastUpdated: string; // Time
}

interface Dividend {
  symbol: string;
  date: string;
  payDate: string;
  recordDate: string;
  declarationDate: string;
  currency: string;
  amount: number;
}

interface ForexRates {
  base: string;
  quote: { [key: string]: number };
}

const targetPriceCache: { [symbol: string]: number } = {};
const dividendCache: { [symbol: string]: { amount: number, payDate: string } } = {};

export function getCurrentPrice(symbol: string): Promise<{ symbol: string, price: number, previousClose: number }> {
  return request<Quote>(`quote?symbol=${ symbol }`)
    .then(data => ({ symbol, price: data.c, previousClose: data.pc }))
    .catch(() => ({ symbol, price: undefined, previousClose: undefined }));
}

function getTargetPrice(symbol: string): Promise<{ symbol: string, price: number }> {
  if (targetPriceCache[symbol]) {
    return Promise.resolve({ symbol, price: targetPriceCache[symbol] });
  }
  return request<Consensus>(`stock/price-target?symbol=${ symbol }`)
    .then(data => {
      targetPriceCache[symbol] = data.targetMean;
      return { symbol, price: data.targetMean };
    })
    .catch(() => ({ symbol, price: undefined }));
}

function getDividend(symbol: string, startDate: Date): Promise<{ symbol: string, amount: number, payDate: string }> {
  if (dividendCache[symbol]) {
    return Promise.resolve({ symbol, ...dividendCache[symbol] });
  }
  return request<Dividend[]>(`stock/dividend?symbol=${ symbol }&from=${ dateToString(startDate) }&to=2020-12-31`)
    .then(data => ({ symbol, amount: data[0].amount, payDate: data[0].payDate || 'not yet' }))
    .catch(() => ({ symbol, amount: undefined, payDate: undefined }));
}

function request<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    batch(path, (data: T) => resolve(data), (error: any) => reject(error));
  })
}

export function getForexRate(from: string, to: string): Promise<number> {
  return request<ForexRates>(`forex/rates?base=USD`)
    .then(data => data.quote[from] / data.quote[to])
    .catch(() => 1);
}

export function getCurrentPrices(symbols: string[]): Promise<({ symbol: string, price: number, previousClose: number })[]> {
  return Promise.all(symbols.map(symbol => getCurrentPrice(symbol)));
}

export function getTargetPrices(symbols: string[]): Promise<({ symbol: string, price: number })[]> {
  return Promise.all(symbols.map(symbol => getTargetPrice(symbol)));
}

// Only 6 call per minute!!!
export function getDividends(stocks: { symbol: string, date: Date | string }[]): Promise<{ symbol: string, amount: number, payDate: string }[]> {
  const promises: Promise<{ symbol: string, amount: number, payDate: string }>[] = [];
  for (let i: number = 0; i < 2; i++) {
    const { symbol, date } = stocks[i];
    promises.push(new Promise<{ symbol: string, amount: number, payDate: string }>(resolve => {
      setTimeout(() => {
        getDividend(symbol, date as Date).then(result => resolve(result))
      }, 60000 * Math.floor(i / 5))
    }));
  }
  return Promise.all(promises);
}
