import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

test('a personal universe follows real watch history, and both themes survive restart', async () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-universe-'))
	const executablePath = process.env.MARATHON_EXECUTABLE
	const env: NodeJS.ProcessEnv = { ...process.env, MARATHON_TEST_MODE: '1', MARATHON_USER_DATA_DIR: directory, ELECTRON_MENU_ENABLED: 'false' }
	delete env.ELECTRON_RUN_AS_NODE
	let devServer: import('vite').ViteDevServer | undefined
	let app: ElectronApplication | undefined
	let page: Page
	const rendererErrors: string[] = []
	const routeHeadings: Record<string, string> = {
		'/dashboard': '나만의 MCU 정주행 기록',
		'/movies': '38편의 영화, 하나의 우주',
		'/movies/mcu-001': 'Iron Man',
		'/diary': '감상 일기',
		'/ranking': '나의 랭킹',
		'/statistics': '숫자로 보는 나의 취향',
		'/settings': '설정',
	}
	async function launch() {
		app = await electron.launch({ executablePath, args: executablePath ? [] : ['.'], env })
		page = await app.firstWindow()
		await page.emulateMedia({ reducedMotion: 'reduce' })
		page.on('pageerror', error => rendererErrors.push(error.message))
		await expect(page.getByRole('heading', { level: 1, name: routeHeadings['/dashboard'], exact: true })).toBeVisible()
	}
	async function navigate(route: string) {
		await page.evaluate(value => {
			window.location.hash = value
		}, route)
		await expect(page.getByRole('heading', { level: 1, name: routeHeadings[route], exact: true })).toBeVisible()
	}
	async function refreshUniverse() {
		await page.reload()
		await navigate('/dashboard')
		await expect(page.getByTestId('universe-map')).toBeVisible()
	}
	async function createRecords(movieIds: string[]) {
		await page.evaluate(async ids => {
			for (const movieId of ids) {
				const result = await window.electronAPI.entries.create({ movieId, watchDate: '2020-11-05', ratingTicks: null, review: '별자리 검증용 감상 기록' })
				if (!result.ok) throw new Error(result.error.message)
			}
		}, movieIds)
	}
	async function assertLitStars(count: number) {
		await expect(page.getByTestId('movie-star')).toHaveCount(38)
		await expect(page.locator('[data-testid="movie-star"][data-watched="true"]')).toHaveCount(count)
		await expect(page.locator('[data-testid="movie-star"][data-watched="false"]')).toHaveCount(38 - count)
	}
	async function contrast(foregroundSelector: string, backgroundSelector: string) {
		return page.evaluate(
			({ foregroundSelector, backgroundSelector }) => {
				const foreground = document.querySelector(foregroundSelector)
				const background = document.querySelector(backgroundSelector)
				if (!foreground || !background) throw new Error('Missing contrast sample')
				function luminance(color: string) {
					const channels = color
						.match(/[\d.]+/g)
						?.slice(0, 3)
						.map(Number)
					if (!channels || channels.length !== 3) throw new Error(`Unsupported color: ${color}`)
					const linear = channels.map(channel => {
						const value = channel / 255
						return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
					})
					return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
				}
				const front = luminance(getComputedStyle(foreground).color)
				const back = luminance(getComputedStyle(background).backgroundColor)
				return (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05)
			},
			{ foregroundSelector, backgroundSelector }
		)
	}
	try {
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
		await launch()
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
		await assertLitStars(0)
		await expect(page.getByTestId('phase-token')).toHaveCount(6)
		await expect(page.locator('[data-testid="phase-token"][data-complete="true"]')).toHaveCount(0)
		const phaseOne = page.locator('[data-testid="phase-token"][data-phase="1"]')
		await phaseOne.click()
		await expect(phaseOne).toHaveAttribute('aria-pressed', 'true')
		// A Phase now moves the camera through one continuous world; all stars remain.
		await expect(page.getByTestId('movie-star')).toHaveCount(38)
		await page.getByRole('button', { name: '전체 우주 보기', exact: true }).click()
		await assertLitStars(0)

		// A star is a real movie link, reachable with the keyboard, not a decorative dot.
		const ironMan = page.locator('[data-testid="movie-star"][data-movie-id="mcu-001"]')
		await ironMan.focus()
		await ironMan.press('Enter')
		await expect(page.getByRole('heading', { level: 1, name: 'Iron Man', exact: true })).toBeVisible()
		await page.getByRole('button', { name: '감상 기록 추가', exact: true }).click()
		await page.getByLabel('시청 날짜', { exact: true }).fill('2020-11-04')
		await page.getByRole('button', { name: '기록 저장', exact: true }).click()
		await expect(page.getByRole('dialog')).toHaveCount(0)
		await navigate('/dashboard')
		await assertLitStars(1)
		// Unrated viewing counts; a rewatch must never create a second star.
		await createRecords(['mcu-001'])
		await refreshUniverse()
		await assertLitStars(1)
		await createRecords(['mcu-002', 'mcu-003', 'mcu-004', 'mcu-005', 'mcu-006'])
		await refreshUniverse()
		await assertLitStars(6)
		await expect(phaseOne).toHaveAttribute('data-complete', 'true')
		await expect(page.locator('[data-testid="phase-token"][data-complete="true"]')).toHaveCount(1)
		await app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1200))
		await page.getByRole('button', { name: '전체 우주 보기', exact: true }).click()
		await page.screenshot({ path: 'test-results/universe-dark.png', fullPage: true, animations: 'disabled' })

		const backupPath = path.join(directory, 'six-stars.json')
		await app!.evaluate(({ dialog }, filename) => {
			dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename })
			dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] })
			dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
		}, backupPath)
		await page.evaluate(async () => {
			const result = await window.electronAPI.backup.export()
			if (!result.ok || result.data.status !== 'saved') throw new Error('Universe backup failed')
		})
		expect(JSON.parse(fs.readFileSync(backupPath, 'utf8')).watchEntries).toHaveLength(7)
		const ironManEntries = await page.evaluate(async () => {
			const result = await window.electronAPI.entries.list()
			if (!result.ok) throw new Error(result.error.message)
			return result.data.filter(entry => entry.movieId === 'mcu-001').map(entry => entry.id)
		})
		for (const [index, id] of ironManEntries.entries()) {
			await page.evaluate(async entryId => {
				const result = await window.electronAPI.entries.delete(entryId)
				if (!result.ok) throw new Error(result.error.message)
			}, id)
			await refreshUniverse()
			await assertLitStars(index === 0 ? 6 : 5)
		}
		await expect(phaseOne).toHaveAttribute('data-complete', 'false')
		await navigate('/settings')
		await page.getByRole('button', { name: /가져오기 \(\.json\)/ }).click()
		await expect(page.locator('.toast')).toHaveText('7개의 감상 기록을 복원했어요.')
		await navigate('/dashboard')
		await assertLitStars(6)
		await expect(phaseOne).toHaveAttribute('data-complete', 'true')
		await createRecords(Array.from({ length: 32 }, (_, index) => `mcu-${String(index + 7).padStart(3, '0')}`))
		await refreshUniverse()
		await assertLitStars(38)
		await expect(page.locator('[data-testid="phase-token"][data-complete="true"]')).toHaveCount(6)
		await page.getByRole('button', { name: '전체 우주 보기', exact: true }).click()
		await page.screenshot({ path: 'test-results/universe-complete.png', fullPage: true, animations: 'disabled' })
		// Importing a partial collection must also turn completed stars and phases back off.
		await navigate('/settings')
		await page.getByRole('button', { name: /가져오기 \(\.json\)/ }).click()
		await expect(page.locator('.toast')).toHaveText('7개의 감상 기록을 복원했어요.')
		await navigate('/dashboard')
		await assertLitStars(6)
		await expect(page.locator('[data-testid="phase-token"][data-complete="true"]')).toHaveCount(1)

		await page.getByRole('button', { name: '밝은 테마로 전환', exact: true }).click()
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
		expect(await contrast('h1', 'html')).toBeGreaterThanOrEqual(4.5)
		await expect(page.locator('.toast')).toHaveCount(0)
		await page.getByRole('button', { name: '전체 우주 보기', exact: true }).click()
		await page.screenshot({ path: 'test-results/universe-light.png', fullPage: true, animations: 'disabled' })
		await navigate('/settings')
		await expect(page.getByRole('button', { name: '밝은 테마', exact: true })).toHaveAttribute('aria-pressed', 'true')
		await page.screenshot({ path: 'test-results/settings-light.png', fullPage: true, animations: 'disabled' })
		await page.getByRole('button', { name: '어두운 테마', exact: true }).click()
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
		await page.getByRole('button', { name: '밝은 테마', exact: true }).click()
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
		await app!.close()
		app = undefined
		await launch()
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
		await assertLitStars(6)
		await navigate('/movies/mcu-001')
		await page.getByRole('button', { name: '감상 기록 추가', exact: true }).click()
		await expect(page.getByRole('dialog')).toBeVisible()
		expect(await contrast('.modal-heading h2', '.modal')).toBeGreaterThanOrEqual(4.5)
		expect(await contrast('#watch-date', '#watch-date')).toBeGreaterThanOrEqual(4.5)
		await page.locator('.rating-star[data-star="3"]').click()
		await expect(page.getByTestId('selected-rating')).toHaveText('2.5 / 5')
		await page.getByRole('dialog').screenshot({ path: 'test-results/entry-form-light.png', animations: 'disabled' })
		await page.getByRole('button', { name: '취소', exact: true }).click()
		for (const [width, height] of [
			[1000, 800],
			[760, 600],
		]) {
			await app!.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size.width, size.height), { width, height })
			for (const route of Object.keys(routeHeadings)) {
				await navigate(route)
				await expect.poll(() => page.locator('.main-scroll').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
			}
			await navigate('/dashboard')
			await page.getByRole('button', { name: '어두운 테마로 전환', exact: true }).click()
			await expect.poll(() => page.locator('.main-scroll').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
			await page.getByRole('button', { name: '밝은 테마로 전환', exact: true }).click()
			if (width === 760) {
				await page.locator('[data-testid="phase-token"][data-phase="3"]').click()
				await page.locator('.universe-atlas').screenshot({ path: 'test-results/universe-phase3-760.png', animations: 'disabled' })
				await page.getByRole('button', { name: '전체 우주 보기', exact: true }).click()
			}
		}
		expect(rendererErrors).toEqual([])
	} finally {
		await app?.close()
		await devServer?.close()
		// Clean up only the temporary directory created by this test.
		if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('marathon-universe-')) fs.rmSync(directory, { recursive: true, force: true })
	}
})
