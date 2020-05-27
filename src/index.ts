import * as TelegramBot from 'node-telegram-bot-api';
import { getPortfolioActualStocks } from './business.service';
import { portfolioNameRegex } from './constants';
import { addTransaction, createPortfolio, getPortfolioTransactions, getUserPortfolios, Transaction } from './database';
import { checkTransaction } from './helpers';
import {
  getDividendInformation, getPortfolioInformation, getStatisticsMessage, getTargetsMessage, getTransactionsInformation
} from './messages.service';
import { getCurrentPrices, getDividends, getForexRate, getPriceTargets } from './stock.service';

const telegramToken: string = process.env.TELEGRAM_TOKEN;
let bot: TelegramBot;
if (process.env.NODE_ENV === 'production') {
  bot = new TelegramBot(telegramToken, { webHook: { port: process.env.PORT as any } });
  bot.setWebHook(process.env.CUSTOM_ENV_VARIABLE + 'bot' + telegramToken);
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
          bot.sendMessage(userId, getPortfolioInformation(transactions), {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Get Transactions', callback_data: userId + '_get_transactions_' + portfolioId }],
                [{ text: 'Get Statistics', callback_data: userId + '_get_statistics_' + portfolioId }, { text: 'Get Targets', callback_data: userId + '_get_targets_' + portfolioId }],
                [{ text: 'Get Dividends', callback_data: userId + '_get_dividends_' + portfolioId }, addTransactionKey]
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
        bot.sendMessage(userId, getTransactionsInformation(transactions), {
          reply_markup: {
            inline_keyboard: [[{ text: 'Open Portfolio', callback_data: userId + '_select_portfolio_' + portfolioId }]]
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
      .then((transaction: Transaction) => {
        addTransaction(portfolioId, transaction)
          .then(() => bot.sendMessage(userId, `Your ${ transaction.symbol } transaction has been added in your portfolio successful`, {
            reply_markup: {
              inline_keyboard: [[{ text: 'Open Portfolio', callback_data: userId + '_select_portfolio_' + portfolioId }]]
            }
          }))
          .catch((error: string) => bot.sendMessage(userId, error))
      })
      .catch((error: string) => bot.sendMessage(userId, error));
  }
  if (callbackString.includes('_get_statistics_')) {
    const [ userIdString, , , portfolioIdString ] = callbackString.split('_');
    const userId = parseInt(userIdString);
    const portfolioId = parseInt(portfolioIdString);
    return getPortfolioTransactions(portfolioId)
      .then((transactions: Transaction[]) => {
        return Promise.all([
          getForexRate('RUB', 'USD'),
          getCurrentPrices(transactions.map(transaction => transaction.symbol))
        ]).then(([ forexRate, currentPrices ]: [ number, ({ symbol: string, price: number, previousClose: number })[] ]) => {
          bot.sendMessage(userId, getStatisticsMessage(getPortfolioActualStocks(transactions), currentPrices, forexRate), {
            reply_markup: { inline_keyboard: [ [
              { text: 'Refresh', callback_data: userId + '_get_statistics_' + portfolioId },
              { text: 'Open Portfolio', callback_data: userId + '_select_portfolio_' + portfolioId }
            ] ] }
          });
        });
      })
      .catch((error: string) => bot.sendMessage(userId, error));
  }
  if (callbackString.includes('_get_targets_')) {
    const [ userIdString, , , portfolioIdString ] = callbackString.split('_');
    const userId = parseInt(userIdString);
    const portfolioId = parseInt(portfolioIdString);
    return getPortfolioTransactions(portfolioId)
      .then((transactions: Transaction[]) => {
        return Promise.all([
            getCurrentPrices(transactions.map(transaction => transaction.symbol)),
            getPriceTargets(transactions.map(transaction => transaction.symbol)),
          ])
          .then(([ currentPrices, priceTargets ]: ({ symbol: string, price: number })[][]) => {
            bot.sendMessage(userId, getTargetsMessage(getPortfolioActualStocks(transactions), currentPrices, priceTargets), {
              reply_markup: { inline_keyboard: [ [
                  { text: 'Open Portfolio', callback_data: userId + '_select_portfolio_' + portfolioId }
                ] ] }
            });
          });
      })
      .catch((error: string) => bot.sendMessage(userId, error));
  }
  if (callbackString.includes('_get_dividends_')) {
    const [ userIdString, , , portfolioIdString ] = callbackString.split('_');
    const userId = parseInt(userIdString);
    const portfolioId = parseInt(portfolioIdString);
    const messagePromise = bot.sendMessage(userId, 'The loading of stock dividends takes times. This message will be replaced by dividends information');
    return Promise.all([
      messagePromise,
      getPortfolioTransactions(portfolioId).then((transactions: Transaction[]) => getDividends(transactions).then(dividends => ({ transactions, dividends })))
    ]).then(([ message, { transactions, dividends } ]) => {
      bot.editMessageText(getDividendInformation(getPortfolioActualStocks(transactions), dividends), {
        chat_id: userId,
        message_id: message.message_id,
        reply_markup: { inline_keyboard: [ [
            { text: 'Open Portfolio', callback_data: userId + '_select_portfolio_' + portfolioId }
          ] ] }
      });
    })
    .catch((error: string) => bot.sendMessage(userId, error));
  }
});

function requestUserTransaction(userId: number): Promise<Transaction> {
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
