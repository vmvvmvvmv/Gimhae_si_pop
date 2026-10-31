import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  getGuideCardPosition,
  getSpotlightRect,
  type TourPoint,
  type TourRect,
  type TourViewport,
} from '../../features/onboarding/tourGeometry'
import './WelcomeGuide.css'

const GUIDE_STEPS = [
  {
    label: '지역과 기간',
    selector: '#dashboard-filters',
    maxHeight: 270,
    title: '먼저 지역과 월을 고르세요',
    description: '행정동·법정동을 바꾸고 연도와 월을 선택하면 해당 시기의 인구 분포를 볼 수 있어요.',
    action: '강조된 조회 조건에서 지역 구분을 눌러 보세요.',
  },
  {
    label: '통합검색',
    selector: '.region-search',
    title: '이름으로 빠르게 찾으세요',
    description: '동 이름뿐 아니라 시설과 개발계획도 이 검색창에서 찾을 수 있어요.',
    action: '검색창에 알고 있는 동 이름을 입력해 보세요.',
  },
  {
    label: '지도',
    selector: '.map-tour-region',
    fallbackSelector: '#map-area .map-wrapper',
    title: '강조된 지역 하나를 눌러 보세요',
    description: 'GeoJSON 경계에 맞춰 강조된 동을 누르면 지역 정보가 상세 패널에 나타나요.',
    action: '밝게 표시된 지역 안쪽을 눌러 보세요.',
  },
  {
    label: '상세 정보',
    selector: '#region-detail',
    maxHeight: 220,
    title: '선택한 곳의 정보를 살펴보세요',
    description: '인구 변화와 연령 구성, 다른 지역과의 비교가 이곳에 나타나요. 모바일에서는 지도 아래에 있어요.',
    action: '지역을 선택했다면 상세 정보의 탭을 살펴보세요.',
  },
  {
    label: '필터 기능',
    selector: '#map-settings',
    title: '지도 설정에서 필터를 사용해 보세요',
    description: '색상 필터, 하천망, 개발계획, 주요 시설을 이곳에서 켜고 끌 수 있어요.',
    action: '지도 설정의 필터 버튼을 하나 눌러 보세요.',
  },
] as const

interface TourLayout {
  spotlight: TourRect | null
  polygon: { path: string; shadePath: string; viewBox: string } | null
  card: TourPoint
  viewport: TourViewport
}

interface WelcomeGuideProps {
  onClose: () => void
}

