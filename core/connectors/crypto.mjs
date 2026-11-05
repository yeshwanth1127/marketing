import crypto from 'node:crypto';

function die(message,status=503){const e=new Error(message);e.status=status;throw e;}

function keyBuf(){
 const hex=String(process.env.EXORA_TOKEN_KEY||'').trim();
 if(/^[0-9a-f]{64}$/i.test(hex))return Buffer.from(hex,'hex');
 const secret=String(process.env.META_APP_SECRET||'').trim();
 if(!secret)die('Token encryption key is not configured');
 return crypto.scryptSync(secret,'exora-meta-tokens',32);
}

export function encryptSecret(plain){
 const iv=crypto.randomBytes(12);
 const cipher=crypto.createCipheriv('aes-256-gcm',keyBuf(),iv);
 const enc=Buffer.concat([cipher.update(String(plain),'utf8'),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),enc]).toString('base64');
}

export function decryptSecret(blob){
 if(!blob)die('No stored token',500);
 const buf=Buffer.from(String(blob),'base64');
 if(buf.length<29)die('Stored token is unreadable',500);
 const decipher=crypto.createDecipheriv('aes-256-gcm',keyBuf(),buf.subarray(0,12));
 decipher.setAuthTag(buf.subarray(12,28));
 return Buffer.concat([decipher.update(buf.subarray(28)),decipher.final()]).toString('utf8');
}
