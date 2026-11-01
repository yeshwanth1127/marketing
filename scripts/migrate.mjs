import fs from 'node:fs';
import path from 'node:path';
import {pool,ROOT} from '../core/db/index.mjs';
const dir=path.join(ROOT,'core/db');
const files=fs.readdirSync(dir).filter(f=>/^\d+-.*\.sql$/.test(f)).sort();
for(const f of files)await pool.query(fs.readFileSync(path.join(dir,f),'utf8'));
for(const kind of ['BrandKit','Strategy','Campaign','Idea','Asset','Approval','Post','Ad','Metric','Report','Learning','Task'])await pool.query(`CREATE OR REPLACE VIEW ${kind.toLowerCase()}_records AS SELECT * FROM records WHERE kind='${kind}'`);
console.log('Database migrated:',files.join(', '));await pool.end();
