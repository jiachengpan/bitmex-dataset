'use strict';

const {ArgumentParser} = require('argparse');
const BitMEXClient = require('./bitmex-realtime-api');
const sqlite3 = require('sqlite3').verbose();
const moment  = require('moment');
const to   = require('await-to-js').default;
const fs   = require('fs');
const path = require('path');
const util = require('util');
const ccxt = require('ccxt');
const _ = require('lodash');

const parser = new ArgumentParser({
    addHelp: true,
    description: 'bitmex-downloader',
});


parser.addArgument(['-o', '--output'],    {defaultValue: 'orderflow.db', help: 'output file'});
parser.addArgument('symbol',              {help: 'symbol. e.g. XBTUSD'});

const args = parser.parseArgs();
const symbol = args.symbol;

const g_client = new BitMEXClient();

const k_orderbook_window = 20; 
const k_interval = 5; 
const k_oppo_side = {'Buy': 'Sell', 'Sell': 'Buy'};

let g_last_trade = undefined;
let g_last_trade_id = undefined;
let g_order_flow = {};
let g_last_tick = moment.utc();
let g_db = undefined;
let g_db_last_date = undefined;

function get_order_flow_record(side, price) {
  const key = [side, price];
  if (!g_order_flow[key]) {
    g_order_flow[key] = {'side': side, 'price': price, 'inc': 0, 'dec': 0, 'trade': 0};
  }
  return g_order_flow[key];
}

function init_db(filename) {
  const db_filename = path.join(
    path.dirname(filename),
    path.basename(filename, path.extname(filename)) + '.' + moment.utc().format('YYYYMMDD') + '.db'
  );

  const db = new sqlite3.Database(db_filename);
  db.run('PRAGMA journal_mode = WAL;');
  db.run('PRAGMA synchronous = NORMAL');

  db.run('create table if not exists orderflow (' +
         ' timestamp integer,' +
         ' side      text,' +
         ' price     real,' +
         ' size      integer,' +
         ' inc       integer,' +
         ' dec       integer,' +
         ' trade     integer,' +
         ' primary key (timestamp, side, price)' +
         ')');

  return db;
}

function export_data(db, ts, orderflow) {
  const timestamp = ts.unix();
  db.serialize(() => {
    const stmt = db.prepare('insert or replace into orderflow values (?,?,?,?,?,?,?)');
    for (let i = 0; i < orderflow.length; ++i) {
      const d = orderflow[i];
      stmt.run(timestamp, d.side, d.price, d.size, d.inc, d.dec, d.trade);
    }
    stmt.finalize();
  });
}


// --------------------------------------------------------------------------------
// entry
// --------------------------------------------------------------------------------

g_db = init_db(args.output);
g_db_last_date = moment.utc();

g_client.addStream(symbol, 'trade', (newData, symbol, table) => {
  if (!newData || !newData.length) return;

  for (let i = 0; i < newData.length; ++i) {
    const trade = newData[newData.length - i - 1];
    if (trade.trdMatchID === g_last_trade_id) break;

    const update = get_order_flow_record(k_oppo_side[trade.side], trade.price);
    update.trade += trade.size;
  }

  g_last_trade = _.last(newData);
  g_last_trade_id = g_last_trade.trdMatchID;
});

g_client.addStream(symbol, 'orderBookL2', function (newData, symbol, table, action, delta) {
  const now = moment.utc();
  if (!g_last_trade) return;

  for (let i = 0; i < delta.length; ++i) {
    const datum = delta[i];

    if (Math.abs(datum.price - g_last_trade.price) > k_orderbook_window) {
      continue;
    }
    
    const update = get_order_flow_record(datum.side, datum.price);
    if (datum.d_size >= 0) {
      update.inc += datum.d_size;
    } else {
      update.dec -= datum.d_size;
    }
  }


  if (now.diff(g_last_tick, 'seconds') > k_interval) {
    if (g_db_last_date.day() != now.day()) {
      g_db = init_db(args.output);
    }

    const orderflow_records = _.values(g_order_flow);
    const prices = _.map(orderflow_records, 'price');
    const max_price = _.max(prices);
    const min_price = _.min(prices);

    const orderbook_records = _.filter(newData, (o) => { return o.price <= max_price && o.price >= min_price; });
    for (let i = 0; i < orderbook_records.length; ++i) {
      const ob_record = orderbook_records[i];
      const of_record = get_order_flow_record(ob_record.side, ob_record.price);
      of_record.size = ob_record.size;
    }

    export_data(g_db, g_last_tick, orderflow_records);
    g_last_tick = now;
    g_order_flow = {};
  }
});

