import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

test('Disney+ seasons: filters, independent ratings, rewatches, stars, backup and offline restart', async () => {
	test.setTimeout(90_000)
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-series-e2e-'))
	const env = { ...process.env, MARATHON_TEST_MODE: '1', MARATHON_USER_DATA_DIR: directory, ELECTRON_MENU_ENABLED: 'false' }
	delete env.ELECTRON_RUN_AS_NODE
	let app: ElectronApplication | undefined
	let page: Page
	const errors: string[] = []
	async function launch() {
		const executablePath = process.env.MARATHON_EXECUTABLE
		app = await electron.launch({ executablePath, args: executablePath ? [] : ['.'], env })
		page = await app.firstWindow()
		page.on('pageerror', error => errors.push(error.message))
		await expect(page.getByRole('heading', { name: '나만의 MCU 정주행 기록', exact: true })).toBeVisible()
	}
	async function route(value: string) {
		await page.evaluate(value => {
			window.location.hash = value
		}, value)
		await expect(page).toHaveURL(new RegExp(`#${value}$`))
	}
	async function record(star: number, date: string) {
		await page.getByRole('button', { name: '감상 기록 추가', exact: true }).click()
		await expect(page.getByRole('dialog').getByText(/시즌 .* 전체의 감상을 기록합니다/)).toBeVisible()
		await page.getByLabel('시청 날짜', { exact: true }).fill(date)
		await page.locator(`.rating-star[data-star="${star}"]`).click({ clickCount: 2 })
		await page.getByLabel('한 줄 감상평').fill('시즌 감상 기록')
		await page.getByRole('button', { name: '기록 저장', exact: true }).click()
		await expect(page.getByRole('dialog')).toHaveCount(0)
	}
	try {
		await launch()
		await expect(page.getByTestId('movie-star')).toHaveCount(64)
		await page.getByRole('button', { name: '드라마·시리즈 23', exact: true }).click()
		await expect(page.getByTestId('movie-star')).toHaveCount(23)
		await expect(page.getByRole('button', { name: /Phase 1,.*0\/0/ })).toBeDisabled()
		await page.locator('.universe-atlas').scrollIntoViewIfNeeded()
		await page.getByRole('button', { name: '전체 우주 보기', exact: true }).click()
		await expect(page.getByRole('button', { name: '우주 축소', exact: true })).toBeDisabled()
		// Wait for the animated camera to fit, then verify every season is in view.
		expect(
			await page.getByTestId('movie-star').evaluateAll(stars =>
				stars.every(star => {
					const box = star.getBoundingClientRect()
					const viewport = star.closest('.universe-canvas')!.getBoundingClientRect()
					return box.left >= viewport.left && box.right <= viewport.right && box.top >= viewport.top && box.bottom <= viewport.bottom
				})
			)
		).toBe(true)
		await page.locator('.universe-atlas').screenshot({ path: 'test-results/series-universe-dark.png', animations: 'disabled' })
		await route('/movies')
		await page.getByRole('button', { name: '드라마·시리즈 23', exact: true }).click()
		await expect(page.locator('.movie-card')).toHaveCount(23)
		await page.getByLabel('작품 검색', { exact: true }).fill('Loki')
		await expect(page.locator('.movie-card')).toHaveCount(2)
		await page.getByRole('button', { name: 'Phase 5', exact: true }).click()
		await expect(page.locator('.movie-card')).toHaveCount(1)
		await page.getByRole('link', { name: /Loki — Season 2/ }).click()
		await expect(page.getByRole('heading', { name: 'Loki — Season 2', exact: true })).toBeVisible()
		await record(4, '2026-01-02')
		await record(5, '2026-01-03')
		await expect(page.locator('.entry-card')).toHaveCount(2)
		// Edit one rewatch, then delete it: the previous season rating becomes current again.
		await page
			.locator('.entry-card')
			.first()
			.getByRole('button', { name: /기록 수정/ })
			.click()
		await page.getByLabel('한 줄 감상평').fill('수정한 시즌 감상')
		await page.getByRole('button', { name: '기록 저장', exact: true }).click()
		await expect(page.getByText('수정한 시즌 감상', { exact: true })).toBeVisible()
		await page
			.locator('.entry-card')
			.first()
			.getByRole('button', { name: /기록 삭제/ })
			.click()
		await page.getByRole('button', { name: '기록 삭제', exact: true }).click()
		await expect(page.locator('.entry-card')).toHaveCount(1)
		await route('/movies/mcu-tv-loki-s01')
		await expect(page.getByRole('heading', { name: 'Loki — Season 1', exact: true })).toBeVisible()
		await record(3, '2026-01-01')
		await route('/ranking')
		await page.getByRole('button', { name: '드라마·시리즈 23', exact: true }).click()
		await expect(page.locator('.ranking-row')).toHaveCount(2)
		await expect(page.locator('.ranking-row').first()).toContainText('Loki — Season 2')
		await page.getByRole('button', { name: '영화 38', exact: true }).click()
		await expect(page.locator('.ranking-row')).toHaveCount(0)
		await route('/statistics')
		await page.getByRole('button', { name: '드라마·시리즈 23', exact: true }).click()
		await expect(page.locator('.stat-card').filter({ hasText: '나의 평균 별점' })).toContainText('3.5')
		await page.getByRole('button', { name: '영화 38', exact: true }).click()
		await expect(page.locator('.stat-card').filter({ hasText: '총 감상' })).toContainText('0회')
		const backupPath = path.join(directory, 'series.json')
		await app!.evaluate(({ dialog }, filename) => {
			dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename })
			dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] })
			dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
		}, backupPath)
		await route('/settings')
		await page.getByRole('button', { name: '내보내기 (.json)' }).click()
		await expect(page.locator('.toast')).toContainText('2개의 감상 기록을 백업')
		expect(JSON.parse(fs.readFileSync(backupPath, 'utf8')).watchEntries).toHaveLength(2)
		await page.getByRole('button', { name: '가져오기 (.json)' }).click()
		await expect(page.locator('.toast')).toContainText('2개의 감상 기록을 복원')
		await app!.close()
		app = undefined
		await launch()
		await page.getByRole('button', { name: '드라마·시리즈 23', exact: true }).click()
		await expect(page.locator('[data-testid="movie-star"][data-watched="true"]')).toHaveCount(2)
		await route('/movies')
		await page.getByRole('button', { name: '드라마·시리즈 23', exact: true }).click()
		await page.getByRole('button', { name: '밝은 테마로 전환', exact: true }).click()
		await page.screenshot({ path: 'test-results/series-collection-light.png', fullPage: true })
		await page.getByRole('button', { name: '스페셜 3', exact: true }).click()
		await expect(page.locator('.movie-card')).toHaveCount(3)
		expect(errors).toEqual([])
	} finally {
		await app?.close()
		if (path.dirname(path.resolve(directory)) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('marathon-series-e2e-')) fs.rmSync(directory, { recursive: true, force: true })
	}
})
