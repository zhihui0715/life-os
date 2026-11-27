import { useTranslation } from 'react-i18next'

import { Field, Input, Select } from '../../components/ui/Field'
import type { RepeatChoice } from './rrule'

/**
 * The "Repeat" and "Ends" fields, shared by calendar events and tasks. Tasks end on a date or never: each next task is
 * its own row, so there's no count to run down (`allowCount={false}`).
 */
export function RepeatFields({ value, onChange, allowCount = true, help }: { value: RepeatChoice; onChange: (r: RepeatChoice) => void; allowCount?: boolean; help?: string }) {
  const { t } = useTranslation('calendar')
  const freqs = ['none', 'daily', 'weekdays', 'weekly', 'monthly', ...(value.freq === 'custom' ? ['custom'] : [])] as RepeatChoice['freq'][]
  return (
    <div className="flex flex-col gap-3">
      <Field label={t('repeat.label')} help={value.freq === 'custom' ? value.custom : help}>
        {(a) => (
          <Select {...a} value={value.freq} onChange={(e) => onChange({ ...value, freq: e.target.value as RepeatChoice['freq'] })}>
            {freqs.map((f) => (
              <option key={f} value={f}>
                {t(`repeat.${f}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {value.freq !== 'none' && value.freq !== 'custom' && (
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('repeat.ends')} className="min-w-32">
            {(a) => (
              <Select {...a} value={value.end} onChange={(e) => onChange({ ...value, end: e.target.value as RepeatChoice['end'] })}>
                <option value="never">{t('repeat.never')}</option>
                <option value="until">{t('repeat.until')}</option>
                {allowCount && <option value="count">{t('repeat.count')}</option>}
              </Select>
            )}
          </Field>
          {value.end === 'until' && (
            <Input type="date" aria-label={t('repeat.until')} className="w-auto" value={value.until} onChange={(e) => onChange({ ...value, until: e.target.value })} />
          )}
          {value.end === 'count' && (
            <label className="flex items-center gap-2 text-sm">
              <Input type="number" min={1} max={1000} className="w-24" value={value.count} onChange={(e) => onChange({ ...value, count: Number(e.target.value) || 1 })} />
              {t('repeat.times')}
            </label>
          )}
        </div>
      )}
    </div>
  )
}
