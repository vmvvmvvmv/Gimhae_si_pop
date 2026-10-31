# 다른 PC에서 김해시 GIS 이어서 작업하기

이 안내는 Windows PowerShell 기준이다. **GitHub에는 코드와 문서만 올린다.** 실제 지도/API 키가 든 `.env`, SQLite DB, 원본 수집 데이터는 Git으로 옮기지 않는다. 새 PC에서 같은 화면·데이터를 보려면 아래의 코드, 키, DB 세 가지를 각각 준비해야 한다.

## 1. 코드 받기

새 PC에 Git, Node.js, Python을 설치한 뒤 원하는 작업 폴더에서 실행한다. 현재 개발 브랜치는 `feat/deploy-and-map-ui`다.

```powershell
git clone --branch feat/deploy-and-map-ui https://github.com/vmvvmvvmv/Gimhae_si_pop.git Gimhae_si_Map
cd Gimhae_si_Map
npm ci
```

GitHub 저장소 접근 권한이 필요한 경우, 새 PC에서 본인 계정으로 로그인한다. 이후 작업을 이어받을 때는 이 폴더에서 `git pull --ff-only`를 실행한다. `--ff-only`가 실패하면 로컬 변경·원격 이력을 먼저 확인한다. 강제로 덮어쓰지 않는다.

## 2. 키 설정

프로젝트 루트에 예시 파일을 복사한다.

```powershell
Copy-Item .env.example .env
```

`.env`를 열어 본인의 키를 입력한다. 지도 표시에는 `VITE_NAVER_MAP_CLIENT_ID`가 필요하다. 이 값은 브라우저에 노출되므로 NAVER Maps 콘솔에서 `http://localhost:5173` 등 사용하는 Web 서비스 URL을 허용해야 한다. 데이터를 새로 수집할 때는 `.env.example`에 적힌 백엔드용 MOIS·SGIS·VWorld 키도 필요하다. 키는 메신저·공개 저장소에 올리지 말고 비밀번호 관리자 등 안전한 방법으로 새 PC에서 다시 입력한다. `.env`는 Git에서 제외된다.

## 3. DB 준비: 둘 중 하나 선택

- **기존 데이터 그대로 사용:** 이 PC의 `server/data/gimhae_population.db`를 개인적으로 관리하는 암호화된 저장매체나 안전한 전송 방법으로 새 PC의 같은 상대 경로에 복사한다. DB 복사 전에 백엔드와 DB를 쓰는 작업을 모두 종료한다. `server/data/` 폴더는 없으면 새 PC에서 만든다. GitHub에는 올리지 않는다.
- **새 DB에서 시작:** 기존 인구·개발고시·시설 데이터는 바로 보이지 않는다. 아래 `init_db` 명령으로 경계 기본정보만 만든 뒤, `README.md` 또는 `docs/project-handoff.md`의 동기화 명령으로 필요한 데이터를 다시 수집한다. 데이터 수집에는 해당 API 키와 시간이 필요하다.

현재 PC의 DB는 약 118 MB이다. `server/data/imports/` 같은 수집 원본이나 과거 백업은 일반적인 화면 실행에 필수는 아니지만, 분석·재수집 작업을 그대로 이어갈 계획이라면 필요한 폴더만 별도로 안전하게 옮긴다. DB를 이미 복사했다면 빈 DB 초기화 명령을 다시 실행할 필요는 없다.

## 4. 백엔드와 프론트엔드 실행

Python 가상환경은 PC마다 새로 만든다. 현재 개발 PC는 Node.js 24, Python 3.14를 사용한다. 다른 버전을 쓸 때 의존성 설치 또는 GIS 라이브러리 호환 문제가 생기면 버전을 먼저 확인한다.

```powershell
cd server
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
# 새 DB로 시작하는 경우에만 다음 줄을 실행한다.
.\.venv\Scripts\python.exe -m app.init_db
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

`python` 명령을 찾지 못한다면 Python 설치와 PATH 설정을 확인한다. 백엔드 터미널은 켜 둔다. 새 PowerShell 창을 열어 프로젝트 루트에서 프론트엔드를 실행한다.

```powershell
npm run dev
```

브라우저에서 Vite가 표시한 주소(보통 `http://localhost:5173/`)를 연다. 지도 바탕이 안 보이면 `.env`의 NAVER Client ID와 NAVER Maps 콘솔의 허용 URL을 확인한다. 인구가 안 보이면 `http://127.0.0.1:8000/api/health` 및 DB 준비 상태를 확인한다. 튜토리얼의 첫 방문 기록은 브라우저 `localStorage`에 저장되므로 새 PC에서는 다시 나타날 수 있고, `사용 안내`로 언제든 다시 열 수 있다.

## 5. Codex에서 이어가기

새 PC에서 같은 GitHub 저장소를 받은 폴더를 Codex 프로젝트로 열고, `docs/project-handoff.md`를 먼저 읽도록 요청한다. 계정에서 이 대화를 다시 볼 수 있더라도, 대화 자체가 이 PC의 로컬 코드·`.env`·DB를 자동 복사하지는 않는다. 새 채팅이라면 인수인계 문서의 **다음 채팅에 전달할 시작 문구**를 사용한다.

프로젝트의 원본 폴더가 OneDrive 등으로 동기화되더라도 Git 작업과 자동 동기화를 동시에 혼용하면 충돌할 수 있다. 코드는 GitHub 브랜치를 기준으로 옮기고, 키·DB는 위와 같이 별도로 관리한다.
