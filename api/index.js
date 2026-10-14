const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('PineTS Bot is running!');
});

app.get('/check', (req, res) => {
  res.json({ status: 'check endpoint works' });
});

module.exports = app;