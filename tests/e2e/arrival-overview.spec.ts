import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

test('every sky visit starts at 25 percent and the overview still fits when resizing', async () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-overview-'))
	const env = { ...process.env, MARATHON_TEST_MODE: '1', MARATHON_USER_DATA_DIR: directory, ELECTRON_MENU_ENABLED: 'false' }
	delete env.ELECTRON_RUN_AS_NODE
	const executablePath = process.env.MARATHON_EXECUTABLE
	let app: ElectronApplication | undefined
	let page: Page
	const errors: string[] = []
	async function returnToSky() {
		await page.getByRole('navigation', { name: '메인 메뉴' }).getByRole('link', { name: '나의 우주', exact: true }).click()
		await expect(page.getByTestId('universe-map')).toBeVisible()
	}
	async function expectOverview(count = 64) {
		await expect(page.getByTestId('movie-star')).toHaveCount(count)
		await expect(page.locator('[data-testid="phase-token"][aria-pressed="true"]')).toHaveCount(0)
		await expect(page.getByRole('button', { name: '우주 축소', exact: true })).toBeDisabled()
		await expect
			.poll(() =>
				page.getByTestId('movie-star').evaluateAll(stars =>
					stars.every(star => {
						const box = star.getBoundingClientRect()
						const viewport = star.closest('.universe-canvas')!.getBoundingClientRect()
						return box.left >= viewport.left + 24 && box.right <= viewport.right - 24 && box.top >= viewport.top + 24 && box.bottom <= viewport.bottom - 24
					})
				)
			)
			.toBe(true)
	}
	async function expectDefaultZoom(count = 64) {
		await expect(page.getByTestId('movie-star')).toHaveCount(count)
		await expect(page.locator('[data-testid="phase-token"][aria-pressed="true"]')).toHaveCount(0)
		await expect(page.getByTestId('universe-viewport')).toHaveAttribute('data-camera-scale', '0.2500')
		await expect(page.getByLabel('우주 지도 확대율', { exact: true })).toHaveText('25%')
	}
	try {
		app = await electron.launch({ executablePath, args: executablePath ? [] : ['.'], env })
		page = await app.firstWindow()
		page.on('pageerror', error => errors.push(error.message))
		await page.emulateMedia({ reducedMotion: 'reduce' })
		await expectDefaultZoom()
		await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1640, 1000))
		const nextStar = page.getByTestId('universe-next')
		await expect(nextStar).toHaveCount(1)
		await expect(nextStar).toHaveAttribute('href', '#/movies/mcu-001')
		await expect(page.getByTestId('universe-viewport')).toHaveAttribute('data-camera-y', '35.000')
		await expect.poll(() => page.getByTestId('universe-viewport').evaluate(element => element.clientHeight)).toBe(600)
		await expect
			.poll(() =>
				page.getByTestId('movie-star').evaluateAll(stars =>
					stars.every(star => {
						const box = star.getBoundingClientRect()
						const viewport = star.closest('.universe-canvas')!.getBoundingClientRect()
						return box.left > viewport.left + 24 && box.right < viewport.right - 24 && box.top > viewport.top + 24 && box.bottom < viewport.bottom - 24
					})
				)
			)
			.toBe(true)
		await page.locator('[data-testid="movie-star"][data-movie-id="mcu-018"]').hover()
		await expect(nextStar).toHaveAttribute('href', '#/movies/mcu-001')
		await expect(nextStar).toContainText('Iron Man')

		// Manual exploration remains in place until leaving and revisiting the sky.
		await page.locator('[data-testid="phase-token"][data-phase="3"]').click()
		await expect(nextStar).toHaveAttribute('href', '#/movies/mcu-001')
		await page.locator('[data-testid="movie-star"][data-movie-id="mcu-017"]').focus()
		await expect(nextStar).toContainText('Iron Man')
		const viewport = page.getByTestId('universe-viewport')
		const cameraBeforeTheme = await viewport.getAttribute('data-camera-x')
		await page.getByRole('button', { name: '밝은 테마로 전환', exact: true }).click()
		await expect(page.locator('[data-testid="phase-token"][data-phase="3"]')).toHaveAttribute('aria-pressed', 'true')
		await expect(viewport).toHaveAttribute('data-camera-x', cameraBeforeTheme!)
		await page
			.getByRole('navigation', { name: '메인 메뉴' })
			.getByRole('link', { name: /작품 목록/ })
			.click()
		await returnToSky()
		await expectDefaultZoom()

		// Saving a review updates the next title and returns to the default 25% view.
		await nextStar.click()
		await page.getByRole('button', { name: '감상 기록 추가', exact: true }).click()
		await page.getByLabel('시청 날짜', { exact: true }).fill('2026-01-01')
		await page.getByRole('button', { name: '기록 저장', exact: true }).click()
		await expect(page.getByRole('dialog')).toHaveCount(0)
		await returnToSky()
		await expectDefaultZoom()
		await expect(nextStar).toHaveAttribute('href', '#/movies/mcu-002')
		await expect(nextStar).toContainText('The Incredible Hulk')
		await page.getByRole('button', { name: '어두운 테마로 전환', exact: true }).click()
		await expect(page.locator('.toast')).toHaveCount(0)
		await nextStar.screenshot({ path: 'test-results/next-star-dark.png', animations: 'disabled' })
		await page.getByRole('button', { name: '밝은 테마로 전환', exact: true }).click()

		await page.getByRole('button', { name: '전체 우주 보기', exact: true }).click()
		await expectOverview()
		for (const size of [
			{ width: 760, height: 600 },
			{ width: 1440, height: 1000 },
		]) {
			await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size.width, size.height), size)
			await expectOverview()
		}
		await page.getByRole('button', { name: '드라마·시리즈 23', exact: true }).click()
		await expectDefaultZoom(23)
		await expect(nextStar).toHaveAttribute('href', '#/movies/mcu-tv-wandavision-s01')
		await page.getByRole('button', { name: '전체 우주 보기', exact: true }).click()
		await expectOverview(23)
		await page.getByRole('button', { name: '전체 64', exact: true }).click()
		await expectDefaultZoom()
		await expect(nextStar).toHaveAttribute('href', '#/movies/mcu-002')
		await nextStar.screenshot({ path: 'test-results/next-star-light.png', animations: 'disabled' })
		await page.getByRole('button', { name: '어두운 테마로 전환', exact: true }).click()
		await page.locator('.universe-atlas').screenshot({ path: 'test-results/arrival-overview.png', animations: 'disabled' })
		expect(errors).toEqual([])
	} finally {
		await app?.close()
		if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('marathon-overview-')) fs.rmSync(directory, { recursive: true, force: true })
	}
})
