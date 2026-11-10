import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import worker from '../dist-web/server/index.js'

export function startPreview({ port = 4173, filename = ':memory:' } = {}) {
	const db = new DatabaseSync(filename)
	db.exec(fs.readFileSync(new URL('../web/drizzle/0000_cloud_records.sql', import.meta.url), 'utf8'))
	db.exec(fs.readFileSync(new URL('../web/drizzle/0001_cloud_posters.sql', import.meta.url), 'utf8'))
	const files = new Map()
	const prepare = (sql, values = []) => ({ bind: (...params) => prepare(sql, params), all: async () => ({ results: db.prepare(sql).all(...values) }), execute: () => db.prepare(sql).run(...values) })
	const env = {
		BUCKET: {
			put: async (key, bytes) => {
				files.set(key, new Uint8Array(bytes))
			},
			get: async key => (files.has(key) ? { body: new Response(files.get(key)).body } : null),
		},
		DB: {
			prepare,
			batch: async statements => {
				db.exec('BEGIN')
				try {
					const result = statements.map(statement => statement.execute())
					db.exec('COMMIT')
					return result
				} catch (error) {
					db.exec('ROLLBACK')
					throw error
				}
			},
		},
	}
	const server = createServer(async (req, res) => {
		try {
			const chunks = []
			for await (const chunk of req) chunks.push(chunk)
			const headers = new Headers()
			for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(key, value)
			headers.set('oai-authenticated-user-id', 'local-preview-only')
			const address = server.address()
			const request = new Request(`http://127.0.0.1:${address.port}${req.url}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) })
			const response = await worker.fetch(request, env)
			res.writeHead(response.status, Object.fromEntries(response.headers))
			res.end(Buffer.from(await response.arrayBuffer()))
		} catch {
			res.writeHead(500)
			res.end('Preview request failed')
		}
	})
	return new Promise(resolve =>
		server.listen(port, '127.0.0.1', () =>
			resolve({
				url: `http://127.0.0.1:${server.address().port}`,
				close: () =>
					new Promise(done =>
						server.close(() => {
							db.close()
							done()
						})
					),
			})
		)
	)
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/preview-web.mjs')) {
	const preview = await startPreview()
	console.log(`Local: ${preview.url}`)
}
