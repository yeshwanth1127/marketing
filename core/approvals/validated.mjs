import {fail} from '../db/index.mjs';
import {submit as baseSubmit,decide} from './index.mjs';

// Strategy approval has an additional agency-quality gate: generated values must first
// be confirmed by the marketer. Other approval types keep the existing workflow.
export async function submit(c,user,client,targetId){
 const target=(await c.query('SELECT kind,data FROM records WHERE id=$1 AND client_id=$2',[targetId,client])).rows[0];
 if(target?.kind==='Strategy'&&target.data?.validation_status!=='confirmed')fail('Validate the strategy facts, assumptions and forecast values with the marketer before sending it for review');
 return baseSubmit(c,user,client,targetId);
}

export {decide};
