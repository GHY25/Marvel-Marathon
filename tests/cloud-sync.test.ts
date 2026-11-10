import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import { MarathonRepository } from '../electron/db/repository'
import { handleRequest, type CloudEnvironment } from '../web/server'
import { nextSyncVersion, validateSyncRecords } from '../src/shared/cloud'
import { synchronizePosters, type PosterRecord, type PosterSyncStore } from '../src/shared/poster-sync'

function cloudDatabase() {
	const database = new DatabaseSync(':memory:')
	database.exec(fs.readFileSync('web/drizzle/0000_cloud_records.sql', 'utf8'))
	database.exec(fs.readFileSync('web/drizzle/0001_cloud_posters.sql', 'utf8'))
	const files = new Map<string, Uint8Array>()
	const prepare = (sql: string, values: unknown[] = []): ReturnType<CloudEnvironment['DB']['prepare']> & { execute(): void } => ({
		bind: (...params) => prepare(sql, params),
		all: async <T>() => ({ results: database.prepare(sql).all(...(values as never[])) as T[] }),
		execute: () => {
			database.prepare(sql).run(...(values as never[]))
		},
	})
	const env: CloudEnvironment = {
		BUCKET: {
			put: async (key, bytes) => {
				files.set(key, new Uint8Array(bytes))
			},
			get: async key => (files.has(key) ? { body: new Response(new Uint8Array(files.get(key)!)).body! } : null),
		},
		DB: {
			prepare,
			batch: async statements => {
				database.exec('BEGIN')
				try {
					for (const statement of statements) (statement as { execute(): void }).execute()
					database.exec('COMMIT')
				} catch (error) {
					database.exec('ROLLBACK')
					throw error
				}
			},
		},
	}
	return { database, env }
}
const input = { movieId: 'mcu-001', watchDate: '2026-01-01', ratingTicks: 8, review: '첫 별' }
describe('cloud replication', () => {
	it('syncs automatic and custom posters separately, retains offline images, and propagates reset without resurrecting a custom image', async () => {
		const pc = new MarathonRepository(':memory:')
		const phone = new MarathonRepository(':memory:')
		const cloud = cloudDatabase()
		const automatic = Buffer.from([255, 216, 255, 1, 255, 217])
		const custom = Buffer.from([255, 216, 255, 2, 255, 217])
		const transfer = (repo: MarathonRepository): PosterSyncStore => ({ list: pending => repo.getPosterRecords(pending), read: record => repo.readPosterRecord(record), merge: (record, bytes) => repo.mergePosterRecord(record, bytes) })
		let imageRequests = 0
		const request = async (path: string, init?: RequestInit) => {
			if (path !== '/api/posters') imageRequests++
			return handleRequest(new Request(`https://app.example${path}`, init), cloud.env, {})
		}
		try {
			pc.savePoster('mcu-001', 'tmdb', automatic)
			await synchronizePosters(transfer(pc), request)
			await synchronizePosters(transfer(phone), request)
			expect(phone.getPoster('mcu-001')).toEqual(pc.getPoster('mcu-001'))
			expect(phone.posterRevision).toBeGreaterThan(0)
			const count = imageRequests
			await synchronizePosters(transfer(phone), request)
			expect(imageRequests).toBe(count)
			phone.savePoster('mcu-001', 'custom', custom)
			const old = phone.getPosterRecords(true)[0]
			await synchronizePosters(transfer(phone), request)
			await synchronizePosters(transfer(pc), request)
			expect(pc.getPoster('mcu-001')).toMatchObject({ source: 'custom', hasAutomatic: true })
			phone.removeCustomPoster('mcu-001')
			await synchronizePosters(transfer(phone), request)
			await request('/api/posters/mcu-001/custom', { method: 'PUT', headers: { 'Content-Type': 'image/jpeg', 'X-Poster-Version': old.version }, body: custom })
			await synchronizePosters(transfer(pc), request)
			expect(pc.getPoster('mcu-001')).toMatchObject({ source: 'tmdb', hasAutomatic: true })
			expect(pc.getPosterRecords(true)).toHaveLength(0)
			await expect(
				synchronizePosters(transfer(pc), async () => {
					throw new Error('offline')
				})
			).rejects.toThrow()
			expect(pc.getPoster('mcu-001')?.dataUrl).toContain(automatic.toString('base64'))
		} finally {
			pc.close()
			phone.close()
			cloud.database.close()
		}
	})
	it('rejects invalid poster uploads and preserves a newer local image when a stale download completes', async () => {
		const cloud = cloudDatabase()
		const repo = new MarathonRepository(':memory:')
		const jpeg = Buffer.from([255, 216, 255, 1, 255, 217])
		try {
			const put = (path: string, body: Uint8Array, origin = 'https://app.example') => handleRequest(new Request(`https://app.example${path}`, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg', 'X-Poster-Version': nextSyncVersion(), Origin: origin }, body: new Uint8Array(body) }), cloud.env, {})
			expect((await put('/api/posters/mcu-001/custom', new TextEncoder().encode('<svg/>'))).status).toBe(400)
			expect((await put('/api/posters/mcu-001/custom', new Uint8Array(524289))).status).toBe(400)
			expect((await put('/api/posters/unknown/custom', jpeg)).status).toBe(400)
			expect((await put('/api/posters/mcu-001/custom', jpeg, 'https://other.example')).status).toBe(403)
			expect(cloud.database.prepare('SELECT count(*) AS count FROM poster_records').get()?.count).toBe(0)
			repo.savePoster('mcu-001', 'custom', jpeg)
			const old: PosterRecord = repo.getPosterRecords()[0]
			repo.removeCustomPoster('mcu-001')
			repo.mergePosterRecord(old, jpeg)
			expect(repo.getPoster('mcu-001')).toBeUndefined()
			expect(repo.getPosterRecords(true)[0].deleted).toBe(true)
		} finally {
			repo.close()
			cloud.database.close()
		}
	})
	it('merges creates, edits and deletes across two independent stores without resurrecting stale changes', async () => {
		const pc = new MarathonRepository(':memory:')
		const phone = new MarathonRepository(':memory:')
		const cloud = cloudDatabase()
		const push = async (records: unknown) => handleRequest(new Request('https://app.example/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://app.example' }, body: JSON.stringify({ records }) }), cloud.env, {})
		const pull = async () => ((await (await handleRequest(new Request('https://app.example/api/sync'), cloud.env, {})).json()) as { records: unknown }).records
		try {
			const created = pc.createEntry(input)
			const first = pc.getSyncRecords(true)
			expect((await push(first)).status).toBe(200)
			phone.mergeSyncRecords(await pull())
			pc.mergeSyncRecords(await pull())
			expect(phone.listEntries()).toEqual(pc.listEntries())
			expect(pc.getSyncRecords(true)).toHaveLength(0)
			phone.updateEntry(created.id, { ...input, review: '아이폰에서 수정' })
			expect((await push(phone.getSyncRecords(true))).status).toBe(200)
			pc.mergeSyncRecords(await pull())
			phone.mergeSyncRecords(await pull())
			expect(pc.listEntries()[0].review).toBe('아이폰에서 수정')
			pc.deleteEntry(created.id)
			await push(pc.getSyncRecords(true))
			await push(first)
			phone.mergeSyncRecords(await pull())
			expect(phone.listEntries()).toHaveLength(0)
			expect(cloud.database.prepare('SELECT count(*) AS count FROM record_history').get()?.count).toBe(3)
		} finally {
			pc.close()
			phone.close()
			cloud.database.close()
		}
	})
	it('does not clear a newer local edit when an older response arrives, and restores create tombstones', () => {
		const repo = new MarathonRepository(':memory:')
		try {
			const entry = repo.createEntry(input)
			const previous = repo.getSyncRecords(true)
			repo.updateEntry(entry.id, { ...input, review: '새 수정' })
			repo.mergeSyncRecords(previous)
			expect(repo.listEntries()[0].review).toBe('새 수정')
			expect(repo.getSyncRecords(true)).toHaveLength(1)
			const backup = repo.createBackup()
			repo.createEntry({ ...input, movieId: 'mcu-002' })
			repo.restoreBackup(backup)
			expect(repo.getSyncRecords(true).filter(record => !record.entry)).toHaveLength(1)
		} finally {
			repo.close()
		}
	})
	it('rejects malformed batches atomically and blocks cross-origin writes', async () => {
		const cloud = cloudDatabase()
		const repo = new MarathonRepository(':memory:')
		try {
			repo.createEntry(input)
			const send = (origin: string, records: unknown[]) => handleRequest(new Request('https://app.example/api/sync', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ records }) }), cloud.env, {})
			expect((await send('https://evil.example', repo.getSyncRecords())).status).toBe(403)
			expect((await send('https://app.example', [...repo.getSyncRecords(), { id: 'invalid' }])).status).toBe(400)
			expect(cloud.database.prepare('SELECT count(*) AS count FROM records').get()?.count).toBe(0)
			expect(() => validateSyncRecords([{ ...repo.getSyncRecords()[0], version: 'invalid' }])).toThrow()
			const future = nextSyncVersion('', Date.now() + 10000)
			expect(nextSyncVersion(future) > future).toBe(true)
		} finally {
			repo.close()
			cloud.database.close()
		}
	})
})
