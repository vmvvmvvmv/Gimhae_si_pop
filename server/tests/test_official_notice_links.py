import unittest

from app.sync_official_notice_links import (
    OfficialCandidate,
    NoticeSnapshot,
    choose_exact_candidate,
    parse_eum_candidates,
    parse_gyeongnam_candidates,
)
from app.audit_official_notice_mismatches import classify_notice


EUM_LIST_SAMPLE = """
<table><tbody>
<tr class="center">
  <td>2026-07-30</td>
  <td title="경상남도 고시 제2026-369호">경상남도 고시 제2026-369호</td>
  <td><a href="gvGosiDet.jsp?seq=638912&amp;gosino=2026-369"
    title="김해 풍유일반물류단지 지정 해제, 사업시행자 지정 취소 및 지형도면 고시">원문</a></td>
  <td title="경상남도">경상남도</td>
</tr>
</tbody></table>
"""

GYEONGNAM_LIST_SAMPLE = """
<table><tbody>
<tr onclick="viewData('55047','N')">
  <td class="d_tb_center">2026-369</td>
  <td class="d_tb_left">김해 풍유일반물류단지 지정 해제, 사업시행자 지정 취소 및 지형도면 고시</td>
  <td class="d_tb_left">교통건설국 물류공항철도과</td>
  <td class="d_tb_center">2026-07-30</td>
  <td class="d_tb_center">3</td>
</tr>
</tbody></table>
"""


class OfficialNoticeLinkTests(unittest.TestCase):
    def setUp(self):
        self.notice = NoticeSnapshot(
            source_id="notice-369",
            notice_number="2026-369",
            notice_date="2026-07-30",
            title="김해 풍유일반물류단지 지정 해제, 사업시행자 지정 취소 및 지형도면 고시",
            organization_name="경상남도",
        )

    def test_eum_list_parser_builds_canonical_detail_url(self):
        candidates = parse_eum_candidates(EUM_LIST_SAMPLE)
        self.assertEqual(len(candidates), 1)
        self.assertEqual(
            candidates[0].url,
            "https://www.eum.go.kr/web/gs/gv/gvGosiDet.jsp?seq=638912",
        )

    def test_exact_match_requires_number_date_title_and_organization(self):
        candidate = parse_eum_candidates(EUM_LIST_SAMPLE)[0]
        self.assertEqual(choose_exact_candidate(self.notice, [candidate]), candidate)

        for changed in (
            NoticeSnapshot(**{**self.notice.__dict__, "notice_date": "2026-07-29"}),
            NoticeSnapshot(**{**self.notice.__dict__, "title": "비슷하지만 다른 고시"}),
            NoticeSnapshot(**{**self.notice.__dict__, "organization_name": "김해시"}),
        ):
            with self.subTest(changed=changed):
                self.assertIsNone(choose_exact_candidate(changed, [candidate]))

    def test_gyeongnam_list_parser_builds_stable_detail_url(self):
        candidates = parse_gyeongnam_candidates(GYEONGNAM_LIST_SAMPLE)
        self.assertEqual(len(candidates), 1)
        self.assertEqual(
            candidates[0].url,
            "https://minwon.gyeongnam.go.kr/citynet/jsp/sap/"
            "SAPGosiBizProcess.do?command=searchDetail&flag=gosiGL&"
            "gosiGbn=N&sno=55047&svp=Y",
        )
        self.assertEqual(choose_exact_candidate(self.notice, candidates), candidates[0])

    def test_audit_classifies_each_mismatch_without_relaxing_match(self):
        exact = parse_eum_candidates(EUM_LIST_SAMPLE)[0]
        cases = (
            (exact, "exact_match"),
            (
                OfficialCandidate(**{**exact.__dict__, "notice_date": "2026-07-29"}),
                "date_mismatch",
            ),
            (
                OfficialCandidate(**{**exact.__dict__, "title": "서로 다른 제목"}),
                "title_mismatch",
            ),
            (
                OfficialCandidate(
                    **{
                        **exact.__dict__,
                        "notice_date": "2026-07-29",
                        "title": "서로 다른 제목",
                    },
                ),
                "date_and_title_mismatch",
            ),
            (
                OfficialCandidate(**{**exact.__dict__, "organization_name": "김해시"}),
                "organization_mismatch",
            ),
        )
        for candidate, expected in cases:
            with self.subTest(expected=expected):
                self.assertEqual(
                    classify_notice(self.notice, [candidate]).reason,
                    expected,
                )

        self.assertEqual(classify_notice(self.notice, []).reason, "no_number_candidate")


if __name__ == "__main__":
    unittest.main()
