import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarathonRepository } from '../electron/db/repository'
import { PosterService, type PosterDependencies } from '../electron/services/poster-service'
import { choosePoster, fetchTmdbPoster, matchMovie, posterImageUrl, PosterFetchError, validateCredential } from '../electron/services/tmdb-client'
import { CATALOG as MOVIES } from '../src/shared/catalog'

const key = 'a'.repeat(32)
const token = 'test.access.token.'.repeat(5)
const match = { id: 1726, title: 'Iron Man', original_title: 'Iron Man', release_date: '2008-04-30', poster_path: '/fallback.jpg' }
const jpeg = Buffer.from('test-normalized-jpeg')
afterEach(() => vi.unstubAllGlobals())

describe('TMDB client boundaries and matching', () => {
	it('accepts v3 keys and Bearer tokens but not arbitrary objects, header injection or giant input', () => {
		expect(validateCredential(` ${key} `)).toBe(key)
		expect(validateCredential(`Bearer ${token}`)).toBe(token)
		for (const input of [null, {}, '', 'short', `Bearer ${token}\nX-Header: test`, 'x'.repeat(4097)]) expect(() => validateCredential(input)).toThrow()
	})
	it('requires one exact title and release year, ignoring harmless punctuation', () => {
		expect(matchMovie({ results: [match] }, MOVIES[0]).id).toBe(1726)
		expect(matchMovie({ results: [{ ...match, title: 'Thunderbolts', original_title: '', release_date: '2025-05-01' }] }, MOVIES[35]).id).toBe(1726)
		for (const results of [[], [match, match], [{ ...match, release_date: '2009-01-01' }], [{ ...match, title: 'Iron Man documentary', original_title: '' }], [{ ...match, adult: true }]]) expect(() => matchMovie({ results }, MOVIES[0])).toThrow()
	})
	it('prefers English over Korean and unlabelled posters regardless of popularity', () => {
		const poster = (language: string | null, file: string) => ({ iso_639_1: language, file_path: `/${file}.jpg`, width: 500, height: 750 })
		expect(
			choosePoster({
				posters: [
					{ ...poster('ko', 'ko'), vote_average: 10 },
					{ ...poster('en', 'en'), vote_average: 1 },
				],
			})
		).toContain('/en.jpg')
		expect(choosePoster({ posters: [poster(null, 'null'), poster('en', 'en')] })).toContain('/en.jpg')
		expect(choosePoster({ posters: [poster('ko', 'ko'), poster(null, 'none')] })).toContain('/none.jpg')
	})
	it('rejects unsupported languages and missing language metadata instead of using a Korean default', () => {
		for (const posters of [[], [{ iso_639_1: 'ko', file_path: '/ko.jpg', width: 500, height: 750 }], [{ file_path: '/unknown.jpg', width: 500, height: 750 }]]) {
			expect(() => choosePoster({ posters })).toThrow('영어 또는 언어 표시 없는 포스터')
		}
	})
	it('never downloads an unverified default poster when the image response has no supported language', async () => {
		const request = vi.fn(async (url: string | URL) => (String(url).includes('/search/') ? Response.json({ results: [match] }) : Response.json({ posters: [] })))
		vi.stubGlobal('fetch', request)
		await expect(fetchTmdbPoster(MOVIES[0], key, new AbortController().signal)).rejects.toThrow('영어 또는 언어 표시 없는 포스터')
		expect(request).toHaveBeenCalledTimes(2)
	})
	it('does not turn untrusted poster paths into arbitrary network requests', () => {
		for (const input of ['https://evil.test/a.jpg', '//evil.test/a.jpg', '/../../secret.jpg', '/foo.jpg?key=x', '/foo.svg', '/foo%2fbar.jpg', null]) expect(() => posterImageUrl(input)).toThrow()
	})
	it.each([key, token])('uses official hosts, correct authentication and no CDN credential', async credential => {
		const requests: { url: URL; init: RequestInit }[] = []
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string | URL, init: RequestInit) => {
				requests.push({ url: new URL(url), init })
				if (String(url).includes('/search/')) return Response.json({ results: [match] })
				if (String(url).includes('/images')) return Response.json({ posters: [{ iso_639_1: 'en', file_path: '/english.jpg', width: 500, height: 750 }] })
				return new Response(jpeg)
			})
		)
		expect(await fetchTmdbPoster(MOVIES[0], credential, new AbortController().signal)).toEqual(jpeg)
		expect(requests.map(item => item.url.hostname)).toEqual(['api.themoviedb.org', 'api.themoviedb.org', 'image.tmdb.org'])
		expect(requests[0].url.searchParams.get('primary_release_year')).toBe('2008')
		expect(requests[1].url.searchParams.get('language')).toBe('en')
		expect(requests[1].url.searchParams.get('include_image_language')).toBe('en,null')
		expect(requests[2].url.pathname).toBe('/t/p/w500/english.jpg')
		expect(requests[0].url.searchParams.get('api_key')).toBe(credential === key ? key : null)
		expect((requests[0].init.headers as Record<string, string>).Authorization).toBe(credential === key ? undefined : `Bearer ${token}`)
		expect(requests[2].url.searchParams.toString()).toBe('')
		expect(requests[2].init.headers).toEqual({ Accept: 'image/jpeg,image/png' })
		expect(requests.every(item => item.init.redirect === 'error')).toBe(true)
	})
	it.each([401, 403, 429, 503])('stops a batch on HTTP %s without exposing credentials', async status => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(key, { status }))
		)
		await expect(fetchTmdbPoster(MOVIES[0], key, new AbortController().signal)).rejects.toMatchObject({ stopBatch: true })
	})
	it('redacts raw fetch errors and rejects overlarge streamed replies', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error(`request url?api_key=${key}`)
			})
		)
		await expect(fetchTmdbPoster(MOVIES[0], key, new AbortController().signal)).rejects.not.toThrow(key)
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(Buffer.alloc(2 * 1024 * 1024 + 1)))
		)
		await expect(fetchTmdbPoster(MOVIES[0], key, new AbortController().signal)).rejects.toThrow('너무 큽니다')
	})
})

