import * as TelegramBot from 'node-telegram-bot-api';
import { portfolioNameRegex } from './constants';
import { addTransaction, createPortfolio, getPortfolioTransactions, getUserPortfolios, Transaction } from './database';
import { checkTransaction } from './helpers';
import { getCurrentPrice } from './stock.service';

const telegramToken: string = process.env.TELEGRAM_TOKEN;

const port: string = process.env.PORT;
const host: string = '0.0.0.0';
const externalUrl: string = process.env.CUSTOM_ENV_VARIABLE;
const nodeEnv: string = process.env.NODE_ENV || 'development';

let bot: TelegramBot;
if (nodeEnv === 'production') {
  bot = new TelegramBot(telegramToken, { webHook: { port: Number.parseInt(port), host } });
  bot.setWebHook(externalUrl + ':443/bot' + telegramToken);
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
    const userId = Number.parseInt(userIdString);
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
              bot.sendMessage(userId, `Your portfolio "${ name }" has been successful added. /selectPortfolio`);
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
    const userId = Number.parseInt(userIdString);
    const portfolioId = Number.parseInt(portfolioIdString);
    return getPortfolioTransactions(userId, portfolioId)
      .then(transactions => {
        const addTransactionKey = { text: 'Add transaction', callback_data: userId + '_add_transaction_' + portfolioId };
        if (transactions.length === 0) {
          bot.sendMessage(userId, 'Your portfolio is empty', { reply_markup: { inline_keyboard: [[addTransactionKey]] } });
        } else {
          bot.sendMessage(userId, `Your portfolio has:\n${  transactions.map(transaction => transaction.symbol) }`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Return Statistics', callback_data: userId + '_get_statistics_' + portfolioId }],
                [addTransactionKey]
              ]
            }
          });
        }
      })
      .catch((error: string) => bot.sendMessage(userId, error))
  }
  if (callbackString.includes('_add_transaction_')) {
    const [ userIdString, , , portfolioIdString ] = callbackString.split('_');
    const userId = Number.parseInt(userIdString);
    const portfolioId = Number.parseInt(portfolioIdString);
    return requestTransaction(userId)
      .then((transaction: Transaction) => {
        addTransaction(userId, portfolioId, transaction)
          .then(() => bot.sendMessage(userId, `Your ${ transaction.symbol } transaction has been added in your portfolio successful`))
          .catch((error: string) => bot.sendMessage(userId, error))
      })
      .catch((error: string) => bot.sendMessage(userId, error));
  }
  if (callbackString.includes('_get_statistics_')) {
    const [ userIdString, , , portfolioIdString ] = callbackString.split('_');
    const userId = Number.parseInt(userIdString);
    const portfolioId = Number.parseInt(portfolioIdString);
    return getPortfolioTransactions(userId, portfolioId)
      .then(transactions => {
        return Promise.all(transactions.map(transaction => getCurrentPrice(transaction.symbol)))
          .then((currentPrices: (number | '‌Symbol not supported')[]) => {
            let totalEarn = 0;
            let totalValue = 0;
            let message = transactions.map(({ symbol, numberOfShares, price }, index) => {
              const current = currentPrices[index];
              if (current === '‌Symbol not supported') {
                return `${ symbol } is not supported symbol`
              }
              const diff = current - price;
              const total = diff * numberOfShares;
              totalEarn += total;
              totalValue += current * numberOfShares;
              return `${ symbol } | ${ numberOfShares } | ${ current } | ${ diff.toFixed(2) } | ${ total.toFixed(2) }`;
            }).join('\n');
            message += `\nTotal | ${ totalValue.toFixed(2) } | ${ totalEarn.toFixed(2) }`;
            bot.sendMessage(userId, message, {
              parse_mode: 'HTML',
              reply_markup: { inline_keyboard: [[{ text: 'Refresh Statistics', callback_data: userId + '_get_statistics_' + portfolioId }]] }
            });
          });
      })
      .catch((error: string) => bot.sendMessage(userId, error));
  }
});

function requestTransaction(userId: number): Promise<Transaction> {
  return bot.sendMessage(userId, `Please replay to this message and write information about your transaction.\nEnter the following parameters separated by a space.\nSymbol(AAPL) PriceOfShare(245.5) NumberOfShares(10) Operation(Purchase/Sale or P/S) Date(2020-04-25)`, { reply_markup: { force_reply: true } })
    .then((sentMessage: TelegramBot.Message) => {
     return new Promise((resolve, reject) => {
      const replyListenerId = bot.onReplyToMessage(userId, sentMessage.message_id, (reply: TelegramBot.Message) => {
        bot.removeReplyListener(replyListenerId);
        const [ symbol, price, numberOfShares, operation, date ] = reply.text.split(' ');
        return checkTransaction(symbol, price, numberOfShares, operation, date).then(valid => valid
          ? resolve({ symbol, price: parseFloat(price), numberOfShares: Number.parseInt(numberOfShares), operation, date })
          : reject('You entered invalid parameters')
        );
      });
    });
  });
}
