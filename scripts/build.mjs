import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const parts = ['text.jsx', 'host.jsx'].map(name => fs.readFileSync(path.join(root, 'jsx', name), 'utf8').replace(/^\s*#(?:include|target).*$/gm, ''));
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const bundle = '// Kinetic ' + version + ' — generated from text.jsx and host.jsx. Run npm run build after editing.\n' + parts.join('\n\n');
fs.writeFileSync(path.join(root, 'jsx', 'kinetic.jsx'), bundle, 'utf8');
console.log('Built jsx/kinetic.jsx (' + Buffer.byteLength(bundle) + ' bytes). No runtime dependencies.');
