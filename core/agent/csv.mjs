import {fail} from '../db/index.mjs';

const METRICS=['impressions','reach','clicks','leads','spend','revenue','engagements','conversions','followers'];
const LABELS=['real','estimated','inferred'];

// Server-side sheet parser. A row is kept only when the sheet itself names the label.
export function parseMetricsCsv(text){
 const raw=String(text||'').replace(/^\uFEFF/,'').trim();
 if(!raw)fail('The sheet is empty');
 const lines=raw.split(/\r?\n/).filter(l=>l.trim());
 const split=line=>line.split(',').map(c=>c.trim().replace(/^"|"$/g,''));
 const head=split(lines[0]).map(h=>h.toLowerCase());
 const col=name=>{const i=head.indexOf(name);if(i<0)fail('The sheet needs a '+name+' column');return i;};
 const date=col('date'),source=col('source'),metric=col('metric'),value=col('value'),label=col('label');
 const campaign=head.indexOf('campaign');
 const rows=[];
 for(const line of lines.slice(1)){
  if(!line.trim())continue;
  const c=split(line);
  const row={date:c[date],source:c[source],metric:c[metric],value:Number(c[value]),label:c[label],campaign:campaign>=0?c[campaign]:''};
  if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date||''))fail('Each row needs a date as YYYY-MM-DD');
  if(!METRICS.includes(row.metric))fail('Unknown metric "'+(row.metric||'')+'"');
  if(!LABELS.includes(row.label))fail('Each row must say real, estimated, or inferred');
  if(!Number.isFinite(row.value)||row.value<0)fail('Metric values must be non-negative');
  if(!row.source)fail('Each row needs a source');
  rows.push(row);
 }
 if(!rows.length||rows.length>1000)fail('Import 1–1000 metric rows');
 return rows;
}
