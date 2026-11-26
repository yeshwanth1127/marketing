export const LAYER_ORDER = Object.freeze([
  'task_context', 'tone_context', 'background_context', 'task_rules', 'examples',
  'conversation_history', 'immediate_request', 'reasoning_guidance', 'output_format', 'response_prefill',
]);

export const LAYER_LABELS = Object.freeze({
  task_context: 'Task context', tone_context: 'Tone context', background_context: 'Background data, documents and images',
  task_rules: 'Detailed task description and rules', examples: 'Examples', conversation_history: 'Conversation history',
  immediate_request: 'Immediate task request', reasoning_guidance: 'Reasoning and task execution guidance',
  output_format: 'Output formatting', response_prefill: 'Prefilled response (if any)',
});

export function layer(name, content, {required = false, sources = [], version = '1'} = {}) {
  return {name, content: content ?? null, required, populated: content !== null && content !== undefined && content !== '', sources, version, validation: 'pending'};
}
