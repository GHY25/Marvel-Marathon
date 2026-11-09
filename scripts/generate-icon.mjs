import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'

// Original monogram, independent of Marvel's official wordmark.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<rect x="8" y="8" width="496" height="496" rx="112" fill="#151519"/>
<rect x="36" y="36" width="440" height="440" rx="88" fill="none" stroke="#333138" stroke-width="3"/>
<path d="M116 352V160h58l82 101 82-101h58v192h-59V246l-81 97-81-97v106z" fill="#ef655b"/>
<path d="M224 379h64" stroke="#e5dfd4" stroke-width="9" stroke-linecap="round"/>
</svg>`
const png = await sharp(Buffer.from(svg)).png().toBuffer()
await writeFile('public/app-icon.svg', svg)
await writeFile('public/app-icon.png', png)
const icoPng = await sharp(png).resize(256, 256).png().toBuffer()
const header = Buffer.alloc(22)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(1, 4)
header.writeUInt16LE(1, 10)
header.writeUInt16LE(32, 12)
header.writeUInt32LE(icoPng.length, 14)
header.writeUInt32LE(22, 18)
await writeFile('public/app-icon.ico', Buffer.concat([header, icoPng]))
