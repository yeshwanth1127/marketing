import path from 'node:path';
import {fileURLToPath} from 'node:url';

// This app is launched from the repository root (`next build web`). Resolve
// from this config file so tracing stays rooted at the repo on every platform.
const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

export default {outputFileTracingRoot:repoRoot,serverExternalPackages:['pg','bcryptjs','playwright'], devIndicators:false,outputFileTracingExcludes:{'/*':['../.local/**/*','../vendor/**/*','../node_modules/hyperframes/**/*']},experimental:{externalDir:true}};
