import { Stock } from './business.service';
import { Transaction } from './database';

export function getStatisticsMessage(transactions: Stock[], currentPrices: ({ symbol: string, price: number })[], priceTargets: ({ symbol: string, price: number })[]): string {
  let totalEarn = 0;
  let totalValue = 0;
  let message = `Sbl | Cou | Buy | Tar | Cur | Diff | Per | Tot\n`;
  message += transactions.map(({ symbol, numberOfShares, averagePrice }) => {
    const current = currentPrices.find(currentPrice => currentPrice.symbol === symbol).price;
    const priceTarget = priceTargets.find(priceTarget => priceTarget.symbol === symbol).price;
    if (!current || !priceTarget) {
      return `${ symbol } is not supported symbol`
    }
    const diff = current - averagePrice;
    const diffPercent = (diff / averagePrice) * 100;
    const total = diff * numberOfShares;
    totalEarn += total;
    totalValue += current * numberOfShares;
    return `${ symbol } | ${ numberOfShares } | ${ averagePrice.toFixed(1) } | ${ priceTarget.toFixed(1) } | ${ current.toFixed(1) } | ${ diff.toFixed(1) } | ${ diffPercent.toFixed(1) } | ${ total.toFixed(1) }`;
  }).join('\n');
  message += `\nTotal | ${ totalValue.toFixed(2) } | ${ totalEarn.toFixed(2) } | ${ (totalEarn / (totalValue - totalEarn) * 100).toFixed(2) }%`;
  return message;
}

export function getPortfolioInformation(transactions: Transaction[]): string {
  let message = `Symbol | Action | Date | Count | Price | Total\n`;
  let totalValue = 0;
  message += transactions.map(transaction => {
    const total = transaction.price * transaction.numberOfShares;
    totalValue += total;
    return `${ transaction.symbol } | ${ transaction.operation } | ${ new Date(transaction.date).toISOString().slice(0, 10) } | ${ transaction.numberOfShares } | ${ transaction.price.toFixed(2) } | ${ total.toFixed(2) }`
  }).join('\n');
  message += `\nTotal ${ totalValue }`;
  return message;
}
