import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'

import { Segmented } from '../../components/ui/Segments'
import { PageHeader } from '../../components/ui/states'
import { useMe } from '../auth/AuthProvider'
import { DayPlanner } from './DayPlanner'
import { WeeklyReviewFlow } from './WeeklyReviewFlow'

/** Plan: shape today (or tomorrow) from your own tasks, and close each week with a short guided review. */
export function PlanPage() {
  const { t, i18n } = useTranslation('planning')
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'week' ? 'week' : 'day'
  const tz = useMe().settings.timezone
  const dateLine = new Intl.DateTimeFormat(i18n.language, { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())

  return (
    <>
      <PageHeader title={t('title')} subtitle={dateLine} />
      <div className="mb-6 max-w-sm">
        <Segmented
          items={['day', 'week'] as const}
          value={tab}
          onChange={(v) => setParams(v === 'week' ? { tab: 'week' } : {}, { replace: true })}
          label={t('tabs.label')}
          render={(v) => t(`tabs.${v}`)}
        />
      </div>
      <div key={tab} className="page-enter">
        {tab === 'day' ? <DayPlanner /> : <WeeklyReviewFlow />}
      </div>
    </>
  )
}
