import {claudeState} from '../claude-cli.mjs';
import {codexState,executeCodex} from './codex.mjs';
export {executeCodex};
export const providerState=()=>({claude:claudeState(),codex:codexState()});
export function requireProvider(provider){
  if(provider==='local_template')return provider;
  const state=provider==='claude'?claudeState():codexState();
  if(state.connected)return provider;
  throw Object.assign(new Error(provider==='claude'?'Connect your Claude account in Settings before generating.':state.detail),{status:409});
}
export function selectedProvider(value,defaults={}){
  const id=value||defaults.default_provider||'claude';
  if(!['claude','codex','local_template'].includes(id))throw Object.assign(new Error('Choose Claude, Codex, or the starter template.'),{status:400});
  return id;
}
