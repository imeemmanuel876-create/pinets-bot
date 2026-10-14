const express = require('express');
const app = express();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
const TWELVE_DATA_API_KEY_2 = process.env.TWELVE_DATA_API_KEY_2;

const PAIRS = [
  { symbol: 'EUR/USD', label: 'EUR/USD', apiKey: TWELVE_DATA_API_KEY },
  { symbol: 'EUR/CAD', label: 'EUR/CAD', apiKey: TWELVE_DATA_API_KEY_2 },
];

const FAST_TIMEFRAMES = [{ td: '5min', label: '5m' }];
const SLOW_TIMEFRAMES = [
  { td: '15min', label: '15m' },
  { td: '45min', label: '45m' },
  { td: '1h',    label: '1H'  },
  { td: '2h',    label: '2H'  },
  { td: '4h',    label: '4H'  },
];

// ============================================================
// CUSTOM TWELVE DATA PROVIDER (enables request.security in PineTS)
// ============================================================
class TwelveDataProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.cache = {};
  }

  mapTimeframe(tf) {
    const map = {
      '1': '1min', '5': '5min', '15': '15min', '30': '30min',
      '45': '45min', '60': '1h', '120': '2h', '240': '4h',
      '1h': '1h', '2h': '2h', '4h': '4h',
      '5min': '5min', '15min': '15min', '45min': '45min',
    };
    return map[String(tf)] || String(tf);
  }

  async getMarketData(tickerId, timeframe, limit = 500) {
    const interval = this.mapTimeframe(timeframe);
    const cacheKey = `${tickerId}|${interval}|${limit}`;
    if (this.cache[cacheKey]) return this.cache[cacheKey];

    const url = `https://api.twelvedata.com/time_series?symbol=${tickerId}&interval=${interval}&outputsize=${limit}&apikey=${this.apiKey}&timezone=UTC`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.status === 'error') throw new Error(data.message);

    const candles = data.values.reverse().map(v => ({
      time: new Date(v.datetime + 'Z').getTime(),
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: parseFloat(v.volume || 0)
    }));

    this.cache[cacheKey] = candles;
    return candles;
  }

  async getSymbolInfo(tickerId) {
    return {
      tickerid: tickerId,
      mintick: 0.00001,
      pricescale: 100000,
      pointvalue: 1,
      mincontract: 1,
      session: '24x7',
      timezone: 'UTC'
    };
  }

  configure(config) {}
}

