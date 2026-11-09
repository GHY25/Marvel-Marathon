import { describe, expect, it } from 'vitest'
import { assertTrustedSender, isAllowedExternalUrl, isAllowedRendererPermission, isTrustedRendererUrl } from '../electron/security'

describe('privileged IPC boundary', () => {
	const allowed = 'file:///C:/app/dist/index.html'
	const mainFrame = { url: `${allowed}#/movies/mcu-001` }
	const contents = { mainFrame }

	it('accepts only the exact trusted main frame and document URL (hash routing allowed)', () => {
		expect(() => assertTrustedSender({ sender: contents, senderFrame: mainFrame }, contents, allowed)).not.toThrow()
		expect(isTrustedRendererUrl('http://localhost:5173/#/diary', 'http://localhost:5173')).toBe(true)
	})

	it('rejects iframes, other windows, external navigations and missing frames', () => {
		for (const event of [
			{ sender: contents, senderFrame: { url: allowed } },
			{ sender: { mainFrame }, senderFrame: mainFrame },
			{ sender: contents, senderFrame: null },
		])
			expect(() => assertTrustedSender(event, contents, allowed)).toThrow('허용되지 않은 요청')
		expect(() => assertTrustedSender({ sender: contents, senderFrame: mainFrame }, undefined, allowed)).toThrow()
		expect(() => assertTrustedSender({ sender: contents, senderFrame: mainFrame }, contents, 'https://evil.example')).toThrow()
		for (const url of [`${allowed}?injected=true`, 'file:///C:/app/dist/other.html', 'https://evil.example', 'not-a-url']) {
			expect(isTrustedRendererUrl(url, allowed)).toBe(false)
		}
	})

	it('allows only well-formed HTTP(S) external links', () => {
		expect(isAllowedExternalUrl('https://github.com/Road-Glide/electron-vite-react-ts')).toBe(true)
		expect(isAllowedExternalUrl('http://example.com')).toBe(true)
		for (const raw of [null, 123, {}, '', 'file:///C:/secret', 'javascript:alert(1)', 'shell:AppsFolder', 'https://', 'x'.repeat(5000)]) {
			expect(isAllowedExternalUrl(raw)).toBe(false)
		}
	})
})

describe('HTML fullscreen permission boundary', () => {
	const expected = 'file:///C:/app/dist/index.html'
	const contents = { mainFrame: { url: `${expected}#/dashboard` } }
	const details = { isMainFrame: true, requestingUrl: contents.mainFrame.url }

	it('allows fullscreen only for the app main document, including development and hash routing', () => {
		expect(isAllowedRendererPermission(contents, contents, 'fullscreen', details, expected)).toBe(true)
		const devContents = { mainFrame: { url: 'http://127.0.0.1:5173/#/dashboard' } }
		expect(isAllowedRendererPermission(devContents, devContents, 'fullscreen', { isMainFrame: true, requestingUrl: devContents.mainFrame.url }, 'http://127.0.0.1:5173')).toBe(true)
	})

	it('keeps automatic fullscreen and every unrelated permission denied', () => {
		for (const permission of ['automatic-fullscreen', 'media', 'display-capture', 'geolocation', 'notifications', 'pointerLock', 'keyboardLock', 'openExternal', 'unknown']) {
			expect(isAllowedRendererPermission(contents, contents, permission, details, expected)).toBe(false)
		}
	})

	it('rejects other windows, workers, iframes and missing document details', () => {
		expect(isAllowedRendererPermission({ mainFrame: contents.mainFrame }, contents, 'fullscreen', details, expected)).toBe(false)
		expect(isAllowedRendererPermission(null, contents, 'fullscreen', details, expected)).toBe(false)
		expect(isAllowedRendererPermission(contents, undefined, 'fullscreen', details, expected)).toBe(false)
		for (const request of [{ ...details, isMainFrame: false }, { requestingUrl: expected }, { isMainFrame: true }, {}]) {
			expect(isAllowedRendererPermission(contents, contents, 'fullscreen', request, expected)).toBe(false)
		}
	})

	it('rejects both untrusted requesting URLs and a navigated main document', () => {
		for (const requestingUrl of [`${expected}?injected=true`, 'file:///C:/app/dist/other.html', 'https://evil.example', 'not-a-url']) {
			expect(isAllowedRendererPermission(contents, contents, 'fullscreen', { ...details, requestingUrl }, expected)).toBe(false)
		}
		const navigated = { mainFrame: { url: 'https://evil.example' } }
		expect(isAllowedRendererPermission(navigated, navigated, 'fullscreen', details, expected)).toBe(false)
	})
})
