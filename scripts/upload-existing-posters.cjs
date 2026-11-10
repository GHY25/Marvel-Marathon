// Transfer existing poster JPEGs through the user's encrypted Site connection.
// Both local libraries are opened read-only; credentials and images are never logged.
const electron = require('electron')
if (typeof electron === 'string') {
	const { spawn } = require('node:child_process')
	const env = { ...process.env }
	delete env.ELECTRON_RUN_AS_NODE
	const child = spawn(electron, [__filename], { env, stdio: 'inherit', windowsHide: true })
	child.on('error', () => {
		console.error('Could not start poster transfer.')
		process.exitCode = 1
	})
	child.on('exit', code => {
		process.exitCode = code ?? 1
	})
} else {
	const { app, safeStorage } = electron
	const fs = require('node:fs')
	const path = require('node:path')
	const { DatabaseSync } = require('node:sqlite')
	const origin = 'https://marvel-marathon-bada.blond-skunk-9580.chatgpt.site'
	const initialVersion = '0000000000000:00000000-0000-4000-8000-000000000001'
	app.disableHardwareAcceleration()
	app.whenReady()
		.then(async () => {
			const directory = path.join(app.getPath('appData'), 'Marvel Marathon')
			const config = JSON.parse(fs.readFileSync(path.join(directory, 'cloud-connection.json'), 'utf8'))
			if (config.origin !== origin || !config.enabled) throw new Error('PC cloud connection is not enabled')
			const token = safeStorage.decryptString(Buffer.from(config.credential, 'base64'))
			const request = async (pathname, init = {}) => {
				const response = await fetch(`${origin}${pathname}`, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000), headers: { ...init.headers, 'OAI-Sites-Authorization': `Bearer ${token}` } })
				if (!response.ok) throw new Error(`Poster service returned HTTP ${response.status}`)
				return response
			}
			const candidates = new Map()
			for (const name of ['marvel-marathon.sqlite3', 'marvel-marathon.development.sqlite3']) {
				const filename = path.join(directory, name)
				if (!fs.existsSync(filename)) continue
				const database = new DatabaseSync(filename, { readOnly: true })
				try {
					const hasSync = database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='poster_sync'").get()
					const rows = hasSync ? database.prepare('SELECT movie_id AS movieId,source,version,deleted,jpeg FROM poster_sync LEFT JOIN poster_assets USING(movie_id,source)').all() : database.prepare('SELECT movie_id AS movieId,source,jpeg FROM poster_assets').all()
					for (const row of rows) {
						const record = { ...row, version: row.version ?? initialVersion, deleted: !!row.deleted }
						const key = `${record.movieId}/${record.source}`
						if (!candidates.has(key) || candidates.get(key).version < record.version) candidates.set(key, record)
					}
				} finally {
					database.close()
				}
			}
			const current = await (await request('/api/posters')).json()
			const remote = new Map(current.posters.map(record => [`${record.movieId}/${record.source}`, record]))
			let uploaded = 0
			for (const [key, record] of candidates) {
				if ((remote.get(key)?.version ?? '') >= record.version) continue
				await request(`/api/posters/${key}`, { method: record.deleted ? 'DELETE' : 'PUT', headers: { 'Content-Type': 'image/jpeg', 'X-Poster-Version': record.version }, body: record.deleted ? undefined : record.jpeg })
				uploaded++
			}
			const verified = await (await request('/api/posters')).json()
			const index = new Map(verified.posters.map(record => [`${record.movieId}/${record.source}`, record]))
			for (const [key, record] of candidates) if (!index.has(key) || index.get(key).version < record.version) throw new Error('Poster verification failed')
			const sample = verified.posters.find(record => !record.deleted)
			if (sample) {
				const response = await request(`/api/posters/${sample.movieId}/${sample.source}?version=${encodeURIComponent(sample.version)}`)
				const bytes = new Uint8Array(await response.arrayBuffer())
				if (!response.headers.get('content-type')?.startsWith('image/jpeg') || bytes[0] !== 255 || bytes[1] !== 216) throw new Error('Poster image verification failed')
			}
			console.log(`Uploaded ${uploaded} poster changes; verified ${verified.posters.filter(record => !record.deleted).length} cloud images. Local libraries were opened read-only.`)
			app.exit(0)
		})
		.catch(error => {
			console.error(error.message?.startsWith('Poster service returned HTTP') ? error.message : 'Poster transfer failed. Local images were not changed.')
			app.exit(1)
		})
}
