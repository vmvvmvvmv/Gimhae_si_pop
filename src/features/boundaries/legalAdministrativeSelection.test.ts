import { describe, expect, it } from 'vitest'
import {
  LEGAL_CODES_BY_ADMIN_CODE,
  legalCodesForAdminSelection,
} from './legalAdministrativeSelection'

describe('CSV 법정동 선택용 행정동 필터', () => {
  it('현재 경계의 행정동 19개와 법정동 41개를 모두 다룬다', () => {
    expect(Object.keys(LEGAL_CODES_BY_ADMIN_CODE)).toHaveLength(19)
    expect(new Set(Object.values(LEGAL_CODES_BY_ADMIN_CODE).flat()).size).toBe(41)
  })

  it('경계가 걸친 법정동은 여러 행정동에서 찾을 수 있다', () => {
    expect(legalCodesForAdminSelection('4825055000')?.has('48250107')).toBe(true)
    expect(legalCodesForAdminSelection('4825059000')?.has('48250107')).toBe(true)
    expect(legalCodesForAdminSelection('')).toBeNull()
  })
})
