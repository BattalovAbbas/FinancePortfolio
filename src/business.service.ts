import { Transaction } from './database';

export interface Stock {
  symbol: string;
  numberOfShares: number;
  averagePrice: number;
}

export function getPortfolioActualStocks(transactions: Transaction[]): Stock[] {
  const sortedTransaction = transactions.sort((a, b) => new Date(a.date).getTime() > new Date(b.date).getTime() ? 1 : -1);
  return sortedTransaction.reduce((result: Stock[], transaction: Transaction) => {
    const stock = result.find(value => value.symbol === transaction.symbol);
    if (stock) {
      if (transaction.operation === 'Purchase') {
        const totalNumberOfShares = stock.numberOfShares + transaction.numberOfShares;
        stock.averagePrice = (stock.averagePrice * stock.numberOfShares + transaction.price * transaction.numberOfShares) / totalNumberOfShares;
        stock.numberOfShares = totalNumberOfShares;
      }
      if (transaction.operation === 'Sale') {
        stock.numberOfShares = stock.numberOfShares - transaction.numberOfShares;
      }
    } else {
      result.push({ symbol: transaction.symbol, averagePrice: transaction.price, numberOfShares: transaction.numberOfShares });
    }
    return result;
  }, []);
}