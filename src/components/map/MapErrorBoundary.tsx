import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import './MapErrorBoundary.css'

interface Props {
  label: string
  children: ReactNode
}

// 네이버 지도 SDK가 인증 실패 등으로 오류를 던져도 이 영역만 안내로 바꾸고 나머지 화면은 유지합니다.
export default class MapErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.label} 표시 오류`, error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="map-error" role="alert">
        <p>{this.props.label}를 표시하지 못했습니다. 다른 조회 기능은 계속 쓸 수 있습니다.</p>
        <button type="button" onClick={() => window.location.reload()}>다시 불러오기</button>
      </div>
    )
  }
}
