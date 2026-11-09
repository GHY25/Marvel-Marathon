import type { Movie, Phase } from '../../../shared/types'
import { CATALOG } from '../../../shared/catalog'

export const WORLD_WIDTH = 3200
export const WORLD_HEIGHT = 2400

export type StarPoint = {
	x: number
	y: number
	size: number
	variant: 'cross' | 'diamond' | 'round'
}

export type Constellation = {
	phase: Phase
	name: string
	skyName: string
	latinName: string
	color: string
	x: number
	y: number
	width: number
	height: number
	points: StarPoint[]
	edges: (readonly [number, number])[]
	sourceUrl: string
}

type CompanionConstellation = {
	name: string
	placement: { x: number; y: number; angle: number }
	stars: [id: string, x: number, y: number, size: number, variant: StarPoint['variant']][]
	edges: (readonly [number, number])[]
}

// Original companion patterns, placed in the open sky beside their own Phase.
// Stable title IDs keep seasons in place even if catalog ordering changes.
const COMPANIONS: Partial<Record<Phase, CompanionConstellation>> = {
	4: {
		name: '확장의 날개',
		placement: { x: 230, y: 610, angle: -14 },
		stars: [
			['wandavision-s01', 260, 165, 8, 'cross'],
			['falcon-winter-soldier-s01', 160, 85, 6, 'round'],
			['loki-s01', 0, 35, 7, 'cross'],
			['what-if-s01', 85, 205, 5, 'round'],
			['hawkeye-s01', 230, 310, 7, 'cross'],
			['moon-knight-s01', 375, 250, 6.5, 'cross'],
			['ms-marvel-s01', 570, 80, 7, 'cross'],
			['groot-s01', 420, 50, 5, 'round'],
			['she-hulk-s01', 305, 0, 6, 'round'],
			['werewolf-by-night', 5, 320, 7, 'diamond'],
			['guardians-holiday', 515, 325, 7, 'diamond'],
		],
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 0],
			[0, 4],
			[4, 5],
			[5, 0],
			[0, 7],
			[7, 6],
			[6, 5],
			[7, 8],
			[8, 1],
			[3, 9],
			[5, 10],
		],
	},
	5: {
		name: '시간의 고리',
		placement: { x: -635, y: 280, angle: 22 },
		stars: [
			['secret-invasion-s01', 165, 0, 6, 'round'],
			['groot-s02', 305, 40, 5, 'round'],
			['loki-s02', 400, 165, 8, 'cross'],
			['what-if-s02', 325, 290, 6, 'round'],
			['echo-s01', 170, 340, 6.5, 'cross'],
			['agatha-s01', 40, 280, 7.5, 'cross'],
			['what-if-s03', 0, 135, 5.5, 'round'],
			['daredevil-born-again-s01', 70, 40, 7, 'cross'],
			['ironheart-s01', 185, 180, 8, 'cross'],
		],
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 4],
			[4, 5],
			[5, 6],
			[6, 7],
			[7, 0],
			[2, 8],
			[8, 5],
		],
	},
	6: {
		name: '새벽의 나침반',
		placement: { x: 930, y: -180, angle: -16 },
		stars: [
			['eyes-of-wakanda-s01', 150, 0, 7, 'cross'],
			['marvel-zombies-s01', 0, 105, 5.5, 'round'],
			['wonder-man-s01', 130, 260, 7, 'cross'],
			['daredevil-born-again-s02', 295, 125, 6.5, 'cross'],
			['punisher-one-last-kill', 290, 285, 7, 'diamond'],
			['visionquest-s01', 150, 130, 8, 'cross'],
		],
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 0],
			[0, 5],
			[5, 2],
			[3, 4],
		],
	},
}

/** Preserve each drawing, but let companions occupy any direction from their Phase.
 * Normalize the visible bounds without changing a title's absolute sky position. */
