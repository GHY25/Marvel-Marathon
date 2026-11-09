import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

test('real Electron: CRUD, rewatch ratings, filters, persistence, backup and responsive UI', async () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-e2e-'))
	const executablePath = process.env.MARATHON_EXECUTABLE
	const env: NodeJS.ProcessEnv = { ...process.env, MARATHON_TEST_MODE: '1', MARATHON_USER_DATA_DIR: directory, ELECTRON_MENU_ENABLED: 'false' }
	delete env.ELECTRON_RUN_AS_NODE
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
	let app: ElectronApplication | undefined
	let page: Page
	const rendererErrors: string[] = []
	async function launch() {
		app = await electron.launch({ executablePath, args: executablePath ? [] : ['.'], env })
		page = await app.firstWindow()
		page.on('pageerror', error => rendererErrors.push(error.message))
		await expect(page.getByRole('heading', { name: '나만의 MCU 정주행 기록' })).toBeVisible()
	}
	async function navigate(route: string) {
		const headings: Record<string, string> = {
			'/dashboard': '나만의 MCU 정주행 기록',
			'/movies': '영화와 시리즈, 하나의 우주',
			'/diary': '감상 일기',
			'/ranking': '나의 랭킹',
			'/statistics': '숫자로 보는 나의 취향',
			'/settings': '설정',
		}
		const heading =
			headings[route] ??
			(await page.evaluate(async movieId => {
				const result = await window.electronAPI.movies.list()
				if (!result.ok) throw new Error('Movie list failed')
				const movie = result.data.find(item => item.id === movieId)
				if (!movie) throw new Error(`Unknown movie: ${movieId}`)
				return movie.titleEn
			}, route.split('/').at(-1)))
		await page.evaluate(value => {
			window.location.hash = value
		}, route)
		await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible()
	}
	async function entries() {
		return page.evaluate(async () => {
			const result = await window.electronAPI.entries.list()
			if (!result.ok) throw new Error('Entry list failed')
			return result.data
		})
	}
	async function add(date: string, ticks: string, review: string) {
		await page.getByRole('button', { name: '감상 기록 추가', exact: true }).click()
		await page.getByLabel('시청 날짜', { exact: true }).fill(date)
		if (ticks) {
			const star = page.locator(`.rating-star[data-star="${Math.ceil(Number(ticks) / 2)}"]`)
			await star.click()
			if (Number(ticks) % 2 === 0) await star.click()
		}
		await page.getByLabel('한 줄 감상평', { exact: false }).fill(review)
		await page.getByRole('button', { name: '기록 저장', exact: true }).click()
		await expect(page.getByRole('dialog')).toHaveCount(0)
	}
	try {
		await launch()
		const security = await app!.evaluate(({ BrowserWindow }) => {
			const pref = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
			return { sandbox: pref.sandbox, contextIsolation: pref.contextIsolation, nodeIntegration: pref.nodeIntegration }
		})
		expect(security).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false })
		expect(await entries()).toHaveLength(0)
		await page.screenshot({ path: 'test-results/dashboard-empty.png', fullPage: true })
		await page
			.locator('nav')
			.getByRole('link', { name: /작품 목록/ })
			.click()
		await expect(page.locator('.movie-card')).toHaveCount(64)
		await page.getByRole('button', { name: 'Phase 1', exact: true }).click()
		await expect(page.locator('.movie-card')).toHaveCount(6)
		await page.getByLabel('작품 검색', { exact: true }).fill('iron')
		await expect(page.locator('.movie-card')).toHaveCount(2)
		await page.getByLabel('감상 상태', { exact: true }).selectOption('watched')
		await expect(page.getByText('조건에 맞는 작품이 없습니다.', { exact: true })).toBeVisible()
		await page.getByRole('button', { name: '필터 초기화' }).click()
		await expect(page.locator('.movie-card')).toHaveCount(64)
		await page.screenshot({ path: 'test-results/movies.png', fullPage: true })
		await page.locator('.movie-card').first().click()
		await page.getByRole('button', { name: '감상 기록 추가', exact: true }).click()
		await expect(page.getByRole('dialog').getByRole('combobox')).toHaveCount(0)
		await expect(page.getByRole('group', { name: '나의 별점 선택' })).toBeVisible()
		const selectedRating = page.getByTestId('selected-rating')
		for (let number = 1; number <= 5; number++) {
			const star = page.locator(`.rating-star[data-star="${number}"]`)
			await star.click()
			await expect(selectedRating).toHaveText(`${(number - 0.5).toFixed(1)} / 5`)
			await expect(star.locator('.star-fill')).toHaveAttribute('style', 'width: 50%;')
			await star.click()
			await expect(selectedRating).toHaveText(`${number.toFixed(1)} / 5`)
			await expect(star.locator('.star-fill')).toHaveAttribute('style', 'width: 100%;')
		}
		await page.locator('.rating-star[data-star="3"]').click()
		await expect(selectedRating).toHaveText('2.5 / 5')
		await expect(page.locator('.rating-star[data-star="4"] .star-fill')).toHaveAttribute('style', 'width: 0%;')
		await page.getByRole('button', { name: '평점 지우기', exact: true }).click()
		await expect(selectedRating).toHaveText('평점 미등록')
		await expect(page.getByRole('button', { name: '평점 지우기', exact: true })).toBeDisabled()
		const firstStar = page.locator('.rating-star[data-star="1"]')
		await firstStar.focus()
		await firstStar.press('Enter')
		await expect(selectedRating).toHaveText('0.5 / 5')
		await firstStar.press('Space')
		await expect(selectedRating).toHaveText('1.0 / 5')
		await firstStar.press('Enter')
		await expect(selectedRating).toHaveText('0.5 / 5')
		await page.locator('.rating-star[data-star="4"]').click()
		await page.getByRole('dialog').screenshot({ path: 'test-results/entry-form-dark.png' })
		await page.getByRole('button', { name: '취소', exact: true }).click()
		await add('2020-11-04', '8', '첫 정주행')
		await add('2020-11-05', '9', '다시 보니 더 좋다')
		await expect(page.locator('.entry-card')).toHaveCount(2)
		const record = page.locator('.entry-card').first()
		const dateBox = (await record.locator('time').boundingBox())!
		const ratingBox = (await record.locator('.entry-rating').boundingBox())!
		const reviewBox = (await record.locator('.entry-review-block').boundingBox())!
		expect(dateBox.y + dateBox.height).toBeLessThan(ratingBox.y)
		expect(ratingBox.y + ratingBox.height).toBeLessThan(reviewBox.y)
		await expect(page.locator('.toast')).toHaveCount(0)
		await page.locator('.watch-history').screenshot({ path: 'test-results/watch-history-dark.png' })
		await page.getByRole('button', { name: '밝은 테마로 전환', exact: true }).click()
		await page.locator('.watch-history').screenshot({ path: 'test-results/watch-history-light.png' })
		await page.getByRole('button', { name: '어두운 테마로 전환', exact: true }).click()
		await expect(page.locator('.rating-change')).toContainText('+0.5점')
		expect((await entries()).map(entry => entry.ratingTicks)).toEqual([9, 8])
		await app!.close()
		app = undefined
		await launch()
		expect(await entries()).toHaveLength(2)
		await navigate('/movies/mcu-004')
		await add('2020-11-05', '7', '토르의 첫 이야기')
		await navigate('/movies/mcu-001')
		await add('2020-11-06', '', '')
		await expect(page.locator('.detail-numbers')).toContainText('4.5')
		await navigate('/statistics')
		await expect(page.locator('.stat-card')).toContainText(['2', '4', '4.0', '2'])
		await navigate('/ranking')
		await expect(page.getByRole('heading', { name: 'Iron Man', exact: true }).first()).toBeVisible()
		await navigate('/diary')
		await expect(page.getByText('다시 보니 더 좋다', { exact: true })).toBeVisible()
		await navigate('/movies/mcu-001')
		await page.getByRole('button', { name: '2020.11.06 기록 삭제', exact: true }).click()
		await page.getByRole('button', { name: '취소', exact: true }).click()
		expect(await entries()).toHaveLength(4)
		await page.getByRole('button', { name: '2020.11.06 기록 삭제', exact: true }).click()
		await page.getByRole('button', { name: '기록 삭제', exact: true }).click()
		await expect(page.locator('.entry-card')).toHaveCount(2)
		await page.getByRole('button', { name: '2020.11.05 기록 수정', exact: true }).click()
		await expect(page.getByTestId('selected-rating')).toHaveText('4.5 / 5')
		await page.locator('.rating-star[data-star="5"]').click()
		await expect(page.getByTestId('selected-rating')).toHaveText('5.0 / 5')
		await page.getByLabel('한 줄 감상평', { exact: false }).fill('수정한 감상평')
		await page.getByRole('button', { name: '기록 저장', exact: true }).click()
		await expect(page.getByText('수정한 감상평', { exact: true })).toBeVisible()
		expect((await entries()).find(entry => entry.review === '수정한 감상평')?.ratingTicks).toBe(10)
		const expectedEntries = await entries()
		const backupPath = path.join(directory, 'watch-backup.json')
		await app!.evaluate(({ dialog }, filename) => {
			dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename })
			dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] })
			dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
		}, backupPath)
		await navigate('/settings')
		await page.getByRole('button', { name: /내보내기 \(\.json\)/ }).click()
		await expect.poll(() => fs.existsSync(backupPath)).toBe(true)
		expect(JSON.parse(fs.readFileSync(backupPath, 'utf8')).watchEntries).toEqual(expectedEntries)
		await page.evaluate(async () => {
			const listed = await window.electronAPI.entries.list()
			if (listed.ok) await window.electronAPI.entries.delete(listed.data[0].id)
		})
		expect(await entries()).toHaveLength(2)
		await page.getByRole('button', { name: /가져오기 \(\.json\)/ }).click()
		await expect.poll(async () => (await entries()).length).toBe(3)
		expect(await entries()).toEqual(expectedEntries)
		expect(fs.readdirSync(path.join(directory, 'recovery-backups'))).toHaveLength(1)
		await expect(page.locator('.toast')).toHaveText('3개의 감상 기록을 복원했어요.')
		await page.evaluate(async () => {
			const listed = await window.electronAPI.entries.list()
			if (!listed.ok) throw new Error('Entry list failed')
			const deleted = await window.electronAPI.entries.delete(listed.data[0].id)
			if (!deleted.ok) throw new Error('Entry delete failed')
		})
		await page.reload()
		await navigate('/settings')
		await expect(page.getByText('현재 2개의 감상 기록을 보관하고 있어요.', { exact: true })).toBeVisible()
		await app!.evaluate(({ ipcMain }) => {
			// Inject exactly one snapshot-read failure; keep the real restore and SQLite handlers.
			// Electron exposes no public getter for a registered invoke handler.
			const channel = 'marathon:entries:list'
			type Handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown
			const original = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers.get(channel)
			if (!original) throw new Error('Missing real entries:list handler for fault injection')
			ipcMain.removeHandler(channel)
			ipcMain.handle(channel, () => {
				ipcMain.removeHandler(channel)
				ipcMain.handle(channel, original)
				return { ok: false, error: { code: 'STORAGE_ERROR', message: 'Injected snapshot read failure' } }
			})
		})
		await page.getByRole('button', { name: /가져오기 \(\.json\)/ }).click()
		await expect(page.getByText('기록은 복원했지만 화면을 새로 불러오지 못했어요. 다시 시도를 눌러 주세요.', { exact: true })).toBeVisible()
		await expect(page.locator('.toast')).toHaveCount(0)
		expect(await entries()).toEqual(expectedEntries)
		await page.getByRole('button', { name: '다시 시도', exact: true }).click()
		await expect(page.getByRole('heading', { level: 1, name: '설정', exact: true })).toBeVisible()
		await expect(page.getByText('현재 3개의 감상 기록을 보관하고 있어요.', { exact: true })).toBeVisible()
		await expect(page.getByRole('button', { name: '다시 시도', exact: true })).toHaveCount(0)
		fs.writeFileSync(backupPath, '{invalid')
		await page.getByRole('button', { name: /가져오기 \(\.json\)/ }).click()
		await expect(page.getByRole('alert')).toContainText('손상된 백업')
		expect(await entries()).toEqual(expectedEntries)
		const invalid = await page.evaluate(() => window.electronAPI.entries.create({ movieId: 'mcu-001', watchDate: '2026-02-30', ratingTicks: 0, review: '' }))
		expect(invalid.ok).toBe(false)
		await navigate('/dashboard')
		await page.screenshot({ path: 'test-results/dashboard-recorded.png', fullPage: true })
		for (const [width, height] of [
			[1000, 800],
			[760, 600],
		]) {
			await app!.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size.width, size.height), { width, height })
			for (const route of ['/dashboard', '/movies', '/movies/mcu-025', '/diary', '/ranking', '/statistics', '/settings']) {
				await navigate(route)
				await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
				await expect.poll(() => page.locator('.main-scroll').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
				if (route === '/ranking') {
					const metadata = page.locator('.ranking-row').first().locator('.ranking-watches')
					await expect(metadata).toBeVisible()
					await expect(metadata).toContainText('2회 감상')
					await expect(metadata.locator('time')).toHaveText('2020.11.05 평가')
				}
			}
			await page.screenshot({ path: `test-results/settings-${width}.png`, fullPage: true })
		}
		await page.evaluate(async () => {
			const listed = await window.electronAPI.entries.list()
			if (!listed.ok) throw new Error('Entry list failed')
			for (const entry of listed.data) {
				const deleted = await window.electronAPI.entries.delete(entry.id)
				if (!deleted.ok) throw new Error('Entry delete failed')
			}
			// Ten distinct Phase 3 films, 87 half-star ticks: exact intended mean 4.35.
			for (let index = 0; index < 10; index++) {
				const created = await window.electronAPI.entries.create({
					movieId: `mcu-${String(index + 13).padStart(3, '0')}`,
					watchDate: '2020-11-04',
					ratingTicks: index < 7 ? 9 : 8,
					review: '평균 별점 반올림 검증',
				})
				if (!created.ok) throw new Error('Rounding fixture create failed')
			}
		})
		const ratedEntries = await entries()
		expect(new Set(ratedEntries.map(entry => entry.movieId)).size).toBe(10)
		expect(ratedEntries.reduce((sum, entry) => sum + entry.ratingTicks!, 0)).toBe(87)
		await page.reload()
		await navigate('/statistics')
		await expect(page.locator('.stat-card').filter({ hasText: '나의 평균 별점' }).locator('.stat-value')).toHaveText('4.4/ 5')
		await expect(page.locator('.phase-item').filter({ hasText: 'Phase 3' }).locator('.phase-average strong')).toHaveText('4.4')
		expect(rendererErrors).toEqual([])
	} finally {
		await app?.close()
		await devServer?.close()
		// Delete only this test's resolved temporary directory, never application userData.
		if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('marathon-e2e-')) fs.rmSync(directory, { recursive: true, force: true })
	}
})
