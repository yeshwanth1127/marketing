import Assistant from '../../components/Assistant';
import {allTools} from '../../../core/agent/catalog.mjs';
import {STRATEGY_FIELDS,STRATEGY_SECTIONS} from '../../../core/agent/strategy-fields.mjs';
import './assistant.css';

export const dynamic = 'force-dynamic';
export default function Page() {
  const tools = allTools().filter(t => t.group !== 'skill').map(t => ({
    id:t.id, group:t.group, description:t.description, risk:t.risk,
    roles:t.roles, nodes:t.nodes || [], module:t.module || '',
    needsCompanyMember:!!t.needsCompanyMember, closed:t.closed, open:t.open,
  }));
  const strategy = {fields:STRATEGY_FIELDS.map(f => ({...f})), sections:STRATEGY_SECTIONS.map(s => ({...s}))};
  return <Assistant tools={tools} strategy={strategy}/>;
}

