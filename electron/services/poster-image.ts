import { nativeImage } from 'electron'
import { DomainError } from '../../src/shared/validation'

const invalid = () => new DomainError('INVALID_INPUT', '읽을 수 있는 JPG 또는 PNG 이미지를 선택해 주세요. 최대 10MB, 2,400만 화소까지 지원해요.')

/** Check dimensions before native decoding, including very small compressed image bombs. */
export function rasterDimensions(bytes: Buffer): { width: number; height: number } {
	if (bytes.length < 24 || bytes.length > 10 * 1024 * 1024) throw invalid()
	let width = 0,
		height = 0
	if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString('ascii', 12, 16) === 'IHDR') {
		width = bytes.readUInt32BE(16)
		height = bytes.readUInt32BE(20)
	} else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
		let offset = 2
		while (offset + 4 <= bytes.length) {
			if (bytes[offset++] !== 0xff) throw invalid()
			while (bytes[offset] === 0xff) offset++
			const marker = bytes[offset++]
			if (marker === 0xda || marker === 0xd9) break
			if (offset + 2 > bytes.length) throw invalid()
			const length = bytes.readUInt16BE(offset)
			if (length < 2 || offset + length > bytes.length) throw invalid()
			if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
				height = bytes.readUInt16BE(offset + 3)
				width = bytes.readUInt16BE(offset + 5)
				break
			}
			offset += length
		}
	}
	if (!width || !height || width > 12000 || height > 12000 || width * height > 24_000_000) throw invalid()
	return { width, height }
}

export function normalizePoster(bytes: Buffer): Buffer {
	const size = rasterDimensions(bytes)
	const image = nativeImage.createFromBuffer(bytes)
	if (image.isEmpty() || image.getSize().width !== size.width || image.getSize().height !== size.height) throw invalid()
	const scale = Math.min(1, 500 / size.width, 750 / size.height)
	const jpeg = image.resize({ width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)), quality: 'best' }).toJPEG(88)
	if (!jpeg.length || jpeg.length > 512 * 1024) throw invalid()
	return jpeg
}
