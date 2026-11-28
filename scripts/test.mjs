import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import ffprobe from '@ffprobe-installer/ffprobe';

const files = process.argv.slice(2);
const suite = ['core','skills','design','reel-editorial','tools','products','extract-details','brand-kit','strategy-level','agent','claude-routing','solo','meta','quality','campaign','prompt-architecture'];
const url = new URL(process.env.DATABASE_URL || 'postgresql://exora@127.0.0.1:55439/exora_marketing');
url.pathname = '/postgres';
const admin = new pg.Client({connectionString:url.toString()});
const database = 'exora_marketing_test_' + randomUUID().replaceAll('-', '');
await admin.connect();
try {
  await admin.query('CREATE DATABASE ' + database);
  try {
    url.pathname = '/' + database;
    const env = {...process.env, DATABASE_URL:url.toString(), EXORA_ROOT:process.cwd()};
    const venv = path.resolve('.local/pyenv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    if (fs.existsSync(venv)) env.EXORA_PYTHON = venv;
    if (env.EXORA_PYTHON) env.PYTHON_BIN ||= env.EXORA_PYTHON;
    env.FFMPEG_BIN ||= ffmpeg.path;
    env.FFPROBE_BIN ||= ffprobe.path;
    if (fs.existsSync('.local/nltk_data')) env.NLTK_DATA = path.resolve('.local/nltk_data');
    const selected = files.length ? files : suite.map(name => 'tests/'+name+'.test.mjs');
    for (const args of [['scripts/migrate.mjs'], ['scripts/seed.mjs'], ['--test','--test-concurrency=1',...selected]]) {
      const result = spawnSync(process.execPath,args,{stdio:'inherit',env});
      if (result.error) throw result.error;
      if (result.status !== 0) {process.exitCode = result.status || 1; break;}
    }
  } finally {
    await admin.query('DROP DATABASE ' + database);
  }
} finally {
  await admin.end();
}
