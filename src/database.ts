import { Client, QueryResult } from 'pg';

const connectionString: string = process.env.DATABASE_URL;

export interface Transaction {
  symbol: string;
  price: number;
  numberOfShares: number;
  operation: string; // 'Purchase' | 'Sale'
  date: string;
}

function getClient(): Client {
  return new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false },
  });
}

export function getUserPortfolios(userId: number,): Promise<{ PortfolioName: string, PortfolioId: string }[]> {
  let client = getClient();
  client.connect();
  return client.query(`SELECT * FROM public."Users" u, public."Portfolios" p WHERE u."UserId"=${ userId }`)
    .then((res: QueryResult<any>) => res.rows)
    .catch(() => Promise.reject('something went wrong during searching of portfolios'))
    .finally(() => {
      client.end();
    });
}

export function createPortfolio(userId: number, portfolioName: string): Promise<string> {
  const client = getClient();
  client.connect();
  return client.query(`INSERT INTO public."Portfolios" ("PortfolioName") VALUES ($1) RETURNING "PortfolioId"`, [ portfolioName ])
    .then((res: QueryResult<any>) => {
      const data = res.rows[0];
      return client.query(`INSERT INTO public."Users" ("UserId", "PortfolioId") VALUES ($1,$2)`, [ userId, data.PortfolioId ])
        .then(() => portfolioName)
        .catch(() => Promise.reject('something went wrong during creating portfolio'));
    })
    .catch(() => Promise.reject('something went wrong during creating portfolio'))
    .finally(() => {
      client.end();
    });
}

export function getPortfolioTransactions(userId: number, portfolioId: number): Promise<Transaction[]> {
  const client = getClient();
  client.connect();
  return client.query(`SELECT * FROM public."Transactions" t WHERE t."PortfolioId" = ${ portfolioId }`)
    .then((res: QueryResult<any>) => {
      return res.rows.map(({ PortfolioId: portfolioId, Symbol: symbol, Price: price, NumberOfShares: numberOfShares, Operation: operation, Date: date }) => ({
        symbol, price: parseFloat(price), numberOfShares: parseInt(numberOfShares), operation, date, portfolioId
      }));
    })
    .catch(() => Promise.reject('something went wrong during getting of portfolio information'))
    .finally(() => {
      client.end();
    })
}

export function addTransaction(userId: number, portfolioId: number, transaction: Transaction) {
  const client = getClient();
  client.connect();
  const { symbol, price, numberOfShares, operation: operationString, date } = transaction;
  const operation = [ 'S', 'SALE '].includes(operationString) ? 'Sale' : 'Purchase';
  return client.query(
      `INSERT INTO public."Transactions" ("PortfolioId", "Symbol", "Price", "NumberOfShares", "Operation", "Date") VALUES ($1, $2, $3, $4, $5, $6) RETURNING "TransactionId"`,
      [ portfolioId, symbol, price, numberOfShares, operation, date ]
    )
    .then((res: QueryResult<any>) => res.rows[0])
    .catch(() => Promise.reject('something went wrong during getting of adding transaction'))
    .finally(() => {
      client.end();
    })
}