// ============================================================
// PINE SCRIPT v5 — EXACT ORIGINAL LOGIC, CRT USES request.security
// ============================================================
const PINE_SCRIPT = `
//@version=5
strategy("CRT + TBS + Manual + BOS MSS FVG + Trend", overlay=true, max_labels_count=500, max_lines_count=100, max_boxes_count=100, calc_on_every_tick=false, process_orders_on_close=true, default_qty_type=strategy.fixed, default_qty_value=1, initial_capital=1000000)

// ENGINE 1 — CRT + TBS
crtTimeframe     = "60"
maxBarsToReclaim = 12
minBodyPercent   = 0.30

crtHigh = request.security(syminfo.tickerid, crtTimeframe, high[1], lookahead=barmerge.lookahead_on)
crtLow  = request.security(syminfo.tickerid, crtTimeframe, low[1],  lookahead=barmerge.lookahead_on)
crtMid  = (crtHigh + crtLow) / 2

crtHighChanged = ta.change(crtHigh)
crtLowChanged  = ta.change(crtLow)
newCRT = crtHighChanged != 0 or crtLowChanged != 0

var int crtSweepState = 0
var int crtSweepBar   = na

if newCRT
    crtSweepState := 0
    crtSweepBar   := na

crtBodyBreakAbove = open > crtHigh and close > crtHigh
crtBodyBreakBelow = open < crtLow  and close < crtLow

if crtBodyBreakAbove
    crtSweepState := 1
    crtSweepBar   := bar_index
if crtBodyBreakBelow
    crtSweepState := -1
    crtSweepBar   := bar_index

crtBarsSinceSweep = na(crtSweepBar) ? na : bar_index - crtSweepBar
crtSweepExpired = crtSweepState != 0 and not na(crtBarsSinceSweep) and crtBarsSinceSweep > maxBarsToReclaim
if crtSweepExpired
    crtSweepState := 0
    crtSweepBar   := na

crtRange   = high - low
crtBody    = math.abs(close - open)
crtBodyPct = crtRange > 0 ? crtBody / crtRange : 0.0
crtBullRecl = close > open and crtBodyPct >= minBodyPercent
crtBearRecl = close < open and crtBodyPct >= minBodyPercent

crtBullishTBS = crtSweepState == -1 and not na(crtBarsSinceSweep) and crtBarsSinceSweep >= 1 and close > crtLow  and crtBullRecl
crtBearishTBS = crtSweepState == 1  and not na(crtBarsSinceSweep) and crtBarsSinceSweep >= 1 and close < crtHigh and crtBearRecl

crtBuySignal  = crtBullishTBS
crtSellSignal = crtBearishTBS

if crtBuySignal or crtSellSignal
    crtSweepState := 0
    crtSweepBar   := na

plotshape(crtBodyBreakBelow, "CRT Low Sweep",  shape.triangledown, location.belowbar, color.orange, size=size.tiny, text="SWEEP")
plotshape(crtBodyBreakAbove, "CRT High Sweep", shape.triangleup,   location.abovebar, color.orange, size=size.tiny, text="SWEEP")
plotshape(crtBuySignal,  "CRT BUY",  shape.labelup,   location.belowbar, color.blue,    text="CRT BUY",  textcolor=color.white, size=size.small)
plotshape(crtSellSignal, "CRT SELL", shape.labeldown, location.abovebar, color.fuchsia, text="CRT SELL", textcolor=color.white, size=size.small)

// ENGINE 2 — MANUAL TRADING ASSISTANT
swingLookback = 12
emaPeriod     = 200
minBodyPct    = 0.30
minCloseQual  = 0.60
atrLength     = 14

ema = ta.ema(close, emaPeriod)
atr = ta.atr(atrLength)

trendUp = close >= ema
trendDn = close <  ema
recentHigh = ta.highest(high, swingLookback)[1]
recentLow  = ta.lowest(low,  swingLookback)[1]
sweptUp = high > recentHigh and close < recentHigh
sweptDn = low  < recentLow  and close > recentLow

rng  = high - low
body = math.abs(close - open)
bodyPct = rng > 0 ? body / rng : 0.0
strongMove = bodyPct >= minBodyPct
closeQualBuy  = rng > 0 ? ((close - low)  / rng) >= minCloseQual : false
closeQualSell = rng > 0 ? ((high - close) / rng) >= minCloseQual : false

rawBuy  = sweptDn and strongMove and trendUp and close > open and closeQualBuy  and barstate.isconfirmed
rawSell = sweptUp and strongMove and trendDn and close < open and closeQualSell and barstate.isconfirmed

var int lastSig = na
inCooldown = not na(lastSig) ? (bar_index - lastSig) <= 1 : false
manualBuySignal  = rawBuy  and not inCooldown
manualSellSignal = rawSell and not inCooldown
if manualBuySignal or manualSellSignal
    lastSig := bar_index

plotshape(manualBuySignal,  "Manual BUY",  shape.labelup,   location.belowbar, color.green, text="BUY",  textcolor=color.white, size=size.small)
plotshape(manualSellSignal, "Manual SELL", shape.labeldown, location.abovebar, color.red,   text="SELL", textcolor=color.white, size=size.small)

// ENGINE 3 — BOS + MSS + FVG
structureSwing     = 5
structureATRLength = 14
minimumFVGATR      = 0.03
structureWindow    = 18
fvgRetestWindow    = 12
retestBodyPercent  = 0.35
structureCooldown  = 3

structureATR = ta.atr(structureATRLength)
structurePivotHigh = ta.pivothigh(high, structureSwing, structureSwing)
structurePivotLow  = ta.pivotlow(low,   structureSwing, structureSwing)

var float structureHigh = na
var float structureLow  = na
var bool  highAlreadyBroken = false
var bool  lowAlreadyBroken  = false

if not na(structurePivotHigh)
    structureHigh := structurePivotHigh
    highAlreadyBroken := false
if not na(structurePivotLow)
    structureLow := structurePivotLow
    lowAlreadyBroken := false

bullishBreak = not na(structureHigh) and close > structureHigh and not highAlreadyBroken
bearishBreak = not na(structureLow)  and close < structureLow  and not lowAlreadyBroken

if bullishBreak
    highAlreadyBroken := true
if bearishBreak
    lowAlreadyBroken := true

var int marketDirection = 0
bullishMSS = bullishBreak and marketDirection == -1
bearishMSS = bearishBreak and marketDirection ==  1
bullishBOS = bullishBreak and marketDirection >=  0
bearishBOS = bearishBreak and marketDirection <=  0

if bullishBreak
    marketDirection := 1
if bearishBreak
    marketDirection := -1

var int bullishStructureBar = na
var int bearishStructureBar = na
if bullishBOS or bullishMSS
    bullishStructureBar := bar_index
if bearishBOS or bearishMSS
    bearishStructureBar := bar_index

bullishStructureActive = not na(bullishStructureBar) and bar_index - bullishStructureBar <= structureWindow
bearishStructureActive = not na(bearishStructureBar) and bar_index - bearishStructureBar <= structureWindow

bullishFVG = low  > high[2] and (low - high[2])   >= structureATR * minimumFVGATR
bearishFVG = high < low[2]  and (low[2] - high)   >= structureATR * minimumFVGATR

var float bullFVGTop = na
var float bullFVGBottom = na
var bool  bullFVGActive = false
if bullishFVG and bullishStructureActive
    bullFVGTop := low
    bullFVGBottom := high[2]
    bullFVGActive := true

var float bearFVGTop = na
var float bearFVGBottom = na
var bool  bearFVGActive = false
if bearishFVG and bearishStructureActive
    bearFVGTop := low[2]
    bearFVGBottom := high
    bearFVGActive := true

bullishRetest = bullFVGActive and low  <= bullFVGTop    and high >= bullFVGBottom
bearishRetest = bearFVGActive and high >= bearFVGBottom and low  <= bearFVGTop

retestRange = high - low
retestBody  = math.abs(close - open)
retestBodyPct = retestRange > 0 ? retestBody / retestRange : 0.0
goodBullishRetestCandle = close > open and retestBodyPct >= retestBodyPercent
goodBearishRetestCandle = close < open and retestBodyPct >= retestBodyPercent

bullishRetestConfirmation = bullishRetest and goodBullishRetestCandle and close > bullFVGBottom
bearishRetestConfirmation = bearishRetest and goodBearishRetestCandle and close < bearFVGTop

structureBuyRaw  = bullishRetestConfirmation and marketDirection ==  1 and barstate.isconfirmed
structureSellRaw = bearishRetestConfirmation and marketDirection == -1 and barstate.isconfirmed

var int lastStructureSignal = na
structureCooldownActive = not na(lastStructureSignal) and bar_index - lastStructureSignal <= structureCooldown
structureBuySignal  = structureBuyRaw  and not structureCooldownActive
structureSellSignal = structureSellRaw and not structureCooldownActive
if structureBuySignal or structureSellSignal
    lastStructureSignal := bar_index

plotshape(bullishBOS, "Bullish BOS", shape.labelup,   location.belowbar, color.blue,   text="BOS", textcolor=color.white, size=size.tiny)
plotshape(bearishBOS, "Bearish BOS", shape.labeldown, location.abovebar, color.red,    text="BOS", textcolor=color.white, size=size.tiny)
plotshape(bullishMSS, "Bullish MSS", shape.labelup,   location.belowbar, color.aqua,   text="MSS", textcolor=color.black, size=size.small)
plotshape(bearishMSS, "Bearish MSS", shape.labeldown, location.abovebar, color.orange, text="MSS", textcolor=color.black, size=size.small)
plotshape(bullishFVG, "Bullish FVG", shape.labelup,   location.belowbar, color.blue,   text="FVG", textcolor=color.white, size=size.tiny)
plotshape(bearishFVG, "Bearish FVG", shape.labeldown, location.abovebar, color.red,    text="FVG", textcolor=color.white, size=size.tiny)
plotshape(structureBuySignal,  "BOS MSS FVG BUY",  shape.labelup,   location.belowbar, color.purple, text="BUY",  textcolor=color.white, size=size.small)
plotshape(structureSellSignal, "BOS MSS FVG SELL", shape.labeldown, location.abovebar, color.orange, text="SELL", textcolor=color.white, size=size.small)

// ENGINE 4 — TREND CHANGE
tcSwingLength      = 4
tcLiquidityLookback= 12
tcFastEMA          = 20
tcMidEMA           = 50
tcSlowEMA          = 200
tcATRLength        = 14
tcLiquidityBuffer  = 0.05
tcConfirmationBars = 2
tcLiquidityWindow  = 10
tcCooldown         = 5

tcEMA20  = ta.ema(close, tcFastEMA)
tcEMA50  = ta.ema(close, tcMidEMA)
tcEMA200 = ta.ema(close, tcSlowEMA)
tcATR    = ta.atr(tcATRLength)
tcBuffer = tcATR * tcLiquidityBuffer

tcPivotHigh = ta.pivothigh(high, tcSwingLength, tcSwingLength)
tcPivotLow  = ta.pivotlow(low,   tcSwingLength, tcSwingLength)

var float tcSwingHigh = na
var float tcSwingLow  = na
if not na(tcPivotHigh)
    tcSwingHigh := tcPivotHigh
if not na(tcPivotLow)
    tcSwingLow := tcPivotLow

tcRecentHigh = ta.highest(high, tcLiquidityLookback)[1]
tcRecentLow  = ta.lowest(low,   tcLiquidityLookback)[1]

tcBullishLiquiditySweep = not na(tcRecentLow)  and low  < tcRecentLow  - tcBuffer and close > tcRecentLow
tcBearishLiquiditySweep = not na(tcRecentHigh) and high > tcRecentHigh + tcBuffer and close < tcRecentHigh

var int tcBullSweepBar = na
var int tcBearSweepBar = na
if tcBullishLiquiditySweep
    tcBullSweepBar := bar_index
if tcBearishLiquiditySweep
    tcBearSweepBar := bar_index

tcBullLiquidityActive = not na(tcBullSweepBar) and bar_index - tcBullSweepBar <= tcLiquidityWindow
tcBearLiquidityActive = not na(tcBearSweepBar) and bar_index - tcBearSweepBar <= tcLiquidityWindow

if not na(tcBullSweepBar) and bar_index - tcBullSweepBar > tcLiquidityWindow
    tcBullSweepBar := na
if not na(tcBearSweepBar) and bar_index - tcBearSweepBar > tcLiquidityWindow
    tcBearSweepBar := na

var int tcTrendState = 0
tcBullTrend = close > tcEMA50 + tcBuffer and tcEMA20 > tcEMA50 and tcEMA50 > tcEMA200
tcBearTrend = close < tcEMA50 - tcBuffer and tcEMA20 < tcEMA50 and tcEMA50 < tcEMA200
if tcBullTrend
    tcTrendState := 1
if tcBearTrend
    tcTrendState := -1

tcBullishStructureBreak = tcBullLiquidityActive and not na(tcSwingHigh) and close > tcSwingHigh
tcBearishStructureBreak = tcBearLiquidityActive and not na(tcSwingLow)  and close < tcSwingLow

tcBullMomentum = 0
tcBearMomentum = 0
for i = 0 to tcConfirmationBars - 1
    if close[i] > tcEMA20[i]
        tcBullMomentum += 1
    if close[i] < tcEMA20[i]
        tcBearMomentum += 1

tcBullConfirmed = tcBullMomentum >= tcConfirmationBars
tcBearConfirmed = tcBearMomentum >= tcConfirmationBars

tcRange = high - low
tcBody  = math.abs(close - open)
tcBodyPercent = tcRange > 0 ? tcBody / tcRange : 0.0
tcBullCandle = close > open and tcBodyPercent >= 0.35
tcBearCandle = close < open and tcBodyPercent >= 0.35

tcBullishTrendChange = tcTrendState == -1 and tcBullishStructureBreak and tcBullConfirmed and tcBullCandle and close > tcEMA20 and barstate.isconfirmed
tcBearishTrendChange = tcTrendState ==  1 and tcBearishStructureBreak and tcBearConfirmed and tcBearCandle and close < tcEMA20 and barstate.isconfirmed

var int tcLastSignalBar = na
tcCooldownActive = not na(tcLastSignalBar) and bar_index - tcLastSignalBar <= tcCooldown

tcTrendBuySignal  = tcBullishTrendChange and not tcCooldownActive
tcTrendSellSignal = tcBearishTrendChange and not tcCooldownActive

if tcTrendBuySignal or tcTrendSellSignal
    tcLastSignalBar := bar_index
if tcTrendBuySignal
    tcBullSweepBar := na
if tcTrendSellSignal
    tcBearSweepBar := na

plotshape(tcBullishLiquiditySweep, "Liq Bull Sweep", shape.labelup, location.belowbar, color=color.new(color.green, 0), text="LIQ BULL", textcolor=color.white, size=size.small)
plotshape(tcBearishLiquiditySweep, "Liq Bear Sweep", shape.labeldown, location.abovebar, color=color.new(color.red, 0), text="LIQ BEAR", textcolor=color.white, size=size.small)
plotshape(tcTrendBuySignal,  "Trend BUY",  shape.labelup,   location.belowbar, color.yellow, text="TREND BUY",  textcolor=color.black, size=size.small)
plotshape(tcTrendSellSignal, "Trend SELL", shape.labeldown, location.abovebar, color.aqua,   text="TREND SELL", textcolor=color.black, size=size.small)
`;
// ============================================================