export function layoutConstellation(base: Constellation, visible: readonly Movie[]) {
	const films = CATALOG.filter(title => title.phase === base.phase && title.mediaType === 'movie')
	const companion = COMPANIONS[base.phase]
	const companionPoints = companion
		? (() => {
				const centerX = Math.max(...companion.stars.map(([, x]) => x)) / 2
				const centerY = Math.max(...companion.stars.map(([, , y]) => y)) / 2
				const angle = (companion.placement.angle * Math.PI) / 180
				return companion.stars.map(([, x, y, size, variant]) => ({
					x: companion.placement.x + centerX + (x - centerX) * Math.cos(angle) - (y - centerY) * Math.sin(angle),
					y: companion.placement.y + centerY + (x - centerX) * Math.sin(angle) + (y - centerY) * Math.cos(angle),
					size,
					variant,
				}))
			})()
		: []
	const companionLabel = { x: Math.min(...companionPoints.map(point => point.x)), y: Math.min(...companionPoints.map(point => point.y)) - 105 }
	const ids = [...films.map(title => title.id), ...(companion?.stars.map(([id]) => `mcu-tv-${id}`) ?? [])]
	const points = [...base.points, ...companionPoints]
	const edges = [...base.edges, ...(companion?.edges.map(([a, b]) => [a + films.length, b + films.length] as const) ?? [])]
	const indexes = visible.map(title => ids.indexOf(title.id))
	const visiblePoints = indexes.map(index => points[index])
	const companionVisible = visible.some(title => title.mediaType !== 'movie')
	const filmVisible = visible.some(title => title.mediaType === 'movie')
	const anchors = [...visiblePoints, ...(filmVisible ? [{ x: 0, y: 0 }] : []), ...(companionVisible ? [companionLabel] : [])]
	const originX = anchors.length ? Math.min(...anchors.map(point => point.x)) : 0
	const originY = anchors.length ? Math.min(...anchors.map(point => point.y)) : 0
	return {
		x: base.x + originX,
		y: base.y + originY,
		points: visiblePoints.map(point => ({ ...point, x: point.x - originX, y: point.y - originY })),
		edges: edges.flatMap(([from, to]) => {
			const a = indexes.indexOf(from),
				b = indexes.indexOf(to)
			return a < 0 || b < 0 ? [] : [[a, b] as const]
		}),
		width: Math.max(...(filmVisible || !visible.length ? [base.width] : []), ...visiblePoints.map(point => point.x + 45)) - originX,
		height: Math.max(...(filmVisible || !visible.length ? [base.height] : []), ...visiblePoints.map(point => point.y + 45)) - originY,
		filmLabel: filmVisible ? { x: -originX, y: -originY } : undefined,
		companion: companionVisible && companion ? { name: companion.name, label: { x: companionLabel.x - originX, y: companionLabel.y - originY } } : undefined,
	}
}

const MUSEUM_GUIDE = 'https://smv.org/documents/58/Constellation_Viewer_ENG_SPAN.pdf'
const NASA_FINDER = 'https://spaceplace.nasa.gov/review/starfinder/star_finder_jan.pdf'

