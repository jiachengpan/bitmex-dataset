'use strict';

const {ArgumentParser} = require('argparse');
const sqlite3 = require('sqlite3').verbose();
const to   = require('await-to-js').default;
const util = require('util');
const ccxt = require('ccxt');
const _ = require('lodash');

const parser = new ArgumentParser({
    addHelp: true,
    description: 'bitmex-downloader',
});


parser.addArgument(['-s', '--start'],     {defaultValue: undefined, help: 'start'});
parser.addArgument(['-t', '--duration'],  {defaultValue: 3600, type: 'int', help: 'duration in seconds'});
parser.addArgument(['--agg'],             {defaultValue: false, action: 'storeTrue', help: 'aggregate trades'});
parser.addArgument(['-o', '--output'],    {defaultValue: 'trades.db', help: 'output file'});
parser.addArgument('symbol',              {help: 'symbol. e.g. XBTUSD'});

const kDefaultDuration = 3600 * 1000; // 1hr

const args = parser.parseArgs();

const start_ts = (args.start) ? new Date(args.start).getTime() : new Date().getTime() - kDefaultDuration;
const end_ts   = start_ts + args.duration * 1000;

const exchange = new ccxt.bitmex({
  'enableRateLimit': true,
});

function aggregate_trades(trades) {
  const reduced = _.reduce(trades, (result, trade) => {
    const ts = trade.timestamp;
    const side = trade.side;
    const price = trade.price;
    const amount = trade.amount;
    const k = [ts, side, price];
    result[k] || (result[k] = [ts, side, price, 0]);
    result[k][3] += amount;
    return result;
  }, {});

  return _.sortBy(_.values(reduced), 0);
}

function get_trades(trades) {
  return _.map(trades, (t) => { return [t.timestamp, t.side, t.price, t.amount] });
}

(async () => {
  const count_per_fetch = 1000;

  await exchange.loadMarkets();
  const data = await exchange.fetchMarkets();
  for (let i = 0; i < data.length; ++i) {
    if (data[i].id == args.symbol) {
      args.symbol = data[i].symbol;
      break;
    }
  }

  let results = [];
  for (let start = 0;;) {
    const params = {'start': start};
    if (end_ts !== undefined) params['endTime'] = exchange.iso8601(end_ts);
    const [err, data] = await to(exchange.fetch_trades(
      args.symbol, start_ts, count_per_fetch, params));

    if (err) {
      console.log(util.inspect(err));
      return;
    }

    results.push(data);
    data.length && console.log(data.length, _.last(data).datetime);

    if (data.length < count_per_fetch) break;
    start += data.length;
  }

  const trades = (args.agg) ? aggregate_trades(_.flatten(results)) : get_trades(_.flatten(results));

  const db = new sqlite3.Database(args.output);
  db.serialize(() => {
    db.run('create table if not exists trades (' +
           ' timestamp integer,' +
           ' side      text,' +
           ' price     real,' +
           ' amount    integer,' +
           ' primary key (timestamp, side, price)' +
           ')');

    const batches = _.chunk(trades, 64);
    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      const stmt = db.prepare('insert or replace into trades values (?,?,?,?)');
      for (let i = 0; i < batch.length; i++) {
        stmt.run(batch[i]);
      }
      stmt.finalize();
    }
  });

  db.close();
})();
