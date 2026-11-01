import path from 'node:path';
export default {outputFileTracingRoot:path.resolve('..'),serverExternalPackages:['pg','bcryptjs','playwright'], devIndicators:false,outputFileTracingExcludes:{'/*':['../.local/**/*','../vendor/**/*','../node_modules/hyperframes/**/*']},experimental:{externalDir:true}};
