process.env.NTBA_FIX_319 = 1;

const TelegramBot = require('node-telegram-bot-api');
const https = require('https');
const pg = require('pg');

const telegramToken = process.env.TELEGRAM_TOKEN;
const finnhubToken = process.env.FINNHUB_TOKEN;
const connectionString = process.env.DATABASE_URL;

const bot = new TelegramBot(telegramToken, { polling: true });

const portfolioNameRegex = new RegExp(/^[a-zA-Z0-9]{4,}$/);
const symbolRegex = new RegExp(/^[A-Z]{1,5}(\.[A-Z]{1,5})?$/);
const priceRegex = new RegExp(/^[0-9]+(\.[0-9]+)?$/);
const numberSharesRegex = new RegExp(/^[0-9]+$/);
const dateRegex = new RegExp(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);

bot.onText(/\/start/, (msg) => {
  const userId = msg.chat.id;
  const client = getClient();
  client.connect();
  getUserPortfolios(client, userId)
    .then(userPortfolios => {
      if (userPortfolios.length === 0) {
        bot.sendMessage(userId, 'You do not have portfolios. Do you want to /createPortfolio?');
      } else {
        bot.sendMessage(userId, `You have portfolios:\n${ userPortfolios.join('\n') }\n/selectPortfolio`);
      }
    })
    .catch(error => bot.sendMessage(userId, error))
    .finally(() => {
      client.end();
    });
});

bot.onText(/\/createPortfolio/, (msg) => {
  const userId = msg.chat.id;
  bot.sendMessage(
    userId,
    `Please replay to this message and write your "PortfolioName".\nName must contain more than 4 number or char symbols.`,
    { reply_markup: JSON.stringify({ force_reply: true }) }
  ).then(sentMessage => {
    const replyListenerId = bot.onReplyToMessage(userId, sentMessage.message_id, reply => {
      bot.removeReplyListener(replyListenerId);
      const name = reply.text;
      if (portfolioNameRegex.test(name)) {
        createPortfolio(userId, reply.text)
          .then(name => {
            bot.sendMessage(userId, `Your portfolio "${ name }" has been successful added. /selectPortfolio`);
          })
          .catch(error => bot.sendMessage(userId, error))
      } else {
        bot.sendMessage(userId, 'You entered invalid symbols. Please try again /createPortfolio');
      }
    });
  });
});

bot.onText(/\/selectPortfolio/, (msg) => {
  const userId = msg.chat.id;
  bot.sendMessage(userId, `Please replay to this message and write name of your portfolio which you want to select.`, {
    reply_markup: JSON.stringify({ force_reply: true })
  }).then(sentMessage => {
    const replyListenerId = bot.onReplyToMessage(userId, sentMessage.message_id, reply => {
      bot.removeReplyListener(replyListenerId);
      const portfolioName = reply.text;
      getPortfolioTransactions(userId, portfolioName)
        .then(transactions => {
          if (transactions.length === 0) {
            bot.sendMessage(userId, 'Your portfolio is empty', {
              reply_markup: JSON.stringify({ inline_keyboard: [[{ text: 'Add transaction', callback_data: userId + '_add_transaction_' + portfolioName }]] })
            });
          } else {
            const getOperation = (operation) => operation === 'Sale' ? 'Sold' : 'Purchased';
            const portfolioShares = transactions.map(transaction => `${ getOperation(transaction.operation)}: ${ transaction.numberOfShares } of ${ transaction.symbol }`).join('\n');
            bot.sendMessage(userId, `Your portfolio ${ portfolioName } has:\n${ portfolioShares }`, {
              reply_markup: JSON.stringify({
                inline_keyboard: [
                  [{ text: 'Get portfolio statistics', callback_data: userId + '_get_statistics_' + portfolioName }],
                  [{ text: 'Add transaction', callback_data: userId + '_add_transaction_' + portfolioName }]
                ]
              })
            });
          }
        })
        .catch(error => bot.sendMessage(userId, error))
    });
  })
});

bot.on('callback_query', msg => {
  const callbackString = msg.data;
  if (callbackString.includes('_add_transaction_')) {
    const [ userIdString, , , portfolioName ] = callbackString.split('_');
    const userId = Number.parseInt(userIdString);
    return requestTransaction(userId)
      .then(transaction => {
        addTransaction(userId, portfolioName, transaction)
          .then(() => bot.sendMessage(userId, `Your ${ transaction.symbol } transaction has been added in your ${ portfolioName } portfolio successful`))
          .catch(error => bot.sendMessage(userId, error))
      })
      .catch(error => bot.sendMessage(userId, error));
  }
  if (callbackString.includes('_get_statistics_')) {
    const [ userId, , , portfolioName ] = callbackString.split('_');
    return getPortfolioTransactions(userId, portfolioName)
      .then(transactions => {
        Promise.all(transactions.map(transaction => getCurrentPrice(transaction.symbol)))
          .then(currentPrices => {
            let earn = 0;
            let message = transactions.map((transaction, index) => {
              const current = currentPrices[index];
              const diff = current - transaction.price;
              const total = diff * transaction.numberOfShares;
              earn += total;
              return `${ transaction.symbol } | ${ current } | ${ diff.toFixed(2) } | ${ total.toFixed(2) }`;
            }).join('\n');
            message += `\nTotal Earn: ${ earn.toFixed(2) }`;
            bot.sendMessage(userId, message);
          });
      })
      .catch(error => bot.sendMessage(userId, error));
  }
});

bot.on("polling_error", (err) =>
  console.log(err)
);

