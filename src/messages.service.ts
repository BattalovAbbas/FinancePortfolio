import { Stock } from './business.service';
import { Transaction } from './database';
import { dateToString } from './helpers';
import { Trend } from './stock.service';

const ImageCharts = require('image-charts');

export function getActualDataMessage(transactions: Stock[], currentPrices: ({ symbol: string, price: number, previousClose: number })[], forexRate: number, spPrices: ({ symbol: string, price: number, previousClose: number })): string {
  let totalBuy = 0;
  let totalCurrent = 0;
  let totalPreviousClose = 0;
  let totalEarn = 0;
  let message = `Stock | Buy | Current | Day Diff | Total Earn\n`;
  message += transactions.map(({ symbol, numberOfShares, averagePrice }) => {
    const data = currentPrices.find(currentPrice => currentPrice.symbol === symbol);
    if (!data.price) {
      return `${ symbol } is not supported symbol`
    }
    const diff = data.price - averagePrice;
    const diffPercent = (diff / averagePrice) * 100;
    const diffPrevious = data.price - data.previousClose;
    const diffPreviousPercent = (diffPrevious / data.previousClose) * 100;
    totalEarn += diff * numberOfShares;
    totalBuy += averagePrice * numberOfShares;
    totalCurrent += data.price * numberOfShares;
    totalPreviousClose += data.previousClose * numberOfShares;
    return `${ symbol }[${ numberOfShares }] | ${ numberToString(averagePrice) } | ${ numberToString(data.price) } | ${ numberToString(diffPrevious, true) }(${ numberToString(diffPreviousPercent, true) }) | ${ numberToString(diff, true) }(${ numberToString(diffPercent, true) })`;
  }).join('\n');
  message += `\nTotal | ${ numberToString(totalBuy, true) } | ${ numberToString(totalCurrent, true) } | ${ numberToString(totalCurrent - totalPreviousClose, true) }(${ numberToString((totalCurrent - totalPreviousClose) / totalPreviousClose * 100, true) }) | ${ numberToString(totalCurrent - totalBuy, true) }(${ numberToString((totalCurrent - totalBuy) / totalBuy * 100, true) })`;
  message += `\nSPY | ${ spPrices.price } | ${ numberToString((spPrices.price - spPrices.previousClose) / spPrices.previousClose * 100, false) }`;
  message += `\nRUB | ${ numberToString(forexRate) } | ${ numberToString(totalCurrent * forexRate, true) } | ${ numberToString(totalEarn * forexRate, true) }`;
  return message;
}

export function getActualChartsMessage(transactions: Stock[], candles: ({ symbol: string, prices: number[], times: number[] })[]): string[] {
  const stocks = transactions.map(({ symbol, numberOfShares, averagePrice }) => {
    const data = candles.find(candle => candle.symbol === symbol);
    if (!data.prices) {
      return undefined;
    }
    const max = Math.max(...data.prices);
    const min = Math.min(...data.prices);
    const diff = (max - min) / 10;
    return { symbol, prices: data.prices, max: numberToString(max + diff, true), min: numberToString(min - diff, true), times: data.times.map(time => new Date(time * 1000).toLocaleString()) };
  }).filter(value => value);
  return stocks.map(stock => {
    return ImageCharts()
      .cht('lc')
      .chtt(stock.symbol)
      .chxt('x,y')
      .chxr(`1,${ stock.min },${ stock.max }`)
      .chds(`${ stock.min },${ stock.max }`)
      .chd(`t:${ stock.prices.map(price => price).join(',') }`)
      .chxl(`0:|${ stock.times.map((time, index) => index ===0 || index === stock.times.length - 1 ? time : '').join('|') }`)
      .chs('600x400')
      .chma('30,30,30,30')
      .toURL();
  })
}

export function getTargetPricesMessage(transactions: Stock[], currentPrices: ({ symbol: string, price: number })[], priceTargets: ({ symbol: string, price: number })[]): string {
  let potentialValue = 0;
  let totalValue = 0;
  let message = `Stock | Current | Target | Diff | Percent\n`;
  message += transactions.map(({ symbol, numberOfShares }) => {
    const current = currentPrices.find(currentPrice => currentPrice.symbol === symbol).price;
    const priceTarget = priceTargets.find(priceTarget => priceTarget.symbol === symbol).price;
    if (!current) {
      return `${ symbol } is not supported symbol`
    }
    const diff = priceTarget > current ? priceTarget - current : 0;
    const diffPercent = (diff / current) * 100;
    potentialValue += (priceTarget > current ? priceTarget : current) * numberOfShares;
    totalValue += current * numberOfShares;
    return `${ symbol } | ${ numberToString(current) } | ${ numberToString(priceTarget) } | ${ numberToString(diff) } | ${ numberToString(diffPercent) }`;
  }).join('\n');
  message += `\nTotal | ${ numberToString(totalValue) } | ${ numberToString(potentialValue) } | ${ numberToString((potentialValue - totalValue) / totalValue * 100) }`;
  return message;
}

