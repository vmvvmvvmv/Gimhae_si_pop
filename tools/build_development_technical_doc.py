from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "김해시_GIS_개발_기술서_2026-10-02.docx"
WORK = ROOT / ".docx_work"
ARCHITECTURE_IMAGE = WORK / "system_architecture.png"
BACKEND_IMAGE = WORK / "backend_layers.png"
SCREEN_IMAGE = WORK / "dashboard_numbered_layout.png"
ERD_IMAGE = WORK / "database_erd.png"

BLACK = "000000"
NAVY = "17365D"
BLUE = "2D5DA1"
LIGHT_BLUE = "EAF3FA"
PALE_BLUE = "F5F9FD"
GRAY = "666666"
LIGHT_GRAY = "F2F4F6"
BORDER = "D9D9D9"
ORANGE = "B56A18"
PALE_ORANGE = "FFF4E5"
GREEN = "2E6B4F"
PALE_GREEN = "EAF6EF"
RED = "9E3B3B"


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_border(cell, color: str = BORDER, size: str = "6") -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.first_child_found_in("w:tcBorders")
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = f"w:{edge}"
        node = borders.find(qn(tag))
        if node is None:
            node = OxmlElement(tag)
            borders.append(node)
        node.set(qn("w:val"), "single")
        node.set(qn("w:sz"), size)
        node.set(qn("w:color"), color)


def set_cell_margins(cell, top=110, start=120, bottom=110, end=120) -> None:
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_run_font(run, name="Noto Sans KR", size=None, bold=None, color=None) -> None:
    run.font.name = name
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), name)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if color is not None:
        run.font.color.rgb = RGBColor.from_string(color)


def set_paragraph_spacing(paragraph, before=0, after=0, line=1.35) -> None:
    fmt = paragraph.paragraph_format
    fmt.space_before = Pt(before)
    fmt.space_after = Pt(after)
    fmt.line_spacing = line


def add_hyperlink(paragraph, text: str, url: str, color=BLUE) -> None:
    part = paragraph.part
    relationship_id = part.relate_to(
        url,
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
        is_external=True,
    )
    hyperlink = OxmlElement("w:hyperlink")
    hyperlink.set(qn("r:id"), relationship_id)
    run = OxmlElement("w:r")
    run_pr = OxmlElement("w:rPr")
    run_color = OxmlElement("w:color")
    run_color.set(qn("w:val"), color)
    underline = OxmlElement("w:u")
    underline.set(qn("w:val"), "single")
    fonts = OxmlElement("w:rFonts")
    fonts.set(qn("w:ascii"), "Noto Sans KR")
    fonts.set(qn("w:hAnsi"), "Noto Sans KR")
    fonts.set(qn("w:eastAsia"), "Noto Sans KR")
    run_pr.extend([fonts, run_color, underline])
    run.append(run_pr)
    text_node = OxmlElement("w:t")
    text_node.text = text
    run.append(text_node)
    hyperlink.append(run)
    paragraph._p.append(hyperlink)


def add_page_number(paragraph) -> None:
    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = paragraph.add_run("페이지 ")
    set_run_font(run, size=8, color=GRAY)
    fld_char_1 = OxmlElement("w:fldChar")
    fld_char_1.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    fld_char_2 = OxmlElement("w:fldChar")
    fld_char_2.set(qn("w:fldCharType"), "end")
    run._r.extend([fld_char_1, instr, fld_char_2])


def add_body(doc: Document, text: str, *, bold_start: str | None = None):
    p = doc.add_paragraph()
    p.style = doc.styles["Body Text"]
    if bold_start and text.startswith(bold_start):
        first = p.add_run(bold_start)
        set_run_font(first, bold=True)
        rest = p.add_run(text[len(bold_start):])
        set_run_font(rest)
    else:
        run = p.add_run(text)
        set_run_font(run)
    set_paragraph_spacing(p, after=5, line=1.42)
    return p


def add_bullets(doc: Document, items: list[str], level=0) -> None:
    for item in items:
        p = doc.add_paragraph(style="List Bullet" if level == 0 else "List Bullet 2")
        run = p.add_run(item)
        set_run_font(run, size=9.5)
        set_paragraph_spacing(p, after=2.5, line=1.25)


def add_numbered(doc: Document, items: list[str]) -> None:
    for item in items:
        p = doc.add_paragraph(style="List Number")
        run = p.add_run(item)
        set_run_font(run, size=9.5)
        set_paragraph_spacing(p, after=3, line=1.28)


def add_callout(doc: Document, title: str, text: str, *, tone="blue") -> None:
    accent = {"blue": BLUE, "green": GREEN, "orange": ORANGE}[tone]
    p = doc.add_paragraph()
    p.paragraph_format.keep_together = True
    r = p.add_run(title + "  ")
    set_run_font(r, size=9.6, bold=True, color=accent)
    r = p.add_run(text)
    set_run_font(r, size=9.4, color=BLACK)
    set_paragraph_spacing(p, after=7, line=1.38)


def add_code_block(doc: Document, lines: list[str]) -> None:
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.cell(0, 0)
    set_cell_shading(cell, "F4F5F7")
    set_cell_border(cell, "D5D8DC", "5")
    set_cell_margins(cell, 110, 160, 110, 160)
    p = cell.paragraphs[0]
    for index, line in enumerate(lines):
        if index:
            p.add_run().add_break()
        run = p.add_run(line)
        set_run_font(run, name="Consolas", size=8.3, color="30343B")
    p.paragraph_format.keep_together = True
    p.paragraph_format.line_spacing = 1.05
    doc.add_paragraph().paragraph_format.space_after = Pt(1)


def add_table(doc: Document, headers: list[str], rows: list[list[str]], widths=None):
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    hdr = table.rows[0]
    tr_pr = hdr._tr.get_or_add_trPr()
    repeat = OxmlElement("w:tblHeader")
    repeat.set(qn("w:val"), "true")
    tr_pr.append(repeat)
    for i, header in enumerate(headers):
        cell = hdr.cells[i]
        set_cell_shading(cell, NAVY)
        set_cell_border(cell)
        set_cell_margins(cell)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(header)
        set_run_font(r, size=8.6, bold=True, color="FFFFFF")
        if widths:
            cell.width = Cm(widths[i])
    for row_index, values in enumerate(rows):
        row = table.add_row()
        cant_split = OxmlElement("w:cantSplit")
        row._tr.get_or_add_trPr().append(cant_split)
        for i, value in enumerate(values):
            cell = row.cells[i]
            set_cell_shading(cell, "FFFFFF" if row_index % 2 == 0 else PALE_BLUE)
            set_cell_border(cell)
            set_cell_margins(cell)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if i == 0 else WD_ALIGN_PARAGRAPH.LEFT
            r = p.add_run(str(value))
            set_run_font(r, size=8.2, color=BLACK)
            p.paragraph_format.line_spacing = 1.2
            if widths:
                cell.width = Cm(widths[i])
    doc.add_paragraph().paragraph_format.space_after = Pt(1)
    return table


def add_source_link(doc: Document, label: str, url: str, note: str = "") -> None:
    p = doc.add_paragraph(style="List Bullet")
    add_hyperlink(p, label, url)
    if note:
        r = p.add_run(f"  {note}")
        set_run_font(r, size=9, color=GRAY)
    set_paragraph_spacing(p, after=3)


