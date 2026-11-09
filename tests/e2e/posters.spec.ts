import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import sharp from 'sharp'
import { CATALOG as MOVIES } from '../../src/shared/catalog'

test('real Electron: TMDB transport fixture, secure key, custom posters, validation and offline restart', async () => {
	test.setTimeout(90_000)
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-posters-e2e-'))
	const env: NodeJS.ProcessEnv = { ...process.env, MARATHON_TEST_MODE: '1', MARATHON_USER_DATA_DIR: directory, ELECTRON_MENU_ENABLED: 'false' }
	delete env.ELECTRON_RUN_AS_NODE
	const executablePath = process.env.MARATHON_EXECUTABLE
	let devServer: import('vite').ViteDevServer | undefined
	if (process.env.MARATHON_TEST_DEV === '1') {
		const { resolveConfig } = await import('electron-vite')
		const { createServer } = await import('vite')
		const resolved = await resolveConfig({}, 'serve', 'development')
		if (!resolved.config?.renderer) throw new Error('Missing renderer config')
		devServer = await createServer({ ...resolved.config.renderer, server: { host: '127.0.0.1', port: 0 } })
		await devServer.listen()
		const address = devServer.httpServer!.address()
		if (!address || typeof address === 'string') throw new Error('Missing dev server address')
		env.ELECTRON_RENDERER_URL = `http://127.0.0.1:${address.port}`
	}
	const remote = await sharp({ create: { width: 500, height: 750, channels: 3, background: '#304f76' } })
		.jpeg()
		.toBuffer()
	const customPath = path.join(directory, 'chosen-poster.png')
	await sharp({ create: { width: 1000, height: 1500, channels: 3, background: '#9a344b' } })
		.png()
		.toFile(customPath)
	const invalidPath = path.join(directory, 'invalid.png')
	fs.writeFileSync(invalidPath, '<svg><script>bad()</script></svg>')
	const giantPath = path.join(directory, 'giant.png')
	const giant = Buffer.alloc(32)
	Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(giant)
	giant.write('IHDR', 12)
	giant.writeUInt32BE(50000, 16)
	giant.writeUInt32BE(50000, 20)
	fs.writeFileSync(giantPath, giant)
	let app: ElectronApplication | undefined
	let page: Page
	const rendererErrors: string[] = []
	const key = 'a'.repeat(32)
	async function launch() {
		app = await electron.launch({ executablePath, args: executablePath ? [] : ['.'], env })
		page = await app.firstWindow()
		page.on('pageerror', error => rendererErrors.push(error.message))
		await expect(page.getByRole('heading', { name: '나만의 MCU 정주행 기록' })).toBeVisible()
	}
	async function route(value: string) {
		await page.evaluate(route => {
			window.location.hash = route
		}, value)
		await expect(page.getByRole('heading', { level: 1, name: value === '/settings' ? '설정' : value === '/movies' ? '영화와 시리즈, 하나의 우주' : 'Iron Man', exact: true })).toBeVisible()
	}
	async function posters() {
		return page.evaluate(async () => {
			const result = await window.electronAPI.movies.list()
			if (!result.ok) throw new Error(result.error.message)
			return result.data.map(movie => movie.poster)
		})
	}
	async function choose(filename: string | null) {
		await app!.evaluate(({ dialog }, filename) => {
			dialog.showOpenDialog = async () => ({ canceled: !filename, filePaths: filename ? [filename] : [] })
		}, filename)
		await page.getByRole('button', { name: '내 이미지로 변경' }).click()
		await expect(page.getByRole('button', { name: '내 이미지로 변경' })).toBeEnabled()
	}
	try {
		await launch()
		const packaged = await app!.evaluate(({ app }) => app.isPackaged)
		const dbFilename = path.join(directory, packaged ? 'marvel-marathon.sqlite3' : 'marvel-marathon.development.sqlite3')
		// Simulate an automatic poster saved by the previous Korean-first version.
		const legacyPoster = await sharp(customPath).resize(500, 750).jpeg().toBuffer()
		const legacyDb = new DatabaseSync(dbFilename)
		legacyDb.prepare("INSERT INTO poster_assets (movie_id, source, jpeg) VALUES ('mcu-001', 'tmdb', ?)").run(legacyPoster)
		legacyDb.close()
		await page.reload()
		await expect(page.getByRole('heading', { name: '나만의 MCU 정주행 기록' })).toBeVisible()
		await app!.evaluate(
			(_electron, fixture) => {
				globalThis.fetch = async (input, init) => {
					const url = new URL(String(input))
					if (url.hostname === 'api.themoviedb.org' && url.searchParams.get('api_key') !== fixture.key) return new Response(null, { status: 401 })
					if (url.pathname === '/3/search/movie') {
						const movie = fixture.movies.find(movie => movie.titleEn === url.searchParams.get('query'))
						return Response.json({ results: movie ? [{ id: movie.releaseOrder, title: movie.titleEn, original_title: movie.titleEn, release_date: `${movie.releaseYear}-01-01`, poster_path: '/korean.jpg' }] : [] })
					}
					if (url.pathname === '/3/search/tv') {
						const movie = fixture.movies.find(movie => movie.seriesTitle === url.searchParams.get('query') && String(movie.seriesStartYear) === url.searchParams.get('first_air_date_year'))
						return Response.json({ results: movie ? [{ id: movie.seriesTitle === 'What If...?' ? 91363 : movie.releaseOrder, name: movie.seriesTitle, original_name: movie.seriesTitle, first_air_date: `${movie.seriesStartYear}-01-01` }] : [] })
					}
					if (url.hostname === 'api.themoviedb.org' && url.pathname.endsWith('/images') && url.searchParams.get('language') === 'en' && url.searchParams.get('include_image_language') === 'en,null')
						return Response.json({
							posters: [
								{ iso_639_1: 'ko', file_path: '/korean.jpg', width: 500, height: 750, vote_average: 10 },
								{ iso_639_1: 'en', file_path: '/english.jpg', width: 500, height: 750, vote_average: 1 },
							],
						})
					if (url.hostname === 'image.tmdb.org' && url.pathname === '/t/p/w500/english.jpg' && !new Headers(init?.headers).has('Authorization') && !url.search) return new Response(Buffer.from(fixture.base64, 'base64'))
					throw new Error('Unexpected network request')
				}
			},
			{ movies: MOVIES, base64: remote.toString('base64'), key }
		)
		await route('/settings')
		await expect(page.getByRole('button', { name: '포스터 자동 가져오기' })).toBeDisabled()
		await page.getByLabel('TMDB API Key 또는 Read Access Token').fill(key)
		await page.getByRole('button', { name: '키 저장', exact: true }).click()
		await expect(page.getByLabel('TMDB API Key 또는 Read Access Token')).toHaveValue('')
		await expect(page.getByRole('button', { name: '포스터 자동 가져오기' })).toBeEnabled()
		await page.getByLabel('저장된 포스터도 영어로 새로 받기').check()
		await page.getByRole('button', { name: '포스터 자동 가져오기' }).click()
		await expect(page.getByText('가져오기 완료 · 64편 저장 · 0편 유지 · 0편 실패', { exact: true })).toBeVisible()
		await expect.poll(async () => (await posters()).filter(Boolean).length).toBe(64)
		expect((await posters())[0]!.dataUrl).not.toBe(`data:image/jpeg;base64,${legacyPoster.toString('base64')}`)
		await page.screenshot({ path: 'test-results/poster-settings-dark.png', fullPage: true })
		await route('/movies')
		await expect(page.locator('.movie-card .has-poster img')).toHaveCount(64)
		await expect
			.poll(() =>
				page
					.locator('.movie-card .has-poster img')
					.first()
					.evaluate((img: HTMLImageElement) => img.naturalWidth)
			)
			.toBe(500)
		await route('/movies/mcu-001')
		const automatic = (await posters())[0]!.dataUrl
		await choose(customPath)
		await expect.poll(async () => (await posters())[0]?.source).toBe('custom')
		await expect(page.getByRole('button', { name: '자동 포스터로 되돌리기' })).toBeVisible()
		const custom = (await posters())[0]!.dataUrl
		expect(custom).not.toBe(automatic)
		for (const filename of [invalidPath, giantPath]) {
			await choose(filename)
			await expect(page.getByRole('alert')).toContainText('JPG 또는 PNG')
			expect((await posters())[0]!.dataUrl).toBe(custom)
		}
		await choose(null)
		expect((await posters())[0]!.dataUrl).toBe(custom)
		await page.getByRole('button', { name: '자동 포스터로 되돌리기' }).click()
		await expect.poll(async () => (await posters())[0]?.dataUrl).toBe(automatic)
		await choose(customPath)
		await route('/settings')
		await page.getByLabel('저장된 포스터도 영어로 새로 받기').check()
		await page.getByRole('button', { name: '포스터 자동 가져오기' }).click()
		await expect(page.getByText('가져오기 완료 · 63편 저장 · 1편 유지 · 0편 실패', { exact: true })).toBeVisible()
		expect((await posters())[0]!.dataUrl).toBe(custom)
		const db = new DatabaseSync(dbFilename)
		const encrypted = db.prepare("SELECT encrypted_value FROM private_settings WHERE name = 'tmdb'").get()!
		expect(Buffer.from(encrypted.encrypted_value as Uint8Array).includes(Buffer.from(key))).toBe(false)
		db.close()
		await app!.close()
		app = undefined
		await launch()
		await app!.evaluate(() => {
			globalThis.fetch = async () => {
				throw new Error('offline')
			}
		})
		await route('/movies/mcu-001')
		expect((await posters())[0]!.dataUrl).toBe(custom)
		await expect(page.locator('.movie-detail-hero .has-poster img')).toBeVisible()
		await expect.poll(() => page.locator('.movie-detail-hero .has-poster img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(500)
		await page.locator('.movie-detail-hero .has-poster img').evaluate((img: HTMLImageElement) => img.decode())
		await page.screenshot({ path: 'test-results/poster-custom-dark.png', fullPage: true })
		await route('/settings')
		await expect(page.getByRole('button', { name: '포스터 자동 가져오기' })).toBeEnabled()
		await app!.evaluate(() => {
			globalThis.fetch = async (_input, init) =>
				new Promise((_resolve, reject) => {
					if (init?.signal?.aborted) reject(new Error('cancelled'))
					else init?.signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
				})
		})
		await page.getByLabel('저장된 포스터도 영어로 새로 받기').check()
		await page.getByRole('button', { name: '포스터 자동 가져오기' }).click()
		await expect(page.getByRole('button', { name: '키 삭제', exact: true })).toBeDisabled()
		await page.getByRole('button', { name: '가져오기 중지', exact: true }).click()
		await expect(page.getByText(/가져오기 중지 · 0편 저장 · 1편 유지 · 0편 실패 · 63편 남음/)).toBeVisible()
		await app!.evaluate(() => {
			globalThis.fetch = async () => {
				throw new Error('offline')
			}
		})
		await page.getByRole('button', { name: '포스터 자동 가져오기' }).click()
		await expect(page.getByText(/가져오기 중단 · 0편 저장 · 1편 유지 · 1편 실패 · 62편 남음/)).toBeVisible()
		expect((await posters()).filter(Boolean)).toHaveLength(64)
		await page.getByRole('button', { name: '키 삭제', exact: true }).click()
		await expect(page.getByRole('button', { name: '포스터 자동 가져오기' })).toBeDisabled()
		expect((await posters()).filter(Boolean)).toHaveLength(64)
		await page.evaluate(() => {
			localStorage.setItem('marvel-marathon.theme', 'light')
		})
		await page.reload()
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
		await page.locator('.poster-settings').scrollIntoViewIfNeeded()
		await page.screenshot({ path: 'test-results/poster-settings-light.png', fullPage: true })
		await page.locator('.tmdb-credit img').scrollIntoViewIfNeeded()
		await expect.poll(() => page.locator('.tmdb-credit img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
		await app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(760, 600))
		for (const target of ['/settings', '/movies/mcu-001', '/movies']) {
			await route(target)
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
		}
		expect(rendererErrors).toEqual([])
	} finally {
		await app?.close()
		await devServer?.close()
		if (path.dirname(path.resolve(directory)) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('marathon-posters-e2e-')) fs.rmSync(directory, { recursive: true, force: true })
	}
})
