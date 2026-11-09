import { test, expect, _electron as electron, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

test('the seamless sky enters real fullscreen and restores the dashboard', async () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-fullscreen-'))
	const executablePath = process.env.MARATHON_EXECUTABLE
	const env: NodeJS.ProcessEnv = { ...process.env, MARATHON_TEST_MODE: '1', MARATHON_USER_DATA_DIR: directory, ELECTRON_MENU_ENABLED: 'false' }
	delete env.ELECTRON_RUN_AS_NODE
	let app: ElectronApplication | undefined
	let devServer: import('vite').ViteDevServer | undefined
	let page: Page
	const errors: string[] = []
	async function launch() {
		app = await electron.launch({ executablePath, args: executablePath ? [] : ['.'], env })
		page = await app.firstWindow()
		page.on('pageerror', error => errors.push(error.message))
		await page.emulateMedia({ reducedMotion: 'reduce' })
		await expect(page.getByRole('heading', { level: 1, name: '나만의 MCU 정주행 기록', exact: true })).toBeVisible()
		await expect.poll(() => app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(true)
	}
	async function camera(viewport: Locator) {
		return viewport.evaluate(element => ({ x: Number(element.getAttribute('data-camera-x')), y: Number(element.getAttribute('data-camera-y')), scale: Number(element.getAttribute('data-camera-scale')) }))
	}
	async function windowBounds() {
		return app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())
	}
	async function enterFullscreen() {
		await page.getByRole('button', { name: '우주 전체 화면', exact: true }).click()
		await expect.poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute('data-testid'))).toBe('universe-atlas')
		await expect.poll(() => app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(true)
		await expect(page.getByRole('button', { name: '전체 화면 종료', exact: true })).toBeVisible()
		await expect
			.poll(() =>
				page.getByTestId('universe-atlas').evaluate(element => {
					const bounds = element.getBoundingClientRect()
					return Math.abs(bounds.x) < 1 && Math.abs(bounds.y) < 1 && Math.abs(bounds.width - window.innerWidth) < 1 && Math.abs(bounds.height - window.innerHeight) < 1
				})
			)
			.toBe(true)
		// The top layer must show the atlas across the screen, not the sidebar or dashboard.
		expect(
			await page.evaluate(() =>
				[
					[5, 5],
					[innerWidth - 5, innerHeight - 5],
					[innerWidth / 2, innerHeight / 2],
				].every(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-testid="universe-atlas"]'))
			)
		).toBe(true)
		await expect(page.getByTestId('movie-star')).toHaveCount(38)
	}
	async function assertRestored(bounds: { x: number; y: number; width: number; height: number }) {
		await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true)
		await expect.poll(() => app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(false)
		await expect.poll(windowBounds).toEqual(bounds)
		await expect(page.getByRole('button', { name: '우주 전체 화면', exact: true })).toBeVisible()
		await expect(page.getByTestId('movie-star')).toHaveCount(38)
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
		await app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 900))
		await expect
			.poll(() =>
				app!.evaluate(({ BrowserWindow }) => {
					const { width, height } = BrowserWindow.getAllWindows()[0].getNormalBounds()
					return { width, height }
				})
			)
			.toEqual({ width: 1280, height: 900 })
		const normalBounds = await windowBounds()
		// Deny the first native request in a fresh session. An earlier successful
		// fullscreen grant can be cached, hiding the failure path in later requests.
		await app!.evaluate(({ BrowserWindow }) => {
			const session = BrowserWindow.getAllWindows()[0].webContents.session
			session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
			session.setPermissionCheckHandler(() => false)
		})
		// Chromium can cache the fullscreen permission when a document is created.
		// Load a new document under the denied policy before requesting fullscreen.
		await page.reload()
		await expect(page.getByRole('heading', { level: 1, name: '나만의 MCU 정주행 기록', exact: true })).toBeVisible()
		await page.getByRole('button', { name: '우주 전체 화면', exact: true }).click()
		await expect(page.getByRole('alert')).toContainText('전체 화면으로 전환하지 못했어요.')
		await assertRestored(normalBounds)
		await expect(page.getByRole('button', { name: '우주 전체 화면', exact: true })).toBeEnabled()
		// Restart restores the real application handlers without reproducing their policy here.
		await app!.close()
		app = undefined
		await launch()
		await assertRestored(normalBounds)
		await expect(page.getByRole('alert')).toHaveCount(0)
		const atlas = page.getByTestId('universe-atlas')
		const viewport = page.getByTestId('universe-viewport')
		await page.getByRole('button', { name: '전체 우주 보기', exact: true }).click()
		await atlas.screenshot({ path: 'test-results/universe-seamless-dark.png', animations: 'disabled' })

		await enterFullscreen()
		await page.getByRole('button', { name: '전체 우주 보기', exact: true }).click()
		await expect(page.getByRole('button', { name: '우주 축소', exact: true })).toBeDisabled()
		await page.screenshot({ path: 'test-results/universe-fullscreen-dark.png', animations: 'disabled' })
		const beforeZoom = await camera(viewport)
		await page.getByRole('button', { name: '우주 확대', exact: true }).click({ clickCount: 3, delay: 100 })
		await expect.poll(async () => (await camera(viewport)).scale).toBeGreaterThan(beforeZoom.scale)
		const blank = await viewport.evaluate(element => {
			const frame = element.getBoundingClientRect()
			for (const [horizontal, vertical] of [
				[0.47, 0.5],
				[0.4, 0.6],
				[0.6, 0.4],
			]) {
				const point = { x: frame.left + frame.width * horizontal, y: frame.top + frame.height * vertical }
				if (!document.elementFromPoint(point.x, point.y)?.closest('a, button')) return point
			}
			throw new Error('No empty sky area available for dragging')
		})
		const beforePan = await camera(viewport)
		await page.mouse.move(blank.x, blank.y)
		await page.mouse.down()
		await page.mouse.move(blank.x - 75, blank.y - 45, { steps: 8 })
		await page.mouse.up()
		const afterPan = await camera(viewport)
		expect(Math.hypot(afterPan.x - beforePan.x, afterPan.y - beforePan.y)).toBeGreaterThan(25)
		await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true)
		await page.getByRole('button', { name: '전체 화면 종료', exact: true }).click()
		await assertRestored(normalBounds)

		await page.getByRole('button', { name: '밝은 테마로 전환', exact: true }).click()
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
		await page.getByRole('button', { name: '전체 우주 보기', exact: true }).click()
		await atlas.screenshot({ path: 'test-results/universe-seamless-light.png', animations: 'disabled' })
		await enterFullscreen()
		await page.getByRole('button', { name: '전체 우주 보기', exact: true }).click()
		await page.screenshot({ path: 'test-results/universe-fullscreen-light.png', animations: 'disabled' })
		await page.keyboard.press('Escape')
		await assertRestored(normalBounds)

		await enterFullscreen()
		await page.getByRole('button', { name: '전체 우주 보기', exact: true }).click()
		await page.locator('[data-testid="movie-star"][data-movie-id="mcu-001"]').click()
		await expect(page.getByRole('heading', { level: 1, name: 'Iron Man', exact: true })).toBeVisible()
		await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true)
		await expect.poll(() => app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(false)
		await expect.poll(windowBounds).toEqual(normalBounds)
		await page.getByRole('button', { name: '감상 기록 추가', exact: true }).click()
		await expect(page.getByRole('dialog')).toBeVisible()
		await page.getByRole('button', { name: '취소', exact: true }).click()
		await page.evaluate(() => {
			window.location.hash = '/dashboard'
		})
		await expect(page.getByRole('heading', { level: 1, name: '나만의 MCU 정주행 기록', exact: true })).toBeVisible()
		await enterFullscreen()
		// Closing while fullscreen must not save the monitor size as the normal window.
		await app!.close()
		app = undefined
		await launch()
		await assertRestored(normalBounds)
		await expect(page.getByRole('alert')).toHaveCount(0)
		expect(errors).toEqual([])
	} finally {
		await app?.close()
		await devServer?.close()
		if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('marathon-fullscreen-')) fs.rmSync(directory, { recursive: true, force: true })
	}
})
