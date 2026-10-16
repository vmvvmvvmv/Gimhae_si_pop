# 김해시 인구 지도

김해시 행정동·법정동 경계와 월별 인구 통계를 지도와 표로 보여주는 React + FastAPI 프로젝트입니다.

## 구성

- `src/`: React 화면, 지도, 인구 조회 API 클라이언트
- `server/app/`: FastAPI API, SQLite 저장소, 데이터 수집·가져오기 명령
- `public/data/`: 브라우저에서 사용하는 GeoJSON 경계 데이터
- `docs/architecture.md`: 데이터 흐름과 책임 분리 문서
- `docs/project-handoff.md`: 다른 채팅이나 개발 환경에서 작업을 이어가기 위한 현재 상태·실행법·남은 과제
- `docs/beginner-code-guide.md`: 처음 보는 사람을 위한 코드 읽는 순서와 폴더·함수 역할
- `docs/deployment-preflight.md`: Docker·DB·지도 키·공개 전 점검 순서

## 실행

1. `.env.example`을 복사해 `.env`를 만들고 값을 채웁니다.
2. 프론트엔드 의존성을 설치하고 개발 서버를 실행합니다.

```powershell
npm install
npm run dev
```

3. 백엔드는 별도 터미널에서 가상환경을 활성화한 뒤 실행합니다.

```powershell
cd server
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

백엔드 전체 테스트는 일반 CMD에서 다음처럼 실행합니다.

```bat
cd /d "C:\Users\User\Documents\ChatGPT\Gimhae_si_Map\server"
.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Windows에서 로컬 소켓 생성을 막는 제한된 실행 환경에서는 FastAPI 테스트
클라이언트가 멈출 수 있습니다. 이 경우 테스트 실패가 아니라 실행 환경의
제한인지 확인하고, 일반 CMD에서 다시 실행합니다.

개발자 도구 콘솔에는 첫 화면의 `조회 기간 준비`, `첫 인구 데이터 준비`,
`지도 사용 가능` 시간이 밀리초로 기록됩니다. 브라우저 Performance 패널에서는
`gimhae:`로 시작하는 마크를 찾아 초기 로딩 병목을 비교할 수 있습니다.

필요하면 최초 1회 지역 데이터를 초기화합니다.

```powershell
python -m app.init_db
```

전국 월별 주민등록 인구는 행정안전부 API에서 받아 SQLite에 저장합니다.
처음 한 번 과거 구간을 동기화한 뒤, 최신 월을 주기적으로 추가하면 됩니다.

저장 상태는 아래 명령으로 읽기 전용 점검할 수 있습니다. 행정·법정동 인구의
빈 월, 월별 11개 연령대 누락, 전국 월별 인구·연도별 면적 및 전국 행정동
비교 인구의 미연결 건수를 보여줍니다. 기본 범위는 각 유형에서 실제로
저장된 첫 달부터 마지막 달까지이며, 행정구역 변경 전후의 빈 월은 확인이
필요한 후보로 해석합니다. DB는 수정하지 않습니다.

```text
cd /d C:\Users\User\Documents\ChatGPT\Gimhae_si_Map\server
.venv\Scripts\python.exe -m app.audit_population_coverage --from-ym 202501 --to-ym 202512 --limit 30
```

```text
cd /d C:\Users\User\Documents\ChatGPT\Gimhae_si_Map\server
# GIS DLL을 사용할 수 없는 환경에서 전국 인구 테이블만 만들 때
.venv\Scripts\python.exe -m app.init_national_db
.venv\Scripts\python.exe -m app.sync_national_population --from-year 2013 --from-month 7 --to-year 2025 --to-month 12 --delay-seconds 0.8
```

저장된 전국 인구는 다음 백엔드 API로 조회합니다.

```text
GET http://127.0.0.1:8000/api/national-population?year=2025&month=12
```

전국 인구밀도 기준은 저장된 전국 인구와 `NATIONAL_AREA_KM2`를 결합해 조회합니다.

```text
GET http://127.0.0.1:8000/api/national-density?year=2025&month=12
```

전국 행정동 면적을 조회연도에 맞춰 비교하려면 SGIS 경계를 연도별로 저장합니다.
이미 3,000개 이상 저장된 연도는 건너뛰므로 중단 후 같은 명령으로 재개할 수 있습니다.

```text
cd /d C:\Users\User\Documents\ChatGPT\Gimhae_si_Map\server
.venv\Scripts\python.exe -m app.sync_sgis_admin_area_range --from-year 2013 --to-year 2025
```

이 명령은 각 연도의 원본 GeoJSON을 `server/data/imports/national_admin/{연도}`에
보관하고, 계산한 면적을 SQLite의 `national_administrative_area`에 저장합니다.
기존 연도를 다시 수집할 때만 `--force`를 추가합니다.

