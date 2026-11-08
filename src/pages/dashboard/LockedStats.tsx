import { requestLogin } from '../../lib/authRedirect'
import './LockedStats.css'

// 화면 모양만 보여 주는 예시 값입니다. 실제 통계는 로그인 전에는 서버에서 받지 않습니다.
const SAMPLE_CARDS = [
  ['총인구', '00,000명'],
  ['세대 수', '00,000세대'],
  ['세대당 인구', '0.00명'],
  ['인구밀도', '0,000명/km²'],
]
const SAMPLE_BARS = [38, 62, 84, 71, 90, 66, 43, 24]

export default function LockedStats() {
  return (
    <div className="locked-stats">
      <div className="locked-stats-preview" aria-hidden="true">
        <div className="locked-stats-cards">
          {SAMPLE_CARDS.map(([label, value]) => (
            <div key={label} className="locked-stats-card">
              <small>{label}</small>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <div className="locked-stats-bars">
          {SAMPLE_BARS.map((height, index) => (
            <span key={index} style={{ height: `${height}%` }} />
          ))}
        </div>
      </div>
      <div className="locked-stats-message">
        <strong>로그인하면 확인할 수 있습니다</strong>
        <p>지역별 인구, 세대, 인구밀도와 변화 추이는 로그인 후 볼 수 있습니다.</p>
        <button type="button" onClick={() => void requestLogin(true)}>로그인</button>
      </div>
    </div>
  )
}
