import { validateSyncRecords } from '../src/shared/cloud'
import { DomainError } from '../src/shared/validation'
import { MAX_POSTER_BYTES, posterKey, validatePosterBytes, validatePosterRecords, type PosterRecord } from '../src/shared/poster-sync'

interface Statement {
	bind(...values: unknown[]): Statement
	all<T>(): Promise<{ results: T[] }>
}
export interface CloudEnvironment {
	DB: { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown> }
	BUCKET?: {
		put(key: string, bytes: Uint8Array, options?: { httpMetadata: { contentType: string } }): Promise<unknown>
		get(key: string): Promise<{ body: ReadableStream<Uint8Array> } | null>
	}
}
export type WebAssets = Record<string, { type: string; body: string }>

function json(value: unknown, status = 200) {
	return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
}

async function readBody(request: Request, limit: number): Promise<Uint8Array> {
	if (Number(request.headers.get('content-length')) > limit) throw new DomainError('INVALID_INPUT', '파일이 너무 큽니다.')
	const reader = request.body?.getReader()
	if (!reader) throw new DomainError('INVALID_INPUT', '파일이 필요합니다.')
	const chunks: Uint8Array[] = []
	let size = 0
	for (;;) {
		const { done, value } = await reader.read()
		if (done) break
		size += value.length
		if (size > limit) {
			await reader.cancel()
			throw new DomainError('INVALID_INPUT', '파일이 너무 큽니다.')
		}
		chunks.push(value)
	}
	const bytes = new Uint8Array(size)
	let offset = 0
	for (const chunk of chunks) {
		bytes.set(chunk, offset)
		offset += chunk.length
	}
	return bytes
}

async function posters(request: Request, env: CloudEnvironment): Promise<Response> {
	const url = new URL(request.url)
	const query = 'SELECT movie_id AS movieId,source,version,deleted FROM poster_records'
	if (url.pathname === '/api/posters' && request.method === 'GET') {
		const rows = await env.DB.prepare(query).all<PosterRecord>()
		return json({ posters: rows.results.map(row => ({ ...row, deleted: !!row.deleted })) })
	}
	const match = /^\/api\/posters\/([^/]+)\/(tmdb|custom)$/.exec(url.pathname)
	if (!match) return json({ error: 'Not found' }, 404)
	if (!['GET', 'PUT', 'DELETE'].includes(request.method)) return json({ error: 'Method not allowed' }, 405)
	const record = validatePosterRecords([{ movieId: match[1], source: match[2], version: request.method === 'GET' ? url.searchParams.get('version') : request.headers.get('x-poster-version'), deleted: request.method === 'DELETE' }])[0]
	const existing = (await env.DB.prepare(`${query} WHERE movie_id=? AND source=?`).bind(record.movieId, record.source).all<PosterRecord>()).results[0]
	const key = `posters/${posterKey(record)}/${record.version}.jpg`
	if (request.method === 'GET') {
		if (!existing || existing.deleted) return json({ error: 'Not found' }, 404)
		if (existing.version !== record.version) return json({ error: 'Poster changed; retry' }, 409)
		const file = await env.BUCKET?.get(key)
		if (!file) return json({ error: 'Not found' }, 404)
		return new Response(file.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
	}
	if (request.method === 'PUT') {
		if (request.headers.get('content-type') !== 'image/jpeg') return json({ error: 'JPEG required' }, 415)
		const bytes = validatePosterBytes(await readBody(request, MAX_POSTER_BYTES))
		if (!existing || existing.version < record.version) {
			if (!env.BUCKET) throw new Error('Poster storage unavailable')
			await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } })
		}
	}
	await env.DB.batch([env.DB.prepare('INSERT INTO poster_records (movie_id,source,version,deleted) VALUES (?,?,?,?) ON CONFLICT(movie_id,source) DO UPDATE SET version=excluded.version,deleted=excluded.deleted WHERE excluded.version > poster_records.version').bind(record.movieId, record.source, record.version, Number(record.deleted))])
	return json({ accepted: true })
}

export async function handleRequest(request: Request, env: CloudEnvironment, assets: WebAssets): Promise<Response> {
	const url = new URL(request.url)
	try {
		if (url.pathname.startsWith('/api/')) {
			// This single-owner collection is behind Sites' owner-private gate.
			// Dispatch authenticates both browser sessions and the desktop service token.
			// A service call intentionally has no visitor identity header.
			if (request.headers.has('origin') && request.headers.get('origin') !== url.origin) return json({ error: 'Forbidden origin' }, 403)
			if (request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Forbidden origin' }, 403)
			if (url.pathname === '/api/posters' || url.pathname.startsWith('/api/posters/')) return await posters(request, env)
			if (url.pathname === '/api/session' && request.method === 'GET') return json({ signedIn: !!request.headers.get('oai-authenticated-user-id') })
			if (url.pathname !== '/api/sync') return json({ error: 'Not found' }, 404)
			if (request.method === 'GET') {
				const rows = await env.DB.prepare('SELECT id,version,payload FROM records ORDER BY id').all<{ id: string; version: string; payload: string | null }>()
				return json({ records: rows.results.map(row => ({ id: row.id, version: row.version, entry: row.payload === null ? null : JSON.parse(row.payload) })) })
			}
			if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
			if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON required' }, 415)
			if (Number(request.headers.get('content-length')) > 2_000_000) return json({ error: 'Too large' }, 413)
			const reader = request.body?.getReader()
			if (!reader) return json({ error: 'Body required' }, 400)
			let size = 0
			const chunks: Uint8Array[] = []
			for (;;) {
				const { done, value } = await reader.read()
				if (done) break
				size += value.length
				if (size > 2_000_000) {
					await reader.cancel()
					return json({ error: 'Too large' }, 413)
				}
				chunks.push(value)
			}
			const bytes = new Uint8Array(size)
			let offset = 0
			for (const chunk of chunks) {
				bytes.set(chunk, offset)
				offset += chunk.length
			}
			const body = JSON.parse(new TextDecoder().decode(bytes))
			const records = validateSyncRecords(body.records)
			if (records.length > 100) return json({ error: 'Batch too large' }, 400)
			// Retain every received revision, so concurrent edits can be recovered.
			const statements = records.flatMap(record => {
				const payload = record.entry ? JSON.stringify(record.entry) : null
				return [env.DB.prepare('INSERT OR IGNORE INTO record_history (id,version,payload) VALUES (?,?,?)').bind(record.id, record.version, payload), env.DB.prepare('INSERT INTO records (id,version,payload) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,payload=excluded.payload WHERE excluded.version > records.version').bind(record.id, record.version, payload)]
			})
			if (statements.length) await env.DB.batch(statements)
			return json({ accepted: records.length })
		}
		if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 })
		const file = assets[url.pathname === '/' ? '/index.html' : url.pathname]
		if (!file) return new Response('Not found', { status: 404 })
		const bytes = Uint8Array.from(atob(file.body), char => char.charCodeAt(0))
		return new Response(request.method === 'HEAD' ? null : bytes, { headers: { 'Content-Type': file.type, 'Cache-Control': url.pathname.startsWith('/assets/') ? 'private, max-age=31536000, immutable' : 'no-cache', 'X-Content-Type-Options': 'nosniff', ...(url.pathname === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {}) } })
	} catch (error) {
		return json({ error: error instanceof DomainError ? error.message : '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.' }, error instanceof DomainError || error instanceof SyntaxError ? 400 : 500)
	}
}
