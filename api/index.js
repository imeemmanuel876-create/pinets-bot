const express = require('express');
const app = express();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;

// --- Simple Pine Script test ---
const TEST_PINE = `
//@version=5
indicator("Test")
ema20 = ta.ema(close, 20)
plot(ema20, "EMA20")
`;

async function fetchCandles(symbol, interval, outputsize = 100) {
  const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${interval}&outputsize=${outputsize}&apikey=${TWELVE_DATA_API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();
  if (data.status === 'error') throw new Error(data.message);
  return data.values.reverse().map(v => ({
    time: new Date(v.datetime).getTime(),
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: parseFloat(v.volume || 0)
  }));
}

app.get('/', (req, res) => res.send('PineTS Bot is running!'));

app.get('/test-pinets', async (req, res) => {
  try {
    const candles = await fetchCandles('EUR/USD', '15min', 100);
    
    // Try to import PineTS
    let PineTS;
    try {
      const pinets = require('pinets');
      PineTS = pinets.PineTS;
    } catch (e) {
      return res.json({ 
        error: 'PineTS import failed', 
        details: e.message,
        availableExports: Object.keys(require('pinets'))
      });
    }

    // Try to run
    try {
      const pine = new PineTS(candles);
      const result = await pine.run(TEST_PINE);
      res.json({ 
        success: true, 
        candles_count: candles.length,
        plots: Object.keys(result.plots || {}),
        lastEMA: result.plots?.EMA20?.data?.slice(-1)[0]
      });
    } catch (e) {
      res.json({ error: 'PineTS run failed', details: e.message, stack: e.stack });
    }
  } catch (error) {
    res.json({ error: error.message });
  }
});

module.exports = app;