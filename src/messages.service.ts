import { Stock } from './business.service';
import { Transaction } from './database';
import { dateToString } from './helpers';

export function getActualDataMessage(transactions: Stock[], currentPrices: ({ symbol: string, price: number, previousClose: number })[], forexRate: number): string {
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
    const diffPreviousPercent = (diffPrevious / data.previousClose) * 100;
    const total = diff * numberOfShares;
    totalEarn += total;
    totalValue += data.price * numberOfShares;
    return `${ symbol }[${ numberOfShares }] | ${ numberToString(averagePrice) } | ${ numberToString(data.price) } | ${ numberToString(diffPrevious, true) }(${ numberToString(diffPreviousPercent, true) }) | ${ numberToString(diff, true) }(${ numberToString(diffPercent, true) })`;
  }).join('\n');
  message += `\nTotal | ${ numberToString(totalValue, true) } | ${ numberToString(totalEarn, true) } | ${ numberToString(totalEarn / (totalValue - totalEarn) * 100) }% | ${ numberToString(totalEarn * forexRate, true) }`;
  return message;
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

export function getWeightsDataMessage(transactions: Stock[], currentPrices: ({ symbol: string, price: number })[]): string {
  let message = `Stock | Count | Price | Sum | Weight | Earn\n`;
  const totalValue = transactions.reduce((result, { symbol, numberOfShares }) => {
    const data = currentPrices.find(currentPrice => currentPrice.symbol === symbol);
    return !data.price ? result : result + numberOfShares * data.price;
  }, 0);
  message += transactions.map(({ symbol, numberOfShares, averagePrice }) => {
    const data = currentPrices.find(currentPrice => currentPrice.symbol === symbol);
    if (!data.price) {
      return `${ symbol } is not supported symbol`
    }
    const total = data.price * numberOfShares;
    const diff = (data.price - averagePrice) * numberOfShares;
    return `${ symbol } | ${ numberOfShares } | ${ numberToString(data.price) } | ${ numberToString(total, true) } | ${ numberToString(total / totalValue * 100) } | ${ numberToString(diff / totalValue * 100) }`;
  }).join('\n');
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
