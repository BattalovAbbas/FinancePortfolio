import * as TelegramBot from 'node-telegram-bot-api';
import { getPortfolioActualStocks } from './business.service';
import { portfolioNameRegex } from './constants';
import {
  addTransaction, createPortfolio, getPortfolioTransactions, getUserPortfolios, removeTransaction, Transaction, UserTransaction
} from './database';
import { checkTransaction, getUniqPortfolioSymbols } from './helpers';
import {
  getActualDataMessage, getComparisonChartsMessage, getIndependenceDay, getPortfolioInformationMessage, getReportsMessage,
  getTargetPricesMessage, getTendenciesMessage, getTransactionsInformationMessage, getTrendsMessage, getWeightsDataMessage
} from './messages.service';
import {
  getCurrentPrice, getCurrentPrices, getForexRate, getReports, getStocksCandles, getTargetPrices, getTendencies, getTrends, Trend
} from './stock.service';

const telegramToken: string = process.env.TELEGRAM_TOKEN;
let bot: TelegramBot;
if (process.env.NODE_ENV === 'production') {
  const port: any = process.env.PORT || 443;
  const host = process.env.HOST || '0.0.0.0';
  bot = new TelegramBot(telegramToken, { webHook: { port, host } });
  bot.setWebHook(process.env.CUSTOM_ENV_VARIABLE + ':443' + '/bot' + telegramToken);
} else {
  bot = new TelegramBot(telegramToken, { polling: true });
}

bot.on('polling_error', (err: Error) =>
  console.log(err)
);

bot.onText(/\/start/, (message: TelegramBot.Message) => {
  const userId = message.chat.id;
  bot.sendMessage(userId, `Please write /portfolios for selecting or creating your portfolio.`)
});

bot.onText(/\/portfolios/, (message: TelegramBot.Message) => {
  const userId = message.chat.id;
  const createPortfolioKey = { text: 'Create Portfolio', callback_data: userId + '_create_portfolio_' };
  getUserPortfolios(userId)
    .then((portfolios: { PortfolioName: string, PortfolioId: string }[]) => {
      if (portfolios.length === 0) {
        bot.sendMessage(userId, `You do not have portfolios.`, { reply_markup: { inline_keyboard: [[createPortfolioKey]] } });
      } else {
        bot.sendMessage(userId, `Select your portfolio.`, {
          reply_markup: {
            inline_keyboard: [
              ...portfolios.map(portfolio => [{ text: 'Select ' + portfolio.PortfolioName,  callback_data: userId + '_select_portfolio_' + portfolio.PortfolioId }]),
              [createPortfolioKey]
            ]
          }
        });
      }
    })
    .catch((error: string) => bot.sendMessage(userId, error));
});