function requestTransaction(userId) {
  return bot.sendMessage(userId, `Please replay to this message and write information about your transaction.\nEnter the following parameters separated by a space.\nSymbol(AAPL) PriceOfShare(245.5) NumberOfShares(10) Operation(Purchase/Sale or P/S) Date(2020-04-25)`, {
    reply_markup: JSON.stringify({ force_reply: true })
  }).then(sentMessage => {
     return new Promise((resolve, reject) => {
      const replyListenerId = bot.onReplyToMessage(userId, sentMessage.message_id, reply => {
        bot.removeReplyListener(replyListenerId);
        const [ symbol, price, numberOfShares, operation, date ] = reply.text.split(' ');
        if (checkTransaction(symbol, price, numberOfShares, operation, date)) {
          return resolve({ symbol, price, numberOfShares, operation, date })
        } else {
          return reject('You entered invalid parameters');
        }
      });
    });
  });
}

function getClient() {
  return new pg.Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false },
  });
}

function getCurrentPrice(symbol) {
  return new Promise(resolve => {
    https.get(`https://finnhub.io/api/v1/quote?symbol=${ symbol }&token=${ finnhubToken }`, (resp) => {
      let data = '';
      resp.on('data', (chunk) => {
        data += chunk;
      });
      resp.on('end', () => {
        resolve(JSON.parse(data).c);
      });
    });
  })
}

function getUserPortfolios(client, userId) {
  return getUserInfo(client, userId).then(userInfo => {
    if (!userInfo || userInfo.length === 0) {
      return Promise.resolve([]);
    }
    const userPortfolioIds = userInfo.map(userRow => userRow.PortfolioId);
    return client.query(`SELECT * FROM public."Portfolios" WHERE "PortfolioId" IN (${ userPortfolioIds.join(', ') })`)
      .then(res => res.rows.map(row => row.PortfolioName))
      .catch(() => Promise.reject('something went wrong during searching of portfolios'));
  });
}

function getUserInfo(client, userId) {
  return client.query(`SELECT * FROM public."Users" WHERE "UserId"=${ userId }`)
    .then(res => res.rows)
    .catch(() => Promise.reject('something went wrong during searching user'));
}

function createPortfolio(userId, name) {
  const client = getClient();
  client.connect();
  getUserPortfolios(client, userId)
    .then(portfolios => {
      if (portfolios.includes(name)) {
        bot.sendMessage(userId, 'You already have similar portfolio name. Please try again /createPortfolio');
        return Promise.reject();
      }
      return client.query(`INSERT INTO public."Portfolios" ("PortfolioName") VALUES ($1) RETURNING "PortfolioId"`, [ name ])
        .then(res => {
          const data = res.rows[0];
          return client.query(`INSERT INTO public."Users" ("UserId", "PortfolioId") VALUES ($1,$2)`, [ userId, data.PortfolioId ])
            .then(() => name)
            .catch(() => Promise.reject('something went wrong during creating portfolio'));
        })
        .catch(() => Promise.reject('something went wrong during creating portfolio'));
    })
    .finally(() => {
      client.end();
    });
}

function getPortfolioTransactions(userId, portfolioName) {
  const client = getClient();
  client.connect();
  return client.query(`SELECT * FROM public."Users" u, public."Portfolios" p, public."Transactions" t WHERE u."UserId" = ${ userId } AND u."PortfolioId" = p."PortfolioId" AND p."PortfolioName" = '${ portfolioName }' AND t."PortfolioId" = p."PortfolioId"`)
    .then(res => {
      return res.rows.map(({ PortfolioId: portfolioId, Symbol: symbol, Price: price, NumberOfShares: numberOfShares, Operation: operation, Date: date }) => ({
        symbol, price, numberOfShares, operation, date, portfolioId
      }));
    })
    .catch(error => Promise.reject('something went wrong during getting of portfolio information'))
    .finally(() => {
      client.end();
    })
}

function addTransaction(userId, portfolioName, transaction) {
  const client = getClient();
  client.connect();
  return client.query(`SELECT * FROM public."Users" u, public."Portfolios" p WHERE u."UserId" = ${ userId } AND u."PortfolioId" = p."PortfolioId" AND p."PortfolioName" = '${ portfolioName }'`)
    .then(res => {
      const portfolioId = res.rows[0].PortfolioId;
      const { symbol, price, numberOfShares, operation: operationString, date } = transaction;
      const operation = [ 'S', 'SALE '].includes(operationString) ? 'Sale' : 'Purchase';
      return client.query(`INSERT INTO public."Transactions" ("PortfolioId", "Symbol", "Price", "NumberOfShares", "Operation", "Date") VALUES ($1, $2, $3, $4, $5, $6) RETURNING "TransactionId"`, [ portfolioId, symbol, price, numberOfShares, operation, date ])
        .then(res => res.rows[0])
        .catch(error => Promise.reject('something went wrong during getting of adding transaction'))
     })
     .catch(error => Promise.reject('something went wrong during getting of portfolio information'))
     .finally(() => {
       client.end();
     })

}

function checkTransaction(symbol, price, numberOfShares, operation, date) {
  if (!symbolRegex.test(symbol)) {
    return false;
  }
  if (!priceRegex.test(price)) {
    return false
  }
  if (!numberSharesRegex.test(numberOfShares)) {
    return false
  }
  if (![ 'Sale', 'S', 'P', 'Purchase' ].includes(operation)) {
    return false;
  }
  if (!dateRegex.test(date)) {
    return false;
  }
  return true;
}
