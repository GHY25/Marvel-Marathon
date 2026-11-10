import { build as viteBuild } from 'vite'
import { build } from 'esbuild'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import sharp from 'sharp'

await viteBuild({ configFile: 'vite.web.config.ts' })
const client = path.resolve('dist-web/client')
await Promise.all(
	[192, 512, 180].map(size =>
		sharp('public/app-icon.png')
			.resize(size, size)
			.png()
			.toFile(path.join(client, size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`))
	)
)
await fs.writeFile(path.join(client, 'manifest.webmanifest'), JSON.stringify({ id: '/', name: 'Marvel Marathon', short_name: 'Marathon', lang: 'ko', start_url: '/#/dashboard', scope: '/', display: 'standalone', background_color: '#0c101b', theme_color: '#0c101b', icons: [192, 512].map(size => ({ src: `/icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })) }))
const files = await fs.readdir(client, { recursive: true, withFileTypes: true })
const assets = {}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' }
for (const file of files) {
	if (!file.isFile()) continue
	const absolute = path.join(file.parentPath, file.name)
	const url = '/' + path.relative(client, absolute).replaceAll('\\', '/')
	// Only ship assets used by the app; exclude desktop-only documents and binaries.
	if (!mime[path.extname(file.name)] || /app-icon\.(png|ico)$/.test(file.name)) continue
	assets[url] = { type: mime[path.extname(file.name)], body: (await fs.readFile(absolute)).toString('base64') }
}
const revision = crypto.createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0, 12)
const precache = Object.keys(assets)
const sw = `const CACHE='marathon-${revision}';const FILES=${JSON.stringify(precache)};
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);for(const url of FILES){const response=await fetch(url,{redirect:'error',cache:'reload'});if(!response.ok)throw new Error('Cache failed');await cache.put(url,response)}await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('marathon-')&&key!==CACHE)await caches.delete(key);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(url.origin!==self.location.origin||event.request.method!=='GET'||url.pathname.startsWith('/api/')||url.pathname.includes('chatgpt')||url.pathname==='/callback')return;if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('/index.html')));return}if(FILES.includes(url.pathname))event.respondWith(caches.match(url.pathname).then(cached=>cached||fetch(event.request))) });`
await fs.writeFile(path.join(client, 'sw.js'), sw)
assets['/sw.js'] = { type: 'text/javascript; charset=utf-8', body: Buffer.from(sw).toString('base64') }
await fs.mkdir('dist-web/server', { recursive: true })
await build({ stdin: { contents: `import {handleRequest} from './web/server';const assets=${JSON.stringify(assets)};export default {fetch:(request,env)=>handleRequest(request,env,assets)};`, resolveDir: process.cwd(), loader: 'ts' }, outfile: 'dist-web/server/index.js', bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true })
console.log(`Web app built with ${Object.keys(assets).length} assets (${revision}).`)
