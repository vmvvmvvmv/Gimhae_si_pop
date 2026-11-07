import { describe, expect, it } from 'vitest'
import { isAuthEndpoint, loginUrlFor, safeNextPath } from './authRedirect'

describe('safeNextPath', () => {
  it('keeps same-site paths', () => {
    expect(safeNextPath('/admin')).toBe('/admin')
    expect(safeNextPath('/?region=1')).toBe('/?region=1')
  })

  it('rejects external and protocol-relative targets', () => {
    expect(safeNextPath('https://evil.example')).toBe('/')
    expect(safeNextPath('//evil.example')).toBe('/')
    expect(safeNextPath('/\\evil.example')).toBe('/')
    expect(safeNextPath(null)).toBe('/')
  })

  it('does not loop back to the login page', () => {
    expect(safeNextPath('/login')).toBe('/')
  })
})

describe('login redirect helpers', () => {
  it('encodes the page to return to', () => {
    expect(loginUrlFor('/?a=1&b=2')).toBe('/login?next=%2F%3Fa%3D1%26b%3D2')
  })

  it('treats login and session endpoints as non-redirecting', () => {
    expect(isAuthEndpoint('/api/admin/session')).toBe(true)
    expect(isAuthEndpoint('/api/admin/login')).toBe(true)
    expect(isAuthEndpoint('/api/population/export.csv')).toBe(false)
  })
})