export default function WelcomeGuide({ onClose }: WelcomeGuideProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [layout, setLayout] = useState<TourLayout | null>(null)
  const step = GUIDE_STEPS[stepIndex]

  useEffect(() => {
    if (step.selector !== '.map-tour-region') return
    document.body.dataset.mapTourActive = 'true'
    return () => { delete document.body.dataset.mapTourActive }
  }, [step])

  useLayoutEffect(() => {
    const target = document.querySelector<HTMLElement>(step.selector)
    const fallbackTarget = 'fallbackSelector' in step
      ? document.querySelector<HTMLElement>(step.fallbackSelector)
      : null
    const getVisibleTarget = () => {
      const bounds = target?.getBoundingClientRect()
      return bounds && bounds.width > 0 && bounds.height > 0 ? target : fallbackTarget
    }
    // 모바일에서는 대상이 화면 밖에 있을 수 있으므로 먼저 보이는 위치로 이동합니다.
    getVisibleTarget()?.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'nearest' })

    const updateLayout = () => {
      const viewport = { width: window.innerWidth, height: window.innerHeight }
      const visibleTarget = getVisibleTarget()
      const targetBounds = visibleTarget?.getBoundingClientRect()
      const spotlight = visibleTarget && targetBounds
        ? getSpotlightRect(targetBounds, viewport, {
            maxWidth: visibleTarget === fallbackTarget ? 520 : undefined,
            maxHeight: visibleTarget === fallbackTarget
              ? 220
              : 'maxHeight' in step ? step.maxHeight : undefined,
          })
        : null
      let polygon: TourLayout['polygon'] = null
      const path = visibleTarget === target && step.selector === '.map-tour-region'
        ? target?.dataset.tourPath
        : null
      if (spotlight && targetBounds && path) {
        const x = spotlight.left - targetBounds.left
        const y = spotlight.top - targetBounds.top
        polygon = {
          path,
          shadePath: `M${x} ${y} h${spotlight.width} v${spotlight.height} h-${spotlight.width} Z ${path}`,
          viewBox: `${x} ${y} ${spotlight.width} ${spotlight.height}`,
        }
      }
      const cardBounds = cardRef.current?.getBoundingClientRect()
      const cardSize = {
        width: cardBounds?.width ?? Math.min(360, viewport.width - 24),
        height: cardBounds?.height ?? 300,
      }
      setLayout({
        spotlight,
        polygon,
        card: getGuideCardPosition(spotlight, viewport, cardSize),
        viewport,
      })
    }

    updateLayout()
    const frame = window.requestAnimationFrame(updateLayout)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateLayout)
    if (target) observer?.observe(target)
    if (fallbackTarget) observer?.observe(fallbackTarget)
    if (cardRef.current) observer?.observe(cardRef.current)
    const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(updateLayout)
    if (target) mutationObserver?.observe(target, { attributes: true, attributeFilter: ['style', 'data-tour-path'] })
    window.addEventListener('resize', updateLayout)
    window.addEventListener('scroll', updateLayout, true)
    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      mutationObserver?.disconnect()
      window.removeEventListener('resize', updateLayout)
      window.removeEventListener('scroll', updateLayout, true)
    }
  }, [step, stepIndex])

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cardRef.current?.querySelector<HTMLButtonElement>('.welcome-guide-dismiss')?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      previousFocus?.focus()
    }
  }, [onClose])

  const spotlight = layout?.spotlight
  const polygon = layout?.polygon
  const viewport = layout?.viewport
  const shadeRects = spotlight && viewport
    ? [
        { left: 0, top: 0, width: viewport.width, height: spotlight.top },
        { left: 0, top: spotlight.bottom, width: viewport.width, height: viewport.height - spotlight.bottom },
        { left: 0, top: spotlight.top, width: spotlight.left, height: spotlight.height },
        { left: spotlight.right, top: spotlight.top, width: viewport.width - spotlight.right, height: spotlight.height },
      ]
    : [{ left: 0, top: 0, width: '100vw', height: '100dvh' }]

  return createPortal(
    <div className="welcome-tour-layer">
      {shadeRects.map((rect, index) => (
        <div key={index} className="welcome-tour-shade" style={rect} aria-hidden="true" />
      ))}
      {spotlight && polygon ? (
        <svg
          className="welcome-tour-polygon"
          style={{ left: spotlight.left, top: spotlight.top, width: spotlight.width, height: spotlight.height }}
          viewBox={polygon.viewBox}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path className="welcome-tour-polygon-shade" d={polygon.shadePath} fillRule="evenodd" />
          <path className="welcome-tour-polygon-halo" d={polygon.path} fillRule="evenodd" />
          <path className="welcome-tour-polygon-outline" d={polygon.path} fillRule="evenodd" />
        </svg>
      ) : spotlight && (
        <div
          className="welcome-tour-spotlight"
          style={{ left: spotlight.left, top: spotlight.top, width: spotlight.width, height: spotlight.height }}
          aria-hidden="true"
        />
      )}

      <div
        ref={cardRef}
        className="welcome-guide-card"
        role="dialog"
        aria-labelledby="welcome-guide-title"
        aria-describedby="welcome-guide-description"
        style={{
          left: layout?.card.left ?? 12,
          top: layout?.card.top ?? 12,
          visibility: layout ? 'visible' : 'hidden',
        }}
      >
        <div className="welcome-guide-topline">
          <span>김해시 GIS 사용 안내</span>
          <button type="button" className="welcome-guide-dismiss" onClick={onClose} aria-label="사용 안내 닫기">
            ×
          </button>
        </div>
        <div className="welcome-guide-copy" aria-live="polite">
          <span className="welcome-guide-step-label">{stepIndex + 1} / {GUIDE_STEPS.length} · {step.label}</span>
          <h2 id="welcome-guide-title">{step.title}</h2>
          <p id="welcome-guide-description">{step.description}</p>
          <p className="welcome-guide-action"><strong>직접 해보기</strong><span>{step.action}</span></p>
        </div>
        <div
          className="welcome-guide-progress"
          role="progressbar"
          aria-label="사용 안내 진행률"
          aria-valuemin={0}
          aria-valuemax={GUIDE_STEPS.length}
          aria-valuenow={stepIndex + 1}
        >
          <span style={{ width: `${((stepIndex + 1) / GUIDE_STEPS.length) * 100}%` }} />
        </div>
        <div className="welcome-guide-actions">
          <button type="button" className="welcome-guide-skip" onClick={onClose}>건너뛰기</button>
          <div>
            {stepIndex > 0 && (
              <button type="button" className="welcome-guide-back" onClick={() => setStepIndex((current) => current - 1)}>
                이전
              </button>
            )}
            <button
              type="button"
              className="welcome-guide-next"
              onClick={() => {
                if (stepIndex === GUIDE_STEPS.length - 1) onClose()
                else setStepIndex((current) => current + 1)
              }}
            >
              {stepIndex === GUIDE_STEPS.length - 1 ? '시작하기' : '다음'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
