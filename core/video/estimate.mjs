// ETA for a video render, from the last measured render speed. Kept apart from the pipeline so the web app never
// imports render tooling (HyperFrames, ffprobe binaries) into its bundle.
import fs from 'node:fs';import path from 'node:path';
import {ROOT} from '../db/index.mjs';
import {totalSeconds} from './design.mjs';
export function estimateSeconds(design){let fps=60;try{fps=JSON.parse(fs.readFileSync(path.join(ROOT,'.local/cache/video/throughput.json'),'utf8')).frames_per_second||fps;}catch{}return Math.ceil(totalSeconds(design)*30/fps+4);}
