import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { Card } from '../../components/ui/states'
import { api } from '../../lib/api'
import { errorMessage } from '../../lib/errors'
import type { Me, ScoreComponentKey, ScoreWeights, UserSettings } from '../../lib/types'
import { ME_KEY, useMe } from '../auth/AuthProvider'

const KEYS: ScoreComponentKey[] = ['tasks', 'goals_learning', 'habits', 'wellbeing']
const DEFAULTS: ScoreWeights = { tasks: 30, goals_learning: 25, habits: 30, wellbeing: 15, enabled: { tasks: true, goals_learning: true, habits: true, wellbeing: true } }

export function ScoreSettingsCard() {
  const { t } = useTranslation('insights')
  const me = useMe()
  const qc = useQueryClient()
  const toast = useToast()
  const [w, setW] = useState<ScoreWeights>(me.settings.score_weights)
  const [target, setTarget] = useState(me.settings.weekly_learning_target_min?.toString() ?? '')
  useEffect(() => {
    setW(me.settings.score_weights)
    setTarget(me.settings.weekly_learning_target_min?.toString() ?? '')
  }, [me.settings.score_weights, me.settings.weekly_learning_target_min])

  const save = useMutation({
    mutationFn: (body: Partial<UserSettings>) => api<UserSettings>('/settings', { method: 'PATCH', body }),
    onSuccess: (settings) => {
      qc.setQueryData<Me>(ME_KEY, (old) => old && { ...old, settings })
      qc.invalidateQueries({ queryKey: ['insights'] })
      toast(t('settings.saved'))
    },
    onError: (e) => toast(errorMessage(t, e), 'error'),
  })

  const anyOn = KEYS.some((k) => w.enabled[k] && w[k] > 0)
  const totalOn = KEYS.reduce((s, k) => s + (w.enabled[k] ? w[k] : 0), 0)

  return (
    <Card className="mb-4 p-5">
      <h2 className="text-[17px] font-semibold tracking-tight">{t('settings.title')}</h2>
      <p className="text-subtle mt-1 mb-4 text-sm">{t('settings.help')}</p>
      <ul className="flex flex-col gap-3">
        {KEYS.map((k) => (
          <li key={k} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <label className="flex w-52 items-center gap-2 text-sm">
              <input type="checkbox" checked={w.enabled[k]} onChange={(e) => setW({ ...w, enabled: { ...w.enabled, [k]: e.target.checked } })} />
              {t(`components.${k}`)}
            </label>
            <input type="range" min={0} max={100} step={5} value={w[k]} disabled={!w.enabled[k]} aria-label={t(`components.${k}`)}
              onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} className="accent-[var(--accent)] w-40" />
            <span className="text-muted w-24 text-sm tabular-nums">
              {w.enabled[k] ? `${w[k]} · ${totalOn ? Math.round((100 * w[k]) / totalOn) : 0}%` : t('score.disabled')}
            </span>
          </li>
        ))}
      </ul>
      {!anyOn && <p className="text-danger mt-2 text-xs">{t('settings.atLeastOne')}</p>}
      <Field label={t('settings.learningTarget')} help={t('settings.learningTargetHelp')} className="mt-4 max-w-xs">
        {(a) => <Input {...a} type="number" min={0} max={10080} value={target} onChange={(e) => setTarget(e.target.value)} />}
      </Field>
      <div className="mt-4 flex gap-2">
        <Button variant="primary" disabled={!anyOn || save.isPending}
          onClick={() => save.mutate({ score_weights: w, weekly_learning_target_min: target ? Math.round(Number(target)) : null })}>
          {t('common:actions.save')}
        </Button>
        <Button variant="ghost" onClick={() => setW(DEFAULTS)}>{t('settings.reset')}</Button>
      </div>
    </Card>
  )
}