bot.on('callback_query', (message: TelegramBot.CallbackQuery) => {
  const callbackString = message.data;
  if (callbackString.includes('_create_portfolio_')) {
    const [ userIdString ] = callbackString.split('_');
    const userId = parseInt(userIdString);
    return bot.sendMessage(
      userId,
      `Please replay to this message and write your "PortfolioName".\nName must contain more than 4 number or char symbols.`,
      { reply_markup: { force_reply: true } }
    ).then((sentMessage: TelegramBot.Message) => {
      const replyListenerId = bot.onReplyToMessage(userId, sentMessage.message_id, (reply: TelegramBot.Message) => {
        bot.removeReplyListener(replyListenerId);
        const name = reply.text;
        if (portfolioNameRegex.test(name)) {
          createPortfolio(userId, reply.text)
            .then((name: string) => {
              bot.sendMessage(userId, `Your portfolio "${ name }" has been successful added. /portfolios`);
            })
            .catch((error: string) => bot.sendMessage(userId, error))
        } else {
          bot.sendMessage(userId, 'You entered invalid symbols. Please try again /createPortfolio');
        }
      });
    });
  }
  if (callbackString.includes('_select_portfolio_')) {
    const [ userIdString, , , portfolioIdString ] = callbackString.split('_');
    const userId = parseInt(userIdString);
    const portfolioId = parseInt(portfolioIdString);
    return getPortfolioTransactions(portfolioId)
      .then(transactions => {
        const addTransactionKey = { text: 'Add Transaction', callback_data: userId + '_add_transaction_' + portfolioId };
        if (transactions.length === 0) {
          bot.sendMessage(userId, 'Your portfolio is empty', { reply_markup: { inline_keyboard: [[addTransactionKey]] } });
        } else {
          bot.sendMessage(userId, getPortfolioInformationMessage(getPortfolioActualStocks(transactions)), {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: 'Get Actual Data', callback_data: userId + '_get_actual_' + portfolioId },
                  { text: 'Get Comparison SP500', callback_data: userId + '_get_comparison_' + portfolioId },
                ],
                [
                  { text: 'Get Transactions', callback_data: userId + '_get_transactions_' + portfolioId },
                  addTransactionKey
                ],
                [
                  { text: 'Get Weights', callback_data: userId + '_get_weights_' + portfolioId },
                  { text: 'Get Dividends', callback_data: userId + '_get_dividends_' + portfolioId },
                ],
                [
                  { text: 'Get Reports', callback_data: userId + '_get_reports_' + portfolioId },
                  { text: 'Get Tendencies', callback_data: userId + '_get_tendencies_' + portfolioId },
                ],
                [
                  { text: 'Get Targets', callback_data: userId + '_get_targets_' + portfolioId },
                  { text: 'Get Trends', callback_data: userId + '_get_trends_' + portfolioId },
                ],
                [
                  { text: 'Independence Day', callback_data: userId + '_independence_day_' + portfolioId },
                ]
              ]
            }
          });
        }
      })
      .catch((error: string) => bot.sendMessage(userId, error))
  }
  if (callbackString.includes('_get_transactions_')) {
    const [ userIdString, , , portfolioIdString ] = callbackString.split('_');
    const userId = parseInt(userIdString);
    const portfolioId = parseInt(portfolioIdString);
    return getPortfolioTransactions(portfolioId)
      .then((transactions: Transaction[]) => {
        bot.sendMessage(userId, getTransactionsInformationMessage(transactions), {
          reply_markup: {
            inline_keyboard: [[
              { text: 'Open Portfolio', callback_data: userId + '_select_portfolio_' + portfolioId },
              { text: 'Remove Transaction', callback_data: userId + '_remove_transaction_' + portfolioId }
            ]]
          }
        });
      })
      .catch((error: string) => bot.sendMessage(userId, error));
  }
  if (callbackString.includes('_add_transaction_')) {
    const [ userIdString, , , portfolioIdString ] = callbackString.split('_');
    const userId = parseInt(userIdString);
    const portfolioId = parseInt(portfolioIdString);
    return requestUserTransaction(userId)
      .then((transaction: UserTransaction) => {
        addTransaction(portfolioId, transaction)
          .then(() => bot.sendMessage(userId, `Your ${ transaction.symbol } transaction has been added in your portfolio`, {
            reply_markup: {
              inline_keyboard: [[{ text: 'Open Portfolio', callback_data: userId + '_select_portfolio_' + portfolioId }]]
            }
          }))
      })
      .catch((error: string) => bot.sendMessage(userId, error));
  }
  if (callbackString.includes('_remove_transaction_')) {
    const [ userIdString, , , portfolioIdString ] = callbackString.split('_');
    const userId = parseInt(userIdString);
    const portfolioId = parseInt(portfolioIdString);
    return Promise.all([
      requestUserRemoveTransaction(userId),
      getPortfolioTransactions(portfolioId)
    ]).then(([ transactionId, userTransactions ]: [ number,  Transaction[] ]) => {
        if (userTransactions.find(transaction => transaction.transactionId === transactionId)) {
          removeTransaction(portfolioId, transactionId)
            .then(() => bot.sendMessage(userId, `Your transaction has been removed from your portfolio`, {
              reply_markup: {
                inline_keyboard: [[
                  { text: 'Open Portfolio', callback_data: userId + '_select_portfolio_' + portfolioId },
                  { text: 'Add Transaction', callback_data: userId + '_add_transaction_' + portfolioId }
                ]]
              }
            }))
        } else {
          bot.sendMessage(userId, 'You do not have transaction with this id in your portfolio')
        }
      })
      .catch((error: string) => bot.sendMessage(userId, error));
  }
  if (callbackString.includes('_get_actual_')) {
    const [ userIdString, , , portfolioIdString ] = callbackString.split('_');
    const userId = parseInt(userIdString);
    const portfolioId = parseInt(portfolioIdString);
    return getPortfolioTransactions(portfolioId)
      .then((transactions: Transaction[]) =>
        Promise.all([
          getForexRate('RUB', 'USD'),
          getCurrentPrices(getUniqPortfolioSymbols(transactions)),
          getCurrentPrice('SPY')
        ]).then(([ forexRate, currentPrices, spPrices ]: [ number, ({ symbol: string, price: number, previousClose: number })[], ({ symbol: string, price: number, previousClose: number }) ]) => {
          bot.sendMessage(userId, getActualDataMessage(getPortfolioActualStocks(transactions), currentPrices, forexRate, spPrices), {
            reply_markup: { inline_keyboard: [ [
              { text: 'Refresh', callback_data: userId + '_get_actual_' + portfolioId },
              { text: 'Open Portfolio', callback_data: userId + '_select_portfolio_' + portfolioId }
            ] ] }
          });
        })
      )
      .catch((error: string) => bot.sendMessage(userId, error));
  }
  if (callbackString.includes('_get_comparison_')) {
    const [ userIdString, , , portfolioIdString ] = callbackString.split('_');
    const userId = parseInt(userIdString);
    const portfolioId = parseInt(portfolioIdString);
    const endDate = Date.now();
    const startDate = endDate - 2664000000; // 1 month
    return getPortfolioTransactions(portfolioId)
      .then((transactions: Transaction[]) =>
        Promise.all([
          getStocksCandles(getUniqPortfolioSymbols(transactions), Math.round(startDate / 1000), Math.round(endDate / 1000)),
          getStocksCandles(['SPY'], Math.round(startDate / 1000), Math.round(endDate / 1000))
        ]).then(([ candles, [ indexCandles ] ]: [ ({ symbol: string, prices: number[], times: number[] })[], ({ symbol: string, prices: number[], times: number[] })[] ]) => {
          const { value, charts } = getComparisonChartsMessage(getPortfolioActualStocks(transactions), candles, indexCandles);
          Promise.all(charts.map(chart => bot.sendPhoto(userId, chart))).then(() => {
            bot.sendMessage(userId, 'Beta = ' + value, {
              reply_markup: { inline_keyboard: [ [
                { text: 'Refresh', callback_data: userId + '_get_comparison_' + portfolioId },
                { text: 'Open Portfolio', callback_data: userId + '_select_portfolio_' + portfolioId }
              ] ] }
            });
          })
        })
      )
      .catch((error: string) => bot.sendMessage(userId, error));
  }
  if (callbackString.includes('_get_targets_')) {
    const [ userIdString, , , portfolioIdString ] = callbackString.split('_');
    const userId = parseInt(userIdString);
    const portfolioId = parseInt(portfolioIdString);
    return getPortfolioTransactions(portfolioId)
      .then((transactions: Transaction[]) =>
        Promise.all([
          getCurrentPrices(getUniqPortfolioSymbols(transactions)),
          getTargetPrices(getUniqPortfolioSymbols(transactions)),
        ])
        .then(([ currentPrices, priceTargets ]: ({ symbol: string, price: number })[][]) => {
          bot.sendMessage(userId, getTargetPricesMessage(getPortfolioActualStocks(transactions), currentPrices, priceTargets), {
            reply_markup: { inline_keyboard: [ [
                { text: 'Open Portfolio', callback_data: userId + '_select_portfolio_' + portfolioId }
            ] ] }
          });
        })
      )
      .catch((error: string) => bot.sendMessage(userId, error));
  }
  if (callbackString.includes('_get_dividends_')) {
    const [ userIdString, , , portfolioIdString ] = callbackString.split('_');
    const userId = parseInt(userIdString);
    const portfolioId = parseInt(portfolioIdString);
    bot.sendMessage(userId, 'The feature is not ready');  // ONLY for premium finhub users
    // const messagePromise = bot.sendMessage(userId, 'The loading of stock dividends takes times. This message will be replaced by dividends information');
    // return Promise.all([
    //   messagePromise,
    //   getPortfolioTransactions(portfolioId).then((transactions: Transaction[]) => getDividends(transactions).then(dividends => ({ transactions, dividends })))
    // ]).then(([ message, { transactions, dividends } ]) => {
    //   bot.editMessageText(getDividendInformation(getPortfolioActualStocks(transactions), dividends), {
    //     chat_id: userId,
    //     message_id: message.message_id,
    //     reply_markup: { inline_keyboard: [ [
    //         { text: 'Open Portfolio', callback_data: userId + '_select_portfolio_' + portfolioId }
    //       ] ] }
    //   });
    // })
    // .catch((error: string) => bot.sendMessage(userId, error));
  }
  if (callbackString.includes('_get_weights_')) {
    const [ userIdString, , , portfolioIdString ] = callbackString.split('_');
    const userId = parseInt(userIdString);
    const portfolioId = parseInt(portfolioIdString);
    return getPortfolioTransactions(portfolioId)
      .then((transactions: Transaction[]) =>
        getCurrentPrices(getUniqPortfolioSymbols(transactions))
          .then((currentPrices: ({ symbol: string, price: number })[]) => {
            const { photo, message } = getWeightsDataMessage(getPortfolioActualStocks(transactions), currentPrices);
            bot.sendPhoto(userId, photo).then(() => {
              bot.sendMessage(userId, message, {
                reply_markup: { inline_keyboard: [ [
                    { text: 'Open Portfolio', callback_data: userId + '_select_portfolio_' + portfolioId }
                ] ] }
              });
            });
          })
      )
      .catch((error: string) => bot.sendMessage(userId, error));
  }
  if (callbackString.includes('_get_reports_')) {
    const [ userIdString, , , portfolioIdString ] = callbackString.split('_');
    const userId = parseInt(userIdString);
    const portfolioId = parseInt(portfolioIdString);
    const startDate = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const endDate = new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0];
    return getPortfolioTransactions(portfolioId)
      .then((transactions: Transaction[]) =>
        getReports(getUniqPortfolioSymbols(transactions), startDate, endDate)
          .then((reports: ({ symbol: string, date: string, quarter: number, year: string, revenue: boolean, eps: boolean })[]) => {
            bot.sendMessage(userId, getReportsMessage(reports), {
              reply_markup: { inline_keyboard: [ [
                  { text: 'Open Portfolio', callback_data: userId + '_select_portfolio_' + portfolioId }
              ] ] }
            });
          })
      )
      .catch((error: string) => bot.sendMessage(userId, error));
  }
  if (callbackString.includes('_get_tendencies_')) {
    const [ userIdString, , , portfolioIdString ] = callbackString.split('_');
    const userId = parseInt(userIdString);
    const portfolioId = parseInt(portfolioIdString);
    const endDate = Date.now();
    const startDate = endDate - 604800000; // 7 days
    return getPortfolioTransactions(portfolioId)
      .then((transactions: Transaction[]) =>
        getTendencies(getUniqPortfolioSymbols(transactions), Math.round(startDate / 1000), Math.round(endDate / 1000))
          .then((tendencies: ({ symbol: string, prices: number[], days: number[] })[]) => {
            bot.sendMessage(userId, getTendenciesMessage(tendencies), {
              reply_markup: { inline_keyboard: [ [
                  { text: 'Open Portfolio', callback_data: userId + '_select_portfolio_' + portfolioId }
              ] ] }
            });
          })
      )
      .catch((error: string) => bot.sendMessage(userId, error));
  }
  if (callbackString.includes('_get_trends_')) {
    const [ userIdString, , , portfolioIdString ] = callbackString.split('_');
    const userId = parseInt(userIdString);
    const portfolioId = parseInt(portfolioIdString);
    return getPortfolioTransactions(portfolioId)
      .then((transactions: Transaction[]) =>
        getTrends(getUniqPortfolioSymbols(transactions))
          .then((trends: Trend[]) => {
            bot.sendMessage(userId, getTrendsMessage(trends), {
              reply_markup: { inline_keyboard: [ [
                  { text: 'Open Portfolio', callback_data: userId + '_select_portfolio_' + portfolioId }
              ] ] }
            });
          })
      )
      .catch((error: string) => bot.sendMessage(userId, error));
  }
  if (callbackString.includes('_independence_day_')) {
    const [ userIdString, , , portfolioIdString ] = callbackString.split('_');
    const userId = parseInt(userIdString);
    const portfolioId = parseInt(portfolioIdString);
    return requestUserIndependenceDayParameters(userId).then(parameters => {
      return getPortfolioTransactions(portfolioId)
        .then((transactions: Transaction[]) =>
          getCurrentPrices(getUniqPortfolioSymbols(transactions)).then((currentPrices: ({ symbol: string, price: number, previousClose: number })[]) => {
              bot.sendMessage(userId, getIndependenceDay(parameters, getPortfolioActualStocks(transactions), currentPrices), {
                reply_markup: { inline_keyboard: [ [
                    { text: 'Open Portfolio', callback_data: userId + '_select_portfolio_' + portfolioId },
                    { text: 'Try Again', callback_data: userId + '_independence_day_' + portfolioId },
                ] ] }
              });
            })
        )
        .catch((error: string) => bot.sendMessage(userId, error));
    })
  }
});

