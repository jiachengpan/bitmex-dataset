#! /bin/bash

set -e
set -x

download_month() {
  symbol=$1
  month=$2

  [[ -z $symbol ]] && return
  [[ -z $month ]] && return

  month=$(echo $month | sed s#/#-#g)
  days=$(date -d "$month-1 + 1 month - 1 day" +%d)
  for day in $(seq -w 01 $days); do
    date=$month-$day
    output=data/$symbol.trades.${date}.db
    [[ -f $output ]] && continue

    node download.js $symbol -s ${date} -t $((3600*24)) --agg -o $output
  done
}

download_month $@

