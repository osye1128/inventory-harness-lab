import { notFound, redirect } from 'next/navigation'
import { SettleForm } from '@/components/SettleForm'
import { getPopupDetail, isPopupExpired } from '@/lib/popup'
import { today } from '@/lib/date'
import { POPUP_STATUS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

export default async function SettlePopupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detail = await getPopupDetail(Number(id))
  if (!detail) notFound()
  // 반출도 안 했거나 이미 정산된 팝업은 정산할 것이 없다
  if (
    detail.popup.status === POPUP_STATUS.CLOSED ||
    isPopupExpired(detail.popup.endDate, today()) ||
    detail.popupLots.length === 0
  )
    redirect(`/popups/${id}`)

  return (
    <SettleForm
      popupId={detail.popup.id}
      popupName={detail.popup.name}
      sourceName={detail.popup.sourceLocation.name}
      lots={detail.popupLots}
    />
  )
}
