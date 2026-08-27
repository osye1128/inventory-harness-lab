import { describe, expect, it } from 'vitest'
import { dateOnly } from '@/lib/date'
import { isPopupExpired } from '@/lib/popup'

describe('Issue #6: popup expiration', () => {
  const endDate = dateOnly('2026-08-25')

  it('종료일 당일에는 만료되지 않는다', () => {
    expect(isPopupExpired(endDate, dateOnly('2026-08-25'))).toBe(false)
  })

  it('종료일 다음 날에는 만료된다', () => {
    expect(isPopupExpired(endDate, dateOnly('2026-08-26'))).toBe(true)
  })

  it('미래 종료일은 만료되지 않는다', () => {
    expect(isPopupExpired(dateOnly('2026-08-27'), dateOnly('2026-08-26'))).toBe(false)
  })

  it('만료 팝업은 활성 목록에 노출되지 않는다', () => {
    const popup = { status: 'ACTIVE', expired: isPopupExpired(endDate, dateOnly('2026-08-26')) }
    expect(popup.status !== 'CLOSED' && !popup.expired).toBe(false)
  })
})
