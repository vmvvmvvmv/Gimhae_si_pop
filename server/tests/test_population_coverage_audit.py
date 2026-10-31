import sqlite3
import unittest

from app.audit_population_coverage import AGE_GROUPS, audit, months_between, valid_month


class PopulationCoverageAuditTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.executescript("""
            CREATE TABLE regions (id INTEGER, level TEXT, region_code TEXT,
                                  region_name TEXT, is_active INTEGER);
            CREATE TABLE population_monthly (region_id INTEGER, stats_ym TEXT);
            CREATE TABLE population_age_monthly (region_id INTEGER, stats_ym TEXT,
                                                 age_group TEXT);
            CREATE TABLE national_population_monthly (stats_ym TEXT);
            CREATE TABLE national_area_annual (year INTEGER);
            CREATE TABLE national_administrative_area
                (boundary_year INTEGER, region_code TEXT, region_name TEXT);
            CREATE TABLE national_administrative_population_monthly
                (stats_ym TEXT, region_code TEXT, region_name TEXT);
        """)

    def tearDown(self):
        self.conn.close()

    def test_month_validation_and_year_transition(self):
        self.assertFalse(valid_month("202513"))
        self.assertFalse(valid_month("2025AA"))
        self.assertEqual(list(months_between("202512", "202601")), ["202512", "202601"])

    def test_missing_population_and_partial_age_are_separate(self):
        self.conn.executemany("INSERT INTO regions VALUES (?, ?, ?, ?, 1)", [
            (1, "admin", "A", "행정 A"),
            (2, "admin", "B", "행정 B"),
            (3, "legal", "C", "법정 C"),
        ])
        self.conn.executemany("INSERT INTO population_monthly VALUES (?, ?)", [
            (1, "202501"), (1, "202503"), (2, "202501"), (2, "202502"), (2, "202503"),
            (3, "202502"),
        ])
        self.conn.executemany("INSERT INTO population_age_monthly VALUES (1, '202501', ?)",
                              [(group,) for group in AGE_GROUPS[:-1]])
        issues = audit(self.conn, "202501", "202503")
        self.assertIn(("population", "admin", "202502", "A"),
                      {(row.category, row.level, row.stats_ym, row.region_code) for row in issues})
        self.assertIn("100세 이상", next(row.detail for row in issues if row.category == "age"
                                       and row.region_code == "A" and row.stats_ym == "202501"))
        self.assertFalse(any(row.level == "legal" and row.stats_ym == "202501" for row in issues))
        self.assertFalse(any(row.category == "age" and row.region_code == "A"
                             and row.stats_ym == "202502" for row in issues))

    def test_national_comparison_uses_area_year_and_name_fallback(self):
        self.conn.execute("INSERT INTO regions VALUES (1, 'admin', 'A', '행정 A', 1)")
        self.conn.execute("INSERT INTO population_monthly VALUES (1, '202501')")
        self.conn.executemany("INSERT INTO population_age_monthly VALUES (1, '202501', ?)",
                              [(group,) for group in AGE_GROUPS])
        self.conn.execute("INSERT INTO national_population_monthly VALUES ('202501')")
        self.conn.execute("INSERT INTO national_area_annual VALUES (2025)")
        self.conn.executemany("INSERT INTO national_administrative_area VALUES (2024, ?, ?)",
                              [("X", "전국 X"), ("Y", "전국 Y")])
        self.conn.execute("INSERT INTO national_administrative_population_monthly "
                          "VALUES ('202501', 'changed', '전국 X')")
        issues = audit(self.conn)
        self.assertEqual([(row.category, row.detail) for row in issues], [
            ("comparison_population", "면적 기준 2024년 2개 중 인구 미연결 1개")
        ])

    def test_missing_tables_fail_without_creating_them(self):
        self.conn.execute("DROP TABLE national_area_annual")
        with self.assertRaisesRegex(ValueError, "national_area_annual"):
            audit(self.conn)

    def test_outside_observed_range_is_not_reported_as_complete(self):
        self.conn.execute("INSERT INTO regions VALUES (1, 'legal', 'C', '법정 C', 1)")
        self.conn.execute("INSERT INTO population_monthly VALUES (1, '202501')")
        issues = audit(self.conn, "202601", "202612")
        self.assertEqual(issues[0].category, "no_population")
        self.assertIn("겹치지 않음", issues[0].detail)


if __name__ == "__main__":
    unittest.main()