// Original, simplified drawings inspired by familiar sky patterns, not sky coordinates.
// Every point is one movie, in release order; sizes are visual variation, not magnitudes.
export const CONSTELLATIONS: Constellation[] = [
	{
		phase: 1,
		name: '시작의 빛',
		skyName: '카시오페이아자리',
		latinName: 'Cassiopeia',
		color: '#7dafff',
		x: 180,
		y: 600,
		width: 520,
		height: 360,
		points: [
			{ x: 25, y: 85, size: 6, variant: 'cross' },
			{ x: 130, y: 250, size: 8, variant: 'cross' },
			{ x: 235, y: 115, size: 5.5, variant: 'round' },
			{ x: 350, y: 285, size: 7, variant: 'diamond' },
			{ x: 465, y: 130, size: 6.5, variant: 'cross' },
			{ x: 485, y: 35, size: 4.5, variant: 'round' },
		],
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 4],
			[4, 5],
		],
		sourceUrl: MUSEUM_GUIDE,
	},
	{
		phase: 2,
		name: '모험의 빛',
		skyName: '백조자리',
		latinName: 'Cygnus',
		color: '#ed8a84',
		x: 1050,
		y: 140,
		width: 520,
		height: 420,
		points: [
			{ x: 290, y: 25, size: 8.5, variant: 'cross' },
			{ x: 245, y: 165, size: 7, variant: 'diamond' },
			{ x: 165, y: 355, size: 6, variant: 'cross' },
			{ x: 35, y: 100, size: 5.5, variant: 'round' },
			{ x: 350, y: 210, size: 4.5, variant: 'round' },
			{ x: 465, y: 265, size: 6.5, variant: 'cross' },
		],
		edges: [
			[0, 1],
			[1, 2],
			[3, 1],
			[1, 4],
			[4, 5],
		],
		sourceUrl: MUSEUM_GUIDE,
	},
	{
		phase: 3,
		name: '연결의 빛',
		skyName: '오리온자리',
		latinName: 'Orion',
		color: '#b49af5',
		x: 1390,
		y: 870,
		width: 550,
		height: 530,
		points: [
			{ x: 270, y: 25, size: 4.5, variant: 'round' },
			{ x: 110, y: 105, size: 9, variant: 'cross' },
			{ x: 430, y: 125, size: 7, variant: 'diamond' },
			{ x: 180, y: 240, size: 6.5, variant: 'cross' },
			{ x: 270, y: 225, size: 7.5, variant: 'diamond' },
			{ x: 360, y: 210, size: 6, variant: 'cross' },
			{ x: 95, y: 465, size: 6, variant: 'round' },
			{ x: 435, y: 450, size: 8.5, variant: 'cross' },
			{ x: 270, y: 305, size: 4.5, variant: 'round' },
			{ x: 255, y: 380, size: 5.5, variant: 'diamond' },
			{ x: 245, y: 455, size: 4, variant: 'round' },
		],
		edges: [
			[0, 1],
			[0, 2],
			[1, 3],
			[2, 5],
			[3, 4],
			[4, 5],
			[3, 6],
			[5, 7],
			[4, 8],
			[8, 9],
			[9, 10],
		],
		sourceUrl: MUSEUM_GUIDE,
	},
	{
		phase: 4,
		name: '확장의 빛',
		skyName: '큰곰자리 · 북두칠성',
		latinName: 'Ursa Major',
		color: '#e8c573',
		x: 2280,
		y: 430,
		width: 590,
		height: 380,
		points: [
			{ x: 25, y: 310, size: 6.5, variant: 'cross' },
			{ x: 120, y: 230, size: 5, variant: 'round' },
			{ x: 225, y: 185, size: 7, variant: 'diamond' },
			{ x: 330, y: 220, size: 6, variant: 'cross' },
			{ x: 510, y: 245, size: 7.5, variant: 'cross' },
			{ x: 550, y: 100, size: 8, variant: 'diamond' },
			{ x: 355, y: 65, size: 5.5, variant: 'round' },
		],
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 4],
			[4, 5],
			[5, 6],
			[6, 3],
		],
		sourceUrl: MUSEUM_GUIDE,
	},
	{
		phase: 5,
		name: '변화의 빛',
		skyName: '사자자리 · 낫',
		latinName: 'Leo',
		color: '#83c8a8',
		x: 790,
		y: 1300,
		width: 380,
		height: 510,
		points: [
			{ x: 320, y: 60, size: 5.5, variant: 'round' },
			{ x: 200, y: 35, size: 6, variant: 'diamond' },
			{ x: 95, y: 125, size: 4.5, variant: 'round' },
			{ x: 125, y: 235, size: 6.5, variant: 'cross' },
			{ x: 255, y: 300, size: 7, variant: 'diamond' },
			{ x: 245, y: 445, size: 9, variant: 'cross' },
		],
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 4],
			[4, 5],
		],
		sourceUrl: MUSEUM_GUIDE,
	},
	{
		phase: 6,
		name: '미래의 빛',
		skyName: '작은개자리',
		latinName: 'Canis Minor',
		color: '#e9a76f',
		x: 1640,
		y: 1810,
		width: 360,
		height: 280,
		points: [
			{ x: 50, y: 55, size: 5.5, variant: 'round' },
			{ x: 300, y: 215, size: 9, variant: 'cross' },
		],
		edges: [[0, 1]],
		sourceUrl: NASA_FINDER,
	},
]
