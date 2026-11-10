import { test, expect } from '@playwright/test'
import sharp from 'sharp'
import { MarathonRepository } from '../../electron/db/repository'
import { synchronizePosters } from '../../src/shared/poster-sync'

test('PC posters appear on iPhone, custom changes return to PC, reset and offline images survive', async ({ page, context }) => {
	const pc = new MarathonRepository(':memory:')
	const automatic = await sharp({ create: { width: 100, height: 150, channels: 3, background: '#304f76' } })
		.jpeg()
		.toBuffer()
	const custom = await sharp({ create: { width: 100, height: 150, channels: 3, background: '#a03050' } })
		.png()
		.toBuffer()
	const synchronizePC = () => synchronizePosters({ list: pending => pc.getPosterRecords(pending), read: record => pc.readPosterRecord(record), merge: (record, bytes) => pc.mergePosterRecord(record, bytes) }, (path, init) => fetch(`http://127.0.0.1:4173${path}`, init))
	try {
		await page.goto('http://127.0.0.1:4173/#/movies/mcu-001')
		await expect(page.getByRole('heading', { name: 'Iron Man', exact: true })).toBeVisible()
		pc.savePoster('mcu-001', 'tmdb', automatic)
		await synchronizePC()
		await page.evaluate(() => window.electronAPI.sync.run())
		const image = page.locator('.detail-poster img')
		await expect(image).toBeVisible()
		await expect(image).toHaveAttribute('src', `data:image/jpeg;base64,${automatic.toString('base64')}`)
		await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(100)
		const chooser = page.waitForEvent('filechooser')
		await page.getByRole('button', { name: '내 이미지로 변경', exact: true }).click()
		await (await chooser).setFiles({ name: 'custom.png', mimeType: 'image/png', buffer: custom })
		await expect(page.getByRole('button', { name: '자동 포스터로 되돌리기', exact: true })).toBeVisible()
		await page.evaluate(() => window.electronAPI.sync.run())
		await expect
			.poll(async () => {
				await synchronizePC()
				return pc.getPoster('mcu-001')?.source
			})
			.toBe('custom')
		await page.getByRole('button', { name: '자동 포스터로 되돌리기', exact: true }).click()
		await expect(image).toHaveAttribute('src', `data:image/jpeg;base64,${automatic.toString('base64')}`)
		await page.evaluate(() => window.electronAPI.sync.run())
		await expect
			.poll(async () => {
				await synchronizePC()
				return pc.getPoster('mcu-001')?.source
			})
			.toBe('tmdb')
		await page.evaluate(() => navigator.serviceWorker.ready)
		await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
		await context.setOffline(true)
		await page.reload()
		await expect(image).toBeVisible()
		await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(100)
		await page.screenshot({ path: 'test-results/web/iphone-poster-offline.png' })
	} finally {
		pc.close()
	}
})
