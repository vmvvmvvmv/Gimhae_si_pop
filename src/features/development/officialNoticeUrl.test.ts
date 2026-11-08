import { describe, expect, it } from 'vitest'
import { officialSourceLabel } from './officialNoticeUrl'

describe('officialSourceLabel', () => {
  it('accepts the three verified official notice addresses', () => {
    expect(officialSourceLabel('https://www.gimhae.go.kr/03360/00023/00029.web?not_ancmt_mgt_no=1')).toBe('김해시청 원문')
    expect(officialSourceLabel('https://www.eum.go.kr/web/gs/gv/gvGosiDet.jsp?seq=12')).toBe('토지이음 원문')
    expect(officialSourceLabel('https://minwon.gyeongnam.go.kr/citynet/jsp/sap/SAPGosiBizProcess.do?command=searchDetail&sno=3')).toBe('경상남도 원문')
  })

  it('rejects script URLs, other hosts and non-numeric ids', () => {
    expect(officialSourceLabel('javascript:alert(1)')).toBe('')
    expect(officialSourceLabel('http://www.eum.go.kr/web/gs/gv/gvGosiDet.jsp?seq=12')).toBe('')
    expect(officialSourceLabel('https://evil.example/web/gs/gv/gvGosiDet.jsp?seq=12')).toBe('')
    expect(officialSourceLabel('https://www.eum.go.kr/web/gs/gv/gvGosiDet.jsp?seq=abc')).toBe('')
  })
})