export function getPortfolioInformationMessage(transactions: Stock[]): string {
  let message = `This portfolio contains:\n`;
  message += transactions.map(transaction => `${ transaction.symbol }[${ transaction.numberOfShares }]`).join(', ');
  return message;
}

export function getTransactionsInformationMessage(transactions: Transaction[]): string {
  let message = `Id | Symbol | Action | Date | Count | Price | Total\n`;
  let totalValue = 0;
  message += transactions.map(transaction => {
    const total = transaction.price * transaction.numberOfShares;
    totalValue += total;
    return `${ transaction.transactionId } | ${ transaction.symbol } | ${ transaction.operation } | ${ dateToString(transaction.date) } | ${ transaction.numberOfShares } | ${ transaction.price.toFixed(2) } | ${ total.toFixed(2) }`
  }).join('\n');
  message += `\nTotal ${ totalValue }`;
  return message;
}

export function getWeightsDataMessage(transactions: Stock[], currentPrices: ({ symbol: string, price: number })[]): { photo: string, message: string } {
  let message = `Stock | Count | Price | Sum | Weight | Earn\n`;
  const totalValue = transactions.reduce((result, { symbol, numberOfShares }) => {
    const data = currentPrices.find(currentPrice => currentPrice.symbol === symbol);
    return !data.price ? result : result + numberOfShares * data.price;
  }, 0);
  const data = transactions.map(({ symbol, numberOfShares, averagePrice }) => {
    const data = currentPrices.find(currentPrice => currentPrice.symbol === symbol);
    if (!data.price) {
      return undefined;
    }
    const total = data.price * numberOfShares;
    const diff = (data.price - averagePrice) * numberOfShares;
    return { symbol, numberOfShares, price: numberToString(data.price), total: numberToString(total, true), weight: numberToString(total / totalValue * 100), earn: numberToString(diff / totalValue * 100) };
  }).filter(value => value);
  message += data.map(({ symbol, numberOfShares, price, total, weight, earn }) => `${ symbol } | ${ numberOfShares } | ${ price } | ${ total } | ${ weight } | ${ earn }`).join('\n');
  const photo = ImageCharts()
    .cht('p')
    .chd(`a:${ data.map(({ weight }) => weight).join(',') }`)
    .chl(data.map(({ symbol }) => symbol).join('|'))
    .chlps('anchor,end|font.size,10')
    .chs('400x400')
    .chma('30,30,30,30')
    .toURL();
  return { message, photo }
}

export function getDividendInformation(transactions: Stock[], dividends: { symbol: string, amount: number, payDate: string }[]): string {
  let message = `Symbol | Pay Date | Amount\n`;
  message += transactions.map(transaction => {
    const dividend = dividends.find(dividend => dividend.symbol === transaction.symbol);
    return `${ transaction.symbol } | ${ dividend.payDate } | ${ dividend.amount || '' }`;
  }).join('\n');
  return message;
}

export function getReportsMessage(reports: ({ symbol: string, date: string, quarter: number, year: string, revenue: boolean, eps: boolean })[]): string {
  let message = `Symbol | Date | Quarter | Year | Rev | Eps\n`;
  reports = reports.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  message += reports.map(report => {
    return report.date
      ? `${ report.symbol } | ${ report.date } | ${ report.quarter } | ${ report.year } | ${ report.revenue === null ? '-' : report.revenue ? '▲' : '▼' } | ${ report.eps === null ? '-' : report.eps ? '▲' : '▼' }`
      : `${ report.symbol } without report`;
  }).join('\n');
  return message;
}

export function getTendenciesMessage(tendencies: ({ symbol: string, prices: number[], days: number[] })[]): string {
  let message = `Symbol | First | Second | Third | Last | Diff\n`;
  message += tendencies.map(({ symbol, prices}) => {
    return `${ symbol } | ${ prices.map(price => numberToString(price)).join(' | ') } | ${ numberToString((prices[prices.length - 1] - prices[0]) / prices[prices.length - 1] * 100) }`;
  }).join('\n');
  return message;
}

export function getTrendsMessage(trends: Trend[]): string {
  let message = `Symbol | Period | Sell | Hold | Buy | Buy %\n`;
  message += trends.map(trend => {
    return trend.period
      ? `${ trend.symbol } | ${ trend.period } | ${ trend.sell + trend.strongSell } | ${ trend.hold } | ${ trend.buy + trend.strongBuy } | ${ numberToString((trend.buy + trend.strongBuy) / (trend.sell + trend.strongSell + trend.hold + trend.buy + trend.strongBuy) * 100) }%`
      : `${ trend.symbol } without trends`;
  }).join('\n');
  return message;
}

function numberToString(value: number, small?: boolean): string {
  return value.toFixed(small ? value > 10 ? 0 : 1 : 2)
}
