// Read-only inspection of a separately acquired official SensMe 1.50 DAT.
// No original binaries, textures, or executable code are shipped with this app.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const path = process.argv[2];
if (!path) {
 console.error('Usage: node scripts/inspect-original.mjs /path/to/SENSME.DAT');
 process.exit(1);
}
const bytes = readFileSync(path);
const expectedHash = 'bbc28d53b3fe918d8a28b3601c53045a2fb997d0956243e5d4085d75633c9534';
const sha256 = createHash('sha256').update(bytes).digest('hex');
if (sha256 !== expectedHash) {
 throw new Error(`Unrecognized DAT: ${sha256}. This inspector is specific to the archived official 1.50 file.`);
}
const start = bytes.indexOf('<property>');
const end = bytes.indexOf('</property>', start);
if (start < 0 || end < start) throw new Error('Missing readable property block');
const xml = bytes.subarray(start, end + '</property>'.length).toString('utf8');
const properties = Object.fromEntries([...xml.matchAll(/<key>(.*?)<\/key><value>(.*?)<\/value>/gs)].map(match => [match[1], match[2]]));
const imageOffsets = [];
for (let cursor = 0; (cursor = bytes.indexOf('MIG.00.1PSP', cursor)) >= 0; cursor += 10) imageOffsets.push(cursor);
console.log(JSON.stringify({ sha256, bytes: bytes.length, propertyOffset: start, properties, gimOffsets: imageOffsets }, null, 2));
