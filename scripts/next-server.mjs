import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const [mode='dev', ...args] = process.argv.slice(2);
if (!['dev', 'start'].includes(mode)) {
  throw new Error('Usage: node scripts/next-server.mjs [dev|start]');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const child = spawn(process.execPath, [nextBin, mode, 'web', '--hostname', '127.0.0.1', ...args], {
  cwd: root,
  env: {...process.env, PORT: process.env.PORT || '3100'},
  stdio: 'inherit',
  windowsHide: true,
});

child.on('error', error => {
  console.error(`Could not start Next.js: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
