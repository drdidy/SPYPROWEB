import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pinePath = path.join(root, 'docs', 'tradingview', 'spy-prophet-entry-pro-v1.pine');
const guidePath = path.join(root, 'docs', 'tradingview', 'spy-prophet-entry-pro-v1-guide.md');

const pine = fs.readFileSync(pinePath, 'utf8');
const guide = fs.readFileSync(guidePath, 'utf8');

const count = (pattern) => [...pine.matchAll(pattern)].length;
const indexOf = (needle) => pine.indexOf(needle);

const requiredPayloadFields = [
  'schemaVersion',
  'source',
  'strategy',
  'symbol',
  'ticker',
  'timeframe',
  'eventAt',
  'barOpenAt',
  'kind',
  'direction',
  'message',
  'mode',
  'last',
  'eventPrice',
  'emaFast',
  'emaSlow',
  'pivotLow',
  'pivotHigh',
  'entryNear',
  'entryFar',
  'plannedEntry',
  'target',
  'stretchTarget',
  'stop',
  'contract',
  'underlying',
  'regime',
  'bandLow',
  'bandHigh',
  'strikeLow',
  'strikeHigh',
  'quoteRule',
  'candle',
  'open',
  'high',
  'low',
  'close',
];

const alertKinds = [
  'price_cross_50',
  'ema_cross_21_50',
  'entry',
  'exit_target',
  'exit_invalid',
  'exit_timeout',
];

