import { test, expect } from '@playwright/test'
import { MarathonRepository } from '../../electron/db/repository'

test('iPhone layout, offline records and PC changes converge, including deletion', async ({ page, context, request }) => {
	const pc = new MarathonRepository(':memory:')
	const errors: string[] = []
	page.on('pageerror', error => errors.push(error.message))
	try {
		await page.goto('http://127.0.0.1:4173')
		await expect(page.getByTestId('movie-star')).toHaveCount(64)
		await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
		await expect.poll(() => page.locator('.main-scroll').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
		await page.screenshot({ path: 'test-results/web/iphone-universe.png' })
		await page.getByTestId('universe-next').click()
		await page.getByRole('button', { name: '감상 기록 추가', exact: true }).click()
		await page.getByLabel('시청 날짜', { exact: true }).fill('2026-01-01')
		await page.locator('#review').fill('아이폰에서 밝힌 첫 별')
		await page.getByRole('button', { name: '기록 저장', exact: true }).click()
		await expect(page.getByRole('dialog')).toHaveCount(0)
		await page.evaluate(() => window.electronAPI.sync.run())
		await expect.poll(async () => (await (await request.get('http://127.0.0.1:4173/api/sync')).json()).records.length).toBe(1)
		pc.mergeSyncRecords((await (await request.get('http://127.0.0.1:4173/api/sync')).json()).records)
		expect(pc.listEntries()[0].review).toBe('아이폰에서 밝힌 첫 별')
		const id = pc.listEntries()[0].id
		pc.updateEntry(id, { watchDate: '2026-01-01', ratingTicks: 9, review: 'PC에서 이어 쓴 감상' })
		await request.post('http://127.0.0.1:4173/api/sync', { data: { records: pc.getSyncRecords(true) } })
		await page.evaluate(() => window.electronAPI.sync.run())
		await expect(page.getByText('PC에서 이어 쓴 감상', { exact: true })).toBeVisible()
		await page.screenshot({ path: 'test-results/web/iphone-detail.png' })
		await page.evaluate(() => navigator.serviceWorker.ready)
		await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
		await context.setOffline(true)
		await page.reload()
		await expect(page.getByText('PC에서 이어 쓴 감상', { exact: true })).toBeVisible()
		await page.getByRole('button', { name: '감상 기록 추가', exact: true }).click()
		await page.getByLabel('시청 날짜', { exact: true }).fill('2026-01-02')
		await page.locator('#review').fill('오프라인 재관람')
		await page.getByRole('button', { name: '기록 저장', exact: true }).click()
		await expect(page.getByRole('dialog')).toHaveCount(0)
		await expect(page.getByText('오프라인 재관람', { exact: true })).toBeVisible()
		await context.setOffline(false)
		await page.evaluate(() => window.electronAPI.sync.run())
		await expect.poll(async () => (await (await request.get('http://127.0.0.1:4173/api/sync')).json()).records.length).toBe(2)
		pc.mergeSyncRecords((await (await request.get('http://127.0.0.1:4173/api/sync')).json()).records)
		expect(pc.listEntries()).toHaveLength(2)
		pc.deleteEntry(id)
		await request.post('http://127.0.0.1:4173/api/sync', { data: { records: pc.getSyncRecords(true) } })
		await page.evaluate(() => window.electronAPI.sync.run())
		await expect(page.getByText('PC에서 이어 쓴 감상', { exact: true })).toHaveCount(0)
		await page.getByRole('link', { name: '설정', exact: true }).click()
		await expect(page.getByText('아이폰 홈 화면에 설치하기', { exact: true })).toBeVisible()
		await page.screenshot({ path: 'test-results/web/iphone-settings.png' })
		await page.getByRole('navigation', { name: '메인 메뉴' }).getByRole('link', { name: '나의 우주', exact: true }).click()
		const viewport = page.getByTestId('universe-viewport')
		await viewport.scrollIntoViewIfNeeded()
		const initial = Number(await viewport.getAttribute('data-camera-scale'))
		const box = (await viewport.boundingBox())!
		const client = await context.newCDPSession(page)
		const center = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
		await client.send('Input.dispatchTouchEvent', {
			type: 'touchStart',
			touchPoints: [
				{ x: center.x - 30, y: center.y, id: 0 },
				{ x: center.x + 30, y: center.y, id: 1 },
			],
		})
		await client.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [
				{ x: center.x - 80, y: center.y, id: 0 },
				{ x: center.x + 80, y: center.y, id: 1 },
			],
		})
		await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
		await expect.poll(async () => Number(await viewport.getAttribute('data-camera-scale'))).toBeGreaterThan(initial)
		expect(errors).toEqual([])
	} finally {
		pc.close()
	}
})