def create_diagrams() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    font_path = Path("C:/Windows/Fonts/NotoSansKR-VF.ttf")
    font_regular = ImageFont.truetype(str(font_path), 31)
    font_small = ImageFont.truetype(str(font_path), 27)
    font_title = ImageFont.truetype(str(font_path), 48)

    def hex_color(value: str) -> str:
        return "#" + value.lstrip("#")

    def draw_centered(draw, box, label, font, fill="#111111"):
        left, top, right, bottom = box
        lines = label.split("\n")
        line_height = font.size + 8
        total_height = line_height * len(lines) - 8
        y = top + (bottom - top - total_height) / 2
        for line in lines:
            bounds = draw.textbbox((0, 0), line, font=font)
            width = bounds[2] - bounds[0]
            draw.text((left + (right - left - width) / 2, y), line, font=font, fill=fill)
            y += line_height

    def arrow(draw, start, end, fill="#718096", width=5):
        draw.line([start, end], fill=fill, width=width)
        x1, y1 = start
        x2, y2 = end
        dx, dy = x2 - x1, y2 - y1
        length = max((dx * dx + dy * dy) ** 0.5, 1)
        ux, uy = dx / length, dy / length
        px, py = -uy, ux
        size = 18
        base_x, base_y = x2 - ux * size, y2 - uy * size
        draw.polygon(
            [(x2, y2), (base_x + px * size * 0.55, base_y + py * size * 0.55),
             (base_x - px * size * 0.55, base_y - py * size * 0.55)],
            fill=fill,
        )

    image = Image.new("RGB", (2160, 1200), "white")
    draw = ImageDraw.Draw(image)
    sx, sy = 180, 160
    boxes = [
        (0.4, 4.6, 2.3, 1.15, "사용자 브라우저\nReact 19 TypeScript", LIGHT_BLUE, NAVY),
        (3.35, 4.6, 2.3, 1.15, "FastAPI\n조회 API", "EAF6EF", GREEN),
        (6.3, 4.6, 2.3, 1.15, "SQLite\n정제 데이터와 상태", "F4F5F7", "4A4A4A"),
        (9.25, 4.6, 2.3, 1.15, "NAVER Maps\n지도 배경", "FFF4E5", ORANGE),
        (0.7, 1.2, 2.0, 1.05, "행정안전부\n주민등록 인구", "F5F9FD", BLUE),
        (3.05, 1.2, 2.0, 1.05, "SGIS KOSIS\n면적과 전국 비교", "F5F9FD", BLUE),
        (5.4, 1.2, 2.0, 1.05, "VWorld\n경계 시설 개발구역", "F5F9FD", BLUE),
        (7.75, 1.2, 2.0, 1.05, "김해 UPIS\n개발 고시", "F5F9FD", BLUE),
        (10.1, 1.2, 1.5, 1.05, "공식 게시판\n원문 링크", "FFF4E5", ORANGE),
    ]
    for x, y, w, h, label, fill, edge in boxes:
        box = (int(x * sx), int((7 - y - h) * sy), int((x + w) * sx), int((7 - y) * sy))
        draw.rounded_rectangle(box, radius=22, fill=hex_color(fill), outline=hex_color(edge), width=5)
        draw_centered(draw, box, label, font_regular)
    arrows = [
        ((2.7, 5.18), (3.35, 5.18)),
        ((5.65, 5.18), (6.3, 5.18)),
        ((2.7, 5.45), (9.25, 5.45)),
        ((1.7, 2.25), (7.0, 4.6)),
        ((4.05, 2.25), (7.1, 4.6)),
        ((6.4, 2.25), (7.2, 4.6)),
        ((8.75, 2.25), (7.35, 4.6)),
        ((10.85, 2.25), (7.5, 4.6)),
    ]
    for start, end in arrows:
        arrow(draw, (int(start[0] * sx), int((7 - start[1]) * sy)),
              (int(end[0] * sx), int((7 - end[1]) * sy)))
    draw_centered(draw, (0, 40, 2160, 150), "김해시 GIS 인구지도 시스템 구성", font_title, "#000000")
    draw_centered(draw, (0, 1080, 2160, 1160), "외부 자료는 동기화 단계에서 정리한 뒤 SQLite와 GeoJSON에 저장하고 화면은 내부 API를 통해 읽는다", font_small, "#4A5568")
    image.save(ARCHITECTURE_IMAGE, quality=95)

    image = Image.new("RGB", (2070, 970), "white")
    draw = ImageDraw.Draw(image)
    sx, sy = 180, 160
    layers = [
        (0.5, 2.05, 2.1, 1.2, "API\n요청 검증과 응답", LIGHT_BLUE, BLUE),
        (3.2, 2.05, 2.1, 1.2, "Service\n업무 규칙과 트랜잭션", "EAF6EF", GREEN),
        (5.9, 2.05, 2.1, 1.2, "Repository\nSQLAlchemy 조회와 저장", "F4F5F7", "555555"),
        (8.6, 2.05, 2.1, 1.2, "SQLite 또는 외부 API\n데이터 원천", "FFF4E5", ORANGE),
    ]
    for x, y, w, h, label, fill, edge in layers:
        box = (int(x * sx), int((5.5 - y - h) * sy), int((x + w) * sx), int((5.5 - y) * sy))
        draw.rounded_rectangle(box, radius=22, fill=hex_color(fill), outline=hex_color(edge), width=5)
        draw_centered(draw, box, label, font_regular)
    for start, end in [((2.6, 2.65), (3.2, 2.65)), ((5.3, 2.65), (5.9, 2.65)), ((8.0, 2.65), (8.6, 2.65))]:
        arrow(draw, (int(start[0] * sx), int((5.5 - start[1]) * sy)),
              (int(end[0] * sx), int((5.5 - end[1]) * sy)), fill="#5B677A")
    draw_centered(draw, (0, 45, 2070, 150), "백엔드 의존 방향", font_title, "#000000")
    draw_centered(draw, (0, 790, 2070, 900), "Repository는 commit하지 않는다 · Service가 업무 단위와 실패 시 롤백 범위를 결정한다", font_small, "#4A5568")
    image.save(BACKEND_IMAGE, quality=95)

    image = Image.new("RGB", (2160, 1320), "white")
    draw = ImageDraw.Draw(image)
    draw_centered(draw, (0, 35, 2160, 140), "대시보드 화면 구성", font_title, "#000000")
    panels = [
        ((120, 175, 2040, 300), "1  지역 구분과 조회 조건", LIGHT_BLUE, BLUE),
        ((120, 330, 2040, 455), "2  지도 레이어와 필터", "F5F9FD", NAVY),
        ((120, 485, 1460, 1020), "3  인구 지도와 선택 경계", "EEF3F7", "65727D"),
        ((1500, 485, 2040, 1020), "4  선택 지역 상세", "EAF6EF", GREEN),
        ((120, 1055, 2040, 1195), "5  행정구역 비교표", "FFF4E5", ORANGE),
    ]
    for box, label, fill, edge in panels:
        draw.rounded_rectangle(box, radius=24, fill=hex_color(fill), outline=hex_color(edge), width=5)
        draw_centered(draw, box, label, font_regular)
    circles = [
        (160, 205, "1"), (160, 360, "2"), (165, 520, "3"),
        (1540, 520, "4"), (160, 1080, "5"),
    ]
    for x, y, label in circles:
        draw.ellipse((x, y, x + 58, y + 58), fill="#17365D")
        draw_centered(draw, (x, y, x + 58, y + 58), label, font_small, "#FFFFFF")
    draw_centered(
        draw,
        (0, 1225, 2160, 1300),
        "선택 지역은 지도와 오른쪽 상세 패널에서 같은 상태를 사용한다",
        font_small,
        "#4A5568",
    )
    image.save(SCREEN_IMAGE, quality=95)

    image = Image.new("RGB", (2160, 1240), "white")
    draw = ImageDraw.Draw(image)
    draw_centered(draw, (0, 35, 2160, 140), "SQLite 주요 테이블 관계", font_title, "#000000")
    erd_boxes = [
        ((810, 440, 1350, 650), "regions\n행정동 법정동 기준", LIGHT_BLUE, BLUE),
        ((120, 220, 690, 390), "population_monthly\n월별 인구와 세대", PALE_BLUE, NAVY),
        ((120, 470, 690, 640), "population_age_monthly\n월별 연령과 성별", PALE_BLUE, NAVY),
        ((120, 720, 690, 890), "floating_population_monthly\n현재 화면 미노출", "F4F5F7", "777777"),
        ((1470, 220, 2040, 390), "facilities\n시설 좌표와 활성 상태", "EAF6EF", GREEN),
        ((1470, 470, 2040, 640), "development_notices\n고시와 공식 원문 상태", "FFF4E5", ORANGE),
        ((1470, 720, 2040, 890), "national tables\n전국 인구 면적 비교", "F4F5F7", "555555"),
    ]
    for box, label, fill, edge in erd_boxes:
        draw.rounded_rectangle(box, radius=22, fill=hex_color(fill), outline=hex_color(edge), width=5)
        draw_centered(draw, box, label, font_regular)
    for y in (305, 555, 805):
        arrow(draw, (690, y), (810, 545), fill="#5B677A")
    draw_centered(draw, (720, 940, 1440, 1090), "regions.id를 참조하는 월별 테이블", font_small, "#4A5568")
    draw_centered(draw, (0, 1120, 2160, 1200), "시설 고시 전국 비교 테이블은 원천 식별자와 기준월 조합으로 중복을 막는다", font_small, "#4A5568")
    image.save(ERD_IMAGE, quality=95)


