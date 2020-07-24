import { dateRegex, numberSharesRegex, priceRegex } from './constants';
import { Transaction } from './database';
import { getCurrentPrice } from './stock.service';

export function checkTransaction(symbol: string, price: string, numberOfShares: string, operation: string, date: string): Promise<boolean> {
  return getCurrentPrice(symbol).then(value =>
    value.price && priceRegex.test(price) && numberSharesRegex.test(numberOfShares)
    && dateRegex.test(date) && new Date(date) as any !== 'Invalid Date' && !isNaN(new Date(date) as any)
    && [ 'Sale', 'S', 'P', 'Purchase' ].includes(operation)
  );
}

export function dateToString(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}

export function getUniqPortfolioSymbols(transactions: Transaction[]): string[] {
  return transactions.map(transaction => transaction.symbol).filter((x, i, a) => a.indexOf(x) == i)
}