const checks = [
  ['script exists and is v6', pine.startsWith('//@version=6')],
  ['indicator name is production candidate', pine.includes('indicator("SPY Prophet Entry Pro v1"')],
  ['chart status line uses short title', pine.includes('shorttitle="SPY Prophet"')],
  ['overlay is true', pine.includes('overlay=true')],
  ['no detached price scale', !pine.includes('scale=scale.none')],
  ['no hidden plot bridge', !/plot\([^)]*display=display\.none/.test(pine)],
  ['loop steps are Pine v6 valid', !/\bfor\s+\w+\s*=.*\s+by\s+-/.test(pine)],
  ['loops do not scan backward to zero', !/\bfor\s+\w+\s*=.*\bto\s+0\b/.test(pine)],
  ['1-minute trade guard exists', pine.includes('validChartTf = timeframe.isminutes and timeframe.multiplier == 1')],
  ['trade arming requires 1-minute guard', pine.includes('canArmNew = validChartTf and inSetupWindow')],
  ['session-open logic avoids v6 bool na checks', !/na\(\s*inEntrySession\[1\]\s*\)/.test(pine)],
  ['default fast EMA is 21', pine.includes('fastLen = input.int(21')],
  ['inputs are hidden from status line', (pine.match(/input\./g) || []).length === (pine.match(/display=display\.none/g) || []).length],
  ['EMA plots stay on chart without status-line clutter', pine.includes('plot(emaFast, "EMA 21", color=colFast, linewidth=2, display=display.pane)') && pine.includes('plot(emaSlow, "EMA 50", color=chart.fg_color, linewidth=2, display=display.pane)')],
  ['default slow EMA is 50', pine.includes('slowLen = input.int(50')],
  ['default pivots are 1 and 1', pine.includes('pivotLeft = input.int(1') && pine.includes('pivotRight = input.int(1')],
  ['default entry pocket is 0.618 to 0.786', pine.includes('nearFibInput = input.float(0.618') && pine.includes('deepFibInput = input.float(0.786')],
  ['float inputs avoid options parameter compile risk', !/input\.float\([^)]*options\s*=/.test(pine)],
  ['default target is 1.618', pine.includes('targetMultiple = input.float(1.618')],
  ['default stretch target is 1.786', pine.includes('stretchTargetMultiple = input.float(1.786')],
  ['default HTF stop is 32 minutes', pine.includes('htfStopMins = input.int(32')],
  ['first setup per session defaults on', pine.includes('setupsPerSession = input.string("First only"') && pine.includes('sessionSetupCount := 0') && pine.includes('canStartNewSetup = sessionSetupCount < setupLimit')],
  ['one confirmed trade per day defaults on', pine.includes('oneTradePerDay = input.bool(true')],
  ['contract guide is present', pine.includes('showContractGuide = input.bool(true') && pine.includes('gContract = "6. Contract guide"')],
  ['contract guide uses cash proxy and VIX regime', pine.includes('contractCashSymbol = input.symbol("SP:SPX"') && pine.includes('contractVixSymbol = input.symbol("CBOE:VIX"') && pine.includes('contractRegime =')],
  ['contract guide is target aware', pine.includes('contractTargetAware = input.bool(true') && pine.includes('contractBandHighActive')],
  ['contract guide freezes entry basis', pine.includes('entryContractBasis := entryContractAnchor - liveEntryPrice') && pine.includes('target + entryContractBasis')],
  ['contract guide uses OPRA/DataBento percentile tables', pine.includes('bucketValue(float otm') && pine.includes('DataBento OPRA SPXW 0DTE p75 ask table') && pine.includes('contractTargetGainPct(string optionSide, string regime, float otm)')],
  ['contract target math passes VIX regime through', pine.includes('contractPotentialAtTarget(string optionSide, string regime') && pine.includes('contractTargetGainPct(optionSide, regime, otm)')],
  ['contract estimate tags are capped', pine.includes('showContractTradeTags = input.bool(true') && pine.includes('rememberContractTag') && pine.includes('maxContractTradeTags = input.int(32')],
  ['contract tags no longer claim live estimates', !pine.includes('SPXW EST') && !pine.includes('SPXW EXIT EST') && pine.includes('SPXW HIST RANGE') && pine.includes('SPXW TARGET WATCH')],
  ['operator panel uses historical option wording', pine.includes('"Hist ask"') && pine.includes('"Target watch"')],
  ['recent 14 trade record exists', pine.includes('recentWindowTrades = input.int(14') && pine.includes('rememberTradeResult') && pine.includes('RECENT ')],
  ['operator panel has enough rows', pine.includes('table.new(panelPos, 2, 30') && pine.includes('table.clear(statusTable, 0, 0, 1, 29)')],
  ['contract estimates preserve exact quote warning', pine.includes('"quoteRule\\":\\"exact_bid_required\\"') && pine.includes('exact bid required')],
  ['performance record exists', pine.includes('showRecordStats = input.bool(true') && pine.includes('statWins') && pine.includes('statLosses') && pine.includes('statRSum')],
  ['price-cross alert exists', pine.includes('sendEvent("price_cross_50"')],
  ['21/50 setup alert exists', pine.includes('sendEvent("ema_cross_21_50"')],
  ['entry alert exists', pine.includes('sendEvent("entry"')],
  ['target exit alert exists', pine.includes('sendEvent("exit_target"')],
  ['invalid exit alert exists', pine.includes('sendEvent("exit_invalid"')],
  ['timeout exit alert exists', pine.includes('sendEvent("exit_timeout"')],
  ['webhook payload builder exists', pine.includes('buildJson(string kind, string side, string mode, float eventPrice)')],
  ['webhook schema version is pinned', pine.includes('"schemaVersion\\":1')],
  ['webhook source is tradingview', pine.includes('"source\\":\\"tradingview\\"')],
  ['webhook strategy id is stable', pine.includes('"strategy\\":\\"spy_prophet_entry_pro\\"')],
  ['webhook eventAt uses bar close', pine.includes('str.format_time(time_close')],
  ['webhook barOpenAt uses bar open', pine.includes('str.format_time(time,')],
  ['webhook payload has all required fields', requiredPayloadFields.every((field) => pine.includes(`"${field}\\":`) || pine.includes(`"${field}\\":\\"`))],
  ['webhook payload uses human-readable message', pine.includes('"message\\":\\"" + humanMessage(kind, side)')],
  ['price-cross payload nulls unknown trade levels', pine.includes('bool early = kind == "price_cross_50"') && pine.includes('(early ? "null" : jnum(pivotLow))') && pine.includes('(early ? "null" : jnum(target))')],
  ['alert dispatch is realtime only', pine.includes('if enabled and barstate.isrealtime')],
  ['alert dispatch fires once per bar close', pine.includes('alert.freq_once_per_bar_close')],
  ['all webhook event kinds are represented', alertKinds.every((kind) => pine.includes(kind))],
  ['price cross is evaluated before 21/50 cross setup', indexOf('if priceCrossUp50') >= 0 && indexOf('if priceCrossUp50') < indexOf('if rawCrossUp')],
  ['21/50 setup is evaluated before entry confirmation', indexOf('if rawCrossUp') >= 0 && indexOf('if rawCrossUp') < indexOf('if longEntryOk or shortEntryOk')],
  ['entry confirmation is evaluated before exits', indexOf('if longEntryOk or shortEntryOk') >= 0 && indexOf('if longEntryOk or shortEntryOk') < indexOf('if targetHit')],
  ['pivots are selected from price-50 cross boundary', pine.includes('pendingPriceCrossBar := lastPriceCrossUpBar') && pine.includes('pendingPriceCrossBar := lastPriceCrossDownBar')],
  ['long and short setup variables are explicit', pine.includes('longLoPivot') && pine.includes('longHiPivot') && pine.includes('shortLoPivot') && pine.includes('shortHiPivot') && !/\[(loPivot|hiPivot),/.test(pine)],
  ['trade cannot use pre-cross entry function', !pine.includes('findPreCrossTouch')],
  ['drawing code avoids object tuple helper compile risk', !pine.includes('makeSetupDrawings') && !/\[[^\]]*EntryNearLine[^\]]*\]\s*=/.test(pine)],
  ['object cleanup avoids typed helper functions', !/(deleteLine|deleteLabel|deleteFill|clearSetupDrawings|extendSetupLines)\s*\(/.test(pine)],
  ['old no-cross straddle strategy absent', !/straddle/i.test(pine)],
  ['control-grid strategy absent', !/control grid/i.test(pine)],
  ['no Pine TODO/FIXME markers', !/(TODO|FIXME)/.test(pine)],
  ['source is ASCII-only', !/[^\x00-\x7F]/.test(pine)],
  ['visual slots stay under TradingView limit', count(/\bplot\(/g) + count(/\bplotshape\(/g) + count(/\balertcondition\(/g) <= 64],
  ['plot count is intentionally tiny', count(/\bplot\(/g) === 2],
  ['alertcondition count covers user-facing choices', count(/\balertcondition\(/g) === 5],
  ['guide documents Any alert function call', guide.includes('Any alert() function call')],
  ['guide documents all alert kinds', alertKinds.every((kind) => guide.includes(kind))],
  ['guide documents webhook contract', requiredPayloadFields.every((field) => guide.includes(field))],
  ['guide documents research alignment', guide.includes('marked-settings ES research profile') && guide.includes('355,826 one-minute bars')],
  ['guide documents operator panel blocks', guide.includes('`SETUP`') && guide.includes('`CONTRACT`') && guide.includes('`RECORD`')],
  ['guide documents exact quote requirement', guide.includes('exact bid required') && guide.includes('chain must confirm')],
  ['guide documents OPRA/DataBento option ranges', guide.includes('DataBento OPRA SPXW 0DTE') && guide.includes('p75 behavior') && guide.includes('historical ask and target-watch ranges')],
  ['guide documents price-cross null trade levels', guide.includes('For `price_cross_50`, the pivot, entry, target, and stop fields are intentionally `null`')],
  ['guide tells Telegram to use full JSON alerts', guide.includes('Do not use the individual TradingView alertcondition messages for the Telegram bot')],
];

const failures = checks.filter(([, pass]) => !pass);

if (failures.length > 0) {
  console.error('SPY Prophet Entry Pro verifier failed:');
  for (const [name] of failures) {
    console.error(`- ${name}`);
  }
  process.exit(1);
}

console.log('SPY Prophet Entry Pro verifier passed.');
console.log(JSON.stringify({
  pinePath,
  guidePath,
  lines: pine.split(/\r?\n/).length,
  plotCalls: count(/\bplot\(/g),
  plotShapes: count(/\bplotshape\(/g),
  alertConditions: count(/\balertcondition\(/g),
  totalVisualSlots: count(/\bplot\(/g) + count(/\bplotshape\(/g) + count(/\balertcondition\(/g),
}, null, 2));