describe('poster synchronization and local persistence', () => {
	let repository: MarathonRepository | undefined
	afterEach(() => {
		repository?.close()
		repository = undefined
	})
	function setup(overrides: Partial<PosterDependencies> = {}) {
		repository = new MarathonRepository(':memory:')
		const deps: PosterDependencies = { encrypt: value => Buffer.from(value.split('').reverse().join('')), decrypt: value => value.toString().split('').reverse().join(''), normalize: value => value, chooseFile: async () => null, fetchPoster: vi.fn(async () => jpeg), ...overrides }
		const service = new PosterService(repository, deps)
		return { service, deps, repo: repository }
	}
	async function done(service: PosterService) {
		await vi.waitFor(() => expect(service.status().running).toBe(false))
	}
	it('requires a credential and never exposes it through status or JSON backup', () => {
		const { service, repo } = setup()
		expect(() => service.startSync(false)).toThrow('먼저')
		service.saveCredential(token)
		expect(service.status().hasCredential).toBe(true)
		expect(JSON.stringify(service.status()) + JSON.stringify(repo.createBackup())).not.toContain(token)
		expect(repo.getPosterCredential()!.toString()).not.toBe(token)
	})
	it('downloads 38 once, keeps cached/custom assets, and refreshes only automatic posters', async () => {
		const { service, deps, repo } = setup()
		service.saveCredential(key)
		service.startSync(false)
		await done(service)
		expect(service.status()).toMatchObject({ total: 64, completed: 64, saved: 64, skipped: 0, errors: [] })
		repo.savePoster(MOVIES[0].id, 'custom', Buffer.from('custom'))
		service.startSync(false)
		await done(service)
		expect(service.status()).toMatchObject({ saved: 0, skipped: 64 })
		service.startSync(true)
		await done(service)
		expect(service.status()).toMatchObject({ saved: 63, skipped: 1 })
		expect(deps.fetchPoster).toHaveBeenCalledTimes(127)
		expect(service.listMovies()[0].poster).toMatchObject({ source: 'custom', hasAutomatic: true })
		service.useAutomatic(MOVIES[0].id)
		expect(service.listMovies()[0].poster?.source).toBe('tmdb')
	})
	it('keeps existing cached posters on failure, stops on invalid auth and reports unprocessed movies', async () => {
		const { service, repo } = setup({
			fetchPoster: async () => {
				throw new PosterFetchError('인증 실패', true)
			},
		})
		repo.savePoster(MOVIES[0].id, 'tmdb', jpeg)
		service.saveCredential(key)
		service.startSync(true)
		await done(service)
		expect(service.status()).toMatchObject({ completed: 1, total: 64, saved: 0, errors: [{ title: 'Iron Man', message: '인증 실패' }] })
		expect(repo.getPoster(MOVIES[0].id)?.dataUrl).toContain(jpeg.toString('base64'))
	})
	it('continues on missing poster and preserves previously saved images when cancelled', async () => {
		let count = 0
		const { service, repo } = setup({
			fetchPoster: async () => {
				count++
				if (count === 1) throw new PosterFetchError('포스터 없음')
				if (count === 3) service.cancelSync()
				return jpeg
			},
		})
		service.saveCredential(key)
		service.startSync(false)
		await done(service)
		expect(service.status()).toMatchObject({ cancelled: true, completed: 2, saved: 1 })
		expect(repo.getPoster(MOVIES[1].id)?.source).toBe('tmdb')
		expect(repo.getPoster(MOVIES[2].id)).toBeUndefined()
	})
	it('restores encrypted credential, clears it without removing assets, and handles decrypt failure', () => {
		const { service, repo, deps } = setup()
		service.saveCredential(token)
		expect(new PosterService(repo, deps).status().hasCredential).toBe(true)
		expect(
			new PosterService(repo, {
				...deps,
				decrypt: () => {
					throw new Error('keychain unavailable')
				},
			}).status()
		).toMatchObject({ hasCredential: false, credentialProblem: true })
		repo.savePoster(MOVIES[0].id, 'custom', jpeg)
		service.clearCredential()
		expect(repo.getPosterCredential()).toBeUndefined()
		expect(repo.getPoster(MOVIES[0].id)?.source).toBe('custom')
	})
	it('rejects unknown movie ids and invalid sync parameters; cancelled picker keeps current image', async () => {
		const { service, repo } = setup()
		expect(() => service.useAutomatic('../secret')).toThrow()
		expect(() => service.startSync('true')).toThrow()
		repo.savePoster(MOVIES[0].id, 'custom', jpeg)
		expect(await service.chooseCustom(MOVIES[0].id)).toEqual({ status: 'cancelled' })
		expect(repo.getPoster(MOVIES[0].id)?.source).toBe('custom')
	})
	it('keeps posters and credentials independent of watch-entry restore', () => {
		const { service, repo } = setup()
		service.saveCredential(key)
		repo.savePoster(MOVIES[0].id, 'custom', jpeg)
		const backup = repo.createBackup()
		repo.createEntry({ movieId: MOVIES[0].id, watchDate: '2026-01-01', ratingTicks: 7, review: 'kept separate' })
		repo.restoreBackup(backup)
		expect(repo.listEntries()).toEqual([])
		expect(repo.getPoster(MOVIES[0].id)?.source).toBe('custom')
		expect(repo.getPosterCredential()).toBeDefined()
	})
})