SGIS 면적 경계의 지역코드(8자리)와 KOSIS 전국 읍면동 인구의 지역코드(10자리)는
직접 일치하지 않습니다. 유사 면적 비교와 누락 점검은 고유한 전체 지역명으로
대조하며 `제1동/1동`, 구두점, 일부 상위 시·구 표기 차이만 보수적으로 보완합니다.
여러 인구 지역으로 갈라지는 면적 구역은 추정 합산하지 않고 미연결로 남깁니다.

행정구역 개편 참고용 하천망과 교량은 VWorld에서 갱신합니다. 첫 명령은
김해시 주변의 공식 하천망 면 데이터를 `public/data/gimhae_waterways.geojson`에
저장하고, 두 번째 명령은 교량 위치를 SQLite 시설 테이블에 저장합니다.

```text
cd /d C:\Users\User\Documents\ChatGPT\Gimhae_si_Map\server
.venv\Scripts\python.exe -m app.sync_vworld_waterways
.venv\Scripts\python.exe -m app.sync_vworld_development_areas
.venv\Scripts\python.exe -m app.sync_vworld_facilities --category BRIDGE
.venv\Scripts\python.exe -m app.sync_vworld_facilities --category PARK
```

경계·하천·도로·개발구역 원본은 DB 계산과 검증에 그대로 쓰고, 브라우저는
좌표 수를 줄인 `*.render.geojson`을 읽는다. `npm run dev`와 `npm run build`는
누락된 지도 표시용 파일을 시작 전에 생성한다. 기존 파일이 원본에서 생성한
결과와 다르면 덮어쓰지 않고 중단하므로, 원본을 갱신한 뒤에는 결과 파일을
확인하고 프로젝트 루트에서 다음 명령으로 다시 만든다.

```text
npm run optimize:geojson
```

하천망은 김해시 행정동 전체 경계로 잘라 저장합니다. 하천은 생활권의 물리적
단절 후보, 교량은 양쪽 생활권의 연결 후보, 공원은 생활권 편의·녹지 접근성
지표로 표시합니다. 행정구역 개편의 결론을 자동으로 내리는 값은 아니며
통행량, 통근·통학, 민원 접근시간 자료와 함께 해석해야 합니다.

개발구역 동기화 명령은 산업단지, 지구단위계획, LH 사업지구, 개발진흥지구를
`public/data/gimhae_development_areas.geojson`에 저장합니다. 화면의 `개발계획`
버튼으로 표시하며, 이 레이어는 VWorld에 등재된 공식 지정·고시 구역입니다.
검토 단계의 개발 예정지나 세부 계획 내용은 김해시 UPIS 고시문을 별도로
확인해야 합니다.

김해시 UPIS의 개발 관련 고시정보는 다음 명령으로 SQLite에 저장합니다.
날짜는 `YYYYMMDD` 형식이며, 공공 서버에 부담을 줄이기 위해 요청 사이에
기본 0.25초 간격을 둡니다.

```text
cd /d C:\Users\User\Documents\ChatGPT\Gimhae_si_Map\server
.venv\Scripts\python.exe -m app.sync_upis_development_notices --from-date 20000101 --to-date 20260921
```

동기화 코드는 도시개발, 산업·농공·물류단지, 지구단위계획, 택지개발,
공공주택·정비사업 관련 제목만 선별합니다. 지도에서는 구역명이 고시 제목과
명확히 일치할 때만 자동 연결하며, 범용 이름은 오연결을 막기 위해 연결하지
않습니다. 저장 결과는 `GET /api/development/notices?limit=200`으로 확인합니다.

UPIS 고시를 김해시청·국토교통부 토지이음·경상남도청의 공식 고시 고유 URL과
연결하려면 다음 명령을 실행합니다. 고시번호·고시일·제목·발행기관이 모두
일치한 게시물만 저장하며, 확인되지 않은 자료에는 임의 링크를 만들지
않습니다. 전체 실행은 토지이음의 김해시 목록을 페이지 단위로 받은 뒤
로컬에서 대조합니다.

```text
cd /d C:\Users\User\Documents\ChatGPT\Gimhae_si_Map\server
.venv\Scripts\python.exe -m app.sync_official_notice_links --concurrency 3 --delay-seconds 0.2
```

한 건만 다시 검증하려면 `--notice-number 2026-200 --refresh`를 붙입니다.
남은 경상남도 고시만 공식 도청 게시판과 대조하려면 다음처럼 실행합니다.

```text
.venv\Scripts\python.exe -m app.sync_official_notice_links --organization 경상남도 --delay-seconds 0.2
```

