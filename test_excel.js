const XLSX = require('xlsx');
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([
  ['竞彩编号', '赛事种类', '双方队伍', '开赛日期'],
  ['周四 001', '世界杯', '墨西哥 vs 南非', '6-12 03:00'],
  ['周四 002', '世界杯', '韩国 vs 捷克', '6-12 10:00'],
]);
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
XLSX.writeFile(wb, '/tmp/test.xlsx');
console.log('OK', new Uint8Array(XLSX.write(wb, { type: 'array' })).length, 'bytes');