const SIGNALS = {
  "CRT BUY":          { label: "CRT BUY",              emoji: "🟦" },
  "CRT SELL":         { label: "CRT SELL",             emoji: "🟪" },
  "Manual BUY":       { label: "MANUAL BUY",           emoji: "🟢" },
  "Manual SELL":      { label: "MANUAL SELL",          emoji: "🔴" },
  "Bullish BOS":      { label: "BOS BULLISH",          emoji: "🔵" },
  "Bearish BOS":      { label: "BOS BEARISH",          emoji: "🔻" },
  "Bullish MSS":      { label: "MSS BULLISH",          emoji: "🩵" },
  "Bearish MSS":      { label: "MSS BEARISH",          emoji: "🟠" },
  "Bullish FVG":      { label: "FVG BULLISH",          emoji: "📘" },
  "Bearish FVG":      { label: "FVG BEARISH",          emoji: "📕" },
  "BOS MSS FVG BUY":  { label: "STRUCTURE BUY",        emoji: "🟣" },
  "BOS MSS FVG SELL": { label: "STRUCTURE SELL",       emoji: "🟠" },
  "Liq Bull Sweep":   { label: "LIQUIDITY BULL SWEEP", emoji: "💧" },
  "Liq Bear Sweep":   { label: "LIQUIDITY BEAR SWEEP", emoji: "💧" },
  "Trend BUY":        { label: "TREND BUY",            emoji: "🟡" },
  "Trend SELL":       { label: "TREND SELL",           emoji: "🌊" },
};

