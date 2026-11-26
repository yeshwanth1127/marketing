import {LAYER_ORDER} from './prompt-types.mjs';

export function validatePrompt(prompt) {
  const errors = [];
  if (!prompt || !Array.isArray(prompt.layers)) return {valid: false, errors: ['Prompt layers are required']};
  const names = prompt.layers.map(x => x.name);
  if (names.length !== LAYER_ORDER.length || names.some((n, i) => n !== LAYER_ORDER[i])) errors.push('Prompt must contain exactly ten layers in canonical order');
  for (const item of prompt.layers) if (item.required && !item.populated) errors.push(`Required layer is empty: ${item.name}`);
  if (!prompt.workflow || !prompt.template?.id || !prompt.template?.version) errors.push('Workflow and versioned template metadata are required');
  if(!['json','text','markdown','html','artifacts'].includes(prompt.output?.format))errors.push('Unsupported output format');
  const prefill=prompt.layers[9]?.content;
  if(prefill!==null&&prefill!==undefined&&(typeof prefill!=='string'||!prefill.trim()||prefill.length>1000))errors.push('Prefill must be a nonempty string under 1,001 characters');
  return {valid: errors.length === 0, errors};
}
