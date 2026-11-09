# 디즈니+ MCU 카탈로그

2026-11-09 사용자 요청: 기존 영화 38편에 **디즈니+ MCU 작품만** 추가. 영화 38편 + 18개 시리즈의 23개 시즌 + 스페셜 3편 = **64개 기록 단위**다. 최초 명세의 영화 전용 범위는 이 후속 요청으로 확장한다.

| Phase | 추가한 시즌                                                                                                                                                  | 스페셜                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| 4     | WandaVision 1, The Falcon and the Winter Soldier 1, Loki 1, What If...? 1, Hawkeye 1, Moon Knight 1, Ms. Marvel 1, I Am Groot 1, She-Hulk: Attorney at Law 1 | Werewolf by Night, The Guardians of the Galaxy Holiday Special |
| 5     | Secret Invasion 1, I Am Groot 2, Loki 2, What If...? 2·3, Echo 1, Agatha All Along 1, Daredevil: Born Again 1, Ironheart 1                                   | —                                                              |
| 6     | Eyes of Wakanda 1, Marvel Zombies 1, Wonder Man 1, Daredevil: Born Again 2, VisionQuest 1                                                                    | The Punisher: One Last Kill                                    |

한 시즌을 독립 항목으로 취급한다. 다른 시즌과 별점·재관람·진행률을 분리하며, 에피소드별 체크나 시청 중 진도는 이번 범위에 없다. 날짜만 기록해도 해당 시즌의 별이 켜진다. VisionQuest는 기준일 현재 공개 중이라는 안내를 표시하고, 감상 기록의 시점은 사용자가 선택한다. 목록과 공개 상태는 자동 업데이트되지 않는다.

Netflix/ABC에서 시작한 시리즈, X-Men ’97 등 별도 세계관, Your Friendly Neighborhood Spider-Man, Assembled/Legends 같은 다큐멘터리·요약, 극장·홈미디어 One-Shot 단편, 미공개 후속 시즌은 제외한다. Your Friendly Neighborhood Spider-Man은 디즈니 공식 제작 소개에서 MCU 밖의 이야기라고 명시하여 제외했다. What If...?와 파생 Marvel Zombies는 MCU 멀티버스 애니메이션으로 포함한다.

## 확인 자료

- [Disney+ 공식 영화·TV·스페셜 안내](https://www.disneyplus.com/explore/articles/marvel-movies-in-order): 실사 시리즈, Groot, Eyes of Wakanda, 스페셜 목록.
- [Disney 공식 2025 애니메이션 소개](https://thewaltdisneycompany.com/news/marvel-animation-2025-sneak-peek/): What If...? 종료, 세 애니메이션의 구분 및 Spider-Man의 별도 세계관 설명. 예고 당시 세부 공개일은 변경될 수 있어 카탈로그에는 연도만 사용한다.
- [Disney 공식 Marvel Zombies 소개](https://thewaltdisneycompany.com/news/marvel-zombies-disney-plus/): 2025년 공개 및 What If...?와의 관계.
- [Disney 공식 The Punisher: One Last Kill 소개](https://thewaltdisneycompany.com/news/the-punisher-one-last-kill/): 2026년 스페셜.
- [Disney 공식 VisionQuest 프레스 키트](https://press.disney.co.uk/press-kit/visionquest-press-kit): 2026년 공개 작품.
- [TMDB TV 검색](https://developer.themoviedb.org/reference/search-tv), [시즌 이미지](https://developer.themoviedb.org/reference/tv-season-images): `first_air_date_year`와 시즌별 이미지 API.

## 호환성

영화 ID `mcu-001`~`mcu-038`과 개봉 순서 값은 유지한다. 시즌은 `mcu-tv-loki-s01`처럼 배열 위치와 무관한 고정 ID를 사용한다. DB는 기존 movies 테이블에 유형·시리즈명·최초 공개 연도·시즌 번호·공개 상태 열만 추가하는 schema 3 마이그레이션을 사용한다. 기존 typed IPC의 movies/movieId 이름과 백업 formatVersion 1은 호환성을 위해 유지하며 이제 영화·시즌·스페셜을 모두 나타낸다. 구버전 백업은 새 버전에서 복원할 수 있고, 새 DB를 구버전 앱으로 여는 것은 버전 검사로 거부한다.

영화 → 디즈니+ 공개 순으로 정렬하며 작품별 별점의 가중치는 동일하다. 영화만의 진행률·평균이 필요하면 유형 필터를 선택한다. 사용자 포스터와 API 키는 종전처럼 감상 JSON 백업에서 제외된다.