const alertedBars = {};

async function sendTelegram(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' })
  });
}

async function checkTimeframe(pair, tf) {
  const provider = new TwelveDataProvider(pair.apiKey);
  const { PineTS } = require('pinets');
  const pine = new PineTS(provider, pair.symbol, tf.td, 500);
  const result = await pine.run(PINE_SCRIPT);

  const marketData = result.marketData;
  const checkIdx = marketData.length - 2;
  const currentPrice = marketData[checkIdx].close;
  const barTime = new Date(marketData[checkIdx].time).toISOString();

  const cacheKey = `${pair.label}_${tf.label}`;
  if (alertedBars[cacheKey] === barTime) {
    return { pair: pair.label, timeframe: tf.label, skipped: true, bar: barTime };
  }

  const fired = [];
  for (const [plotName, meta] of Object.entries(SIGNALS)) {
    const data = result.plots[plotName]?.data;
    if (!Array.isArray(data) || data.length < 2) continue;
    const last = data[checkIdx];
    const value = (last && typeof last === 'object') ? last.value : last;
    if (value === true) {
      fired.push({ signal: meta.label, emoji: meta.emoji });
    }
  }

  if (fired.length > 0) {
    alertedBars[cacheKey] = barTime;
    for (const f of fired) {
      const msg = `${f.emoji} <b>${f.signal}</b>\n` +
                  `📊 ${pair.label} · <b>${tf.label}</b>\n` +
                  `💵 Price: ${currentPrice}\n` +
                  `🕐 Bar: ${barTime}`;
      await sendTelegram(msg);
    }
  }

  return {
    pair: pair.label,
    timeframe: tf.label,
    bar: barTime,
    price: currentPrice,
    signals_fired: fired.length,
    signals: fired
  };
}

