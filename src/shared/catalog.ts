import type { Movie, Phase } from './types'

export const CATALOG_VERSION = 'mcu-2026-11-09'

// The fixed catalog from the implementation specification. Stable IDs are never
// derived from titles, so metadata corrections cannot orphan viewing history.
const catalog: [title: string, year: number, phase: Phase][] = [
	['Iron Man', 2008, 1],
	['The Incredible Hulk', 2008, 1],
	['Iron Man 2', 2010, 1],
	['Thor', 2011, 1],
	['Captain America: The First Avenger', 2011, 1],
	['The Avengers', 2012, 1],
	['Iron Man 3', 2013, 2],
	['Thor: The Dark World', 2013, 2],
	['Captain America: The Winter Soldier', 2014, 2],
	['Guardians of the Galaxy', 2014, 2],
	['Avengers: Age of Ultron', 2015, 2],
	['Ant-Man', 2015, 2],
	['Captain America: Civil War', 2016, 3],
	['Doctor Strange', 2016, 3],
	['Guardians of the Galaxy Vol. 2', 2017, 3],
	['Spider-Man: Homecoming', 2017, 3],
	['Thor: Ragnarok', 2017, 3],
	['Black Panther', 2018, 3],
	['Avengers: Infinity War', 2018, 3],
	['Ant-Man and the Wasp', 2018, 3],
	['Captain Marvel', 2019, 3],
	['Avengers: Endgame', 2019, 3],
	['Spider-Man: Far From Home', 2019, 3],
	['Black Widow', 2021, 4],
	['Shang-Chi and the Legend of the Ten Rings', 2021, 4],
	['Eternals', 2021, 4],
	['Spider-Man: No Way Home', 2021, 4],
	['Doctor Strange in the Multiverse of Madness', 2022, 4],
	['Thor: Love and Thunder', 2022, 4],
	['Black Panther: Wakanda Forever', 2022, 4],
	['Ant-Man and the Wasp: Quantumania', 2023, 5],
	['Guardians of the Galaxy Vol. 3', 2023, 5],
	['The Marvels', 2023, 5],
	['Deadpool & Wolverine', 2024, 5],
	['Captain America: Brave New World', 2025, 5],
	['Thunderbolts*', 2025, 5],
	['The Fantastic Four: First Steps', 2025, 6],
	['Spider-Man: Brand New Day', 2026, 6],
]

export const MOVIES: Movie[] = catalog.map(([titleEn, releaseYear, phase], index) => ({
	id: `mcu-${String(index + 1).padStart(3, '0')}`,
	titleEn,
	titleKo: null,
	releaseYear,
	phase,
	saga: phase <= 3 ? 'Infinity Saga' : 'Multiverse Saga',
	releaseOrder: index + 1,
	mediaType: 'movie',
	seriesTitle: null,
	seriesStartYear: null,
	seasonNumber: null,
	releaseStatus: 'released',
}))

// Disney+ MCU originals only. One season is one recordable title; IDs never depend
// on a title's position. Publication years are season years, not series start years.
const television: [id: string, title: string, year: number, phase: Phase, season: number | null, startYear: number][] = [
	['wandavision-s01', 'WandaVision', 2021, 4, 1, 2021],
	['falcon-winter-soldier-s01', 'The Falcon and the Winter Soldier', 2021, 4, 1, 2021],
	['loki-s01', 'Loki', 2021, 4, 1, 2021],
	['what-if-s01', 'What If...?', 2021, 4, 1, 2021],
	['hawkeye-s01', 'Hawkeye', 2021, 4, 1, 2021],
	['moon-knight-s01', 'Moon Knight', 2022, 4, 1, 2022],
	['ms-marvel-s01', 'Ms. Marvel', 2022, 4, 1, 2022],
	['groot-s01', 'I Am Groot', 2022, 4, 1, 2022],
	['she-hulk-s01', 'She-Hulk: Attorney at Law', 2022, 4, 1, 2022],
	['werewolf-by-night', 'Werewolf by Night', 2022, 4, null, 2022],
	['guardians-holiday', 'The Guardians of the Galaxy Holiday Special', 2022, 4, null, 2022],
	['secret-invasion-s01', 'Secret Invasion', 2023, 5, 1, 2023],
	['groot-s02', 'I Am Groot', 2023, 5, 2, 2022],
	['loki-s02', 'Loki', 2023, 5, 2, 2021],
	['what-if-s02', 'What If...?', 2023, 5, 2, 2021],
	['echo-s01', 'Echo', 2024, 5, 1, 2024],
	['agatha-s01', 'Agatha All Along', 2024, 5, 1, 2024],
	['what-if-s03', 'What If...?', 2024, 5, 3, 2021],
	['daredevil-born-again-s01', 'Daredevil: Born Again', 2025, 5, 1, 2025],
	['ironheart-s01', 'Ironheart', 2025, 5, 1, 2025],
	['eyes-of-wakanda-s01', 'Eyes of Wakanda', 2025, 6, 1, 2025],
	['marvel-zombies-s01', 'Marvel Zombies', 2025, 6, 1, 2025],
	['wonder-man-s01', 'Wonder Man', 2026, 6, 1, 2026],
	['daredevil-born-again-s02', 'Daredevil: Born Again', 2026, 6, 2, 2025],
	['punisher-one-last-kill', 'The Punisher: One Last Kill', 2026, 6, null, 2026],
	['visionquest-s01', 'VisionQuest', 2026, 6, 1, 2026],
]

export const TV_TITLES: Movie[] = television.map(([id, title, releaseYear, phase, seasonNumber, seriesStartYear], index) => ({
	id: `mcu-tv-${id}`,
	titleEn: seasonNumber === null ? title : `${title} — Season ${seasonNumber}`,
	titleKo: null,
	releaseYear,
	phase,
	saga: 'Multiverse Saga',
	releaseOrder: MOVIES.length + index + 1,
	mediaType: seasonNumber === null ? 'special' : 'series',
	seriesTitle: seasonNumber === null ? null : title,
	seriesStartYear: seasonNumber === null ? null : seriesStartYear,
	seasonNumber,
	releaseStatus: id === 'visionquest-s01' ? 'airing' : 'released',
}))

export const CATALOG: Movie[] = [...MOVIES, ...TV_TITLES]
