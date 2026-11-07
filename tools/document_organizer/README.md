# PC 문서 OCR 정리

Windows에서 원본 폴더를 선택해 파일을 종류별 폴더로 이동하는 도구입니다. PDF·사진·DOCX·HWPX·XLSX·PPTX는 본문 또는 OCR을 읽고, 그 밖의 파일은 파일명과 확장자로 분류합니다. 미리보기에서 제안된 이름과 파일 배치를 고칠 수 있습니다.

## 준비

2025년 8월까지 공개된 도구만 사용합니다: [Python 3.11.9](https://www.python.org/downloads/release/python-3119/) (2024-04-02), [PyMuPDF 1.26.3](https://github.com/pymupdf/PyMuPDF/blob/main/changes.txt) (2025-07-02), [Tesseract 5.4.0](https://github.com/tesseract-ocr/tesseract/releases/tag/5.4.0) (2024-06-06), 한국어 모델 [`tessdata_fast` 4.1.0](https://github.com/tesseract-ocr/tessdata_fast/releases/tag/4.1.0). 이 PC에는 각 버전을 전용 환경으로 준비했습니다.

프로젝트 루트의 PowerShell에서 전용 Python 환경과 PDF 읽기용 패키지를 준비합니다.

```powershell
& 'C:\Users\goodd\AppData\Local\Python\pythoncore-3.11-64\python.exe' -m venv .\tools\document_organizer\.venv
& .\tools\document_organizer\.venv\Scripts\python.exe -m pip install -r .\tools\document_organizer\requirements.txt
```

사진과 스캔 PDF를 읽으려면 [Tesseract Windows 설치 안내](https://tesseract-ocr.github.io/tessdoc/Installation.html)에 따라 Tesseract OCR을 설치하고 **Korean (`kor`) 언어 데이터**를 포함하세요. 이 PC에는 2025년 8월 이전에 공개된 한국어 모델이 `models/kor.traineddata`에 준비되어 있습니다. 설치 후 앱 하단에 `한국어 OCR 사용 가능`이 보여야 합니다. 글자가 이미 들어 있는 PDF와 DOCX·HWPX는 Tesseract 없이도 읽을 수 있습니다.

## 실행

`tools/document_organizer/start.cmd`를 더블클릭합니다. 또는 프로젝트 루트에서 다음 명령을 실행합니다.

```powershell
& .\tools\document_organizer\.venv\Scripts\python.exe .\tools\document_organizer\app.py
```

## Windows 실행 파일

현재 수정본은 `tools/document_organizer/dist/DocumentOrganizer_Compact/DocumentOrganizer_Compact.exe`입니다. 이 파일을 더블클릭하면 Python이나 CMD 창 없이 실행됩니다. 다른 Windows PC로 가져갈 때는 `DocumentOrganizer_Compact` **폴더 전체**를 복사하세요. 폴더에는 Tesseract OCR과 한국어 모델도 함께 들어 있습니다.

실행 파일을 다시 만들려면 전용 Python 환경에서 2025년 8월 이전 버전의 빌드 도구를 설치하고 빌드 스크립트를 실행합니다.

```powershell
& .\tools\document_organizer\.venv\Scripts\python.exe -m pip install -r .\tools\document_organizer\requirements-build.txt
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\document_organizer\build_exe.ps1
```

빌드 결과는 `dist/DocumentOrganizer`에 생성됩니다. 다른 PC에서의 실행은 아직 검증하지 않았습니다.

1. 원본 폴더를 선택합니다. 하위 폴더의 일반 파일도 찾습니다.
2. 결과 폴더를 확인합니다. 기본값은 원본 폴더 옆의 `원본폴더명_자동정리결과`입니다.
3. **분류 미리보기**를 누릅니다. `표시`에서 미분류·읽기 실패·중복·파일명 기준 파일만 볼 수 있고, 열 제목을 눌러 정렬할 수 있습니다. 표에서 파일을 선택하고 원하는 이름을 입력한 뒤 **선택 파일에 적용**을 누르면 그 파일의 폴더가 바뀝니다. **폴더 전체 이름 변경**을 누르면 선택한 파일과 같은 폴더에 있는 파일들의 이름을 한 번에 바꿉니다.
4. **정리 시작**을 누르면 이동할 파일 수와 원본 삭제 여부를 확인할 수 있습니다. 결과 파일과 원본의 SHA-256이 일치할 때 원본을 지웁니다. 동일한 내용이 이미 결과 폴더에 있거나 이번 정리에서 먼저 이동되었다면 결과 파일을 다시 확인한 뒤 중복 원본을 지웁니다. 이름만 같은 다른 파일은 `_2` 같은 번호를 붙입니다. GIS·프로그램 구성 파일은 원래의 하위 폴더 경로를 유지하고, 같은 내용의 구성 요소라도 다른 묶음에서 제거하지 않습니다.

정리가 끝나면 원본 위치에서 이동한 파일이 사라집니다. 읽기에 실패한 파일도 내용 검증을 거쳐 파일명 기준으로 이동하므로 미리보기의 `읽기 방식 / 오류`를 확인하세요. 검증이나 이동에 실패한 파일은 원본에 남습니다. 작업 중 **중단**을 누르거나 창을 닫으면 현재 파일 처리가 끝난 뒤 멈춥니다. 이미 이동된 파일은 결과 폴더에 남고, 미처리 파일은 원본에 남습니다. **결과 폴더 열기**로 실행 기록을 확인할 수 있습니다.

대량 처리에는 `batch.py preview <원본 폴더>`와 `batch.py apply <원본 폴더>`도 사용할 수 있습니다. `apply`는 파일을 이동합니다. 미리보기 데이터는 원본 폴더마다 별도로 저장되며 `--manifest <경로>`로 저장 위치를 지정할 수도 있습니다. 결과 폴더의 `정리_결과_날짜_시간.csv`에는 폴더, **분류 조건**, 이동·중복 정리·실패·미처리 상태가 기록됩니다. 이전 실행 기록은 덮어쓰지 않습니다. 이전 버전의 미리보기 파일은 다시 만들어야 합니다.

자동 제안은 `auto_groups.py`에서 파일명과 추출한 글자의 앞부분을 읽습니다. 날짜·숫자·`보고서` 같은 공통 단어를 제외하고, 여러 문서에서 반복되는 단어를 폴더 이름으로 고릅니다. 문서가 30개 미만이면 최소 2개, 30~99개면 최소 3개, 100개 이상이면 최소 4개에서 나타나야 후보가 됩니다. 폴더는 최대 20개까지 제안하며, 단서가 부족한 파일은 `미분류`에 둡니다. 사진의 사물이나 장면을 이해하는 기능은 없으므로 OCR로 글자를 읽지 못한 사진은 직접 확인하세요.

PDF는 앞의 5쪽을 읽고, 100MB를 넘는 읽기 대상 파일은 읽기 실패로 표시합니다. 구형 `.hwp`는 본문을 읽지 않고 파일명으로 분류하며 이동할 수 있습니다. 본문까지 이용하려면 한글에서 `.hwpx` 또는 PDF로 저장하세요. 설치 파일·프로젝트 파일의 경로 참조는 이동 후에도 동작하는지 보장할 수 없으므로 미리보기에서 해당 묶음을 확인하세요.

문서 내용은 이 PC에서만 처리합니다. 분류 결과를 외부 서비스로 전송하지 않습니다.

## 코드 구성

- `reader.py`: PDF·사진·Office 문서의 글자 추출과 OCR 상태 확인
- `auto_groups.py`: 반복 단어를 이용한 폴더 제안
- `organizer.py`: 중복 확인, 폴더 이름 수정, 내용 검증 후 이동
- `app.py` / `batch.py`: 각각 화면 조작과 명령줄 실행