def configure_document(doc: Document) -> None:
    section = doc.sections[0]
    section.top_margin = Cm(1.9)
    section.bottom_margin = Cm(1.8)
    section.left_margin = Cm(2.1)
    section.right_margin = Cm(2.1)

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Noto Sans KR"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Noto Sans KR")
    normal.font.size = Pt(9.5)
    normal.font.color.rgb = RGBColor.from_string(BLACK)
    normal.paragraph_format.line_spacing = 1.38
    normal.paragraph_format.space_after = Pt(5)

    body = styles["Body Text"]
    body.font.name = "Noto Sans KR"
    body._element.rPr.rFonts.set(qn("w:eastAsia"), "Noto Sans KR")
    body.font.size = Pt(9.5)
    body.font.color.rgb = RGBColor.from_string(BLACK)

    title = styles["Title"]
    title.font.name = "Noto Sans KR"
    title._element.rPr.rFonts.set(qn("w:eastAsia"), "Noto Sans KR")
    title.font.size = Pt(28)
    title.font.bold = True
    title.font.color.rgb = RGBColor.from_string(BLACK)
    title.paragraph_format.space_after = Pt(12)
    title_p_pr = title._element.get_or_add_pPr()
    title_border = title_p_pr.find(qn("w:pBdr"))
    if title_border is not None:
        title_p_pr.remove(title_border)

    for style_name, size, space_before, space_after in (
        ("Heading 1", 18, 18, 8),
        ("Heading 2", 13, 14, 6),
        ("Heading 3", 10.5, 10, 4),
    ):
        style = styles[style_name]
        style.font.name = "Noto Sans KR"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Noto Sans KR")
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor.from_string(BLACK)
        style.paragraph_format.space_before = Pt(space_before)
        style.paragraph_format.space_after = Pt(space_after)
        style.paragraph_format.keep_with_next = True

    for style_name in ("List Bullet", "List Bullet 2", "List Number"):
        style = styles[style_name]
        style.font.name = "Noto Sans KR"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Noto Sans KR")
        style.font.size = Pt(9.5)

    footer = section.footer
    add_page_number(footer.paragraphs[0])

    props = doc.core_properties
    props.title = "김해시 GIS 인구지도 개발 기술서"
    props.subject = "시스템 구조 데이터 설계 운영 및 검증 기준"
    props.author = "김해시 GIS 프로젝트"
    props.keywords = "김해시 GIS React FastAPI SQLite VWorld UPIS"


