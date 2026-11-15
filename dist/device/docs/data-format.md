# 데이터 형식 — `data/`

웹 시뮬레이터가 읽는 파일은 모두 `data/`에 미리 만들어 두었습니다. 지형 영역은 Gale 크레이터의 Mount Sharp 하부, 대략 남위 4.73–5.04°, 동경 137.31–137.44°입니다.

| 파일 | 크기 | 내용 |
|---|---|---|
| `meta.json` | 2 KB | 격자 크기, 해상도, 좌표 원점, 고도 범위, 출처 |
| `terrain_8m.f32` | 8.5 MB | 고도 격자 |
| `ortho_4m.jpg` | 1.9 MB | 지표 텍스처 (HiRISE 정사영상) |
| `route.json` | 57 KB | Curiosity 웨이포인트 |
| `LICENSE` | 7 KB | CC0 1.0 원문. `data/`의 파일은 CC0으로 공개 |
| `terrain_8m_f32.b64.txt` | 11.3 MB | `terrain_8m.f32`의 base64 사본. claude.ai 게시용이며 git에서 제외 |

## 1. `terrain_8m.f32`

- **형식**: 헤더 없는 리틀엔디언 float32 배열이고, 값의 단위는 m입니다.
- **크기**: `meta.width × meta.height` = 928 × 2283 = 2 118 624개입니다.
- **배열 순서**: 행 우선입니다. 0행이 북쪽 끝이고, 각 행은 서쪽에서 동쪽으로 진행합니다. 셀 (i, j)의 값은 `z[i * width + j]`입니다.
- **좌표**: 셀 (i, j)의 중심은 로컬 좌표 ((j + ½)·res, (i + ½)·res)이고, res = `meta.res_m` ≈ 8.096 m입니다.
- **고도 기준**: 화성 areoid입니다. 범위는 약 −4324 ~ −2081 m입니다.
- **자료 없음**: NaN입니다. DTM 가장자리의 사선 영역이 해당하며, 전체 셀의 약 26 %입니다.
- **원본**: HiRISE DTM `DTEEC_019698_1750_019988_1750_U01`. 원본 해상도는 1 m입니다.
  - 이 원본을 4 m로 줄인 것을 다시 2×2로 평균해 만들었습니다.
  - 2×2 블록 중 하나라도 자료가 없으면 NaN으로 두었습니다. 가장자리 값이 번지지 않게 하기 위해서입니다.

브라우저에서는 이렇게 읽습니다.
```js
const z = new Float32Array(await (await fetch('data/terrain_8m.f32')).arrayBuffer());
```

## 2. `meta.json`

| 키 | 예시 | 의미 |
|---|---|---|
| `name` | "Lower Mount Sharp, Gale crater" | 지역 이름 |
| `width`, `height` | 928, 2283 | 격자 열 수, 행 수 |
| `res_m` | 8.096… | 셀 크기 (m) |
| `tex` | `{file, width: 1856, height: 4567}` | 텍스처 파일과 픽셀 크기. 4 m 격자와 같은 범위를 덮음 |
| `origin_proj_m` | [8139139.29, −280315.58] | 격자 북서 모서리의 투영 좌표 (m) |
| `crs` | WKT 문자열 | "Mars (2015) - Sphere / Ocentric / Equirectangular" 투영. 구 반지름 3 396 190 m |
| `lonlat_nw`, `lonlat_se` | [경도, 위도] | 북서·남동 모서리의 경위도 (도, 행성중심 기준, 동경 양수) |
| `z_min`, `z_max` | −4324.4, −2080.7 | 유효 고도의 최소·최대 |
| `sources` | 배열 | 각 자료의 설명, URL, 라이선스, 저작권 표기 |

**로컬 좌표 ↔ 경위도 변환** (등장방형, 표준위선 0°):
```
경도 = (origin_x + x) / (R · π/180)
위도 = (origin_y − y) / (R · π/180)      R = 3 396 190 m
```

## 3. `ortho_4m.jpg`

- **원본**: HiRISE RED 밴드 정사영상 `ESP_019698_1750_RED_A_01_ORTHO`입니다.
- **가공**: DTM의 4 m 격자에 맞춰 평균 리샘플했습니다.
  - 그래서 픽셀 (i, j)는 지형 셀 (⌊i/2⌋, ⌊j/2⌋)와 같은 위치입니다.
  - 밝기는 0.5–99.5 백분위수 사이를 0–255로 늘린 8비트 흑백이고, 자료 없는 곳은 검은색(0)입니다.
- **화면 표시**: 화면에 보이는 붉은 색조는 앱이 입힌 틴트입니다. 실제 색이 아닙니다.

## 4. `route.json`

Curiosity(MSL) 웨이포인트 중 격자 범위 안에 있는 691개입니다. sol 순서로 정렬되어 있고, 범위는 sol 1930–5073입니다.

```json
{ "sol": 1930, "x": 3786.3, "y": 11.7, "elev": -4149.29, "dist_total_m": 18216.33 }
```

| 키 | 의미 |
|---|---|
| `sol` | 미션 sol (착륙 후 화성일 수) |
| `x`, `y` | 로컬 좌표 (m, x 동쪽, y 남쪽) |
| `elev` | NASA가 제공한 웨이포인트 고도 (m, areoid 기준). 앱에서는 쓰지 않고 지형 격자 값을 씀 |
| `dist_total_m` | 착륙 이후 누적 주행 거리 (m) |

- **경계의 점**: 격자 범위 안에 있어도 지형 자료가 없는 곳의 점이 있습니다. 앱은 불러올 때 이런 점을 뺍니다(`PH.inside`).
- **범위 밖 구간**: 로버가 범위를 벗어났다 돌아온 구간은 직선으로 이어집니다.

## 5. 출처와 라이선스

| 자료 | 출처 | 라이선스 |
|---|---|---|
| HiRISE DTM `DTEEC_019698_1750_019988_1750_U01` | NASA/JPL/University of Arizona/USGS, [USGS Astrogeology STAC](https://stac.astrogeology.usgs.gov/api/collections/mro_hirise_socet_dtms/items/DTEEC_019698_1750_019988_1750_U01) | CC0-1.0 |
| HiRISE 정사영상 `ESP_019698_1750_RED_A_01_ORTHO` | 같은 STAC 항목의 `ortho_2` asset | CC0-1.0 |
| Curiosity 웨이포인트 | NASA/JPL-Caltech MMGIS (`https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/`) | NASA 공개 자료 (미국 퍼블릭 도메인) |

MMGIS JSON 경로는 NASA가 공식 API로 문서화한 주소가 아닙니다. 주소가 바뀔 수 있으므로, 데이터를 다시 만들 때 다시 확인해야 합니다.
