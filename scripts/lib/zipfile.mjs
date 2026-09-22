/**
 * A minimal reader for the one thing the Census ships everything in: a .zip
 * holding one big deflated text file.
 *
 * Node has zlib but no archive reader, and the alternative is a dependency to
 * parse a 46-byte header. The format needed here is the simple half of it: walk
 * the central directory from the end of the file, find the entry by name, then
 * re-read the offsets from the LOCAL header because its name and extra-field
 * lengths can legally differ from the central copy.
 *
 * scripts/build_zips.mjs carries its own copy of this, deliberately left where
 * it is: that script is the one whose output the exporter refuses to write
 * unless it reproduces byte for byte, and it is not worth re-verifying to save
 * forty lines.
 */
import { createReadStream, openSync, readSync, closeSync, statSync } from 'node:fs';
import { createInflateRaw } from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

export function openZip(zipPath) {
  const size = statSync(zipPath).size;
  const fd = openSync(zipPath, 'r');
  // The end-of-central-directory record is last, but a trailing comment can sit
  // after it, so it is searched for backwards rather than read at a fixed spot.
  const tailLen = Math.min(66000, size);
  const tail = Buffer.alloc(tailLen);
  readSync(fd, tail, 0, tailLen, size - tailLen);

  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) { closeSync(fd); throw new Error(`${zipPath}: no end-of-central-directory record`); }

  const count = tail.readUInt16LE(eocd + 10);
  const cd = Buffer.alloc(tail.readUInt32LE(eocd + 12));
  readSync(fd, cd, 0, cd.length, tail.readUInt32LE(eocd + 16));

  const entries = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (cd.readUInt32LE(p) !== CD_SIG) { closeSync(fd); throw new Error(`${zipPath}: bad central directory entry`); }
    const nameLen = cd.readUInt16LE(p + 28);
    entries.push({
      name: cd.slice(p + 46, p + 46 + nameLen).toString('latin1'),
      method: cd.readUInt16LE(p + 10),
      compSize: cd.readUInt32LE(p + 20),
      localOff: cd.readUInt32LE(p + 42),
    });
    p += 46 + nameLen + cd.readUInt16LE(p + 30) + cd.readUInt16LE(p + 32);
  }

  return {
    entries,
    stream(name) {
      const e = entries.find((x) => x.name === name);
      if (!e) throw new Error(`${zipPath}: no entry named ${name}`);
      const lh = Buffer.alloc(30);
      readSync(fd, lh, 0, 30, e.localOff);
      if (lh.readUInt32LE(0) !== LOCAL_SIG) throw new Error(`${zipPath}: bad local header`);
      const start = e.localOff + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      const raw = createReadStream(zipPath, { start, end: start + e.compSize - 1 });
      // 0 is stored, 8 is deflate. Anything else would need a real library.
      if (e.method === 0) return raw;
      if (e.method !== 8) throw new Error(`${zipPath}: ${name} uses compression method ${e.method}`);
      return raw.pipe(createInflateRaw());
    },
    close() { closeSync(fd); },
  };
}
