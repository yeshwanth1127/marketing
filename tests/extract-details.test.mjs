import {test} from 'node:test';import assert from 'node:assert/strict';
import {guessFromText,missing,foundKeys} from '../core/clients/extract-details.mjs';

test('labelled brief fills stated fields and lists the rest as missing',()=>{
 const data=guessFromText('company',`Name: FileFill Co
Industry: Education
City: Bengaluru
Website: https://filefill.example
Languages: English, Hindi
`);
 assert.equal(data.name,'FileFill Co');
 assert.equal(data.industry,'Education');
 assert.equal(data.city,'Bengaluru');
 assert.equal(data.website,'https://filefill.example');
 assert.deepEqual(data.languages,['English','Hindi']);
 assert.ok(foundKeys('company',data).includes('name'));
 assert.ok(missing('company',data).includes('state / region'));
 assert.ok(!missing('company',data).includes('industry'));
});

test('product briefs keep unstated fields empty so the wizard can ask optionally',()=>{
 const data=guessFromText('product',`Name: Bandhej silk saree
Description: Hand-tied bandhej silk
Category: Saree
Price or offer: INR 4200
`);
 assert.equal(data.brief.description,'Hand-tied bandhej silk');
 assert.equal(data.brief.category,'Saree');
 assert.equal(data.brief.offer,'INR 4200');
 assert.equal(data.brief.audience,'');
 const miss=missing('product',data);
 assert.ok(miss.includes('who buys it'));
 assert.ok(miss.includes('where it is sold'));
 assert.ok(!miss.includes('description'));
});
