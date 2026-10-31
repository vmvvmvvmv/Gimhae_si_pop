# 배포 전 점검

현재 Docker 이미지는 React 화면과 FastAPI를 함께 제공합니다. 화면의 API 주소는 같은 출처의 `/api`로 빌드됩니다. 아래 절차는 서버 종류를 정하기 전에도 확인할 수 있는 공통 항목입니다. 실제 공개 배포와 데이터 이전은 별도 작업입니다.

## 1. 로컬 검증

프로젝트 폴더에서 프런트엔드 검사를 실행합니다.

```bat
npm test
npm run lint
npm run build
```

백엔드 테스트는 `server` 폴더에서 실행합니다.

```bat
cd server
.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Docker Desktop이 실행 중일 때만 다음 명령으로 새 이미지를 만듭니다. 지도 Client ID는 브라우저에 전달되는 공개 식별자이므로 네이버 콘솔에서 실제 접속 도메인만 허용해야 합니다. 값을 바꾸면 이미지를 다시 빌드해야 합니다.

```bat
docker build --build-arg VITE_NAVER_MAP_CLIENT_ID=본인의_지도_Client_ID -t gimhae-map .
docker compose up -d
docker compose ps
```

`docker compose ps`의 `healthy`는 API가 열리고 행정동·법정동 인구 자료가 모두 확인됐다는 뜻입니다. 이미지 빌드가 끝나도 DB가 없으면 `unhealthy`가 정상적인 경고입니다.

## 2. DB를 별도로 보관하기

`server/data/gimhae_population.db`는 이미지와 Git에 들어가지 않습니다. 현재 Compose는 호스트의 `server/data`를 컨테이너에 연결합니다. 새 서버에는 이 DB를 별도로 옮기고, 컨테이너가 읽고 쓸 수 있는 권한을 줘야 합니다. 빈 `server/data`로 실행하면 서버 프로세스는 떠도 인구 자료가 나오지 않습니다.

DB를 복사하기 전에는 쓰기 작업을 멈추고 일관된 백업을 만드세요. 운영 중인 SQLite 파일을 단순 복사하면 진행 중인 트랜잭션이나 WAL 파일 때문에 복사본이 불완전할 수 있습니다. DB나 백업 파일을 Git에 올리거나 공개 저장소에 첨부하지 않습니다.

데이터 준비 상태는 `GET /api/ready`로 확인합니다. 행정동과 법정동 인구가 모두 있으면 `200`, 한쪽이 비었거나 스키마가 없으면 `503`입니다. `GET /api/health`는 서버 프로세스 상태 확인용이며 데이터 존재를 보장하지 않습니다.

## 3. 공개 전 확인

- 지도에서 행정동·법정동 각각 선택, 검색, 시설 로드뷰, 개발계획 원문 연결, CSV 미리보기와 내려받기를 실제 브라우저에서 확인합니다.
- 접속 주소에 HTTPS를 적용하고 HTTP는 HTTPS로 이동시킵니다.
- 네이버 지도 Client ID에는 실제 웹 도메인을 등록합니다. 지도에 쓰는 Client ID와 서버 전용 API 키를 혼동하지 않습니다.
- 백엔드 전용 키는 서버 환경 변수로만 넣고 `.env` 파일과 DB는 저장소에 포함하지 않습니다.
- 별도 프런트엔드 주소를 쓸 때만 `VITE_API_BASE_URL`과 `CORS_ORIGINS`를 그 주소에 맞게 설정합니다. 현재 Docker 이미지는 `/api`를 같은 출처에서 제공합니다.
- 서버 데이터 디렉터리의 지속 저장, DB 정기 백업, 복구 테스트, 로그 확인 방법을 정합니다.
- `/login`과 `/admin`은 실제 인증 기능이 없는 안내 화면입니다. 관리자 기능으로 공개하지 않습니다.

현재 `compose.yaml`은 로컬의 `gimhae-map:latest` 이미지를 사용합니다. 새 서버에는 이미지를 다시 빌드하거나 신뢰할 수 있는 이미지 저장소에서 가져와야 합니다. 어느 방식을 쓸지는 배포 서버를 정한 뒤 결정합니다.

## 4. 한 서버에서 운영할 때

`compose.prod.yaml`은 같은 Docker 서버에서 앱과 Caddy를 함께 실행합니다. 외부에는 80·443 포트만 열고, FastAPI의 8000 포트는 Docker 내부 네트워크에서만 사용합니다. Caddy는 도메인에 맞는 HTTPS 인증서를 자동으로 발급·갱신합니다. DNS가 서버를 가리키고 외부에서 80·443 포트로 접속할 수 있어야 합니다.

1. 서버에 프로젝트 코드를 준비합니다. `server/data/gimhae_population.db`는 Git으로 옮기지 말고 별도로 안전하게 복사합니다. 파일과 `server/data` 디렉터리의 읽기·쓰기 권한을 확인합니다.
2. 서버에서 `deploy.example.env`를 `deploy.env`로 복사하고 실제 `SITE_DOMAIN`과 `VITE_NAVER_MAP_CLIENT_ID`를 채웁니다. 도메인에는 `https://` 없이 호스트 이름만 적습니다. `deploy.env`는 Git과 Docker 빌드 컨텍스트에서 제외됩니다.
3. 네이버 지도 콘솔의 허용 웹 도메인에 실제 HTTPS 주소를 등록합니다.
4. 프로젝트 폴더에서 아래 명령을 실행합니다.

```bat
docker compose --env-file deploy.env -f compose.prod.yaml config --quiet
docker compose --env-file deploy.env -f compose.prod.yaml up -d --build
docker compose --env-file deploy.env -f compose.prod.yaml ps
```

`app`이 `healthy`가 되기 전에는 Caddy가 시작되지 않습니다. DB가 비었으면 먼저 데이터 파일과 권한을 확인합니다. `config --quiet`은 설정의 문법만 검사하고 키 값을 화면에 출력하지 않습니다.

5. 브라우저에서 `https://설정한_도메인`에 접속합니다. `https://설정한_도메인/api/ready`는 데이터가 있으면 `200`을 반환합니다. 지도·지역 선택·고시 원문·CSV 내려받기까지 확인합니다.

운영 DB와 Caddy의 `caddy_data` 볼륨은 별도로 백업해야 합니다. Docker 이미지 재빌드는 백업을 대신하지 않습니다. 현재 설정은 단일 앱 컨테이너·단일 SQLite DB를 전제로 하므로 앱 컨테이너를 여러 개로 늘리지 않습니다.
