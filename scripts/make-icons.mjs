// Generates the PWA icons (PNG) without external tooling: a white ring with a
// red "time" arc on black. Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

function crc32(buf) {
    let c, crc = 0xffffffff;
    for (let n = 0; n < buf.length; n++) {
        c = (crc ^ buf[n]) & 0xff;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
}
function png(size, { padding }) {
    const raw = Buffer.alloc((size * 4 + 1) * size);
    const c = size / 2, outer = (size / 2) * (1 - padding), inner = outer * 0.78;
    for (let y = 0; y < size; y++) {
        raw[y * (size * 4 + 1)] = 0;
        for (let x = 0; x < size; x++) {
            const dx = x + 0.5 - c, dy = y + 0.5 - c, r = Math.hypot(dx, dy);
            const angle = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI); // 0 at 12 o'clock, clockwise
            let rgb = [0, 0, 0];
            if (r <= outer && r >= inner) rgb = angle < Math.PI * 1.5 ? [255, 255, 255] : [200, 16, 46];
            const handLen = inner * 0.7, w = size * 0.035;
            if (Math.abs(dx) < w && dy < 0 && -dy < handLen) rgb = [255, 255, 255];
            if (r < w * 1.6) rgb = [255, 255, 255];
            const o = y * (size * 4 + 1) + 1 + x * 4;
            raw[o] = rgb[0]; raw[o + 1] = rgb[1]; raw[o + 2] = rgb[2]; raw[o + 3] = 255;
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const out = new URL('../public/icons/', import.meta.url);
writeFileSync(new URL('icon-192.png', out), png(192, { padding: 0.12 }));
writeFileSync(new URL('icon-512.png', out), png(512, { padding: 0.12 }));
writeFileSync(new URL('icon-maskable-512.png', out), png(512, { padding: 0.3 }));
writeFileSync(new URL('apple-touch-icon-180.png', out), png(180, { padding: 0.14 }));
console.log('icons written');
