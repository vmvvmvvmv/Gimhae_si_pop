// 고시 원문 링크는 아래 공식 주소 형식만 허용합니다. 다른 주소는 링크로 만들지 않습니다.
export function officialSourceLabel(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl)
    if (
      url.protocol === 'https:' &&
      url.hostname === 'www.gimhae.go.kr' &&
      url.pathname === '/03360/00023/00029.web' &&
      url.searchParams.has('not_ancmt_mgt_no')
    ) return '김해시청 원문'
    if (
      url.protocol === 'https:' &&
      ['eum.go.kr', 'www.eum.go.kr'].includes(url.hostname) &&
      url.pathname === '/web/gs/gv/gvGosiDet.jsp' &&
      /^\d+$/.test(url.searchParams.get('seq') ?? '')
    ) return '토지이음 원문'
    if (
      url.protocol === 'https:' &&
      url.hostname === 'minwon.gyeongnam.go.kr' &&
      url.pathname === '/citynet/jsp/sap/SAPGosiBizProcess.do' &&
      url.searchParams.get('command') === 'searchDetail' &&
      /^\d+$/.test(url.searchParams.get('sno') ?? '')
    ) return '경상남도 원문'
    return ''
  } catch {
    return ''
  }
}

// 지도 정보창의 고시 링크 클릭을 한 번만 등록해서 처리합니다. 인라인 onclick은 CSP가 막습니다.
let officialLinkHandlerInstalled = false

export function installOfficialNoticeLinkHandler(): void {
  if (officialLinkHandlerInstalled || typeof document === 'undefined') return
  officialLinkHandlerInstalled = true
  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest<HTMLAnchorElement>('a[data-official-url]')
    if (!anchor) return
    event.preventDefault()
    const url = anchor.dataset.officialUrl ?? ''
    if (!officialSourceLabel(url)) return
    window.open(url, 'OfficialNotice', 'noopener,noreferrer,width=1200,height=850,scrollbars=yes,resizable=yes')
  })
}
