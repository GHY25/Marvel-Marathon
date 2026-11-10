import { test, expect } from '@playwright/test'
import sharp from 'sharp'

test('mobile sky starts at 11%, returns to the next Phase, and has compact filters and diary posters', async ({ page, context }) => {
	await context.addInitScript(() => localStorage.setItem('marathon-sync-enabled', 'false'))
	await page.goto('http://127.0.0.1:4173/#/dashboard')
	await page.emulateMedia({ reducedMotion: 'reduce' })
	const viewport = page.getByTestId('universe-viewport')
	await expect(viewport).toHaveAttribute('data-camera-scale', '0.1100')
	await expect.poll(() => viewport.evaluate(el => el.clientWidth > el.clientHeight)).toBe(true)
	await expect
		.poll(() =>
			page.getByTestId('movie-star').evaluateAll(stars =>
				stars.every(star => {
					const box = star.getBoundingClientRect(),
						frame = star.closest('.universe-canvas')!.getBoundingClientRect()
					return box.x + box.width / 2 > frame.left && box.right - box.width / 2 < frame.right && box.y + box.height / 2 > frame.top && box.bottom - box.height / 2 < frame.bottom
				})
			)
		)
		.toBe(true)
	await expect
		.poll(() =>
			page.locator('.universe-sector-label').evaluateAll(labels =>
				labels.every(label => {
					const box = label.getBoundingClientRect(),
						frame = label.closest('.universe-canvas')!.getBoundingClientRect()
					return box.top >= frame.top && box.bottom <= frame.bottom
				})
			)
		)
		.toBe(true)
	await page.locator('.universe-atlas').screenshot({ path: 'test-results/web/mobile-overview.png' })
	await page.evaluate(async () => {
		for (let i = 1; i <= 6; i++) await window.electronAPI.entries.create({ movieId: `mcu-${String(i).padStart(3, '0')}`, watchDate: '2026-01-01', ratingTicks: i === 1 ? 8 : null, review: '작은 화면에서도 이어지는 감상 기록' })
	})
	await expect(page.getByTestId('universe-next')).toHaveAttribute('href', '#/movies/mcu-007')
	const nav = page.getByRole('navigation', { name: '메인 메뉴' })
	await nav.getByRole('link', { name: '작품 목록', exact: true }).click()
	await expect(page.locator('.phase-tabs button')).toHaveCount(7)
	await expect.poll(() => page.locator('.phase-tabs button').evaluateAll(buttons => new Set(buttons.map(button => Math.round(button.getBoundingClientRect().top))).size)).toBe(1)
	await expect.poll(() => page.getByLabel('감상 상태', { exact: true }).evaluate(el => el.getBoundingClientRect().width)).toBeLessThan(120)
	await expect.poll(() => page.locator('.movie-tools').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
	await page.screenshot({ path: 'test-results/web/mobile-collection.png' })
	await nav.getByRole('link', { name: '나의 우주', exact: true }).click()
	await expect(page.locator('[data-testid="phase-token"][data-phase="2"]')).toHaveAttribute('aria-pressed', 'true')
	await expect.poll(async () => Number(await viewport.getAttribute('data-camera-scale'))).toBeGreaterThan(0.11)
	await expect
		.poll(() =>
			page.locator('[data-testid="constellation"][data-phase="2"] [data-testid="movie-star"]').evaluateAll(stars =>
				stars.every(star => {
					const box = star.getBoundingClientRect(),
						frame = star.closest('.universe-canvas')!.getBoundingClientRect()
					return box.left > frame.left && box.right < frame.right && box.top > frame.top && box.bottom < frame.bottom
				})
			)
		)
		.toBe(true)
	await page.locator('.universe-atlas').screenshot({ path: 'test-results/web/mobile-next-phase.png' })
	await viewport.tap({ position: { x: 5, y: 5 } })
	const client = await context.newCDPSession(page)
	for (let i = 0; i < 2; i++) {
		const before = Number(await viewport.getAttribute('data-camera-scale'))
		const box = (await viewport.boundingBox())!,
			x = box.x + box.width / 2,
			y = box.y + box.height / 2
		await client.send('Input.dispatchTouchEvent', {
			type: 'touchStart',
			touchPoints: [
				{ x: x - 25, y, id: 0 },
				{ x: x + 25, y, id: 1 },
			],
		})
		await client.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [
				{ x: x - 45, y, id: 0 },
				{ x: x + 45, y, id: 1 },
			],
		})
		await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
		await expect.poll(async () => Number(await viewport.getAttribute('data-camera-scale'))).toBeGreaterThan(before)
	}
	await page.getByRole('button', { name: '전체 우주 보기', exact: true }).click()
	await expect(viewport).toHaveAttribute('data-camera-scale', '0.1100')
	await page.evaluate(() => {
		window.location.hash = '/movies/mcu-001'
	})
	const chooser = page.waitForEvent('filechooser')
	await page.getByRole('button', { name: '내 이미지로 변경', exact: true }).click()
	await (
		await chooser
	).setFiles({
		name: 'poster.png',
		mimeType: 'image/png',
		buffer: await sharp({ create: { width: 100, height: 150, channels: 3, background: '#763044' } })
			.png()
			.toBuffer(),
	})
	await expect(page.locator('.detail-poster img')).toBeVisible()
	await nav.getByRole('link', { name: '감상 일기', exact: true }).click()
	await expect(page.getByLabel('평점 필터')).toHaveCount(0)
	const image = page.locator('.diary-cover[aria-label="Iron Man 상세 보기"] img')
	await expect(image).toBeVisible()
	await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(100)
	await page.screenshot({ path: 'test-results/web/mobile-diary.png' })
	for (const width of [390, 320]) {
		await page.setViewportSize({ width, height: 844 })
		for (const title of ['작품 목록', '나의 우주', '감상 일기', '나의 랭킹', '통계']) {
			await nav.getByRole('link', { name: title, exact: true }).click()
			await expect(page.locator('.media-tabs button')).toHaveCount(4)
			await expect(page.locator('.media-tabs')).toContainText('시리즈')
			await expect(page.locator('.media-tabs')).not.toContainText('드라마')
			await expect.poll(() => page.locator('.media-tabs button').evaluateAll(buttons => new Set(buttons.map(button => Math.round(button.getBoundingClientRect().top))).size)).toBe(1)
			await expect.poll(() => page.locator('.main-scroll').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
			if (title === '작품 목록') await expect.poll(() => page.locator('.phase-tabs button').evaluateAll(buttons => new Set(buttons.map(button => Math.round(button.getBoundingClientRect().top))).size)).toBe(1)
		}
	}
})
