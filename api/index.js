const express = require('express');
const app = express();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;

// --- Test 1: Welcome route ---
app.get('/', (req, res) => {
  res.send('PineTS Bot is running!');
});

// --- Test 2: Verify environment variables are loaded ---
app.get('/env-check', (req, res) => {
  res.json({
    telegram_token_set: !!TELEGRAM_BOT_TOKEN,
    telegram_chat_set: !!TELEGRAM_CHAT_ID,
    twelve_data_key_set: !!TWELVE_DATA_API_KEY
  });
});

// --- Test 3: Send a test message to Telegram ---
app.get('/test-telegram', async (req, res) => {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: '✅ Test message from your Vercel bot!',
        parse_mode: 'HTML'
      })
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.json({ error: error.message });
  }
});

// --- Test 4: Fetch a candle from Twelve Data ---
app.get('/test-data', async (req, res) => {
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=EUR/USD&interval=15min&outputsize=5&apikey=${TWELVE_DATA_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.json({ error: error.message });
  }
});

module.exports = app;