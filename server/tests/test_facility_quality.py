import unittest

from app.facility_quality import (
    deduplicate_facilities,
    deduplicate_nearby_parks,
    deduplicate_nearby_schools,
    display_facility_name,
    is_human_medical_facility,
    is_distinct_school,
    is_passenger_transit,
    is_likely_bridge,
    is_market_or_major_mart,
)


class MarketQualityTests(unittest.TestCase):
    def test_actual_markets_and_major_marts_are_allowed(self):
        for name in ("동상시장", "장유중앙시장", "롯데마트 김해점", "하나로마트 김해점"):
            with self.subTest(name=name):
                self.assertTrue(is_market_or_major_mart(name))

    def test_search_term_matches_are_not_facilities(self):
        for name in (
            "가마치통닭 삼방시장점",
            "땅스부대찌개 외동시장점",
            "삼방시장 고객지원센터",
            "김해동상시장청년몰협동조합",
            "이마트24 삼방점",
            "홈플러스 익스프레스 삼방점",
            "롯데마트 수스 장유점",
            "롯데마트 제임스딘 장유점",
            "이마트 아모레퍼시픽 김해점",
        ):
            with self.subTest(name=name):
                self.assertFalse(is_market_or_major_mart(name))


class BridgeQualityTests(unittest.TestCase):
    def test_bridge_names_are_allowed(self):
        for name in ("낙동강대교", "대청계곡출렁다리"):
            with self.subTest(name=name):
                self.assertTrue(is_likely_bridge(name))

    def test_restaurant_names_are_excluded(self):
        for name in ("1991정성코다리", "신주공점투다리", "대동키다리"):
            with self.subTest(name=name):
                self.assertFalse(is_likely_bridge(name))


class HospitalQualityTests(unittest.TestCase):
    def test_animal_hospital_is_not_human_medical_facility(self):
        self.assertFalse(is_human_medical_facility("세계로동물종합병원"))
        self.assertTrue(is_human_medical_facility("의료법인갑을의료재단갑을장유병원"))

    def test_known_aliases_are_deduplicated_without_merging_other_places(self):
        facilities = [
            {"name": "갑을의료재단갑을장유병원", "road_address": "장유로 167-13"},
            {"name": "의료법인갑을의료재단갑을장유병원", "road_address": "장유로 167-13"},
            {"name": "김해보건소", "road_address": None},
            {"name": "김해시보건소", "road_address": "분성로 227"},
            {"name": "김해시서부보건소", "road_address": "능동로 149"},
        ]
        selected = deduplicate_facilities("HOSPITAL", facilities)
        self.assertEqual(len(selected), 3)
        self.assertEqual(
            {item["name"] for item in selected},
            {"갑을의료재단갑을장유병원", "김해시보건소", "김해시서부보건소"},
        )


class OtherFacilityQualityTests(unittest.TestCase):
    def test_school_aliases_are_not_separate_schools(self):
        for name in ("진영장등초중학교", "진영초중학교", "수남고등학교"):
            self.assertFalse(is_distinct_school(name))
        self.assertTrue(is_distinct_school("진영장등초등학교"))
        self.assertTrue(is_distinct_school("진영장등중학교"))
        self.assertTrue(is_distinct_school("김해수남고등학교"))

    def test_park_case_duplicate_requires_nearby_coordinate(self):
        parks = [
            {"name": "e편한세상102동앞공원", "latitude": 35.1935, "longitude": 128.8091},
            {"name": "E편한세상102동앞공원", "latitude": 35.1936, "longitude": 128.8092},
            {"name": "E편한세상102동앞공원", "latitude": 35.2000, "longitude": 128.8092},
        ]
        self.assertEqual(len(deduplicate_nearby_parks(parks)), 2)

    def test_official_light_rail_station_name_is_displayed(self):
        self.assertEqual(
            display_facility_name("TRANSIT", "활천역"), "인제대(활천)역"
        )

    def test_transit_vendor_is_not_a_passenger_stop(self):
        self.assertTrue(is_passenger_transit("불암역"))
        self.assertTrue(is_passenger_transit("진영역"))
        self.assertFalse(is_passenger_transit("코레일유통진영역"))
        self.assertFalse(is_passenger_transit("불암역(버스정류장)"))

    def test_school_aliases_merge_only_when_nearby(self):
        schools = [
            {"name": "내동초등학교", "latitude": 35.2, "longitude": 128.8},
            {"name": "김해내동초등학교", "latitude": 35.2002, "longitude": 128.8,
             "road_address": "평전로 151"},
            {"name": "제일고등학교", "latitude": 35.30, "longitude": 128.74},
            {"name": "김해제일고등학교", "latitude": 35.24, "longitude": 128.85},
        ]
        selected = deduplicate_nearby_schools(schools)
        self.assertEqual(
            {item["name"] for item in selected},
            {"김해내동초등학교", "제일고등학교", "김해제일고등학교"},
        )


if __name__ == "__main__":
    unittest.main()