경상남도 게시판은 동기화 토큰을 순서대로 갱신해야 하므로 병렬 요청을 하지
않습니다. 제목에 `김해`가 포함된 공식 고시 목록을 먼저 수집한 뒤 DB에서
번호·날짜·제목을 정확히 대조합니다.

미연결 고시의 원인을 검토할 때는 아래 읽기 전용 점검 명령을 사용합니다.
번호 후보 없음, 발행기관 불일치, 날짜 불일치, 제목 불일치로 분류한 요약과
전체 CSV를 `server/data/reports/`에 만들며 DB는 수정하지 않습니다.

```text
.venv\Scripts\python.exe -m app.audit_official_notice_mismatches --concurrency 3 --delay-seconds 0.2
```

기존 DB에 상태 열을 처음 추가할 때는 마이그레이션을 한 번 실행합니다. 화면에
미확인 이유도 표시하려면 공식 사이트를 다시 대조해 상태만 저장합니다. 후보
링크나 공문 사본은 저장하지 않습니다.

```text
.venv\Scripts\python.exe -m app.migrate_development_notice_status
.venv\Scripts\python.exe -m app.audit_official_notice_mismatches --concurrency 3 --delay-seconds 0.2 --save-status
```

유동·주거인구 CSV는 먼저 미리보기로 열 구조와 지역 코드 일치 여부를 확인한
후 SQLite에 저장합니다. 아래 명령의 CSV 경로는 실제 다운로드 파일 경로로
바꿉니다.

```text
cd /d C:\Users\User\Documents\ChatGPT\Gimhae_si_Map\server
.venv\Scripts\python.exe -m app.import_floating_population --file "C:\data\gimhae_floating_population.csv" --dry-run
.venv\Scripts\python.exe -m app.import_floating_population --file "C:\data\gimhae_floating_population.csv"
```

저장 후 `GET /api/floating-population?year=2025&month=12`로 확인할 수 있습니다.
유동·주거인구 저장·조회 기능은 향후 최신 데이터가 확보될 때 다시 사용할 수
있도록 유지합니다. 현재 지도 화면에서는 신뢰할 수 있는 최신 원자료가 없어
유동·주거인구 분포와 상세 지표를 노출하지 않고 주민등록 인구만 표시합니다.

원천 API 키는 백엔드의 `.env`에서만 사용하며, 브라우저가 행정안전부 API를 직접 호출하지 않습니다.

## 환경 변수

| 변수 | 용도 |
| --- | --- |
| `VITE_NAVER_MAP_CLIENT_ID` | 브라우저용 네이버 지도 Client ID. 네이버 콘솔에서 허용 도메인을 제한해야 합니다. |
| `VITE_API_BASE_URL` | API 주소. 비워 두면 개발 환경은 `127.0.0.1:8000`, 배포 환경은 같은 출처의 `/api`를 사용합니다. |
| `MOIS_SERVICE_KEY` | 행정안전부 API 키. 백엔드 전용이며 브라우저 코드에 넣지 않습니다. |
| `SGIS_CONSUMER_KEY` | SGIS 서비스 ID. 전국 행정동 경계 수집용이며 백엔드에서만 사용합니다. |
| `SGIS_CONSUMER_SECRET` | SGIS 보안 Key. 액세스 토큰 발급용이며 백엔드에서만 사용합니다. |
| `VWORLD_API_KEY` | VWorld 하천망·시설 수집용 인증키. 백엔드에서만 사용합니다. |
| `VWORLD_API_DOMAIN` | VWorld 인증키에 등록한 서비스 도메인 |
| `CORS_ORIGINS` | 쉼표로 구분한 허용 프론트엔드 Origin 목록 |
| `ENABLE_LIVE_MOIS_PROXY` | 원천 API 프록시 허용 여부. 기본값은 `false`이며, 인증·요청 제한을 갖춘 운영 환경에서만 활성화합니다. |

## 보안 및 운영 주의사항

- `.env`, SQLite DB, 원본 CSV, Python 가상환경과 캐시는 저장소에 커밋하지 않습니다.
- `.env`의 실제 키가 노출되었거나 공유되었다면 즉시 폐기하고 재발급합니다.
- `/api/population/regions`는 저장된 SQLite 데이터만 읽습니다. 실시간 원천 프록시는 기본적으로 비활성화되어 있습니다.
- 현재 `/login`과 `/admin` 화면은 인증 UI의 자리만 마련된 상태입니다. 관리자 기능을 추가하기 전 서버 측 인증·권한 검사와 요청 제한을 구현해야 합니다.

## 검증

```powershell
npm run lint
npm run build
```
