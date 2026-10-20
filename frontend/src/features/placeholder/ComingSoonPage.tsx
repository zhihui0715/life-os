import { Hammer } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Card, EmptyState, PageHeader } from '../../components/ui/states'

/** Honest placeholder: the module is planned but not built, and stores nothing. */
export function ComingSoonPage({ feature, stage }: { feature: string; stage: number }) {
  const { t } = useTranslation()
  const name = t(`nav.${feature}`)
  return (
    <>
      <PageHeader title={name} />
      <Card>
        <EmptyState icon={Hammer} title={t('comingSoon.title', { feature: name })} body={t('comingSoon.body', { stage })} />
      </Card>
    </>
  )
}
