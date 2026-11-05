import {q,hash,fail} from '../db/index.mjs';
import {chainOf,resolveFromChain} from '../clients/tree.mjs';
export async function authenticate(request){const cookie=request.headers.get('cookie')||'';const token=cookie.match(/(?:^|;\s*)exora_session=([^;]+)/)?.[1];if(!token)fail('Sign in to continue',401);const {rows}=await q('SELECT u.id,u.name,u.email,u.role,u.settings FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true',[hash(token)]);if(!rows[0])fail('Your session has expired',401);return rows[0];}
export function authorize(user,roles=['admin','marketer']){if(!roles.includes(user.role))fail('Your role cannot perform this action',403);}
// Access to a client = admin, or a member of that client or of anything above it (company -> brand -> product).
// Returns the effective client (settings passed down, brand_name, chain); see core/clients/tree.mjs.
export async function access(user,client){if(!client||!/^[0-9a-f-]{36}$/i.test(client))fail('Choose a valid client');const chain=await chainOf(client);if(!chain[0])fail('Client not found',404);if(user.role!=='admin'){const m=await q('SELECT 1 FROM memberships WHERE user_id=$1 AND client_id=ANY($2)',[user.id,chain.map(c=>c.id)]);if(!m.rowCount)fail('This client is outside your workspace access',403);}return resolveFromChain(chain);}
export function sameOrigin(request){
 const origin=request.headers.get('origin');
 const allowed=new Set(['http://127.0.0.1:3100','http://localhost:3100',new URL(request.url).origin]);
 if(process.env.EXORA_PUBLIC_ORIGIN)allowed.add(process.env.EXORA_PUBLIC_ORIGIN.replace(/\/$/,''));
 for(const o of String(process.env.EXORA_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean))allowed.add(o.replace(/\/$/,''));
 if(origin&&!allowed.has(origin))fail('Cross-origin writes are blocked',403);
 if(request.headers.get('sec-fetch-site')==='cross-site')fail('Cross-site writes are blocked',403);
}
