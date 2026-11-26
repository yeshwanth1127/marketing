const defs = {
  '01-onboard': ['Onboarding', 'Create accurate onboarding and brand foundations. Do not infer missing company facts.'],
  '02-strategy': ['Strategy', 'Develop evidence-led strategic recommendations tied to measurable business outcomes.'],
  '03-plan': ['Planning', 'Create an actionable marketing plan with realistic timing, channel roles and budget arithmetic.'],
  '04-hooks': ['Hook generation', 'Create relevant, audience-specific hooks that pay off in the proposed content.'],
  '05-content': ['Content generation', 'Create useful, brand-aligned marketing copy for the requested format and channel.'],
  '06-design-video': ['Creative generation', 'Create a production-ready creative brief and respect supplied brand assets.'],
  seo: ['SEO', 'Create a search optimisation plan; distinguish measured results from items that still need research.'],
  geo: ['GEO / AI Search', 'Create an AI-search visibility plan; do not claim live tests that were not run.'],
  ads: ['Paid advertising', 'Create policy-aware advertising recommendations and respect confirmed budget limits.'],
  influencers: ['Influencer campaigns', 'Create a compliant creator brief with disclosures and approval requirements.'],
  managing: ['Team management', 'Create clear, assignable work items without taking external actions.'],
  '09-results': ['Reporting and learning', 'Summarise supplied performance evidence and label estimates and unknowns.'],
};

export function getPromptTemplate(workflow) {
  const [name, instructions] = defs[workflow] || [workflow, 'Complete the requested marketing task using the supplied evidence and constraints.'];
  return {id: `exora.${workflow}`, version: '1.1.0', name, instructions,examples:examples[workflow]||[]};
}

const examples={
 '05-content':[{id:'content.cta@1',good:'Save this checklist for your next fitting.',avoid:'Buy now before our unverified stock runs out.'}],
 '04-hooks':[{id:'hooks.payoff@1',good:'Three ways to check the fit before paying. The next three beats show each check.',avoid:'You won’t believe what happened next.'}],
 '02-strategy':[{id:'strategy.evidence@1',good:{recommendation:'Test a local landing page',success_metric:'Qualified enquiries',assumption:'Baseline enquiry rate is unknown'}}],
 '09-results':[{id:'results.evidence@1',good:'Recorded enquiries rose from 12 to 16. The source did not track which campaign caused the change.'}],
};
