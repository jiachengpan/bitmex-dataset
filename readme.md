BitMEX Trading Dataset
----------------------

This repository hosts historical trading dataset from [BitMex](https://www.bitmex.com/).
See [releases](https://github.com/jiachengpan/bitmex-dataset/releases) for the data.

All data are retrieved from [bucketed trades api](https://www.bitmex.com/api/explorer/#!/Trade/Trade_getBucketed) from BitMEX, stored in sqlite3 database on a daily basis. <br/>
One can query the trade entries from table `trades`.
Each entry is a tuple of `(timestamp, side, price, amount)`.

The entries in the released dataset are aggregated -- entries with the same `(timestamp, side, price)` are merged with `amount` summed together.

To download trade data for one own, try:

    node download.js --start <start time> --duration <duration in seconds> <symbol>
    e.g.
    node download.js --start 2020-01-01 --duration 3600 ETHUSD
