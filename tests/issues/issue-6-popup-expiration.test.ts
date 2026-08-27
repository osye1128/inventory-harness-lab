import { describe, expect, it } from 'vitest'
import { dateOnly } from '@/lib/date'
import { isPopupExpired, popupDisplayStatus } from '@/lib/popup'

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

  it('만료됐지만 정산하지 않은 팝업은 정산 중으로 표시된다', () => {
    expect(popupDisplayStatus('ACTIVE', endDate, dateOnly('2026-08-26'))).toBe('SETTLING')
  })

  it('유효한 팝업은 진행 중 상태를 유지한다', () => {
    expect(popupDisplayStatus('ACTIVE', endDate, dateOnly('2026-08-25'))).toBe('ACTIVE')
    expect(popupDisplayStatus('ACTIVE', dateOnly('2026-08-27'), dateOnly('2026-08-26'))).toBe('ACTIVE')
  })

  it('이미 정산된 팝업은 정산 완료 상태를 유지한다', () => {
    expect(popupDisplayStatus('CLOSED', endDate, dateOnly('2026-08-26'))).toBe('CLOSED')
  })
})
