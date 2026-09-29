"""공식 고시 원문 확인 상태와 사용자 안내 문구."""

VERIFIED = "VERIFIED"
PENDING = "PENDING"
NOT_FOUND = "NOT_FOUND"
DATE_MISMATCH = "DATE_MISMATCH"
TITLE_MISMATCH = "TITLE_MISMATCH"
DATE_TITLE_MISMATCH = "DATE_TITLE_MISMATCH"
ORG_MISMATCH = "ORG_MISMATCH"
SOURCE_ERROR = "SOURCE_ERROR"

VALID_STATUSES = frozenset({
    VERIFIED,
    PENDING,
    NOT_FOUND,
    DATE_MISMATCH,
    TITLE_MISMATCH,
    DATE_TITLE_MISMATCH,
    ORG_MISMATCH,
    SOURCE_ERROR,
})

STATUS_LABELS = {
    VERIFIED: "공식 원문 확인",
    PENDING: "원문 확인 대기",
    NOT_FOUND: "같은 고시번호 원문 미확인",
    DATE_MISMATCH: "고시일 불일치",
    TITLE_MISMATCH: "고시 제목 불일치",
    DATE_TITLE_MISMATCH: "고시일·제목 불일치",
    ORG_MISMATCH: "발행기관 불일치",
    SOURCE_ERROR: "공식 사이트 조회 오류",
}

STATUS_MESSAGES = {
    VERIFIED: "발행기관 공식 원문을 확인했습니다.",
    PENDING: "아직 공식 원문 대조를 마치지 않았습니다.",
    NOT_FOUND: "공식 사이트에서 같은 고시번호의 원문을 찾지 못했습니다.",
    DATE_MISMATCH: "같은 번호의 공식 문서가 있지만 고시일이 다릅니다.",
    TITLE_MISMATCH: "같은 번호와 날짜의 공식 문서가 있지만 제목이 다릅니다.",
    DATE_TITLE_MISMATCH: "같은 번호의 공식 문서가 있지만 고시일과 제목이 다릅니다.",
    ORG_MISMATCH: "같은 고시번호가 다른 발행기관 문서에서 확인됐습니다.",
    SOURCE_ERROR: "공식 사이트를 조회하지 못했습니다. 다음 점검 때 다시 확인합니다.",
}

AUDIT_REASON_TO_STATUS = {
    # 정확 일치는 동기화 명령이 공식 URL까지 저장해야 VERIFIED가 됩니다.
    "exact_match": PENDING,
    "date_mismatch": DATE_MISMATCH,
    "title_mismatch": TITLE_MISMATCH,
    "date_and_title_mismatch": DATE_TITLE_MISMATCH,
    "organization_mismatch": ORG_MISMATCH,
    "no_number_candidate": NOT_FOUND,
}
