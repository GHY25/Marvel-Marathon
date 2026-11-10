export interface Camera {
	x: number
	y: number
	scale: number
}

export interface CameraSize {
	width: number
	height: number
}

export interface CameraBounds extends CameraSize {
	x: number
	y: number
}

export const CAMERA_PADDING = 48
export const DEFAULT_CAMERA_SCALE = 0.25
export const MOBILE_OVERVIEW_SCALE = 0.11
export const MAX_CAMERA_SCALE = 1.8

function clamp(value: number, minimum: number, maximum: number) {
	return Math.max(minimum, Math.min(maximum, value))
}

/** The entire world remains recoverable even in the smallest supported viewport. */
export function cameraScaleLimits(viewport: CameraSize, world: CameraSize) {
	const fit = Math.min(Math.max(1, viewport.width - CAMERA_PADDING * 2) / world.width, Math.max(1, viewport.height - CAMERA_PADDING * 2) / world.height)
	return { min: Math.max(0.01, Math.min(MAX_CAMERA_SCALE, fit)), max: MAX_CAMERA_SCALE }
}

export function constrainCamera(camera: Camera, viewport: CameraSize, world: CameraSize): Camera {
	const limits = cameraScaleLimits(viewport, world)
	const scale = clamp(camera.scale, limits.min, limits.max)
	function constrainAxis(position: number, viewportLength: number, worldLength: number) {
		const scaledLength = worldLength * scale
		return scaledLength <= viewportLength - CAMERA_PADDING * 2 ? (viewportLength - scaledLength) / 2 : clamp(position, viewportLength - scaledLength - CAMERA_PADDING, CAMERA_PADDING)
	}
	return { x: constrainAxis(camera.x, viewport.width, world.width), y: constrainAxis(camera.y, viewport.height, world.height), scale }
}

export function fitWorldCamera(viewport: CameraSize, world: CameraSize): Camera {
	const scale = cameraScaleLimits(viewport, world).min
	return { x: (viewport.width - world.width * scale) / 2, y: (viewport.height - world.height * scale) / 2, scale }
}

/** Preserve the world coordinate under the cursor, except at a world boundary. */
export function zoomCamera(camera: Camera, factor: number, anchor: { x: number; y: number }, viewport: CameraSize, world: CameraSize): Camera {
	const limits = cameraScaleLimits(viewport, world)
	const scale = clamp(camera.scale * factor, limits.min, limits.max)
	const ratio = scale / camera.scale
	return constrainCamera({ x: anchor.x - (anchor.x - camera.x) * ratio, y: anchor.y - (anchor.y - camera.y) * ratio, scale }, viewport, world)
}

export function focusCamera(bounds: CameraBounds, viewport: CameraSize, world: CameraSize, padding = 72): Camera {
	const limits = cameraScaleLimits(viewport, world)
	const scale = clamp(Math.min(Math.max(1, viewport.width - padding * 2) / Math.max(1, bounds.width), Math.max(1, viewport.height - padding * 2) / Math.max(1, bounds.height)), limits.min, limits.max)
	return constrainCamera({ x: viewport.width / 2 - (bounds.x + bounds.width / 2) * scale, y: viewport.height / 2 - (bounds.y + bounds.height / 2) * scale, scale }, viewport, world)
}

/** Keep overview fitted; otherwise preserve the user's viewed world center. */
export function resizeCamera(camera: Camera, previous: CameraSize, next: CameraSize, world: CameraSize): Camera {
	if (Math.abs(camera.scale - cameraScaleLimits(previous, world).min) < 0.0001) return fitWorldCamera(next, world)
	const center = { x: (previous.width / 2 - camera.x) / camera.scale, y: (previous.height / 2 - camera.y) / camera.scale }
	const scale = Math.max(cameraScaleLimits(next, world).min, camera.scale)
	return constrainCamera({ x: next.width / 2 - center.x * scale, y: next.height / 2 - center.y * scale, scale }, next, world)
}
