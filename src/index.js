const TelegramBot = require('node-telegram-bot-api');
const https = require('https');

const telegramToken = process.env.TELEGRAM_TOKEN;
const finnhubToken = process.env.FINNHUB_TOKEN;

const myPortfolio = [
  {
    symbol: 'NMIH',
    price: 10.06,
    count: 10,
  },
  {
    symbol: 'GM',
    price: 21.22,
    count: 10,
  },
  {
    symbol: 'TJX',
    price: 46.33,
    count: 10,
  },
  {
    symbol: 'DHI',
    price: 39.5,
    count: 5,
  },
  {
    symbol: 'BSX',
    price: 35.5,
    count: 7,
  },
  {
    symbol: 'DFS',
    price: 34.79,
    count: 2,
  },
  {
    symbol: 'RCL',
    price: 34.06,
    count: 2,
  },
];

const bot = new TelegramBot(telegramToken, { polling: true });

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  Promise.all(myPortfolio.map(ticker => getCurrentPrice(ticker.symbol)))
    .then(currentPrices => {
      let earn = 0;
      let message = myPortfolio.map((ticker, index) => {
        const current = currentPrices[index];
        const diff = current - ticker.price;
        const total = diff * ticker.count;
        earn += total;
        return `${ ticker.symbol } | ${ current } | ${ diff.toFixed(2) } | ${ total.toFixed(2) }`;
      }).join('\n');
      message += `\nTotal Earn: ${ earn.toFixed(2) }`;
      bot.sendMessage(chatId, message);
    });
});

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