def add_title_page(doc: Document) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(72)
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    label = p.add_run("DEVELOPMENT TECHNICAL DOCUMENT")
    set_run_font(label, size=9, bold=True, color=BLUE)

    p = doc.add_paragraph(style="Title")
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.add_run("김해시 GIS 인구지도\n개발 기술서")

    p = doc.add_paragraph()
    r = p.add_run("시스템 구조 데이터 설계 운영 및 검증 기준")
    set_run_font(r, size=13, color=GRAY)
    p.paragraph_format.space_after = Pt(28)

    add_callout(
        doc,
        "문서 목적",
        "김해시 GIS 인구지도의 현재 구조를 코드 기준으로 설명한다. 새 개발자가 프로젝트를 실행하고, 데이터 흐름을 따라가며, 기능을 수정한 뒤 검증할 수 있도록 작성했다.",
        tone="blue",
    )

    table = doc.add_table(rows=4, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    table.autofit = False
    meta = [
        ("기준일", "2026년 10월 2일"),
        ("프로젝트 상태", "개발 진행 중"),
        ("기준 브랜치", "main"),
        ("기준 커밋", "bd5371b"),
    ]
    for row, (key, value) in zip(table.rows, meta):
        row.cells[0].width = Cm(3.4)
        row.cells[1].width = Cm(11.7)
        set_cell_shading(row.cells[0], LIGHT_GRAY)
        for cell in row.cells:
            set_cell_border(cell)
            set_cell_margins(cell, 95, 130, 95, 130)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        p1 = row.cells[0].paragraphs[0]
        r1 = p1.add_run(key)
        set_run_font(r1, size=8.8, bold=True, color=NAVY)
        p2 = row.cells[1].paragraphs[0]
        r2 = p2.add_run(value)
        set_run_font(r2, size=8.8)

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(36)
    r = p.add_run("작성 근거")
    set_run_font(r, size=9, bold=True, color=GRAY)
    p = doc.add_paragraph()
    r = p.add_run("현재 소스 코드와 테스트  |  프로젝트 인수인계 및 아키텍처 문서  |  Notion 개발 기록")
    set_run_font(r, size=8.5, color=GRAY)
    doc.add_page_break()


def build_document() -> None:
    create_diagrams()
    doc = Document()
    configure_document(doc)
    add_title_page(doc)

    doc.add_heading("문서 개요", level=1)
    add_body(doc, "이 문서는 김해시의 행정동과 법정동 인구를 지도에서 조회하고 비교하는 웹 서비스의 개발 기술서다. 프론트엔드와 백엔드 구조, 데이터 출처, 데이터베이스, 주요 로직, 운영 명령, 품질 기준을 현재 코드에 맞춰 설명한다.")
    add_callout(doc, "현재 결론", "조회 화면과 핵심 데이터 파이프라인은 동작한다. 백엔드는 API, Service, Repository의 하향식 의존 구조로 정리했고 주요 동기화 작업은 한 업무 단위로 커밋한다. 운영 배포, 관리자 인증, 과거 경계 이력과 유동인구 원천은 아직 마무리하지 않았다.", tone="green")

    doc.add_heading("대상 독자", level=2)
    add_bullets(doc, [
        "프로젝트를 처음 인수받아 실행해야 하는 개발자",
        "인구 데이터와 지도 레이어의 출처와 가공 기준을 확인해야 하는 검토자",
        "기능을 추가하거나 데이터 동기화 작업을 운영할 담당자",
    ])

    doc.add_heading("문서 범위", level=2)
    add_table(doc, ["포함", "제외 또는 별도 확인"], [
        ["현재 구현된 지도 인구 시설 개발계획 기능", "운영 인프라와 배포 자동화"],
        ["SQLite 스키마와 FastAPI API", "실제 관리자 인증과 권한 정책"],
        ["공공데이터 수집과 공식 고시 원문 검증", "비밀키 값과 원본 DB 파일"],
        ["로컬 실행 테스트 장애 대응", "데이터 제공기관의 향후 정책 변경"],
    ], widths=[8.0, 8.0])

    doc.add_page_break()
    doc.add_heading("시스템 개요", level=1)
    add_body(doc, "사용자는 React 화면에서 기준월과 지역 구분을 고르고 지도를 클릭한다. 프론트엔드는 FastAPI에서 인구와 시설, 고시 목록을 읽고 GeoJSON은 정적 파일로 불러온다. 외부 공공 API는 브라우저가 직접 호출하지 않는다. 동기화 도구가 자료를 받아 정리한 뒤 SQLite 또는 GeoJSON에 저장한다.")
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    shape = p.add_run().add_picture(str(ARCHITECTURE_IMAGE), width=Cm(16.3))
    shape._inline.docPr.set("descr", "김해시 GIS 인구지도 시스템과 외부 데이터 유입 경로")
    caption = doc.add_paragraph("그림 1  시스템 구성과 데이터 유입 경로")
    caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_run_font(caption.runs[0], size=8.2, color=GRAY)

    doc.add_heading("현재 데이터 현황", level=2)
    add_table(doc, ["항목", "현재 값", "확인 기준"], [
        ["인구 보유 기간", "2013년 7월부터 2026년 8월", "SQLite population_monthly"],
        ["행정동", "19개", "regions의 admin 레벨"],
        ["법정동", "41개", "regions의 legal 레벨"],
        ["개발구역", "424개", "gimhae_development_areas.geojson"],
        ["활성 개발 고시", "1,447건", "development_notices의 활성 행"],
        ["공식 원문 확인", "949건", "official_link_status가 VERIFIED"],
        ["원문 미확인", "498건", "번호 날짜 제목 기관 불일치 포함"],
    ], widths=[4.2, 4.4, 7.4])
    add_body(doc, "화면은 사용자가 고른 조회월을 표시한다. 최신 적재월이 곧 실시간 자료라는 뜻은 아니므로 배포 전에는 `/api/population/availability`와 데이터 제공기관의 공표 시점을 함께 확인한다.")

    doc.add_heading("기술 구성", level=2)
    add_table(doc, ["영역", "기술", "사용 목적"], [
        ["프론트엔드", "React 19 TypeScript Vite 8", "대시보드 상태 관리와 화면 렌더링"],
        ["라우팅", "React Router 7", "대시보드 로그인 관리자 404 경로 구성"],
        ["서버 상태", "TanStack Query 5", "API 캐시 로딩 오류 상태 관리"],
        ["지도", "NAVER Maps JavaScript API v3", "기본 지도 GeoJSON 마커 정보창"],
        ["백엔드", "FastAPI SQLAlchemy httpx", "조회 API DB 접근 외부 API 통신"],
        ["데이터베이스", "SQLite", "정제 인구 시설 고시와 점검 상태 저장"],
        ["공간 처리", "proj4 Shapely pyproj", "좌표 변환 면적 계산 공간 판정"],
        ["품질 검사", "unittest ESLint TypeScript Vite", "회귀 테스트 정적 검사 프로덕션 빌드"],
    ], widths=[3.0, 5.0, 8.0])

    doc.add_heading("사용자 기능", level=2)
    add_bullets(doc, [
        "행정동과 법정동 경계를 전환하고 월별 인구를 단계구분도로 표시한다.",
        "선택 지역의 총인구 세대수 세대당 인구 전월 전년 증감을 확인한다.",
        "10세 단위 남녀 인구와 장기 월별 추이를 마우스 오버로 읽는다.",
        "면적이 비슷한 전국 행정동과 인구밀도를 비교한다.",
        "시설 하천 주요 도로 도로 교통상황 개발구역을 별도 레이어로 켜고 끈다.",
        "개발구역이 겹친 지점에서는 작은 구역부터 고르고 연결된 공식 고시 원문을 연다.",
    ])

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    shape = p.add_run().add_picture(str(SCREEN_IMAGE), width=Cm(16.3))
    shape._inline.docPr.set("descr", "김해시 GIS 인구지도 대시보드의 번호별 화면 구성")
    caption = doc.add_paragraph("그림 2  대시보드 화면 구성과 주요 영역")
    caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_run_font(caption.runs[0], size=8.2, color=GRAY)
    add_table(doc, ["번호", "화면 영역", "주요 코드와 데이터"], [
        ["1", "행정동 법정동 조회월 지역 검색", "DashboardPage와 population availability API"],
        ["2", "색상 하천 도로 교통 개발계획 시설", "DashboardPage의 레이어 상태와 필터"],
        ["3", "경계 인구색 선택 강조 개발구역", "NaverMap과 정적 GeoJSON"],
        ["4", "요약 인구 변화 연령 구성", "인구 비교 추이 연령 API"],
        ["5", "행정구역별 인구 비교", "RegionComparisonTable"],
    ], widths=[1.5, 6.0, 8.5])

    doc.add_page_break()
    doc.add_heading("프론트엔드 구조", level=1)
    add_body(doc, "프론트엔드는 화면 단위 상태를 `DashboardPage.tsx`에 모으고, 지도 표현과 상호작용은 `NaverMap.tsx`가 맡는다. 데이터 요청 함수와 응답 타입은 `src/features` 아래에서 기능별로 분리한다. API 응답 모양을 바꾸면 같은 기능의 TypeScript 타입도 함께 수정해야 한다.")

    doc.add_heading("주요 파일과 책임", level=2)
    add_table(doc, ["파일", "책임"], [
        ["src/pages/DashboardPage.tsx", "조회월 지역 선택 레이어 토글 필터 쿼리 상태와 상세 패널 조정"],
        ["src/components/map/NaverMap.tsx", "NAVER 지도 생성 GeoJSON 스타일 클릭 순서 시설 마커 개발구역 정보창"],
        ["src/components/common/AgeDistributionChart.tsx", "10세 단위 남녀 분포와 툴팁"],
        ["src/components/common/PopulationTrendChart.tsx", "월별 장기 추이와 시점별 값 표시"],
        ["src/components/common/OfficialNoticeWindow.tsx", "공식 고시 검색 유형 필터 원문 상태 안내"],
        ["src/features/boundaries", "행정 법정동 하천 도로 개발구역 GeoJSON 로딩과 공간 계산"],
        ["src/features/population", "인구 조회 비교 추이 유사 면적 API 타입과 요청"],
        ["src/features/development", "고시 API 타입 구역과 고시의 식별자 및 명칭 매칭"],
    ], widths=[6.2, 9.8])

    doc.add_heading("상태와 쿼리 흐름", level=2)
    add_numbered(doc, [
        "사용자가 행정동 또는 법정동과 조회월을 선택한다.",
        "TanStack Query의 queryKey가 바뀌고 해당 API를 다시 조회한다.",
        "응답 데이터와 GeoJSON 속성을 지역 코드로 결합한다.",
        "지도 스타일과 오른쪽 상세 패널이 같은 선택 지역을 기준으로 갱신된다.",
        "시설과 개발구역 필터는 지도 인스턴스를 다시 만들지 않고 표시 대상만 바꾼다.",
    ])

    doc.add_heading("지도 레이어와 클릭 처리", level=2)
    add_body(doc, "행정구역 면은 인구색과 클릭을 담당한다. 모든 경계를 별도 `MultiLineString`으로 다시 만든 선 레이어는 클릭을 받지 않는다. 덕분에 개발구역이 위에 있어도 행정동과 법정동 경계가 사라지지 않는다. 겹친 개발구역은 점을 포함하는 모든 도형을 찾은 뒤 면적이 작은 순서로 보여 준다.")
    add_body(doc, "선택한 지역 코드는 지도 기본 스타일에도 전달된다. 선택 경계는 노란색 굵은 선으로 유지하고 GeoJSON 좌표로 `LatLngBounds`를 만든 뒤 `fitBounds`로 화면에 맞춘다. 마우스 오버 스타일이 끝나도 기본 스타일의 선택 상태가 다시 나타난다.")
    add_body(doc, "개발구역을 켜면 인구 면 투명도를 낮춰 두 색이 겹쳐도 개발구역을 읽을 수 있게 한다. 필터 팝업은 `development`, `facility`, `null` 중 하나만 가지는 상태로 관리한다. 같은 버튼을 다시 누르거나 지도를 누르면 `null`로 바뀌어 닫힌다.")
    add_callout(doc, "변경 시 주의", "NaverMap 초기화 useEffect의 의존성에 필터 상태를 넣으면 버튼을 누를 때 지도 전체가 다시 만들어질 수 있다. 지도 생성과 레이어 데이터 갱신을 분리한다.", tone="orange")

    doc.add_heading("백엔드 구조", level=1)
    add_body(doc, "백엔드는 API, Service, Repository 순서로 의존한다. API는 요청 형식과 HTTP 응답을 맡고, Service는 업무 규칙과 데이터 조립을 맡는다. Repository는 SQLAlchemy 조회와 저장만 수행한다. 외부 API 호출도 Service 또는 동기화 모듈 아래에 둔다.")
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    shape = p.add_run().add_picture(str(BACKEND_IMAGE), width=Cm(15.8))
    shape._inline.docPr.set("descr", "API, Service, Repository, 데이터 원천으로 이어지는 백엔드 의존 방향")
    caption = doc.add_paragraph("그림 3  백엔드 계층과 의존 방향")
    caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_run_font(caption.runs[0], size=8.2, color=GRAY)

    doc.add_heading("계층별 책임", level=2)
    add_table(doc, ["계층", "하는 일", "하지 않는 일"], [
        ["API", "Query 검증 HTTP 상태코드 Service 호출", "직접 SQL 작성과 대량 데이터 가공"],
        ["Service", "업무 규칙 응답 조립 트랜잭션 단위 상태값 검증", "HTTP 표현 세부사항과 화면 렌더링"],
        ["Repository", "SQLAlchemy 조회 저장 flush", "commit 외부 API 호출 사용자 메시지 결정"],
        ["동기화 모듈", "외부 자료 수집 정규화 Service 호출", "부분 저장을 위한 임의 commit"],
    ], widths=[2.6, 6.7, 6.7])

    doc.add_heading("트랜잭션과 오류 처리", level=2)
    add_body(doc, "반복 실행하는 인구 시설 개발고시 동기화는 외부 통신을 끝낸 다음 `SessionLocal.begin()`으로 짧은 쓰기 트랜잭션을 연다. Repository는 `flush()`까지만 수행한다. 개발고시는 기존 범위를 비활성화하고 신규 행을 저장하는 작업을 한 트랜잭션으로 묶어 중간 실패 시 모두 되돌린다.")
    add_code_block(doc, [
        "with SessionLocal.begin() as db:",
        "    replace_development_notices(",
        "        db, from_date=from_date, to_date=to_date, notices=notices",
        "    )",
    ])
    add_body(doc, "요청 처리 중 SQLAlchemy 오류가 발생하면 서버 로그에는 예외를 남기고 API 응답에는 내부 SQL이나 경로를 노출하지 않는다. DB 세션 의존성도 예외 시 `rollback()`한 뒤 세션을 닫는다.")

    doc.add_heading("데이터 출처와 처리 기준", level=1)
    add_body(doc, "각 데이터는 역할이 다르다. 지도에 함께 보인다는 이유로 같은 신뢰 수준이나 같은 기준일을 뜻하지 않는다. 화면과 팝업에는 구역 경계와 고시 정보의 출처를 따로 표시한다.")
    add_table(doc, ["데이터", "출처", "저장과 사용 기준"], [
        ["김해 주민등록 인구", "행정안전부 API와 과거 CSV", "월별 행정동 법정동 인구와 세대 연령 저장"],
        ["전국 행정동 인구", "KOSIS 및 행정안전부", "유사 면적 지역의 월별 밀도 비교"],
        ["행정동 면적", "SGIS 경계", "조회연도 이하에서 가장 가까운 경계연도 사용"],
        ["법정동 면적", "VWorld 경계", "기준연도별 면적 저장"],
        ["시설", "VWorld 검색 API", "품질 규칙으로 분류하고 활성 행만 표시"],
        ["하천 도로 개발구역", "VWorld WFS", "김해시 범위로 잘라 GeoJSON 저장"],
        ["개발 고시", "김해 UPIS", "개발 관련 제목을 선별해 SQLite 저장"],
        ["공식 고시 원문", "김해시청 경상남도청 토지이음", "번호 날짜 제목 기관이 맞는 상세 URL만 제공"],
        ["유동 주거인구", "공급원 검토 중", "구조만 유지하고 최신 자료가 없어 화면에서 숨김"],
    ], widths=[3.2, 4.0, 8.8])

    doc.add_heading("출처 표시와 이용 조건", level=2)
    add_table(doc, ["자료", "현재 적용", "배포 전 확인"], [
        ["NAVER 지도", "지도 로고와 지도 데이터 저작권 컨트롤을 표시", "등록 도메인 호출량 요금과 최신 Maps 이용약관"],
        ["VWorld", "개발구역 주요 도로 하천 시설 화면에 VWorld 출처 표시", "API 키 허용 도메인과 레이어별 이용 조건"],
        ["행정안전부 KOSIS SGIS", "기술서에 제공기관과 기준월 기록", "각 API와 내려받은 자료의 이용 조건 및 재배포 범위"],
        ["김해 UPIS와 공식 고시", "원문을 복제하지 않고 발행기관 상세 URL로 연결", "게시물별 공공누리 유형과 첨부파일 이용 조건"],
    ], widths=[3.4, 6.3, 6.3])
    add_body(doc, "공공누리가 붙은 자료는 표시된 유형을 먼저 확인한다. 출처 표시는 기본이며 유형에 따라 상업적 이용이나 변경이 제한될 수 있다. 운영 배포 전에는 수집 당시 조건이 그대로인지 다시 확인하고, 화면과 기술서에 기관명과 원문 주소를 남긴다.")

    doc.add_heading("지역 코드와 면적", level=2)
    add_body(doc, "행정동과 법정동은 이름이 같아도 코드 체계가 다르다. 법정동 GeoJSON은 8자리 코드를 쓰지만 외부 요청은 10자리를 요구할 수 있어 요청 시에만 뒤에 `00`을 붙인다. DB와 지도 매칭에서는 원래 8자리 코드를 유지한다.")
    add_body(doc, "면적은 위경도 좌표를 그대로 계산하지 않는다. 경계를 EPSG 5186으로 변환한 뒤 제곱미터를 계산하고 화면에서는 제곱킬로미터로 바꾼다. 현재 행정동은 SGIS, 법정동은 VWorld 면적을 우선하며 외부 면적이 없을 때만 로컬 GeoJSON 계산값을 쓴다.")

    doc.add_heading("시설 품질 관리", level=2)
    add_body(doc, "시설 검색 결과에는 주차장 입구, 업체명, 동물병원, 같은 시설의 긴 법인명과 짧은 이름이 섞일 수 있다. 수집할 때 한 번 거르고 조회 Service에서 기존 DB 행을 다시 검사한다. 원본 행은 삭제하지 않고 `is_active`와 응답 필터로 화면 노출을 조정한다.")
    add_bullets(doc, [
        "병원은 병원 의료원 보건소 접미어를 확인하고 동물 수의 펫 표기를 제외한다.",
        "직접 확인한 병원 별칭만 같은 시설로 묶고 이름이 비슷하다는 이유만으로 합치지 않는다.",
        "시장 마트 교량 교통거점은 카테고리별 허용 제외 규칙을 따로 둔다.",
        "수집일은 자료를 받은 날짜이며 운영 여부나 좌표를 공식 검증한 날짜와 다르다.",
    ])

    doc.add_heading("공식 고시 원문 검증", level=2)
    add_body(doc, "개발구역 도형은 VWorld 자료이고 관련 고시 목록은 김해 UPIS 자료다. 원문 링크는 발행기관 공식 사이트의 상세 페이지로 제한한다. 로컬 DB나 민간 수집 사이트를 공문의 근거로 쓰지 않는다.")
    add_table(doc, ["상태", "건수", "판정 기준"], [
        ["공식 원문 확인", "949", "공식 상세 URL과 번호 날짜 제목 기관 일치"],
        ["같은 번호 원문 미확인", "167", "현재 공식 검색 범위에 같은 번호 없음"],
        ["발행기관 불일치", "284", "같은 번호가 다른 기관 문서에서 확인"],
        ["고시일 불일치", "2", "번호 제목 기관은 같고 날짜가 다름"],
        ["고시 제목 불일치", "36", "번호 날짜 기관은 같고 제목이 다름"],
        ["고시일과 제목 불일치", "9", "번호와 기관만 같아 추가 확인 필요"],
    ], widths=[4.2, 2.0, 9.8])
    add_callout(doc, "해석 기준", "원문 미확인은 공문이 없다는 뜻이 아니다. 현재 연동한 공식 검색 범위에서 상세 원문을 확인하지 못했다는 뜻이다. 후보 URL은 저장하지 않고 미확인 사유만 기록한다.", tone="orange")

    doc.add_heading("데이터베이스 설계", level=1)
    add_body(doc, "SQLite 기본 파일은 `server/data/gimhae_population.db`다. 코드와 테스트는 Git으로 관리하지만 DB와 원본 파일, 백업은 `server/data` 아래에 두고 Git에서 제외한다.")
    add_table(doc, ["테이블", "용도", "중복 방지 기준"], [
        ["regions", "행정동 법정동 기본정보 면적 경계", "level + region_code"],
        ["population_monthly", "지역별 월 인구 성별 세대", "region_id + stats_ym"],
        ["population_age_monthly", "지역별 월 연령대 남녀 인구", "region_id + stats_ym + age_group"],
        ["floating_population_monthly", "서비스 주거 직장 방문인구", "region_id + stats_ym"],
        ["national_population_monthly", "전국 월별 총인구", "stats_ym"],
        ["national_area_annual", "전국 연도별 면적", "year"],
        ["national_administrative_area", "전국 행정동 연도별 면적", "boundary_year + region_code"],
        ["national_legal_area", "전국 법정동 기준연도별 면적", "reference_year + region_code"],
        ["national_administrative_population_monthly", "전국 행정동 월 인구", "region_code + stats_ym"],
        ["facilities", "시설 분류 좌표 주소 활성 상태", "source + source_id"],
        ["development_notices", "UPIS 고시 공식 URL 점검 상태", "source + source_id"],
    ], widths=[5.4, 6.8, 3.8])

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    shape = p.add_run().add_picture(str(ERD_IMAGE), width=Cm(16.3))
    shape._inline.docPr.set("descr", "김해시 GIS SQLite 주요 테이블과 regions 외래키 관계")
    caption = doc.add_paragraph("그림 4  SQLite 주요 테이블 관계")
    caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_run_font(caption.runs[0], size=8.2, color=GRAY)

    doc.add_heading("관계와 저장 규칙", level=2)
    add_bullets(doc, [
        "김해 월별 인구 연령 유동인구는 `region_id`로 `regions.id`를 참조한다.",
        "월은 `YYYYMM` 6자리 문자열로 저장하고 고시일은 `YYYY-MM-DD` 형식을 쓴다.",
        "시설과 고시는 원천 시스템 식별자인 `source + source_id`로 중복을 막는다.",
        "자료를 화면에서 빼야 할 때 행을 지우기보다 `is_active`를 꺼 이력을 남긴다.",
        "`Base.metadata.create_all()`은 새 테이블을 만들지만 기존 열을 변경하지 않는다.",
    ])

    doc.add_heading("스키마 변경", level=2)
    add_body(doc, "현재 Alembic은 사용하지 않는다. 개발고시 상태 열은 전용 마이그레이션 명령으로 추가한다. 기존 DB를 변경하기 전에 파일을 백업하고, 명령을 두 번 실행해도 같은 열을 다시 만들지 않는지 확인했다.")
    add_code_block(doc, [
        ".venv\\Scripts\\python.exe -m app.migrate_development_notice_status",
    ])

    doc.add_heading("백엔드 API", level=1)
    add_body(doc, "현재 외부에 노출하는 경로는 조회 중심이다. 실시간 행정안전부 프록시는 설정값으로 기본 비활성화하며, 화면은 저장된 SQLite 데이터를 우선 읽는다.")
    add_table(doc, ["경로", "주요 입력", "응답 목적"], [
        ["GET /api/health", "없음", "서버와 주요 키 설정 여부"],
        ["GET /api/population/regions", "level year month", "지역별 인구 세대 면적 연령"],
        ["GET /api/population/availability", "없음", "레벨별 조회 가능 월과 완전성"],
        ["GET /api/population/comparison", "level region_code base_ym target_ym", "두 시점 인구와 증감률"],
        ["GET /api/population/trend", "level region_code from_ym to_ym", "장기 월별 추이와 요약"],
        ["GET /api/population/similar-density", "region_code year month limit tolerance", "유사 면적 행정동 밀도 비교"],
        ["GET /api/facilities", "category 반복", "선택 카테고리의 활성 시설"],
        ["GET /api/development/notices", "area_name limit", "개발 고시와 공식 원문 상태"],
        ["GET /api/national-population", "year month", "전국 월별 총인구"],
        ["GET /api/national-density", "year month", "전국 인구밀도 기준"],
        ["GET /api/floating-population", "year month", "저장된 유동 주거 직장 방문인구"],
    ], widths=[5.4, 5.3, 5.3])

    doc.add_heading("주요 응답 예시", level=2)
    add_body(doc, "지역 인구 응답은 화면이 바로 결합할 수 있도록 지역 코드와 기준월, 인구와 비교값을 함께 돌려준다. 값이 없으면 임의의 0으로 바꾸지 않고 `null` 또는 빈 목록을 사용한다.")
    add_code_block(doc, [
        "{",
        '  "year": 2026, "month": 8, "statsYm": "202608",',
        '  "items": [{',
        '    "regionCode": "4825051000", "regionName": "동상동",',
        '    "population": 0, "households": 0,',
        '    "comparisons": {',
        '      "previousMonth": {"change": null, "changeRate": null}',
        "    }",
        "  }]",
        "}",
    ])
    add_body(doc, "위 숫자는 응답 모양을 설명하기 위한 형식 예시다. 실제 값은 SQLite에 저장된 선택 월 자료를 사용한다.")

    doc.add_heading("입력 검증과 응답 규칙", level=2)
    add_bullets(doc, [
        "지역 코드는 숫자 8자리에서 10자리로 제한한다.",
        "통계월은 `YYYYMM` 6자리로 검사하고 같은 기준월과 대상월 비교는 400으로 거부한다.",
        "없는 지역은 404를 반환하고 외부 원천 연결 실패는 502로 구분한다.",
        "저장 자료가 없는 월은 빈 목록과 `dataAvailable: false`를 돌려 화면이 원인을 표시하게 한다.",
        "공식 고시 URL은 HTTPS 도메인 경로 필수 식별자를 허용 목록으로 다시 검사한 뒤 노출한다.",
    ])

    doc.add_heading("주요 업무 로직", level=1)
    doc.add_heading("인구 조회와 비교", level=2)
    add_body(doc, "조회 Service는 지역 기본정보와 월별 인구, 연령 분포, 면적을 조합한다. 비교 API는 기준월과 대상월을 각각 읽어 차이와 증감률을 계산한다. 어느 한쪽이 없으면 없는 값을 `null`로 유지해 화면이 임의의 0으로 해석하지 않게 한다.")

    doc.add_heading("10세 단위 연령 분포", level=2)
    add_body(doc, "원천 성별 연령 필드를 0대부터 90대 이상까지 묶고 총인구 남성 여성 값을 함께 저장한다. 차트는 막대 높이로 전체 분포를 보여 주고 마우스를 올리면 남녀 인원수를 따로 표시한다.")

    doc.add_heading("유사 면적 지역 비교", level=2)
    add_body(doc, "선택한 행정동 면적의 기본 ±10퍼센트 범위에서 전국 후보를 찾는다. 후보 월의 인구가 있는 지역만 밀도를 계산하고 평균 밀도와 대상 지역의 배수를 응답한다. 법정동 화면에서는 전국 행정동 자료와 비교한다는 안내를 표시한다.")

    doc.add_heading("개발구역과 고시 연결", level=2)
    add_body(doc, "VWorld 도형의 고시 식별자가 있으면 UPIS `source_id`와 먼저 정확히 맞춘다. 식별자가 없거나 연결되지 않으면 정규화한 구역명으로 보수적으로 보조 매칭한다. 구역명과 고시 제목을 느슨하게 추정하지 않으며 화면에는 모든 관련 고시를 표시한다.")

    doc.add_heading("공식 링크 상태", level=2)
    add_body(doc, "공식 원문이 확인되면 URL과 `VERIFIED` 상태를 함께 저장한다. 미확인 항목은 번호 없음 날짜 불일치 제목 불일치 기관 불일치 조회 오류로 제한한다. 서비스 계층은 허용되지 않은 상태값을 거부한다. API는 공식 URL이 없는데 DB 상태만 `VERIFIED`인 비정상 조합을 `PENDING`으로 낮춰 잘못된 링크 노출을 막는다.")

    doc.add_heading("보안과 신뢰성", level=1)
    add_table(doc, ["항목", "적용 기준"], [
        ["비밀정보", ".env DB 백업 원본 CSV는 Git과 Notion에 기록하지 않음"],
        ["브라우저 노출", "VITE 접두사 값만 프론트 번들에 포함 가능"],
        ["CORS", "CORS_ORIGINS에 등록한 출처와 GET 요청만 허용"],
        ["보안 헤더", "nosniff DENY frame no-referrer 적용"],
        ["외부 문자열", "지도 정보창 HTML에 넣기 전 이스케이프"],
        ["오류 응답", "DB 내부 예외와 키 전체 원천 응답을 사용자에게 숨김"],
        ["공식 링크", "김해시청 토지이음 경상남도청 상세 URL 형식만 허용"],
        ["인증", "로그인 관리자 화면은 골격만 있으며 서버 권한 제어는 미구현"],
    ], widths=[4.0, 12.0])

    doc.add_heading("테스트와 품질 기준", level=2)
    add_body(doc, "서버 테스트는 메모리 SQLite를 사용해 시설 품질 규칙, API 응답 계약, 고시 URL 허용 목록, 트랜잭션 롤백, DB 오류 세부정보 비노출을 확인한다. 프론트엔드는 Vitest로 지도 표시와 팝업 상태를 검사한다.")
    add_table(doc, ["검사", "현재 범위", "2026년 10월 2일 상태"], [
        ["Vitest", "선택 경계 개발구역 투명도 자동 확대 좌표 단일 팝업 고시 고정", "6개 통과"],
        ["ESLint", "TypeScript React 훅과 코드 규칙", "통과"],
        ["프로덕션 빌드", "TypeScript 검사와 Vite 번들", "통과"],
        ["백엔드 unittest", "API Service Repository 트랜잭션과 오류 응답", "테스트 함수 30개"],
        ["npm audit", "프론트 직접 간접 의존성", "취약점 0건"],
    ], widths=[3.3, 8.2, 4.5])
    add_code_block(doc, [
        "npm test",
        "npm run lint",
        "npm run build",
        "cd server",
        ".venv\\Scripts\\python.exe -m unittest discover -s tests -v",
    ])

    doc.add_heading("브라우저와 성능 확인", level=2)
    add_body(doc, "반응형 화면은 820px 이하에서 지도와 상세 패널을 한 열로 배치한다. 기본 확인 대상은 최신 Chrome과 Edge 데스크톱, Android Chrome, iOS Safari다. Firefox와 Safari 데스크톱은 배포 전 수동으로 지도 클릭, 팝업, 스크롤을 다시 확인한다.")
    add_table(doc, ["대상", "현재 기준", "릴리스 확인"], [
        ["JavaScript", "약 447.69KB gzip 약 142.89KB", "큰 라이브러리 추가 시 번들 변화 기록"],
        ["CSS", "약 50.54KB gzip 약 10KB", "모바일에서 필터와 범례 줄바꿈 확인"],
        ["개발구역 GeoJSON", "424개 약 1.67MB", "초기 로드와 필터 변경 시 지도 재생성 금지"],
        ["지도 상호작용", "선택 지역만 강조하고 전체 424개 애니메이션 없음", "저사양 모바일에서 클릭 지연 확인"],
    ], widths=[3.7, 6.0, 6.3])

    doc.add_heading("로컬 실행과 운영 작업", level=1)
    doc.add_heading("환경 변수", level=2)
    add_body(doc, "`.env.example`을 복사해 로컬 `.env`를 준비한다. 문서와 Git에는 키 값을 적지 않는다. NAVER 지도 허용 URL과 FastAPI CORS 주소는 실제 개발 포트와 맞아야 한다.")
    add_table(doc, ["변수", "용도", "노출 범위"], [
        ["VITE_NAVER_MAP_CLIENT_ID", "NAVER 지도 브라우저 인증", "브라우저"],
        ["VITE_API_BASE_URL", "FastAPI 기본 주소", "브라우저"],
        ["MOIS_SERVICE_KEY", "행정안전부 API", "백엔드"],
        ["SGIS_CONSUMER_KEY SECRET TOKEN", "SGIS 경계와 면적", "백엔드"],
        ["VWORLD_API_KEY DOMAIN", "VWorld 경계 시설 WFS", "백엔드"],
        ["CORS_ORIGINS", "허용 프론트 주소", "백엔드"],
        ["ENABLE_LIVE_MOIS_PROXY", "실시간 원천 프록시 사용 여부", "백엔드"],
        ["NATIONAL_AREA_KM2", "전국 인구밀도 보조 면적", "백엔드"],
    ], widths=[5.3, 7.0, 3.7])

    doc.add_heading("서버 실행", level=2)
    add_body(doc, "아래 명령은 프로젝트 루트에서 실행한다. 실제 저장 위치와 관계없이 상대 경로를 사용한다.")
    add_code_block(doc, [
        "# Windows PowerShell 또는 CMD",
        "cd server",
        ".venv\\Scripts\\python.exe -m pip install -r requirements.txt",
        ".venv\\Scripts\\python.exe -m uvicorn app.main:app --reload --port 8000",
        "curl http://127.0.0.1:8000/api/health",
        "",
        "# macOS 또는 Linux",
        "cd server",
        "python3 -m venv .venv",
        ".venv/bin/python -m pip install -r requirements.txt",
        ".venv/bin/python -m uvicorn app.main:app --reload --port 8000",
    ])

    doc.add_heading("프론트엔드 실행", level=2)
    add_code_block(doc, [
        "# 프로젝트 루트에서 Windows macOS Linux 공통",
        "npm install",
        "npm run dev",
    ])

    doc.add_heading("주요 데이터 갱신", level=2)
    add_table(doc, ["작업", "명령 모듈"], [
        ["김해 행정동 법정동 월 인구", "app.sync_population 또는 app.sync_population_range"],
        ["전국 월별 인구", "app.sync_national_population"],
        ["전국 행정동 면적", "app.sync_sgis_admin_area_range"],
        ["김해 법정동 경계 면적", "app.sync_vworld_legal_areas"],
        ["하천 개발구역 시설", "app.sync_vworld_waterways development_areas facilities"],
        ["김해 개발 고시", "app.sync_upis_development_notices"],
        ["공식 고시 원문", "app.sync_official_notice_links"],
        ["미확인 고시 점검 상태", "app.audit_official_notice_mismatches --save-status"],
    ], widths=[6.4, 9.6])
    add_callout(doc, "대량 동기화 원칙", "짧은 날짜 범위로 먼저 시험한다. 외부 호출에는 지연을 두고, 다운로드가 끝난 뒤 쓰기 트랜잭션을 짧게 연다. DB 구조를 바꾸기 전에는 명시적인 백업 파일을 만든다.", tone="blue")

    doc.add_heading("장애 대응", level=1)
    add_table(doc, ["증상", "확인 순서"], [
        ["NAVER 지도가 뜨지 않음", "Client ID와 콘솔 Web 서비스 URL 현재 Vite 포트 확인"],
        ["인구 값이 비어 있음", "FastAPI 실행 여부 availability 응답 해당 월 DB 적재 확인"],
        ["행정 법정동 경계가 반응하지 않음", "GeoJSON 요청 오류 좌표계 지도 레이어 클릭 순서 확인"],
        ["도로 하천 경계가 안 보임", "public/data 파일과 load 함수 네트워크 요청 확인"],
        ["필터를 누를 때 지도가 새로 생성됨", "NaverMap 초기화 useEffect 의존성 확인"],
        ["개발구역 작은 도형을 클릭 못함", "도형 정렬 순서와 포함 구역 선택 목록 확인"],
        ["공식 고시 링크가 없음", "officialLinkStatus를 보고 번호 날짜 제목 기관 불일치 원인 확인"],
        ["공식 링크가 열리지 않음", "팝업 차단과 허용 URL 형식 확인"],
        ["pyproj Shapely import 실패", "PC 애플리케이션 제어 정책과 가상환경 DLL 허용 확인"],
    ], widths=[5.3, 10.7])

    doc.add_heading("제약과 개발 계획", level=1)
    add_body(doc, "현재 코드는 로컬 분석 서비스로는 사용할 수 있지만 운영 공개 전에 정리할 부분이 남아 있다. 아래 항목은 기능 오류와 장기 유지보수 위험을 구분해 우선순위를 정했다.")
    add_table(doc, ["우선", "항목", "담당 역할", "시점", "완료 기준과 위험"], [
        ["높음", "관리자 인증과 권한", "백엔드", "운영 공개 전", "서버 접근 통제 적용. 현재 화면 골격만 믿으면 무단 접근 위험"],
        ["높음", "DB 마이그레이션", "백엔드 운영", "배포 체계 구성 전", "Alembic과 되돌리기 절차. 수동 열 추가는 환경 차이 위험"],
        ["높음", "배포와 백업", "운영 인프라", "운영 공개 전", "정기 백업과 복구 시험. 로컬 DB 단일 파일 손실 위험"],
        ["중간", "과거 경계 이력", "공간 데이터", "시계열 기능 전", "조회연도 경계 적용. 현재 경계로 과거 값을 읽는 해석 위험"],
        ["중간", "미확인 고시 498건", "데이터 검증", "공식 연동 확대 시", "확인된 원문만 VERIFIED. 느슨한 매칭은 오연결 위험"],
        ["중간", "월별 재생과 전환", "프론트엔드", "다음 기능 주기", "재생 정지 키보드 접근과 저사양 지도 성능 확인"],
        ["낮음", "유동 주거인구", "데이터 기획", "공급원 확정 후", "최신성과 이용 권한을 확인하기 전 화면 노출 금지"],
        ["낮음", "Repository 추가 분리", "백엔드", "조회 로직 확장 전", "긴 집계 SQL을 역할별 모듈로 나눠 변경 영향 축소"],
    ], widths=[1.3, 3.5, 2.4, 2.7, 6.1])

    doc.add_heading("인수인계 체크리스트", level=2)
    add_bullets(doc, [
        "README.md에서 실행 명령을 확인하고 `.env.example` 기준으로 로컬 설정을 준비한다.",
        "`/api/health`와 `/api/population/availability`로 서버와 적재 기간을 확인한다.",
        "프론트 lint build와 백엔드 테스트를 통과시킨다.",
        "지도에서 행정 법정동 클릭 시설 토글 개발구역 겹침 고시 팝업을 직접 눌러 본다.",
        "DB 변경 전 백업을 만들고 동기화는 작은 범위로 시험한다.",
        "원격 Git 이력을 확인한 뒤 push 방법을 결정하며 강제 push는 사용하지 않는다.",
    ])

    doc.add_heading("근거 자료", level=1)
    add_body(doc, "기술 설명은 2026년 10월 2일의 로컬 코드와 아래 문서를 함께 대조해 작성했다. 노션 기록은 결정 배경과 작업 당시의 문제를 설명하고, 실제 동작 기준은 현재 코드와 테스트다.")
    add_source_link(doc, "김해시 GIS 개발 과정 기록", "https://app.notion.com/p/3d5f7b32dbea8148b03dcf959eef8215", "프로젝트 목표 개발 과정 고시 검증 기록")
    add_source_link(doc, "김해시 GIS 코드 구조 설계 입문 가이드", "https://app.notion.com/p/3e3f7b32dbea8103a782df1fbe545f40", "계층 구조 DB와 GeoJSON 실행 점검 순서")
    add_source_link(doc, "시설 레이어 품질 개선 아키텍처와 핵심 코드", "https://app.notion.com/p/3e3f7b32dbea81efa2e5d8d5b3243d1c", "시설 필터 중복 제거와 품질 기준")
    add_source_link(doc, "Git 첫 커밋과 비밀정보 제외 점검", "https://app.notion.com/p/3e3f7b32dbea81e5b62bc575e91d0665", "Git 제외 대상과 비밀정보 관리")
    add_source_link(doc, "GitHub 저장소", "https://github.com/vmvvmvvmv/Gimhae_si_pop", "원격 저장소 주소")
    add_source_link(doc, "NAVER 지도 API 지도 컨트롤", "https://navermaps.github.io/maps.js.ncp/docs/tutorial-Controls.html", "로고와 지도 데이터 저작권 컨트롤")
    add_source_link(doc, "VWorld 공간정보 오픈플랫폼", "https://www.vworld.kr", "공간정보 API와 레이어 원천")
    add_source_link(doc, "공공누리 이용 방법", "https://www.kogl.or.kr/info/license.do", "유형별 출처 표시와 이용 조건")

    doc.add_heading("로컬 문서와 핵심 코드", level=2)
    add_bullets(doc, [
        "docs/project-handoff.md  데이터 현황 실행 명령 알려진 제한",
        "docs/architecture.md  프론트 백엔드 서비스 계층 데이터 흐름",
        "server/app/models.py  SQLite 테이블과 제약조건",
        "server/app/main.py  FastAPI 구성 CORS 보안 헤더 예외 처리",
        "src/pages/DashboardPage.tsx  화면 상태와 데이터 요청",
        "src/components/map/NaverMap.tsx  지도 레이어와 상호작용",
        "src/features/map/mapPresentation.ts  선택 경계 투명도 자동 확대와 팝업 상태 규칙",
        "server/tests  품질 규칙 API 계약 트랜잭션 회귀 테스트",
    ])

    doc.add_heading("버전 기록", level=2)
    add_table(doc, ["날짜", "기준 커밋", "문서 변경"], [
        ["2026-10-01", "bd5371b", "최초 개발 기술서 작성"],
        ["2026-10-02", "bd5371b + 작업 트리", "화면 구성도 데이터 현황 ERD API 예시 이용 조건 테스트와 개발 계획 갱신"],
    ], widths=[3.2, 4.2, 8.6])

    trailing_paragraph = doc.paragraphs[-1]
    if not trailing_paragraph.text.strip():
        trailing_paragraph._element.getparent().remove(trailing_paragraph._element)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    build_document()
