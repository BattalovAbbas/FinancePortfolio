import { Client, QueryResult } from 'pg';

const connectionString: string = process.env.DATABASE_URL;

export interface Transaction {
  transactionId: number;
  symbol: string;
  price: number;
  numberOfShares: number;
  operation: string; // 'Purchase' | 'Sale'
  date: Date;
}

export interface UserTransaction {
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

const userPortfoliosCache: { [userId: number]: { PortfolioName: string, PortfolioId: string }[] } = {};
const portfolioTransactionsCache: { [portfolioId: number]: Transaction[] } = {};

export function getUserPortfolios(userId: number,): Promise<{ PortfolioName: string, PortfolioId: string }[]> {
  if (userPortfoliosCache[userId]) {
    return Promise.resolve(userPortfoliosCache[userId]);
  }
  let client = getClient();
  client.connect();
  return client.query(`SELECT * FROM public."Users" u, public."Portfolios" p WHERE u."UserId"=${ userId } AND u."PortfolioId"=p."PortfolioId"`)
    .then((res: QueryResult<any>) => {
      userPortfoliosCache[userId] = res.rows;
      return res.rows;
    })
    .catch(() => Promise.reject('something went wrong during searching of portfolios'))
    .finally(() => {
      client.end();
    });
}

export function getPortfolioTransactions(portfolioId: number): Promise<Transaction[]> {
  if (portfolioTransactionsCache[portfolioId]) {
    return Promise.resolve(portfolioTransactionsCache[portfolioId]);
  }
  const client = getClient();
  client.connect();
  return client.query(`SELECT * FROM public."Transactions" t WHERE t."PortfolioId" = ${ portfolioId }`)
    .then((res: QueryResult<any>) => {
      const result = res.rows.map(({ TransactionId: transactionId, PortfolioId: portfolioId, Symbol: symbol, Price: price, NumberOfShares: numberOfShares, Operation: operation, Date: date }) => ({
        transactionId: parseInt(transactionId), symbol, price: parseFloat(price), numberOfShares: parseInt(numberOfShares), operation, date, portfolioId
      })).sort((a, b) => a.transactionId - b.transactionId);
      portfolioTransactionsCache[portfolioId] = result;
      return result;
    })
    .catch(() => Promise.reject('something went wrong during getting of portfolio information'))
    .finally(() => {
      client.end();
    })
}

export function createPortfolio(userId: number, portfolioName: string): Promise<string> {
  delete userPortfoliosCache[userId];
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

export function addTransaction(portfolioId: number, transaction: UserTransaction) {
  delete portfolioTransactionsCache[portfolioId];
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

export function removeTransaction(portfolioId: number, transactionId: number) {
  delete portfolioTransactionsCache[portfolioId];
  const client = getClient();
  client.connect();
  return client.query(`DELETE FROM public."Transactions" t WHERE t."PortfolioId" = ${ portfolioId } AND t."TransactionId" = ${ transactionId }`)
    .then((res: QueryResult<any>) => res.rows[0])
    .catch(() => Promise.reject('something went wrong during getting of adding transaction'))
    .finally(() => {
      client.end();
    })
}
