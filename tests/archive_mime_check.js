const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const s = { console, Utilities: { DigestAlgorithm: { SHA_256: 'SHA_256' },
  computeDigest: () => new Array(32).fill(1) } };
vm.createContext(s);
vm.runInContext(fs.readFileSync('apps-script/Code.gs', 'utf8'), s);
function blob(bytes, declared) {
  let type = declared;
  return { getBytes: () => bytes.slice(), getContentType: () => type,
    setContentType: value => { type = value; } };
}
// Generic Telegram downloads with a recognizable signature remain byte-identical.
for (const [bytes, expected] of [
  [[255, 216, 1, 2, 255, 217], 'image/jpeg'],
  [[137, 80, 78, 71, 13, 10, 26, 10, 0], 'image/png'],
  [[82, 73, 70, 70, 8, 0, 0, 0, 87, 69, 66, 80], 'image/webp']
]) {
  const b = blob(bytes, 'application/octet-stream');
  const evidence = s.validateArchiveBlob_(b);
  assert.strictEqual(evidence.mimeType, expected);
  assert.strictEqual(b.getContentType(), expected);
  assert.deepStrictEqual(b.getBytes(), bytes);
}
for (const b of [blob([1, 2, 3, 4], 'application/octet-stream'),
  blob([255, 216, 255, 217], 'image/png'),
  blob([255, 216, 255, 217], 'text/html')]) {
  assert.throws(() => s.validateArchiveBlob_(b), error => error.archivePermanent === true);
}
console.log('PASS: signature-validated generic MIME archive checks');
