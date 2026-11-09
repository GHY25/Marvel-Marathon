import { describe, expect, it } from 'vitest'
import { cameraScaleLimits, constrainCamera, fitWorldCamera, focusCamera, resizeCamera, zoomCamera, type Camera, type CameraSize } from '../src/shared/universe-camera'

const world = { width: 2400, height: 1600 }
const viewport = { width: 1000, height: 520 }

function worldPoint(camera: Camera, point: { x: number; y: number }) {
	return { x: (point.x - camera.x) / camera.scale, y: (point.y - camera.y) / camera.scale }
}

describe('universe camera navigation', () => {
	it.each<CameraSize>([viewport, { width: 500, height: 520 }, { width: 1400, height: 700 }])('fits the entire sky inside a %j viewport with breathing room', size => {
		const fitted = fitWorldCamera(size, world)
		expect(fitted.x).toBeGreaterThanOrEqual(47.99)
		expect(fitted.y).toBeGreaterThanOrEqual(47.99)
		expect(fitted.x + world.width * fitted.scale).toBeLessThanOrEqual(size.width - 47.99)
		expect(fitted.y + world.height * fitted.scale).toBeLessThanOrEqual(size.height - 47.99)
	})

	it('keeps the same star under the pointer when zooming in and back out', () => {
		const camera = { x: -500, y: -400, scale: 0.8 }
		const cursor = { x: 370, y: 180 }
		const before = worldPoint(camera, cursor)
		const zoomed = zoomCamera(camera, 1.4, cursor, viewport, world)
		expect(worldPoint(zoomed, cursor).x).toBeCloseTo(before.x)
		expect(worldPoint(zoomed, cursor).y).toBeCloseTo(before.y)
		const reversed = zoomCamera(zoomed, 1 / 1.4, cursor, viewport, world)
		expect(reversed.x).toBeCloseTo(camera.x)
		expect(reversed.y).toBeCloseTo(camera.y)
		expect(reversed.scale).toBeCloseTo(camera.scale)
	})

	it('caps large wheel deltas so the map cannot vanish or zoom indefinitely', () => {
		const camera = { x: -500, y: -400, scale: 0.8 }
		const anchor = { x: 500, y: 260 }
		expect(zoomCamera(camera, 10_000, anchor, viewport, world).scale).toBe(cameraScaleLimits(viewport, world).max)
		expect(zoomCamera(camera, 0.0001, anchor, viewport, world).scale).toBe(cameraScaleLimits(viewport, world).min)
	})

	it('keeps world edges reachable after a very long drag in either direction', () => {
		for (const position of [-100_000, 100_000]) {
			const constrained = constrainCamera({ x: position, y: position, scale: 1 }, viewport, world)
			expect(constrained.x).toBeLessThanOrEqual(48)
			expect(constrained.y).toBeLessThanOrEqual(48)
			expect(constrained.x + world.width).toBeGreaterThanOrEqual(viewport.width - 48)
			expect(constrained.y + world.height).toBeGreaterThanOrEqual(viewport.height - 48)
		}
	})

	it('centers an entire Phase constellation with its own readable scale', () => {
		const phase = { x: 900, y: 600, width: 450, height: 300 }
		const camera = focusCamera(phase, viewport, world)
		expect((phase.x + phase.width / 2) * camera.scale + camera.x).toBeCloseTo(viewport.width / 2)
		expect((phase.y + phase.height / 2) * camera.scale + camera.y).toBeCloseTo(viewport.height / 2)
		expect(phase.x * camera.scale + camera.x).toBeGreaterThanOrEqual(71.99)
		expect(phase.y * camera.scale + camera.y).toBeGreaterThanOrEqual(71.99)
		expect((phase.x + phase.width) * camera.scale + camera.x).toBeLessThanOrEqual(viewport.width - 71.99)
		expect((phase.y + phase.height) * camera.scale + camera.y).toBeLessThanOrEqual(viewport.height - 71.99)
	})

	it('preserves the viewed world center when resizing the app window', () => {
		const camera = { x: -500, y: -400, scale: 0.8 }
		const larger = { width: 1300, height: 650 }
		const before = worldPoint(camera, { x: viewport.width / 2, y: viewport.height / 2 })
		const after = worldPoint(resizeCamera(camera, viewport, larger, world), { x: larger.width / 2, y: larger.height / 2 })
		expect(after.x).toBeCloseTo(before.x)
		expect(after.y).toBeCloseTo(before.y)
	})

	it('locks the smaller axis to the middle when zoomed all the way out', () => {
		const fitted = fitWorldCamera(viewport, world)
		const moved = constrainCamera({ ...fitted, x: -4000, y: 4000 }, viewport, world)
		expect(moved).toEqual(fitted)
	})

	it.each<CameraSize>([
		{ width: 500, height: 420 },
		{ width: 1500, height: 900 },
	])('keeps the overview fitted when the window changes to %j', next => {
		const overview = fitWorldCamera(viewport, world)
		expect(resizeCamera(overview, viewport, next, world)).toEqual(fitWorldCamera(next, world))
	})
})
