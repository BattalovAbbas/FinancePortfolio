import { Stock } from './business.service';
import { Transaction } from './database';
import { dateToString } from './helpers';

export function getStatisticsMessage(transactions: Stock[], currentPrices: ({ symbol: string, price: number, previousClose: number })[], forexRate: number): string {
  let totalEarn = 0;
  let totalValue = 0;
  let message = `Stock | Buy | Current | PrevDiff | Diff | Total\n`;
  message += transactions.map(({ symbol, numberOfShares, averagePrice }) => {
    const data = currentPrices.find(currentPrice => currentPrice.symbol === symbol);
    if (!data.price) {
      return `${ symbol } is not supported symbol`
    }
    const diff = data.price - averagePrice;
    const diffPercent = (diff / averagePrice) * 100;
    const diffPrevious = data.price - data.previousClose;
    const total = diff * numberOfShares;
    totalEarn += total;
    totalValue += data.price * numberOfShares;
    return `${ symbol }[${ numberOfShares }] | ${ numberToString(averagePrice) } | ${ numberToString(data.price) } | ${ numberToString(diffPrevious, true) } | ${ numberToString(diff, true) }(${ numberToString(diffPercent, true) }) | ${ numberToString(total, true) }`;
  }).join('\n');
  message += `\nTotal | ${ numberToString(totalValue) } | ${ numberToString(totalEarn) } | ${ numberToString(totalEarn / (totalValue - totalEarn) * 100) }% | ${ numberToString(totalEarn * forexRate) }`;
  return message;
}

export function getTargetsMessage(transactions: Stock[], currentPrices: ({ symbol: string, price: number })[], priceTargets: ({ symbol: string, price: number })[]): string {
  let potentialEarn = 0;
  let totalValue = 0;
  let message = `Stock | Current | Target | Diff | Percent\n`;
  message += transactions.map(({ symbol, numberOfShares }) => {
    const current = currentPrices.find(currentPrice => currentPrice.symbol === symbol).price;
    const priceTarget = priceTargets.find(priceTarget => priceTarget.symbol === symbol).price;
    if (!current) {
      return `${ symbol } is not supported symbol`
    }
    const diff = priceTarget - current;
    const diffPercent = (diff / current) * 100;
    potentialEarn += priceTarget * numberOfShares;
    totalValue += current * numberOfShares;
    return `${ symbol } | ${ numberToString(current) } | ${ numberToString(priceTarget) } | ${ numberToString(diff) } | ${ numberToString(diffPercent) }`;
  }).join('\n');
  message += `\nTotal | ${ numberToString(totalValue) } | ${ numberToString(potentialEarn) } | ${ numberToString((potentialEarn - totalValue) / totalValue * 100) }`;
  return message;
}

export function getPortfolioInformation(transactions: Transaction[]): string {
  let message = `This portfolio contains:\n`;
  message += transactions.map(transaction => `${ transaction.symbol }[${ transaction.numberOfShares }]`).join(', ');
  return message;
}

export function getTransactionsInformation(transactions: Transaction[]): string {
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

export function getDividendInformation(transactions: Stock[], dividends: { symbol: string, amount: number, payDate: string }[]): string {
  let message = `Symbol | Pay Date | Amount\n`;
  message += transactions.map(transaction => {
    const dividend = dividends.find(dividend => dividend.symbol === transaction.symbol);
    return `${ transaction.symbol } | ${ dividend.payDate } | ${ dividend.amount || '' }`;
  }).join('\n');
  return message;
}

function numberToString(value: number, small?: boolean): string {
  return value.toFixed(small ? value > 10 ? 0 : 1 : 2)
}
