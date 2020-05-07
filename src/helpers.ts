import { dateRegex, numberSharesRegex, priceRegex } from './constants';
import { getCurrentPrice } from './stock.service';

export function checkTransaction(symbol: string, price: string, numberOfShares: string, operation: string, date: string): Promise<boolean> {
  return getCurrentPrice(symbol).then(value =>
    value.price && priceRegex.test(price) && numberSharesRegex.test(numberOfShares)
    && dateRegex.test(date) && new Date(date) as any !== 'Invalid Date' && !isNaN(new Date(date) as any)
    && [ 'Sale', 'S', 'P', 'Purchase' ].includes(operation)
  );
}
