# 김해시 인구지도 코드 읽기 안내

코드를 처음 보는 사람을 위한 지도다. 파일을 위에서 아래로 모두 읽기보다, 화면에서 궁금한 기능 하나를 정해 아래 경로를 따라가면 이해하기 쉽다. 실제 작업 상태와 남은 과제는 [project-handoff.md](project-handoff.md)를 먼저 확인한다.

## 1. 한눈에 보는 전체 흐름

```text
브라우저
  src/main.tsx → src/App.tsx → src/app/router.tsx → src/pages/DashboardPage.tsx
                                               ├─ src/components/ (화면 부품)
                                               ├─ src/features/ (API 요청·데이터 가공)
                                               └─ public/data/*.render.geojson (지도 모양)

인구 API 요청
  src/features/population/populationApi.ts
    → server/app/main.py → server/app/api/population.py
    → server/app/services/population_query_service.py
    → server/app/repositories/population_repository.py
    → server/data/gimhae_population.db
```

지도 경계는 주로 브라우저가 `public/data/`의 GeoJSON을 직접 읽는다. 인구·시설·고시처럼 검색하고 필터링할 자료는 FastAPI를 거쳐 SQLite에서 읽는다. 지도에 보이는 경계와 인구 숫자가 서로 다른 경로로 들어온다는 점이 중요하다.

## 2. 폴더별 역할

| 위치 | 쉬운 설명 | 먼저 볼 파일 |
|---|---|---|
| `src/main.tsx`, `src/App.tsx` | React 앱을 시작하고 공통 설정을 감싼다 | `src/App.tsx` |
| `src/app/` | URL별 화면 연결, 데이터 조회 캐시 설정 | `router.tsx`, `providers.tsx` |
| `src/pages/` | 한 화면 전체의 상태·배치 | `DashboardPage.tsx` |
| `src/components/` | 재사용할 화면 조각. 지도, 차트, 목록 등 | `map/NaverMap.tsx`, `common/RegionComparisonTable.tsx` |
| `src/features/` | 특정 기능의 API 요청과 데이터 처리 | `population/populationApi.ts`, `boundaries/boundaryLoader.ts` |
| `src/lib/` | 여러 기능이 함께 쓰는 작은 도구 | `apiConfig.ts` |
| `public/data/` | 브라우저가 읽는 지도 경계 파일 | `*.render.geojson` |
| `server/app/api/` | 브라우저 요청을 받는 주소와 입력 검사 | `population.py` |
| `server/app/services/` | 서비스 규칙·검증·조회 조합 | `population_query_service.py` |
| `server/app/repositories/` | SQLite에서 실제 행을 읽고 저장 | `population_repository.py` |
| `server/app/models.py`, `db.py` | DB 표(테이블) 구조와 연결 | `db.py` |
| `server/app/sync_*.py` | 외부 자료를 받아 로컬 DB·파일을 갱신하는 별도 명령 | 필요한 자료의 동기화 파일 |
| `server/tests/`, `src/**/*.test.ts` | 변경 뒤 결과가 유지되는지 검사 | 변경한 기능과 같은 이름의 테스트 |

`src/pages/DashboardPage.css`는 대시보드 모양을 정한다. TypeScript/TSX는 동작과 화면 구조, CSS는 색·크기·배치를 담당한다. `docs/architecture.md`는 더 자세한 기술 설계 문서다.

## 3. 예시: 월을 바꿀 때 어디를 거치나?

1. `DashboardPage.tsx`의 연·월 선택 상태가 바뀐다. React의 `useState`는 사용자가 고른 값을 기억한다.
2. `availabilitySelection.ts`가 실제 저장된 월 중 표시할 월을 고른다. 완료된 월을 우선하고 일부만 저장된 월은 별도로 알린다.
3. `DashboardPage.tsx`의 `useQuery`가 그 월의 인구를 요청한다. `queryKey`가 달라지면 새 자료를 조회하고, 같은 키의 결과는 캐시를 재사용할 수 있다.
4. `populationApi.ts`가 `/api/population/regions`로 HTTP 요청을 보낸다.
5. 서버의 `api/population.py`가 `level`·`year`·`month`를 받고, `services/population_query_service.py`를 호출한다.
6. 서비스가 `repositories/population_repository.py`로 SQLite 데이터를 읽는다. 응답이 돌아오면 상세 패널의 숫자와 지도의 인구 색상이 바뀐다.

중요: 자료가 없는 월의 빈 화면이 항상 코드 오류는 아니다. 저장된 월은 `/api/population/availability`가 알려 준다. DB 자체의 빈 월·연령 누락은 `python -m app.audit_population_coverage`로 **읽기 전용** 점검할 수 있다.

## 4. 예시: 지도에서 동을 누를 때

`NaverMap.tsx`가 지도 클릭을 감지해 지역 코드·이름·유형을 `onSelectRegion`으로 부모 화면에 전달한다. `DashboardPage.tsx`의 `selectRegion`이 선택 지역을 기억한다. 그 뒤 선택 지역용 비교·추이 조회가 활성화되고 왼쪽 설명창을 다시 그린다. 지도 경계 파일의 코드와 DB 지역 코드가 맞아야 숫자가 표시된다.

`두 동 비교` 코드는 보존되어 있지만 지금은 `DashboardPage.tsx`의 `ENABLE_TWO_REGION_COMPARISON = false`로 화면에서 꺼져 있다. 일반 `지역 비교` 탭의 순위 목록은 계속 사용 가능하다.

## 5. 자주 보이는 문법

- `useState`: 화면이 기억하는 값. 예: 현재 선택한 동.
- `useQuery`: 서버·파일 자료를 가져오고 로딩/오류/캐시 상태를 관리.
- `useMemo`: 입력이 바뀔 때만 계산을 다시 하도록 결과를 기억.
- `useEffect`: 화면 표시 뒤 외부 시스템과 동기화하거나 부가 작업을 실행.
- `props`: 부모 컴포넌트가 자식 컴포넌트에 전달하는 값·함수. 예: `NaverMap`의 `onSelectRegion`.
- `interface`/`type`: 데이터가 어떤 모양이어야 하는지 TypeScript에 알려 주는 설명서. 실행 중 값을 저장하지는 않는다.
- `GeoJSON`: 동 경계·도로·하천을 좌표와 속성으로 담은 지도 파일.
- `API`: 브라우저와 서버가 자료를 주고받는 약속된 주소. 예: `GET /api/population/regions`.
- `repository`: DB 읽기·쓰기 담당. 화면 모양을 만들지 않는다.

## 6. 기능을 고칠 때 읽는 순서

| 고치려는 것 | 읽는 순서 |
|---|---|
| 버튼·탭·문구 | `DashboardPage.tsx` → `DashboardPage.css` → 해당 `components/` |
| 인구 숫자·월 선택 | `DashboardPage.tsx` → `features/population/` → `server/app/api/population.py` → `services/` → `repositories/` |
| 지도 색·클릭 | `DashboardPage.tsx` → `NaverMap.tsx` → `features/map/`·`features/boundaries/` |
| 개발 고시 연결 | `features/development/` → `server/app/api/development.py` → `services/` → `repositories/` |
| 데이터 자체가 비어 있음 | `GET /api/population/availability` → `audit_population_coverage.py` → 필요할 때만 해당 `sync_*.py` |

처음에는 한 기능의 입력과 출력만 따라가면 된다. 주석은 코드가 *왜* 그렇게 동작하는지 설명하고, 함수·변수 이름은 *무엇*을 하는지 보여 주도록 유지한다.