function requestUserTransaction(userId: number): Promise<UserTransaction> {
  return bot.sendMessage(
    userId,
    `Please replay to this message and write information about your transaction.\nEnter the following parameters separated by a space.\nSymbol(AAPL) PriceOfShare(245.5) NumberOfShares(10) Operation(Purchase/Sale or P/S) Date(2020-04-25)`,
    { reply_markup: { force_reply: true } }
  ).then((sentMessage: TelegramBot.Message) => {
    return new Promise((resolve, reject) => {
      const replyListenerId = bot.onReplyToMessage(userId, sentMessage.message_id, (reply: TelegramBot.Message) => {
        bot.removeReplyListener(replyListenerId);
        const [ symbol, price, numberOfShares, operation, date ] = reply.text.split(' ');
        return checkTransaction(symbol, price, numberOfShares, operation, date).then(valid => valid
          ? resolve({ symbol, price: parseFloat(price), numberOfShares: parseInt(numberOfShares), operation, date })
          : reject('You entered invalid parameters')
        );
      });
    });
  });
}

function requestUserRemoveTransaction(userId: number): Promise<number> {
  return bot.sendMessage(
    userId,
    `Please replay to this message and write transaction id`,
    { reply_markup: { force_reply: true } }
  ).then((sentMessage: TelegramBot.Message) => {
    return new Promise((resolve, reject) => {
      const replyListenerId = bot.onReplyToMessage(userId, sentMessage.message_id, (reply: TelegramBot.Message) => {
        bot.removeReplyListener(replyListenerId);
        return resolve(parseInt(reply.text));
      });
    });
  });
}

function requestUserIndependenceDayParameters(userId: number): Promise<{ annualReplenishment: number, marketGrowth: number, target: number }> {
  return bot.sendMessage(
    userId,
    `Please replay to this message and write information about your Independence Day.\nEnter the following parameters separated by a space.\nAnnual Replenishment $(3000) Market Growth %(8) Target Result $(100000)`,
    { reply_markup: { force_reply: true } }
  ).then((sentMessage: TelegramBot.Message) => {
    return new Promise((resolve, reject) => {
      const replyListenerId = bot.onReplyToMessage(userId, sentMessage.message_id, (reply: TelegramBot.Message) => {
        bot.removeReplyListener(replyListenerId);
        const [ annualReplenishment, marketGrowth, target ] = reply.text.split(' ');
        return resolve({ annualReplenishment: parseInt(annualReplenishment), marketGrowth: parseInt(marketGrowth), target: parseInt(target) });
      });
    });
  });
}