async function runChecks(timeframes) {
  const results = [];
  for (const pair of PAIRS) {
    for (const tf of timeframes) {
      try {
        results.push(await checkTimeframe(pair, tf));
      } catch (e) {
        results.push({ pair: pair.label, timeframe: tf.label, error: e.message });
      }
    }
  }
  return results;
}

app.get('/', (req, res) => res.send('PineTS Bot is running!'));

app.get('/check-fast', async (req, res) => {
  res.json({ success: true, mode: 'fast', checked: await runChecks(FAST_TIMEFRAMES) });
});

app.get('/check-slow', async (req, res) => {
  res.json({ success: true, mode: 'slow', checked: await runChecks(SLOW_TIMEFRAMES) });
});

// Verify that Twelve Data is returning the correct symbols
app.get('/verify-pairs', async (req, res) => {
  const out = [];
  for (const pair of PAIRS) {
    try {
      const url = `https://api.twelvedata.com/time_series?symbol=${pair.symbol}&interval=15min&outputsize=3&apikey=${pair.apiKey}&timezone=UTC`;
      const r = await fetch(url);
      const d = await r.json();
      out.push({
        requested: pair.label,
        twelveDataReturned: d.meta?.symbol || 'unknown',
        match: pair.symbol === (d.meta?.symbol || ''),
        latestClose: d.values?.[0]?.close
      });
    } catch (e) {
      out.push({ requested: pair.label, error: e.message });
    }
  }
  res.json(out);
});

module.exports = app;