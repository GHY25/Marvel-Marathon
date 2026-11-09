import { test, expect, _electron as electron, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

test('the sky pans and zooms without accidental movie navigation', async () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-navigation-'))
	const executablePath = process.env.MARATHON_EXECUTABLE
	const env: NodeJS.ProcessEnv = { ...process.env, MARATHON_TEST_MODE: '1', MARATHON_USER_DATA_DIR: directory, ELECTRON_MENU_ENABLED: 'false' }
	delete env.ELECTRON_RUN_AS_NODE
	let app: ElectronApplication | undefined
	let devServer: import('vite').ViteDevServer | undefined
	let page: Page
	const errors: string[] = []
	async function camera(viewport: Locator) {
		return viewport.evaluate(element => ({ x: Number(element.getAttribute('data-camera-x')), y: Number(element.getAttribute('data-camera-y')), scale: Number(element.getAttribute('data-camera-scale')) }))
	}
	async function visibleCenter(locator: Locator, viewport: Locator) {
		return locator.evaluate(
			(element, viewSelector) => {
				const bounds = element.getBoundingClientRect()
				const frame = document.querySelector(viewSelector)!.getBoundingClientRect()
				const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
				return center.x > frame.left + 12 && center.x < frame.right - 12 && center.y > frame.top + 12 && center.y < frame.bottom - 12
			},
			`[data-testid="${await viewport.getAttribute('data-testid')}"]`
		)
	}
	async function blankSky(viewport: Locator) {
		return viewport.evaluate(element => {
			const bounds = element.getBoundingClientRect()
			for (const [horizontal, vertical] of [
				[0.45, 0.6],
				[0.55, 0.45],
				[0.35, 0.65],
			]) {
				const point = { x: bounds.left + bounds.width * horizontal, y: bounds.top + bounds.height * vertical }
				if (!document.elementFromPoint(point.x, point.y)?.closest('a, button')) return point
			}
			throw new Error('No empty sky area available for dragging')
		})
	}
	async function waitForCameraRest(viewport: Locator) {
		await viewport.evaluate(
			element =>
				new Promise<void>((resolve, reject) => {
					let previous = ''
					let stableFrames = 0
					const deadline = performance.now() + 3000
					const frame = () => {
						const current = ['x', 'y', 'scale'].map(axis => element.getAttribute(`data-camera-${axis}`)).join(',')
						stableFrames = current === previous ? stableFrames + 1 : 0
						previous = current
						if (stableFrames >= 8) resolve()
						else if (performance.now() > deadline) reject(new Error('Camera did not come to rest'))
						else requestAnimationFrame(frame)
					}
					requestAnimationFrame(frame)
				})
		)
	}
	async function dashboard() {
		await page.evaluate(() => {
			window.location.hash = '/dashboard'
		})
		await expect(page.getByRole('heading', { level: 1, name: '나만의 MCU 정주행 기록', exact: true })).toBeVisible()
		await page.getByTestId('universe-viewport').scrollIntoViewIfNeeded()
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
		app = await electron.launch({ executablePath, args: executablePath ? [] : ['.'], env })
		page = await app.firstWindow()
		page.on('pageerror', error => errors.push(error.message))
		await expect(page.getByRole('heading', { level: 1, name: '나만의 MCU 정주행 기록', exact: true })).toBeVisible()
		await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 1000))
		// Reduced motion gives deterministic endpoints; normal animation is checked below.
		await page.emulateMedia({ reducedMotion: 'reduce' })
		const viewport = page.getByTestId('universe-viewport')
		await viewport.scrollIntoViewIfNeeded()
		await expect(page.getByTestId('movie-star')).toHaveCount(38)
		const blank = await blankSky(viewport)
		const beforePan = await camera(viewport)
		const pageScroll = await page.locator('.main-scroll').evaluate(element => element.scrollTop)
		await page.mouse.move(blank.x, blank.y)
		await page.mouse.down()
		await page.mouse.move(blank.x + 85, blank.y + 45, { steps: 8 })
		await expect(viewport).toHaveClass(/is-dragging/)
		await page.mouse.up()
		await expect(viewport).not.toHaveClass(/is-dragging/)
		const afterPan = await camera(viewport)
		expect(afterPan.x - beforePan.x).toBeGreaterThan(30)
		expect(afterPan.y - beforePan.y).toBeGreaterThan(20)
		await expect(viewport).toBeFocused()
		expect(await page.locator('.main-scroll').evaluate(element => element.scrollTop)).toBe(pageScroll)

		const viewportBox = (await viewport.boundingBox())!
		// Chromium wheel coordinates use integral client pixels.
		const pointer = { x: Math.round(viewportBox.x + viewportBox.width * 0.47), y: Math.round(viewportBox.y + viewportBox.height * 0.5) }
		const anchor = { x: pointer.x - viewportBox.x, y: pointer.y - viewportBox.y }
		const beforeZoom = await camera(viewport)
		const beforePoint = { x: (anchor.x - beforeZoom.x) / beforeZoom.scale, y: (anchor.y - beforeZoom.y) / beforeZoom.scale }
		await page.mouse.move(pointer.x, pointer.y)
		await page.mouse.wheel(0, -250)
		await expect.poll(async () => (await camera(viewport)).scale).toBeGreaterThan(beforeZoom.scale)
		const afterZoom = await camera(viewport)
		expect(Math.abs((anchor.x - afterZoom.x) / afterZoom.scale - beforePoint.x)).toBeLessThan(0.6)
		expect(Math.abs((anchor.y - afterZoom.y) / afterZoom.scale - beforePoint.y)).toBeLessThan(0.6)
		expect(await page.locator('.main-scroll').evaluate(element => element.scrollTop)).toBe(pageScroll)

		await page.locator('[data-testid="phase-token"][data-phase="1"]').click()
		await viewport.scrollIntoViewIfNeeded()
		await expect(page.getByTestId('movie-star')).toHaveCount(38)
		const ironMan = page.locator('[data-testid="movie-star"][data-movie-id="mcu-001"]')
		await expect.poll(() => visibleCenter(ironMan, viewport)).toBe(true)
		// Place a star inside the keyboard-reveal margin. Pointer focus must not
		// unexpectedly recenter it before the drag has started.
		const edgeFrame = (await viewport.boundingBox())!
		const initialStarBox = (await ironMan.boundingBox())!
		const shiftToEdge = 25 - (initialStarBox.x + initialStarBox.width / 2 - edgeFrame.x)
		const edgeBlank = await blankSky(viewport)
		await page.mouse.move(edgeBlank.x, edgeBlank.y)
		await page.mouse.down()
		await page.mouse.move(edgeBlank.x + shiftToEdge, edgeBlank.y, { steps: 8 })
		await page.mouse.up()
		const starBox = (await ironMan.boundingBox())!
		expect(starBox.x + starBox.width / 2 - edgeFrame.x).toBeCloseTo(25, 0)
		const beforeStarDrag = await camera(viewport)
		await page.mouse.move(starBox.x + starBox.width / 2, starBox.y + starBox.height / 2)
		await page.mouse.down()
		expect(await camera(viewport)).toEqual(beforeStarDrag)
		await page.mouse.move(starBox.x + starBox.width / 2 + 100, starBox.y + starBox.height / 2 + 50, { steps: 9 })
		await page.mouse.up()
		await expect(page).toHaveURL(/#\/dashboard$/)
		expect((await camera(viewport)).x - beforeStarDrag.x).toBeGreaterThan(30)
		// The next genuine click is not swallowed by the preceding drag's click guard.
		await ironMan.click()
		await expect(page.getByRole('heading', { level: 1, name: 'Iron Man', exact: true })).toBeVisible()

		await dashboard()
		await viewport.focus()
		const beforeKeys = await camera(viewport)
		await viewport.press('=')
		await expect.poll(async () => (await camera(viewport)).scale).toBeGreaterThan(beforeKeys.scale)
		const beforeArrow = await camera(viewport)
		await viewport.press('ArrowRight')
		expect((await camera(viewport)).x).toBeLessThan(beforeArrow.x - 20)
		await viewport.press('Home')
		const overview = await camera(viewport)
		expect(overview.scale).toBeLessThan(beforeKeys.scale)
		await expect(page.getByRole('button', { name: '우주 축소', exact: true })).toBeDisabled()
		await viewport.press('-')
		expect((await camera(viewport)).scale).toBe(overview.scale)
		await page.getByRole('button', { name: '우주 확대', exact: true }).click()
		expect((await camera(viewport)).scale).toBeGreaterThan(overview.scale)
		await page.getByRole('button', { name: '우주 축소', exact: true }).click()
		expect((await camera(viewport)).scale).toBeCloseTo(overview.scale, 3)

		await page.locator('[data-testid="phase-token"][data-phase="1"]').click()
		await viewport.scrollIntoViewIfNeeded()
		const finalMovie = page.locator('[data-testid="movie-star"][data-movie-id="mcu-038"]')
		const beforeFocus = await camera(viewport)
		await finalMovie.focus()
		await expect.poll(() => visibleCenter(finalMovie, viewport)).toBe(true)
		expect((await camera(viewport)).x).not.toBe(beforeFocus.x)
		expect(await viewport.evaluate(element => ({ left: element.scrollLeft, top: element.scrollTop }))).toEqual({ left: 0, top: 0 })
		await expect(page).toHaveURL(/#\/dashboard$/)
		await finalMovie.press('Enter')
		await expect(page.getByRole('heading', { level: 1, name: 'Spider-Man: Brand New Day', exact: true })).toBeVisible()

		await dashboard()
		await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(760, 600))
		await page.locator('[data-testid="phase-token"][data-phase="3"]').click()
		await viewport.scrollIntoViewIfNeeded()
		await expect(page.getByTestId('movie-star')).toHaveCount(38)
		for (const number of [13, 17, 23]) {
			const star = page.locator(`[data-testid="movie-star"][data-movie-id="mcu-${number.toString().padStart(3, '0')}"]`)
			await expect.poll(() => visibleCenter(star, viewport)).toBe(true)
		}
		await page.getByRole('button', { name: '전체 우주 보기', exact: true }).click()
		await expect(page.getByRole('button', { name: '우주 축소', exact: true })).toBeDisabled()
		await expect.poll(() => page.locator('.main-scroll').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)

		await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 1000))
		await page.emulateMedia({ reducedMotion: 'no-preference' })
		const beforeFlight = await camera(viewport)
		// Observe actual intermediate frames, rather than only the final phase position.
		const flightFrames = viewport.evaluate(
			element =>
				new Promise<string[]>(resolve => {
					const samples = new Set<string>()
					const deadline = performance.now() + 1000
					const frame = () => {
						samples.add(`${element.getAttribute('data-camera-x')},${element.getAttribute('data-camera-y')}`)
						if (performance.now() >= deadline) resolve([...samples])
						else requestAnimationFrame(frame)
					}
					requestAnimationFrame(frame)
				})
		)
		await page.locator('[data-testid="phase-token"][data-phase="3"]').click()
		expect((await flightFrames).length).toBeGreaterThan(5)
		await waitForCameraRest(viewport)
		expect((await camera(viewport)).x).not.toBe(beforeFlight.x)
		await viewport.scrollIntoViewIfNeeded()
		await expect.poll(() => visibleCenter(page.locator('[data-testid="movie-star"][data-movie-id="mcu-017"]'), viewport)).toBe(true)

		const coastBlank = await blankSky(viewport)
		await page.mouse.move(coastBlank.x, coastBlank.y)
		await page.mouse.down()
		await page.mouse.move(coastBlank.x + 55, coastBlank.y + 25, { steps: 5 })
		await page.mouse.up()
		const releaseCamera = await camera(viewport)
		await expect.poll(async () => (await camera(viewport)).x).toBeGreaterThan(releaseCamera.x + 1)
		await waitForCameraRest(viewport)
		await expect(viewport).not.toHaveClass(/is-dragging/)
		await page.locator('[data-testid="phase-token"][data-phase="3"]').click()
		await waitForCameraRest(viewport)
		await page.locator('.universe-atlas').scrollIntoViewIfNeeded()
		await page.screenshot({ path: 'test-results/universe-explore.png' })
		await page.emulateMedia({ reducedMotion: 'reduce' })
		expect(errors).toEqual([])
	} finally {
		await app?.close()
		await devServer?.close()
		if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('marathon-navigation-')) fs.rmSync(directory, { recursive: true, force: true })
	}
})
