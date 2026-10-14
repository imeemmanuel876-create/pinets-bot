const express = require('express');
const app = express();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;

// ============================================================
// YOUR PINE SCRIPT v5 — FULLY INTEGRATED
// ============================================================
const PINE_SCRIPT = `
//@version=5
strategy("CRT + TBS + Manual + BOS MSS FVG + Trend - Full Strategy", overlay=true, max_labels_count=500, max_lines_count=100, max_boxes_count=100, calc_on_every_tick=false, process_orders_on_close=true, default_qty_type=strategy.fixed, default_qty_value=1, initial_capital=1000000)

//====================================================
// ENGINE 1 — CRT + TBS
//====================================================
maxBarsToReclaim  = input.int(12, "Max Bars For TBS Reclaim", minval=1, maxval=100)
minBodyPercent    = input.float(0.30, "Minimum Reclaim Body %", minval=0.0, maxval=1.0, step=0.05)
showMidpoint      = input.bool(true, "Show CRT Midpoint")
showCRTSignals    = input.bool(true, "Show CRT Signals")
showSweepMarkers  = input.bool(true, "Show Sweep Markers")

crtHigh = request.security("EUR/USD", "60", high[1], lookahead=barmerge.lookahead_on)
crtLow  = request.security("EUR/USD", "60", low[1],  lookahead=barmerge.lookahead_on)
crtMid  = (crtHigh + crtLow) / 2

plot(crtHigh, "CRT High", color=color.red,  linewidth=2)
plot(crtLow,  "CRT Low",  color=color.lime, linewidth=2)
plot(showMidpoint ? crtMid : na, "CRT Mid", color=color.gray, linewidth=1)

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
crtSweepExpired   = crtSweepState != 0 and not na(crtBarsSinceSweep) and crtBarsSinceSweep > maxBarsToReclaim
if crtSweepExpired
    crtSweepState := 0
    crtSweepBar   := na

crtRange     = high - low
crtBody      = math.abs(close - open)
crtBodyPct   = crtRange > 0 ? crtBody / crtRange : 0.0
crtBullRecl  = close > open and crtBodyPct >= minBodyPercent
crtBearRecl  = close < open and crtBodyPct >= minBodyPercent

crtBullishTBS = crtSweepState == -1 and not na(crtBarsSinceSweep) and crtBarsSinceSweep >= 1 and close > crtLow  and crtBullRecl
crtBearishTBS = crtSweepState == 1  and not na(crtBarsSinceSweep) and crtBarsSinceSweep >= 1 and close < crtHigh and crtBearRecl

crtBuySignal  = crtBullishTBS
crtSellSignal = crtBearishTBS

if crtBuySignal or crtSellSignal
    crtSweepState := 0
    crtSweepBar   := na

plotshape(showSweepMarkers and crtBodyBreakBelow, "CRT Low Sweep",  shape.triangledown, location.belowbar, color.orange, size=size.tiny, text="SWEEP")
plotshape(showSweepMarkers and crtBodyBreakAbove, "CRT High Sweep", shape.triangleup,   location.abovebar, color.orange, size=size.tiny, text="SWEEP")
plotshape(showCRTSignals and crtBuySignal,  "CRT BUY",  shape.labelup,   location.belowbar, color.blue,    text="CRT BUY",  textcolor=color.white, size=size.small)
plotshape(showCRTSignals and crtSellSignal, "CRT SELL", shape.labeldown, location.abovebar, color.fuchsia, text="CRT SELL", textcolor=color.white, size=size.small)

//====================================================
// ENGINE 2 — MANUAL TRADING ASSISTANT
//====================================================
swingLookback = input.int(12, "Swing Lookback", minval=3)
emaPeriod     = input.int(200, "Trend EMA Period")
minBodyPct    = input.float(0.30, "Min Body % (Displacement)")
minCloseQual  = input.float(0.60, "Min Close Quality")
atrLength     = input.int(14, "ATR Length")
slMultiplier  = input.float(1.5, "SL ATR Multiplier", minval=0.5)
rrRatio       = input.float(1.5, "RR Ratio", minval=1.0)
showSLTP      = input.bool(true, "Draw SL/TP")
showLabels    = input.bool(true, "Show Entry Labels")
useSessionBg  = input.bool(true, "Shade Session")
sess          = input.session("0700-1000,1200-1600", "Session (UTC)")

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
inSession = not na(time(timeframe.period, sess))

rawBuy  = sweptDn and strongMove and trendUp and close > open and closeQualBuy  and barstate.isconfirmed
rawSell = sweptUp and strongMove and trendDn and close < open and closeQualSell and barstate.isconfirmed

var int lastSig = na
inCooldown = not na(lastSig) ? (bar_index - lastSig) <= 1 : false
manualBuySignal  = rawBuy  and not inCooldown
manualSellSignal = rawSell and not inCooldown
if manualBuySignal or manualSellSignal
    lastSig := bar_index

var float slLong  = na
var float tpLong  = na
var float slShort = na
var float tpShort = na

if manualBuySignal
    slLong := close - (atr * slMultiplier)
    tpLong := close + (atr * slMultiplier * rrRatio)
if manualSellSignal
    slShort := close + (atr * slMultiplier)
    tpShort := close - (atr * slMultiplier * rrRatio)

plotshape(showLabels and manualBuySignal,  "Manual BUY",  shape.labelup,   location.belowbar, color.green, text="BUY",  textcolor=color.white, size=size.small)
plotshape(showLabels and manualSellSignal, "Manual SELL", shape.labeldown, location.abovebar, color.red,   text="SELL", textcolor=color.white, size=size.small)

if showSLTP and manualBuySignal
    line.new(bar_index, slLong, bar_index + 10, slLong, color=color.red,   style=line.style_dashed)
    line.new(bar_index, tpLong, bar_index + 10, tpLong, color=color.green, style=line.style_dashed)
if showSLTP and manualSellSignal
    line.new(bar_index, slShort, bar_index + 10, slShort, color=color.red,   style=line.style_dashed)
    line.new(bar_index, tpShort, bar_index + 10, tpShort, color=color.green, style=line.style_dashed)

bgcolor(useSessionBg and inSession ? color.new(color.blue, 80) : na, title="Trade Window")

//====================================================
// ENGINE 3 — BOS + MSS + FVG
//====================================================
structureSwing      = input.int(5, "BOS/MSS Swing Strength", minval=2, maxval=15)
structureATRLength  = input.int(14, "Structure ATR Length", minval=1)
minimumFVGATR       = input.float(0.03, "Min FVG × ATR", minval=0.0, step=0.01)
structureWindow     = input.int(18, "Structure Validity Bars", minval=5, maxval=100)
fvgRetestWindow     = input.int(12, "FVG Retest Window", minval=3, maxval=50)
retestBodyPercent   = input.float(0.35, "Retest Body %", minval=0.10, maxval=1.0, step=0.05)
structureCooldown   = input.int(3, "Structure Cooldown", minval=1, maxval=20)

structureATR = ta.atr(structureATRLength)
structPivotH = ta.pivothigh(high, structureSwing, structureSwing)
structPivotL = ta.pivotlow(low,   structureSwing, structureSwing)

var float structureHigh   = na
var float structureLow    = na
var int   structureHighBar = na
var int   structureLowBar  = na
var bool  highAlreadyBroken = false
var bool  lowAlreadyBroken  = false

if not na(structPivotH)
    structureHigh := structPivotH
    structureHighBar := bar_index - structureSwing
    highAlreadyBroken := false
if not na(structPivotL)
    structureLow := structPivotL
    structureLowBar := bar_index - structureSwing
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

var int bullishStructureBar  = na
var int bearishStructureBar  = na
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
var int   bullFVGBar = na
var bool  bullFVGActive = false

if bullishFVG and bullishStructureActive
    bullFVGTop := low
    bullFVGBottom := high[2]
    bullFVGBar := bar_index
    bullFVGActive := true

var float bearFVGTop = na
var float bearFVGBottom = na
var int   bearFVGBar = na
var bool  bearFVGActive = false

if bearishFVG and bearishStructureActive
    bearFVGTop := low[2]
    bearFVGBottom := high
    bearFVGBar := bar_index
    bearFVGActive := true

if bullFVGActive and not na(bullFVGBar) and bar_index - bullFVGBar > fvgRetestWindow
    bullFVGActive := false
if bearFVGActive and not na(bearFVGBar) and bar_index - bearFVGBar > fvgRetestWindow
    bearFVGActive := false

bullishRetest = bullFVGActive and bar_index > bullFVGBar and low  <= bullFVGTop    and high >= bullFVGBottom
bearishRetest = bearFVGActive and bar_index > bearFVGBar and high >= bearFVGBottom and low  <= bearFVGTop

retestRange = high - low
retestBody  = math.abs(close - open)
retestBodyPct = retestRange > 0 ? retestBody / retestRange : 0.0
goodBullRetest = close > open and retestBodyPct >= retestBodyPercent
goodBearRetest = close < open and retestBodyPct >= retestBodyPercent

bullRetestConf = bullishRetest and goodBullRetest and close > bullFVGBottom
bearRetestConf = bearishRetest and goodBearRetest and close < bearFVGTop

structureBuyRaw  = bullRetestConf and marketDirection ==  1 and barstate.isconfirmed
structureSellRaw = bearRetestConf and marketDirection == -1 and barstate.isconfirmed

var int lastStructureSignal = na
structCooldownActive = not na(lastStructureSignal) and bar_index - lastStructureSignal <= structureCooldown

structureBuySignal  = structureBuyRaw  and not structCooldownActive
structureSellSignal = structureSellRaw and not structCooldownActive

if structureBuySignal or structureSellSignal
    lastStructureSignal := bar_index
if structureBuySignal
    bullFVGActive := false
if structureSellSignal
    bearFVGActive := false

plotshape(bullishBOS, "Bullish BOS", shape.labelup,   location.belowbar, color.blue,   text="BOS", textcolor=color.white, size=size.tiny)
plotshape(bearishBOS, "Bearish BOS", shape.labeldown, location.abovebar, color.red,    text="BOS", textcolor=color.white, size=size.tiny)
plotshape(bullishMSS, "Bullish MSS", shape.labelup,   location.belowbar, color.aqua,   text="MSS", textcolor=color.black, size=size.small)
plotshape(bearishMSS, "Bearish MSS", shape.labeldown, location.abovebar, color.orange, text="MSS", textcolor=color.black, size=size.small)
plotshape(bullishFVG, "Bullish FVG", shape.labelup,   location.belowbar, color.blue,   text="FVG", textcolor=color.white, size=size.tiny)
plotshape(bearishFVG, "Bearish FVG", shape.labeldown, location.abovebar, color.red,    text="FVG", textcolor=color.white, size=size.tiny)
plotshape(structureBuySignal,  "BOS MSS FVG BUY",  shape.labelup,   location.belowbar, color.purple, text="BUY",  textcolor=color.white, size=size.small)
plotshape(structureSellSignal, "BOS MSS FVG SELL", shape.labeldown, location.abovebar, color.orange, text="SELL", textcolor=color.white, size=size.small)

//====================================================
// ENGINE 4 — TREND CHANGE / LIQUIDITY
//====================================================
tcSwingLength      = input.int(4,  "Trend Swing Strength", minval=2, maxval=10)
tcLiquidityLookback= input.int(12, "Liquidity Lookback", minval=5, maxval=30)
tcFastEMA          = input.int(20, "Trend Fast EMA", minval=5, maxval=100)
tcMidEMA           = input.int(50, "Trend Mid EMA", minval=10, maxval=200)
tcSlowEMA          = input.int(200,"Trend Slow EMA", minval=50, maxval=500)
tcATRLength        = input.int(14, "Trend ATR", minval=1)
tcLiquidityBuffer  = input.float(0.05, "Liquidity Buffer × ATR", minval=0.0, step=0.01)
tcConfirmationBars = input.int(2, "Trend Confirmation Bars", minval=1, maxval=4)
tcLiquidityWindow  = input.int(10, "Liquidity Validity Bars", minval=2, maxval=30)
tcCooldown         = input.int(5, "Trend Signal Cooldown", minval=1, maxval=30)

tcEMA20  = ta.ema(close, tcFastEMA)
tcEMA50  = ta.ema(close, tcMidEMA)
tcEMA200 = ta.ema(close, tcSlowEMA)
tcATR    = ta.atr(tcATRLength)
tcBuffer = tcATR * tcLiquidityBuffer

tcPivotH = ta.pivothigh(high, tcSwingLength, tcSwingLength)
tcPivotL = ta.pivotlow(low,   tcSwingLength, tcSwingLength)

var float tcSwingHigh = na
var float tcSwingLow = na
var int   tcSwingHighBar = na
var int   tcSwingLowBar = na

if not na(tcPivotH)
    tcSwingHigh := tcPivotH
    tcSwingHighBar := bar_index - tcSwingLength
if not na(tcPivotL)
    tcSwingLow := tcPivotL
    tcSwingLowBar := bar_index - tcSwingLength

tcRecentHigh = ta.highest(high, tcLiquidityLookback)[1]
tcRecentLow  = ta.lowest(low,   tcLiquidityLookback)[1]

tcBullSweep = not na(tcRecentLow)  and low  < tcRecentLow  - tcBuffer and close > tcRecentLow
tcBearSweep = not na(tcRecentHigh) and high > tcRecentHigh + tcBuffer and close < tcRecentHigh

var int tcBullSweepBar = na
var int tcBearSweepBar = na

if tcBullSweep
    tcBullSweepBar := bar_index
if tcBearSweep
    tcBearSweepBar := bar_index

tcBullLiqActive = not na(tcBullSweepBar) and bar_index - tcBullSweepBar <= tcLiquidityWindow
tcBearLiqActive = not na(tcBearSweepBar) and bar_index - tcBearSweepBar <= tcLiquidityWindow

if not na(tcBullSweepBar) and bar_index - tcBullSweepBar > tcLiquidityWindow
    tcBullSweepBar := na
if not na(tcBearSweepBar) and bar_index - tcBearSweepBar > tcLiquidityWindow
    tcBearSweepBar := na

tcBullTrend = close > tcEMA50 + tcBuffer and tcEMA20 > tcEMA50 and tcEMA50 > tcEMA200
tcBearTrend = close < tcEMA50 - tcBuffer and tcEMA20 < tcEMA50 and tcEMA50 < tcEMA200

var int tcTrendState = 0
if tcBullTrend
    tcTrendState := 1
if tcBearTrend
    tcTrendState := -1

tcBullStructBreak = tcBullLiqActive and not na(tcSwingHigh) and close > tcSwingHigh
tcBearStructBreak = tcBearLiqActive and not na(tcSwingLow)  and close < tcSwingLow

tcBullMom = 0
tcBearMom = 0
for i = 0 to tcConfirmationBars - 1
    if close[i] > tcEMA20[i]
        tcBullMom += 1
    if close[i] < tcEMA20[i]
        tcBearMom += 1

tcBullConf = tcBullMom >= tcConfirmationBars
tcBearConf = tcBearMom >= tcConfirmationBars

tcRange = high - low
tcBody  = math.abs(close - open)
tcBodyPct = tcRange > 0 ? tcBody / tcRange : 0.0
tcBullCandle = close > open and tcBodyPct >= 0.35
tcBearCandle = close < open and tcBodyPct >= 0.35

tcBullishTrendChange = tcTrendState == -1 and tcBullStructBreak and tcBullConf and tcBullCandle and close > tcEMA20 and barstate.isconfirmed
tcBearishTrendChange = tcTrendState ==  1 and tcBearStructBreak and tcBearConf and tcBearCandle and close < tcEMA20 and barstate.isconfirmed

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

plotshape(tcBullSweep, "Liq Bull Sweep", shape.labelup, location.belowbar, color=color.new(color.green, 0), text="LIQ BULL", textcolor=color.white, size=size.small)
plotshape(tcBearSweep, "Liq Bear Sweep", shape.labeldown, location.abovebar, color=color.new(color.red, 0), text="LIQ BEAR", textcolor=color.white, size=size.small)
plotshape(tcTrendBuySignal,  "Trend BUY",  shape.labelup,   location.belowbar, color.yellow, text="TREND BUY",  textcolor=color.black, size=size.small)
plotshape(tcTrendSellSignal, "Trend SELL", shape.labeldown, location.abovebar, color.aqua,   text="TREND SELL", textcolor=color.black, size=size.small)
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