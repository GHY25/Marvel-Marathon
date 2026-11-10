// One-time local setup. The existing Site service credential enters only through
// hidden stdin and is stored with Windows user-bound encryption, never in source.
const { app, safeStorage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const origin = 'https://marvel-marathon-bada.blond-skunk-9580.chatgpt.site'
app.disableHardwareAcceleration()
app.whenReady()
	.then(() => {
		if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage unavailable')
		const providedInput = process.env.MARATHON_CLOUD_SETUP_JSON
		delete process.env.MARATHON_CLOUD_SETUP_JSON
		if (!providedInput && process.stdin.isTTY) process.stdin.setRawMode(true)
		process.stdin.setEncoding('utf8')
		process.stdin.resume()
		if (!providedInput) process.stdout.write('Ready for cloud connection JSON on stdin (input is hidden).\n')
		let input = ''
		process.stdin.on('data', async chunk => {
			input += chunk
			if (!/[\r\n]/.test(input)) return
			process.stdin.pause()
			try {
				const value = JSON.parse(input.trim())
				if (value.origin !== origin || typeof value.token !== 'string' || value.token.length < 20 || value.token.length > 10000) throw new Error('Invalid connection')
				const directory = path.join(app.getPath('appData'), 'Marvel Marathon')
				fs.mkdirSync(directory, { recursive: true })
				const filename = path.join(directory, 'cloud-connection.json')
				const encrypted = safeStorage.encryptString(value.token).toString('base64')
				fs.writeFileSync(`${filename}.tmp`, JSON.stringify({ origin, enabled: true, credential: encrypted }), { mode: 0o600 })
				fs.renameSync(`${filename}.tmp`, filename)
				input = ''
				process.stdout.write('Cloud connection saved securely.\n')
				if (value.initialSync) {
					const installedDatabase = path.join(directory, 'marvel-marathon.sqlite3')
					const filename = fs.existsSync(installedDatabase) ? installedDatabase : path.join(directory, 'marvel-marathon.development.sqlite3')
					if (fs.existsSync(filename)) {
						const { DatabaseSync } = require('node:sqlite')
						const database = new DatabaseSync(filename, { readOnly: true })
						let records
						try {
							const hasSync = database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sync_records'").get()
							records = hasSync
								? database
										.prepare('SELECT id,version,payload FROM sync_records')
										.all()
										.map(row => ({ id: row.id, version: row.version, entry: row.payload ? JSON.parse(row.payload) : null }))
								: database
										.prepare('SELECT id,movie_id AS movieId,watch_date AS watchDate,rating_ticks AS ratingTicks,review,created_at_utc AS createdAtUtc,updated_at_utc AS updatedAtUtc FROM watch_entries')
										.all()
										.map(entry => ({ id: entry.id, version: `${String(Date.parse(entry.updatedAtUtc)).padStart(13, '0')}:${entry.id}`, entry }))
						} finally {
							database.close()
						}
						for (let offset = 0; offset < records.length; offset += 100) {
							const response = await fetch(`${origin}/api/sync`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json', 'OAI-Sites-Authorization': `Bearer ${value.token}` }, body: JSON.stringify({ records: records.slice(offset, offset + 100) }) })
							if (!response.ok) throw new Error('Initial sync failed')
						}
						const verification = await fetch(`${origin}/api/sync`, { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'OAI-Sites-Authorization': `Bearer ${value.token}` } })
						if (!verification.ok) throw new Error('Cloud verification failed')
						const cloud = await verification.json()
						if (!Array.isArray(cloud.records)) throw new Error('Invalid cloud response')
						const received = new Map(cloud.records.map(record => [record.id, record]))
						if (records.some(record => !received.has(record.id) || received.get(record.id).version < record.version)) throw new Error('Missing cloud records')
						process.stdout.write(`Initial cloud sync completed: ${records.filter(record => record.entry).length} watch records. Local database was opened read-only.\n`)
						process.stdout.write('Live cloud records verified.\n')
					}
				}
				app.exit(0)
			} catch {
				process.stderr.write('Cloud connection setup failed.\n')
				app.exit(1)
			}
		})
		if (providedInput) process.stdin.emit('data', `${providedInput}\n`)
	})
	.catch(() => {
		process.stderr.write('Secure storage unavailable.\n')
		app.exit(1)
	})
