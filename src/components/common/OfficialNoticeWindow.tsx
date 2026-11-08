import { useEffect, useMemo, useState } from 'react'
import type { DevelopmentNotice } from '../../features/development/developmentApi'
import { officialSourceLabel } from '../../features/development/officialNoticeUrl'
import './OfficialNoticeWindow.css'

interface OfficialNoticeWindowProps {
  notices: DevelopmentNotice[]
  isLoading: boolean
  isError: boolean
  onClose: () => void
}

function getOfficialSourceLabel(notice: DevelopmentNotice) {
  return officialSourceLabel(notice.sourceUrl)
}

function hasVerifiedOfficialUrl(notice: DevelopmentNotice) {
  return Boolean(getOfficialSourceLabel(notice))
}

function openOfficialNotice(url: string) {
  const popup = window.open(
    url,
    '_blank',
    'noopener,noreferrer,width=1200,height=850,resizable=yes,scrollbars=yes',
  )

  if (!popup) window.open(url, '_blank', 'noopener,noreferrer')
}

export default function OfficialNoticeWindow({
  notices,
  isLoading,
  isError,
  onClose,
}: OfficialNoticeWindowProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState('all')

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const noticeTypes = useMemo(
    () =>
      Array.from(new Set(notices.map((notice) => notice.noticeType))).sort(
        (left, right) => left.localeCompare(right, 'ko'),
      ),
    [notices],
  )

  const verifiedCount = notices.filter(hasVerifiedOfficialUrl).length
  const filteredNotices = useMemo(() => {
    const normalizedTerm = searchTerm.trim().toLocaleLowerCase()

    return notices.filter((notice) => {
      const matchesType =
        selectedType === 'all' || notice.noticeType === selectedType
      const searchableText = [
        notice.title,
        notice.noticeNumber,
        notice.organizationName ?? '',
        notice.summary ?? '',
      ]
        .join(' ')
        .toLocaleLowerCase()

      return (
        matchesType &&
        (!normalizedTerm || searchableText.includes(normalizedTerm))
      )
    })
  }, [notices, searchTerm, selectedType])

  return (
    <div
      className="official-notice-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="official-notice-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="official-notice-window-title"
      >
        <header className="official-notice-header">
          <div>
            <span className="official-notice-eyebrow">발행기관 공식 고시</span>
            <h2 id="official-notice-window-title">고시공고 원문</h2>
            <p>번호와 날짜, 제목, 발행기관이 일치하는 공식 원문만 모았습니다.</p>
          </div>
          <button
            type="button"
            className="official-notice-close"
            aria-label="고시공고 창 닫기"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="official-notice-summary" aria-label="고시공고 요약">
          <div>
            <small>전체 고시</small>
            <strong>{notices.length.toLocaleString()}건</strong>
          </div>
          <div className="verified">
            <small>원문 확인</small>
            <strong>{verifiedCount.toLocaleString()}건</strong>
          </div>
          <div className="unverified">
            <small>링크 미확인</small>
            <strong>{(notices.length - verifiedCount).toLocaleString()}건</strong>
          </div>
        </div>

        <div className="official-notice-tools">
          <label className="official-notice-search">
            <span>고시 검색</span>
            <input
              type="search"
              value={searchTerm}
              placeholder="제목, 고시번호, 담당기관 검색"
              autoFocus
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
          <label className="official-notice-type-filter">
            <span>고시 유형</span>
            <select
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value)}
            >
              <option value="all">전체 유형</option>
              {noticeTypes.map((noticeType) => (
                <option key={noticeType} value={noticeType}>
                  {noticeType}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="official-notice-list" aria-live="polite">
          {isLoading ? (
            <p className="official-notice-empty">고시공고를 불러오는 중입니다.</p>
          ) : isError ? (
            <p className="official-notice-empty error" role="alert">
              고시공고를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
            </p>
          ) : filteredNotices.length ? (
            filteredNotices.map((notice) => {
              const verified = hasVerifiedOfficialUrl(notice)
              const officialSourceLabel = getOfficialSourceLabel(notice)

              return (
                <article className="official-notice-item" key={notice.id}>
                  <div className="official-notice-item-heading">
                    <span className="official-notice-type">{notice.noticeType}</span>
                    <time dateTime={notice.noticeDate}>{notice.noticeDate}</time>
                  </div>
                  {verified ? (
                    <a
                      className="official-notice-title"
                      href={notice.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => {
                        event.preventDefault()
                        openOfficialNotice(notice.sourceUrl)
                      }}
                    >
                      {notice.title}
                    </a>
                  ) : (
                    <strong className="official-notice-title is-unverified">
                      {notice.title}
                    </strong>
                  )}
                  <p>{notice.summary || '자세한 내용은 공식 원문에서 확인해 주세요.'}</p>
                  {!verified && (
                    <p className="official-notice-status-note">
                      <strong>{notice.officialLinkStatusLabel}</strong>
                      <span>{notice.officialLinkMessage}</span>
                      <small>구역 경계는 VWorld에서, 고시 정보는 김해 UPIS에서 가져왔습니다.</small>
                    </p>
                  )}
                  <div className="official-notice-item-meta">
                    <span>{notice.noticeNumber || '고시번호 미상'}</span>
                    <span>{notice.organizationName || '김해시 관련 부서'}</span>
                    <span className={verified ? 'link-verified' : 'link-unverified'}>
                      {verified ? `${officialSourceLabel} 열기 ↗` : notice.officialLinkStatusLabel}
                    </span>
                  </div>
                </article>
              )
            })
          ) : (
            <p className="official-notice-empty">조건에 맞는 고시공고가 없습니다.</p>
          )}
        </div>

        <footer className="official-notice-footer">
          <span>
            {filteredNotices.length.toLocaleString()}건 · 제목과 고시번호가 일치하는 원문만 연결했습니다.
          </span>
          <button type="button" onClick={onClose}>
            창 닫기
          </button>
        </footer>
      </section>
    </div>
  )
}
