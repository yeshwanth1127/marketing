import hook from './hook.mjs';import offer from './offer.mjs';import mythFact from './myth-fact.mjs';import faq from './faq.mjs';import festival from './festival.mjs';
import list from './list.mjs';import beforeAfter from './before-after.mjs';import behind from './behind-scenes.mjs';import proof from './proof.mjs';import event from './event.mjs';import campaign from './campaign.mjs';
export {lint as lintCampaign,cornerLabels} from './campaign.mjs';
export const LAYOUTS=Object.fromEntries([hook,offer,mythFact,faq,festival,list,beforeAfter,behind,proof,event,campaign].map(l=>[l.id,l]));
