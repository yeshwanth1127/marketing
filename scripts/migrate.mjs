import fs from 'node:fs';
import path from 'node:path';
import {pool,ROOT} from '../core/db/index.mjs';
await pool.query(fs.readFileSync(path.join(ROOT,'core/db/001-initial.sql'),'utf8'));
for(const kind of ['BrandKit','Strategy','Campaign','Idea','Asset','Approval','Post','Ad','Metric','Report','Learning','Task'])await pool.query(`CREATE OR REPLACE VIEW ${kind.toLowerCase()}_records AS SELECT * FROM records WHERE kind='${kind}'`);
console.log('Database migrated: client + 12 versioned record types, users, sessions, jobs, audit and files.');await pool.end();
