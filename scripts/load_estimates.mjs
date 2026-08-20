import { createClient } from '@base44/sdk';
import fs from 'node:fs';
const b = createClient({ appId: '6a78376a454093ba2f431acd' });
const rows = [
  ...JSON.parse(fs.readFileSync('/tmp/estimate1.json', 'utf8')),
  ...JSON.parse(fs.readFileSync('/tmp/estimate2.json', 'utf8')),
];
let created = 0;
const failed = [];
for (let i = 0; i < rows.length; i += 20) {
  const batch = rows.slice(i, i + 20);
  const out = await Promise.allSettled(batch.map((r) => b.entities.ProductionRecord.create(r)));
  out.forEach((x, j) => {
    if (x.status === 'fulfilled') created++;
    else failed.push({ id: batch[j].msha_mine_id, error: String(x.reason?.message || x.reason) });
  });
  console.log(`batch ${i + 1}-${i + batch.length}: created=${created} failed=${failed.length}`);
}
console.log(JSON.stringify({ total: rows.length, created, failed: failed.slice(0, 20) }, null, 2));
