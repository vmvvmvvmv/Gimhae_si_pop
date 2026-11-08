import type { GeoJsonFeature } from '../../features/boundaries/boundaryLoader'
import type { DevelopmentNotice } from '../../features/development/developmentApi'
import { getDevelopmentAreaNotices } from '../../features/development/developmentMatching'
import { officialSourceLabel } from '../../features/development/officialNoticeUrl'

// 네이버 지도 정보창은 HTML 문자열을 받습니다. 외부 자료는 반드시 escapeHtml을 거쳐 넣습니다.
export function escapeHtml(value: string): string {
  // NAVER 정보창에는 문자열로 만든 HTML을 넣습니다. 외부 데이터가 태그로
  // 해석되지 않도록 제목·주소 등을 끼워 넣기 전에 특수문자를 바꿉니다.
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  )
}

function summarizeText(value: string, maxLength = 110): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength).trim()}…`
}

function renderDevelopmentNotices(notices: DevelopmentNotice[]): string {
  if (!notices.length) {
    return (
      '<div class="development-notice-preview empty">' +
        '<p>VWorld 공식 공간정보에 등록된 개발구역입니다.</p>' +
        '<span>김해 UPIS에서 연결할 고시를 찾지 못했습니다.</span>' +
      '</div>'
    )
  }

  return (
    '<div class="development-notice-list">' +
      notices
        .map((notice) => {
          const title = officialSourceLabel(notice.sourceUrl)
            ? `<a class="development-notice-title" href="${escapeHtml(notice.sourceUrl)}" ` +
              `data-official-url="${escapeHtml(notice.sourceUrl)}" target="_blank" rel="noopener noreferrer">` +
              `${escapeHtml(notice.title)}</a>`
            : `<strong class="development-notice-title is-unlinked">${escapeHtml(notice.title)}</strong>`
          let linkStatus = notice.officialLinkStatusLabel
          if (notice.sourceUrl) {
            try {
              const hostname = new URL(notice.sourceUrl).hostname
              linkStatus = hostname === 'minwon.gyeongnam.go.kr'
                ? '경상남도 공식 고시 원문'
                : hostname.endsWith('eum.go.kr')
                  ? '토지이음 공식 고시 원문'
                  : '김해시청 공식 고시공고'
            } catch {
              linkStatus = notice.officialLinkStatusLabel
            }
          }
          return (
            '<article class="development-notice-preview">' +
              title +
              `<p>${escapeHtml(summarizeText(notice.summary || notice.stageLabel))}</p>` +
              `<span>${escapeHtml(notice.noticeDate)} · ${escapeHtml(notice.noticeNumber)} · ${linkStatus}</span>` +
            '</article>'
          )
        })
        .join('') +
    '</div>'
  )
}

export function renderFacilityInfo(label: string, name: string, address: string, provenance: string): string {
  return (
    '<div class="facility-info">' +
      '<small>' + escapeHtml(label) + '</small>' +
      '<strong>' + escapeHtml(name) + '</strong>' +
      (address ? '<span>' + escapeHtml(address) + '</span>' : '') +
      '<span>' + escapeHtml(provenance) + '</span>' +
    '</div>'
  )
}

export function renderDevelopmentAreaInfo(selectedFeatures: GeoJsonFeature[], allNotices: DevelopmentNotice[]): string {
  const areaSections = selectedFeatures
    .map((feature) => {
      const properties = feature.properties
      const categoryLabel = String(
        properties.categoryLabel ?? '개발 관련 구역',
      )
      const areaName = String(properties.name ?? categoryLabel)
      const notices = getDevelopmentAreaNotices(
        feature,
        allNotices,
      )
      return (
        '<details class="development-area-choice">' +
          '<summary>' +
            `<small>${escapeHtml(categoryLabel)}</small>` +
            `<strong>${escapeHtml(areaName)}</strong>` +
            `<span>관련 고시 ${notices.length.toLocaleString()}건</span>` +
          '</summary>' +
          renderDevelopmentNotices(notices) +
        '</details>'
      )
    })
    .join('')

  return (
    '<div class="development-info">' +
      '<button type="button" class="development-info-close" data-close-development-info aria-label="고시정보 닫기">' +
        '<span aria-hidden="true">×</span>' +
      '</button>' +
      `<small>${selectedFeatures.length > 1 ? `겹친 개발구역 ${selectedFeatures.length}개 · 작은 구역부터` : 'VWorld 공식 지정구역'}</small>` +
      `<h3>${escapeHtml(selectedFeatures.length > 1 ? '확인할 구역을 골라 주세요' : String(selectedFeatures[0]?.properties.name ?? '개발 관련 구역'))}</h3>` +
      `<div class="development-area-choice-list">${areaSections}</div>` +
      '<p class="development-source-note">구역 경계: VWorld · 관련 고시: 김해 UPIS</p>' +
    '</div>'
  )
}

export function renderDevelopmentHover(categoryLabel: string, name: string, stageLabel: string): string {
  return (
    '<div class="region-hover-label development-hover-label">' +
      `<small>${escapeHtml(categoryLabel)}</small>` +
      `<strong>${escapeHtml(name)}</strong>` +
      `<span>${escapeHtml(stageLabel)}</span>` +
    '</div>'
  )
}

export function renderRegionHover(regionName: string, population: number | undefined): string {
  return (
    '<div class="region-hover-label">' +
      `<strong>${escapeHtml(regionName)}</strong>` +
      (population === undefined
        ? '<span>분포 데이터 없음</span>'
        : `<span>주민등록 인구 ${population.toLocaleString()}명</span>`) +
    '</div>'
  )
}
