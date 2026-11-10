import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { cameraScaleLimits, constrainCamera, DEFAULT_CAMERA_SCALE, MOBILE_OVERVIEW_SCALE, fitWorldCamera, focusCamera, resizeCamera, zoomCamera, type Camera, type CameraBounds, type CameraSize } from '../../shared/universe-camera'

interface Drag {
	id: number
	startX: number
	startY: number
	lastX: number
	lastY: number
	lastTime: number
	velocityX: number
	velocityY: number
	startCamera: Camera
	moved: boolean
}

export function useUniverseCamera({ worldWidth, worldHeight, initialCenter, mobileInitialBounds }: { worldWidth: number; worldHeight: number; initialCenter: { x: number; y: number }; mobileInitialBounds?: CameraBounds }) {
	const viewportRef = useRef<HTMLDivElement>(null)
	const cameraRef = useRef<Camera>({ x: 0, y: 0, scale: 1 })
	const sizeRef = useRef<CameraSize>({ width: 0, height: 0 })
	const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 })
	const [size, setSize] = useState<CameraSize>({ width: 0, height: 0 })
	const [isDragging, setDragging] = useState(false)
	const frameRef = useRef<number | null>(null)
	const dragRef = useRef<Drag | null>(null)
	const suppressClickUntil = useRef(0)
	const reduceMotionRef = useRef(false)
	const pinchRef = useRef<{ distance: number; x: number; y: number } | null>(null)
	// Only the arrival camera uses this; later data refreshes must not steal a gesture.
	const initialBoundsRef = useRef(mobileInitialBounds)

	const stopAnimation = useCallback(() => {
		if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
		frameRef.current = null
	}, [])

	const applyCamera = useCallback(
		(next: Camera) => {
			const constrained = constrainCamera(next, sizeRef.current, { width: worldWidth, height: worldHeight })
			cameraRef.current = constrained
			setCamera(constrained)
			return constrained
		},
		[worldWidth, worldHeight]
	)

	const moveTo = useCallback(
		(target: Camera, animate = true) => {
			stopAnimation()
			if (reduceMotionRef.current || !animate) {
				applyCamera(target)
				return
			}
			const start = cameraRef.current
			const started = performance.now()
			const frame = (time: number) => {
				const progress = Math.min(1, (time - started) / 380)
				const eased = 1 - (1 - progress) ** 3
				applyCamera({ x: start.x + (target.x - start.x) * eased, y: start.y + (target.y - start.y) * eased, scale: start.scale + (target.scale - start.scale) * eased })
				frameRef.current = progress < 1 ? requestAnimationFrame(frame) : null
			}
			frameRef.current = requestAnimationFrame(frame)
		},
		[applyCamera, stopAnimation]
	)

	const zoomBy = useCallback(
		(factor: number) => {
			const viewport = sizeRef.current
			moveTo(zoomCamera(cameraRef.current, factor, { x: viewport.width / 2, y: viewport.height / 2 }, viewport, { width: worldWidth, height: worldHeight }))
		},
		[moveTo, worldWidth, worldHeight]
	)

	// Fixed-size labels extend above the stars; leave a little more room at the top.
	const overview = useCallback((viewport: CameraSize) => (window.matchMedia('(max-width: 600px)').matches ? { x: viewport.width / 2 - initialCenter.x * MOBILE_OVERVIEW_SCALE, y: viewport.height / 2 - initialCenter.y * MOBILE_OVERVIEW_SCALE + 12, scale: MOBILE_OVERVIEW_SCALE } : fitWorldCamera(viewport, { width: worldWidth, height: worldHeight })), [worldWidth, worldHeight, initialCenter.x, initialCenter.y])
	const fitWorld = useCallback(() => moveTo(overview(sizeRef.current)), [moveTo, overview])
	const focusBounds = useCallback((bounds: CameraBounds) => moveTo(focusCamera(bounds, sizeRef.current, { width: worldWidth, height: worldHeight }, window.matchMedia('(max-width: 600px)').matches ? 28 : 72)), [moveTo, worldWidth, worldHeight])
	const revealPoint = useCallback(
		(x: number, y: number) => {
			stopAnimation()
			// Focusing a transformed offscreen link can make an overflow-hidden element scroll.
			// Camera translation remains the only source of viewport movement.
			viewportRef.current?.scrollTo(0, 0)
			// Pointer focus must not move a visible edge star away from the pointer or
			// replace the origin captured by pointerdown. Keyboard focus still reveals it.
			if (dragRef.current) return
			const viewport = sizeRef.current
			const current = cameraRef.current
			const screenX = x * current.scale + current.x
			const screenY = y * current.scale + current.y
			const margin = 42
			if (screenX >= margin && screenX <= viewport.width - margin && screenY >= margin && screenY <= viewport.height - margin) return
			moveTo({ x: viewport.width / 2 - x * current.scale, y: viewport.height / 2 - y * current.scale, scale: current.scale }, false)
		},
		[moveTo, stopAnimation]
	)

	useEffect(() => {
		const element = viewportRef.current
		if (!element) return
		const world = { width: worldWidth, height: worldHeight }
		const media = window.matchMedia('(prefers-reduced-motion: reduce)')
		reduceMotionRef.current = media.matches
		const motionChanged = () => {
			reduceMotionRef.current = media.matches
			if (media.matches) stopAnimation()
		}
		media.addEventListener('change', motionChanged)
		const measure = () => {
			const next = { width: element.clientWidth, height: element.clientHeight }
			if (!next.width || !next.height || (next.width === sizeRef.current.width && next.height === sizeRef.current.height)) return
			stopAnimation()
			const previous = sizeRef.current
			sizeRef.current = next
			setSize(next)
			if (!previous.width || !previous.height) {
				applyCamera(window.matchMedia('(max-width: 600px)').matches ? (initialBoundsRef.current ? focusCamera(initialBoundsRef.current, next, world, 28) : overview(next)) : { x: next.width / 2 - initialCenter.x * DEFAULT_CAMERA_SCALE, y: next.height / 2 - initialCenter.y * DEFAULT_CAMERA_SCALE, scale: DEFAULT_CAMERA_SCALE })
			} else applyCamera(resizeCamera(cameraRef.current, previous, next, world))
		}
		const observer = new ResizeObserver(measure)
		observer.observe(element)
		measure()
		const pinch = (event: TouchEvent) => {
			if (event.touches.length !== 2) {
				pinchRef.current = null
				return
			}
			event.preventDefault()
			stopAnimation()
			dragRef.current = null
			setDragging(false)
			suppressClickUntil.current = performance.now() + 500
			const rect = element.getBoundingClientRect()
			const [a, b] = [event.touches[0], event.touches[1]]
			const current = { distance: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)), x: (a.clientX + b.clientX) / 2 - rect.left, y: (a.clientY + b.clientY) / 2 - rect.top }
			const previous = pinchRef.current
			if (previous) {
				const zoomed = zoomCamera(cameraRef.current, current.distance / previous.distance, previous, sizeRef.current, world)
				applyCamera({ ...zoomed, x: zoomed.x + current.x - previous.x, y: zoomed.y + current.y - previous.y })
			}
			pinchRef.current = current
		}
		element.addEventListener('touchstart', pinch, { passive: false })
		element.addEventListener('touchmove', pinch, { passive: false })
		element.addEventListener('touchend', pinch)
		element.addEventListener('touchcancel', pinch)

		const wheel = (event: WheelEvent) => {
			if (event.target instanceof Element && event.target.closest('[data-camera-control]')) return
			event.preventDefault()
			// A gesture keeps one camera origin until release; wheel input must not replace its scale.
			if (dragRef.current) return
			stopAnimation()
			const rectangle = element.getBoundingClientRect()
			const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? sizeRef.current.height : 1)
			const factor = Math.exp(Math.max(-0.45, Math.min(0.45, -delta * 0.0018)))
			applyCamera(zoomCamera(cameraRef.current, factor, { x: event.clientX - rectangle.left, y: event.clientY - rectangle.top }, sizeRef.current, world))
		}
		element.addEventListener('wheel', wheel, { passive: false })
		const preventNativeDrag = (event: DragEvent) => event.preventDefault()
		element.addEventListener('dragstart', preventNativeDrag)

		const move = (event: PointerEvent) => {
			const drag = dragRef.current
			if (!drag || event.pointerId !== drag.id) return
			const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
			if (!drag.moved && distance < 6) return
			if (!drag.moved) {
				drag.moved = true
				setDragging(true)
				try {
					element.setPointerCapture(event.pointerId)
				} catch {
					// Window listeners keep the drag usable if capture is unavailable.
				}
			}
			event.preventDefault()
			const now = performance.now()
			const elapsed = Math.max(1, now - drag.lastTime)
			drag.velocityX = Math.max(-2.2, Math.min(2.2, (event.clientX - drag.lastX) / elapsed))
			drag.velocityY = Math.max(-2.2, Math.min(2.2, (event.clientY - drag.lastY) / elapsed))
			drag.lastX = event.clientX
			drag.lastY = event.clientY
			drag.lastTime = now
			applyCamera({ ...drag.startCamera, x: drag.startCamera.x + event.clientX - drag.startX, y: drag.startCamera.y + event.clientY - drag.startY })
		}

		const end = (event: PointerEvent) => {
			const drag = dragRef.current
			if (!drag || event.pointerId !== drag.id) return
			dragRef.current = null
			pinchRef.current = null
			setDragging(false)
			if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
			if (!drag.moved) return
			suppressClickUntil.current = performance.now() + 500
			if (event.type === 'pointercancel' || reduceMotionRef.current || performance.now() - drag.lastTime > 80) return
			let vx = drag.velocityX
			let vy = drag.velocityY
			let last = performance.now()
			const started = last
			const coast = (now: number) => {
				const elapsed = Math.min(32, now - last)
				last = now
				const current = cameraRef.current
				const next = applyCamera({ ...current, x: current.x + vx * elapsed, y: current.y + vy * elapsed })
				if (Math.abs(next.x - current.x) < 0.01) vx = 0
				if (Math.abs(next.y - current.y) < 0.01) vy = 0
				vx *= Math.exp(-elapsed / 105)
				vy *= Math.exp(-elapsed / 105)
				frameRef.current = now - started < 450 && Math.hypot(vx, vy) > 0.025 ? requestAnimationFrame(coast) : null
			}
			frameRef.current = requestAnimationFrame(coast)
		}
		const blur = () => {
			const drag = dragRef.current
			if (drag?.moved) suppressClickUntil.current = performance.now() + 500
			if (drag && element.hasPointerCapture(drag.id)) element.releasePointerCapture(drag.id)
			dragRef.current = null
			setDragging(false)
			stopAnimation()
		}
		window.addEventListener('pointermove', move, { passive: false })
		window.addEventListener('pointerup', end)
		window.addEventListener('pointercancel', end)
		window.addEventListener('blur', blur)
		return () => {
			observer.disconnect()
			element.removeEventListener('touchstart', pinch)
			element.removeEventListener('touchmove', pinch)
			element.removeEventListener('touchend', pinch)
			element.removeEventListener('touchcancel', pinch)
			media.removeEventListener('change', motionChanged)
			element.removeEventListener('wheel', wheel)
			element.removeEventListener('dragstart', preventNativeDrag)
			window.removeEventListener('pointermove', move)
			window.removeEventListener('pointerup', end)
			window.removeEventListener('pointercancel', end)
			window.removeEventListener('blur', blur)
			const drag = dragRef.current
			if (drag && element.hasPointerCapture(drag.id)) element.releasePointerCapture(drag.id)
			dragRef.current = null
			stopAnimation()
		}
	}, [applyCamera, stopAnimation, worldWidth, worldHeight, initialCenter.x, initialCenter.y, overview])

	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0 || !event.isPrimary || dragRef.current || pinchRef.current || (event.target instanceof Element && event.target.closest('[data-camera-control]'))) return
		stopAnimation()
		suppressClickUntil.current = 0
		dragRef.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, lastTime: performance.now(), velocityX: 0, velocityY: 0, startCamera: cameraRef.current, moved: false }
		const interactive = event.target instanceof Element && event.target.closest('a, button, input, select, textarea, [contenteditable="true"], [data-camera-control]')
		if (!interactive) event.currentTarget.focus({ preventScroll: true })
	}
	const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
		if (event.detail !== 0 && performance.now() < suppressClickUntil.current) {
			event.preventDefault()
			event.stopPropagation()
			suppressClickUntil.current = 0
		}
	}
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return
		const directions: Record<string, [number, number]> = { ArrowLeft: [85, 0], ArrowRight: [-85, 0], ArrowUp: [0, 85], ArrowDown: [0, -85] }
		if (directions[event.key]) {
			event.preventDefault()
			const [x, y] = directions[event.key]
			const current = cameraRef.current
			stopAnimation()
			applyCamera({ ...current, x: current.x + x, y: current.y + y })
		} else if (event.key === '+' || event.key === '=') {
			event.preventDefault()
			zoomBy(1.25)
		} else if (event.key === '-') {
			event.preventDefault()
			zoomBy(0.8)
		} else if (event.key === 'Home' || event.key === '0') {
			event.preventDefault()
			fitWorld()
		}
	}
	const limits = cameraScaleLimits(size.width ? size : { width: 1000, height: 520 }, { width: worldWidth, height: worldHeight })
	return { viewportRef, camera, size, isDragging, minScale: limits.min, maxScale: limits.max, zoomBy, fitWorld, focusBounds, revealPoint, handlers: { onPointerDown, onClickCapture, onKeyDown } }
}
