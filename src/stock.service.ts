import * as https from 'https';
import { dateToString } from './helpers';

const limiter = require('simple-rate-limiter');

const finnhubToken: string = process.env.FINNHUB_TOKEN;
const finnhubToken2: string = process.env.FINNHUB_TOKEN_2;
let tokenFlag: boolean = false;

const secondBatch = limiter(function(path: string, resolve: (result: any) => void, reject: (result: any) => void) {
  tokenFlag = !tokenFlag;
  https.get(`https://finnhub.io/api/v1/${ path }&token=${ tokenFlag ? finnhubToken : finnhubToken2 }`, response => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => data === '‌Symbol not supported' ? reject(data) : resolve((JSON.parse(data))));
  });
}).to(30).per(1000); // finnhub allows 30 request in second, we limit 15 request in second. But we have 2 tokens

const batch = limiter(function(path: string, resolve: (result: any) => void, reject: (result: any) => void) {
  secondBatch(path, resolve, reject);
}).to(80).per(60 * 1000); // finnhub allows 60 request / 60 second, we limit 40 request / 60 second. But we have 2 tokens

export interface Trend {
  symbol: string;
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

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

interface Report {
  date: string;
  epsActual: number;
  epsEstimate: number;
  quarter: number;
  revenueActual: number;
  revenueEstimate: number;
  symbol: string;
  year: string;
}

interface Candles {
  c: number[];
  h: number[];
  l: number[];
  o: number[];
  t: number[]; // Time UNIX
  v: number[];
}

interface ForexRates {
  base: string;
  quote: { [key: string]: number };
}

const targetPriceCache: { [symbol: string]: number } = {};
const dividendCache: { [symbol: string]: { amount: number, payDate: string } } = {};
const reportCache: { [symbol: string]: { date: string, quarter: number, year: string, eps: boolean, revenue: boolean  }[] } = {};
const tendencyCache: { [symbol: string]: { prices: number[], days: number[] } } = {};
const trendCache: { [symbol: string]: { period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number; } } = {};

export function getCurrentPrice(symbol: string): Promise<{ symbol: string, price: number, previousClose: number }> {
  return request<Quote>(`quote?symbol=${ symbol }`)
    .then(data => ({ symbol, price: data.c, previousClose: data.pc }))
    .catch(() => ({ symbol, price: undefined, previousClose: undefined }));
}

export function getStockCandles(symbol: string, startDate: number, endDate: number): Promise<{ symbol: string, prices: number[], times: number[] }> {
  return request<Candles>(`stock/candle?symbol=${ symbol }&resolution=30&from=${ startDate }&to=${ endDate }`)
    .then((data: Candles) => ({ symbol, prices: data.c, times: data.t }))
    .catch(() => ({ symbol, prices: undefined, times: undefined }));
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

function getReport(symbol: string, startDate: string, endDate: string): Promise<{ symbol: string, date: string, quarter: number, year: string, revenue: boolean, eps: boolean }[]> {
  if (reportCache[symbol]) {
    return Promise.resolve(reportCache[symbol].map(data => ({ symbol, ...data })));
  }
  return request<{ earningsCalendar: Report[] }>(`calendar/earnings?symbol=${ symbol }&from=${ startDate }&to=${ endDate }`)
    .then((data) => {
      const { earningsCalendar } = data;
      if (earningsCalendar && Array.isArray(earningsCalendar) && earningsCalendar[0]) {
        const last = earningsCalendar[0];
        reportCache[symbol] = [{
          date: last.date,
          quarter: last.quarter,
          year: last.year,
          revenue: last.revenueActual !== null ? last.revenueActual > last.revenueEstimate : null,
          eps: last.epsActual !== null ? last.epsActual > last.epsEstimate :null,
        }];
        const preLast = earningsCalendar[1];
        if (preLast) {
          reportCache[symbol].push({
            date: preLast.date,
            quarter: preLast.quarter,
            year: preLast.year,
            revenue: preLast.revenueActual !== null ? preLast.revenueActual > preLast.revenueEstimate : null,
            eps: preLast.epsActual !== null ? preLast.epsActual > preLast.epsEstimate :null,
          })
        }
        return reportCache[symbol].map(data => ({ symbol, ...data }));
      }
      return ([{ symbol, date: undefined, quarter: undefined, year: undefined, revenue: null, eps: null }]);
    })
    .catch(error => {
      console.error(error);
      return ([{ symbol, date: undefined, quarter: undefined, year: undefined, revenue: null, eps: null }])
    })
}

function getTendency(symbol: string, startDate: number, endDate: number): Promise<{ symbol: string, prices: number[], days: number[] }> {
  if (tendencyCache[symbol]) {
    return Promise.resolve({ symbol, ...tendencyCache[symbol] });
  }
  return request<Candles>(`stock/candle?symbol=${ symbol }&resolution=D&from=${ startDate }&to=${ endDate }`)
    .then((data) => {
      if (data) {
        tendencyCache[symbol] = { prices: data.c, days: [] };
        return { symbol, ...tendencyCache[symbol] };
      }
      return ({ symbol, prices: [], days: [] });
    })
    .catch(error => {
      console.error(error);
      return ({ symbol, prices: [], days: [] })
    })
}

function getTrend(symbol: string): Promise<Trend> {
  if (trendCache[symbol]) {
    return Promise.resolve({ symbol, ...trendCache[symbol] });
  }
  return request<Trend[]>(`stock/recommendation?symbol=${ symbol }`)
    .then((data) => {
      if (data && Array.isArray(data)) {
        trendCache[symbol] = { ...data[0] };
        return { symbol, ...trendCache[symbol] };
      }
      return ({ symbol, period: undefined, strongBuy: undefined, buy: undefined, hold: undefined, sell: undefined, strongSell: undefined, });
    })
    .catch(error => {
      console.error(error);
      return ({ symbol, period: undefined, strongBuy: undefined, buy: undefined, hold: undefined, sell: undefined, strongSell: undefined, })
    })
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

export function getStocksCandles(symbols: string[], startDate: number, endDate: number): Promise<({ symbol: string, prices: number[], times: number[] })[]> {
  return Promise.all(symbols.map(symbol => getStockCandles(symbol, startDate, endDate)));
}

export function getTargetPrices(symbols: string[]): Promise<({ symbol: string, price: number })[]> {
  return Promise.all(symbols.map(symbol => getTargetPrice(symbol)));
}

export function getReports(symbols: string[], startDate: string, endDate: string): Promise<({ symbol: string, date: string, quarter: number, year: string, revenue: boolean, eps: boolean })[]> {
  return Promise.all(symbols.map(symbol => getReport(symbol, startDate, endDate))).then((results: any[][]) => {
    return results.reduce((result: any[], data: any[]) => {
      result.push(...data);
      return result;
    }, []);
  });
}

export function getTendencies(symbols: string[], startDate: number, endDate: number): Promise<({ symbol: string, prices: number[], days: number[] })[]> {
  return Promise.all(symbols.map(symbol => getTendency(symbol, startDate, endDate)));
}

export function getTrends(symbols: string[]): Promise<Trend[]> {
  return Promise.all(symbols.map(symbol => getTrend(symbol)));
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
