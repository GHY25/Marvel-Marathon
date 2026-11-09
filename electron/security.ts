import { DomainError } from '../src/shared/validation'

interface FrameLike {
	url: string
}
interface ContentsLike {
	mainFrame: FrameLike
}
interface SenderEvent {
	sender: ContentsLike
	senderFrame: FrameLike | null
}

export function isTrustedRendererUrl(candidate: string, expectedUrl: string): boolean {
	try {
		const actual = new URL(candidate)
		const expected = new URL(expectedUrl)
		actual.hash = ''
		expected.hash = ''
		return actual.href === expected.href
	} catch {
		return false
	}
}

/** Only the app's own main document may request user-initiated HTML fullscreen. */
export function isAllowedRendererPermission(contents: ContentsLike | null, trusted: ContentsLike | undefined, permission: string, details: { isMainFrame?: boolean; requestingUrl?: string }, expectedUrl: string): boolean {
	return permission === 'fullscreen' && !!trusted && contents === trusted && details.isMainFrame === true && typeof details.requestingUrl === 'string' && isTrustedRendererUrl(details.requestingUrl, expectedUrl) && isTrustedRendererUrl(trusted.mainFrame.url, expectedUrl)
}

export function assertTrustedSender(event: SenderEvent, trusted: ContentsLike | undefined, expectedUrl: string): void {
	if (!trusted || event.sender !== trusted || !event.senderFrame || event.senderFrame !== trusted.mainFrame || !isTrustedRendererUrl(event.senderFrame.url, expectedUrl)) {
		throw new DomainError('PERMISSION_DENIED', '허용되지 않은 요청입니다.')
	}
}

export function isAllowedExternalUrl(raw: unknown): raw is string {
	if (typeof raw !== 'string' || !raw.length || raw.length > 4096) return false
	try {
		const url = new URL(raw)
		return url.protocol === 'http:' || url.protocol === 'https:'
	} catch {
		return false
	}
}
