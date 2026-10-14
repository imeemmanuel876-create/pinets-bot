const express = require('express');
const app = express();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;

// ============================================================
// YOUR PINE SCRIPT v5 — PASTE THE FULL SCRIPT HERE
// (the v5 conversion I gave you earlier)
// ============================================================
const PINE_SCRIPT = `
//@version=5
strategy("CRT + TBS + Manual + BOS MSS FVG + Trend - Full Strategy", overlay=true, max_labels_count=500, max_lines_count=100, max_boxes_count=100, calc_on_every_tick=false, process_orders_on_close=true, default_qty_type=strategy.fixed, default_qty_value=1, initial_capital=1000000)

// ...PASTE YOUR FULL v5 SCRIPT HERE...
`;
// ============================================================

async function fetchCandles(symbol, interval, outputsize = 500) {
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

async function sendTelegram(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' })
  });
}

app.get('/', (req, res) => res.send('PineTS Bot is running!'));

// Diagnostic: shows what plots PineTS produces from your script
app.get('/inspect', async (req, res) => {
  try {
    const candles = await fetchCandles('EUR/USD', '15min', 500);
    const { PineTS } = require('pinets');
    const pine = new PineTS(candles);
    const result = await pine.run(PINE_SCRIPT);

    const plotNames = Object.keys(result.plots || {});
    const lastBarValues = {};
    for (const name of plotNames) {
      const data = result.plots[name]?.data;
      if (Array.isArray(data) && data.length > 0) {
        const last = data[data.length - 1];
        lastBarValues[name] = (last && typeof last === 'object') ? last.value : last;
      }
    }
    res.json({ candle_count: candles.length, plot_names: plotNames, last_bar_values: lastBarValues });
  } catch (e) {
    res.json({ error: e.message, stack: e.stack });
  }
});

module.exports = app;