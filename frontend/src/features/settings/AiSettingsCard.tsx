import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { Button } from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { Card } from '../../components/ui/states'
import { api } from '../../lib/api'
import { errorMessage } from '../../lib/errors'
import type { Me, UserSettings } from '../../lib/types'
import { ME_KEY, useMe } from '../auth/AuthProvider'
import { AI_STATUS_KEY, useAiStatus } from '../ai/api'

export function AiSettingsCard() {
  const { t } = useTranslation('ai')
  const me = useMe()
  const status = useAiStatus()
  const qc = useQueryClient()
  const toast = useToast()
  const [budget, setBudget] = useState(String(me.settings.ai_monthly_token_budget))
  useEffect(() => setBudget(String(me.settings.ai_monthly_token_budget)), [me.settings.ai_monthly_token_budget])

  const save = useMutation({
    mutationFn: (body: Partial<UserSettings>) => api<UserSettings>('/settings', { method: 'PATCH', body }),
    onSuccess: (settings) => {
      qc.setQueryData<Me>(ME_KEY, (old) => old && { ...old, settings })
      qc.invalidateQueries({ queryKey: AI_STATUS_KEY })
      toast(t('common:state.saved'))
    },
    onError: (e) => toast(errorMessage(t, e), 'error'),
  })

  const value = Number(budget)
  const budgetValid = budget.trim() !== '' && Number.isInteger(value) && value >= 0 && value <= 10_000_000

  return (
    <Card className="mb-4 p-5">
      <h2 className="font-semibold">{t('settings.title')}</h2>
      <p className="text-subtle mt-1 mb-4 text-sm">{t('settings.help')}</p>
      {status.data && !status.data.configured && <p className="text-muted mb-4 text-sm">{t('unavailable.body')}</p>}

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={me.settings.ai_enabled}
          disabled={save.isPending}
          onChange={(e) => save.mutate({ ai_enabled: e.target.checked })}
        />
        <span>
          <span className="font-medium">{t('settings.enable')}</span>
          <span className="text-subtle block text-xs">{t('settings.enableHelp')}</span>
        </span>
      </label>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <Field label={t('settings.budget')} help={t('settings.budgetHelp')} className="w-56">
          {(a) => <Input {...a} type="number" min={0} step={10000} value={budget} onChange={(e) => setBudget(e.target.value)} />}
        </Field>
        <Button
          className="mb-6"
          disabled={!budgetValid || value === me.settings.ai_monthly_token_budget || save.isPending}
          onClick={() => save.mutate({ ai_monthly_token_budget: value })}
        >
          {t('common:actions.save')}
        </Button>
      </div>
      {me.settings.ai_enabled && status.data?.configured && (
        <Link to="/assistant" className="text-accent text-sm font-medium hover:underline">
          {t('settings.open')}
        </Link>
      )}
    </Card>
  )
}
