import fs from 'node:fs/promises'
import path from 'node:path'

const target = path.resolve(process.argv[2] ?? '../sites/marvel-marathon-web')
const manifest = JSON.parse(await fs.readFile(path.join(target, '.openai/hosting.json'), 'utf8'))
if (manifest.project_id !== 'appgprj_6af2d38873b08191b762d63fbb525050') throw new Error('Unexpected Site checkout')
for (const directory of ['src', 'public', 'web']) await fs.cp(directory, path.join(target, directory), { recursive: true })
await fs.mkdir(path.join(target, 'scripts'), { recursive: true })
for (const file of ['scripts/build-web.mjs', 'vite.web.config.ts']) await fs.copyFile(file, path.join(target, file))
await fs.cp('web/drizzle', path.join(target, 'drizzle'), { recursive: true })
await fs.writeFile(path.join(target, '.openai/hosting.json'), JSON.stringify({ ...manifest, d1: 'DB', r2: 'BUCKET' }, null, 2) + '\n')
const names = ['react', 'react-dom', 'react-router-dom', 'lucide-react', 'vite', '@vitejs/plugin-react', 'esbuild', 'sharp']
const dependencies = Object.fromEntries(await Promise.all(names.map(async name => [name, JSON.parse(await fs.readFile(`node_modules/${name}/package.json`, 'utf8')).version])))
await fs.writeFile(path.join(target, 'package.json'), JSON.stringify({ name: 'marvel-marathon-web', version: '0.2.1', private: true, type: 'module', scripts: { build: 'node scripts/build-web.mjs && node scripts/prepare-hosting.mjs' }, dependencies }, null, 2) + '\n')
await fs.writeFile(path.join(target, 'scripts/prepare-hosting.mjs'), `import fs from 'node:fs/promises';await fs.mkdir('dist/server',{recursive:true});await fs.mkdir('dist/.openai',{recursive:true});await fs.copyFile('dist-web/server/index.js','dist/server/index.js');await fs.copyFile('.openai/hosting.json','dist/.openai/hosting.json');\n`)
await fs.writeFile(path.join(target, '.gitignore'), 'node_modules/\ndist/\ndist-web/\noutputs/\n.env*\n*.local\n')
await fs.writeFile(path.join(target, 'README.md'), '# Marvel Marathon Web\n\nPrivate iPhone PWA and desktop watch-history sync. Source is exported from the companion Electron repository using scripts/export-web-site.mjs.\n\nRun npm install and npm run build. Hosted authentication is provided by Sites. Keep the Site owner-private: /api/sync accepts browser sessions and Sites service access to one fixed private collection. Never put the desktop service credential into this source or browser assets.\n\nThe D1 migration is in drizzle/. Service worker caches only application assets; records are held in IndexedDB for offline work and merged with the server. Revision history is retained in D1. Poster JPEGs are stored privately in R2 with version metadata in D1 and offline copies on each device. TMDB credentials remain on the desktop.\n')
console.log(`Exported web source to ${target}`)
