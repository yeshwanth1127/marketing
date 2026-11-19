import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const exec=promisify(execFile);

// Combine a narration file with a finished video without shortening either silently.
// The caller owns path validation, access checks and the resulting draft record.
export async function mixVoiceover({videoPath,voicePath,outputPath,keepOriginalAudio=true,ffmpeg=process.env.FFMPEG_BIN||'ffmpeg',ffprobe=process.env.FFPROBE_BIN||'ffprobe'}){
 if(!videoPath||!voicePath||!outputPath)throw new Error('Video, narration and output paths are required');
 const probe=async file=>JSON.parse((await exec(ffprobe,['-v','error','-show_format','-show_streams','-of','json',file],{timeout:30000,maxBuffer:2000000})).stdout);
 const [video,voice]=await Promise.all([probe(videoPath),probe(voicePath)]);
 const videoStream=video.streams?.find(s=>s.codec_type==='video');
 const voiceStream=voice.streams?.find(s=>s.codec_type==='audio');
 const duration=Number(video.format?.duration),voiceDuration=Number(voice.format?.duration);
 if(!videoStream||!Number.isFinite(duration)||duration<=0)throw new Error('The selected file does not contain a usable video');
 if(!voiceStream||!Number.isFinite(voiceDuration)||voiceDuration<=0)throw new Error('The narration file does not contain usable audio');
 if(voiceDuration>duration+0.1)throw new Error('The narration is longer than the video. Shorten the script or extend the video before combining them.');
 const sourceAudio=keepOriginalAudio&&video.streams.some(s=>s.codec_type==='audio');
 const filter=sourceAudio?'[0:a:0]volume=0.25,apad[background];[1:a:0]aresample=async=1,apad[voice];[background][voice]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix]':'[1:a:0]aresample=async=1,apad[voice]';
 const args=['-y','-v','error','-i',videoPath,'-i',voicePath,'-filter_complex',filter,'-map','0:v:0','-map',sourceAudio?'[mix]':'[voice]','-c:v','copy','-c:a','aac','-b:a','192k','-t',String(duration),'-movflags','+faststart',outputPath];
 await exec(ffmpeg,args,{timeout:300000,maxBuffer:2000000});
 return {duration,voiceDuration,width:videoStream.width||null,height:videoStream.height||null,originalAudioMixed:sourceAudio};
}
