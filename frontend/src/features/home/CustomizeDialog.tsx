import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { useToast } from '../../components/ui/Toast'
import { api } from '../../lib/api'
import { errorMessage } from '../../lib/errors'
import type { Me, UserSettings } from '../../lib/types'
import { ME_KEY, useMe } from '../auth/AuthProvider'

/** Show/hide Home sections and change their order (buttons rather than drag, so it works by keyboard and touch). */
export function CustomizeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const me = useMe()
  const qc = useQueryClient()
  const toast = useToast()
  const [layout, setLayout] = useState(me.settings.dashboard_layout)
  useEffect(() => {
    if (open) setLayout(me.settings.dashboard_layout)
  }, [open, me.settings.dashboard_layout])

  const save = useMutation({
    mutationFn: () => api<UserSettings>('/settings', { method: 'PATCH', body: { dashboard_layout: layout } }),
    onSuccess: (settings) => {
      qc.setQueryData<Me>(ME_KEY, (old) => old && { ...old, settings })
      toast(t('home.layoutSaved'))
      onClose()
    },
    onError: (e) => toast(errorMessage(t, e), 'error'),
  })

  const move = (i: number, by: number) =>
    setLayout((l) => {
      const next = [...l]
      ;[next[i], next[i + by]] = [next[i + by], next[i]]
      return next
    })

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('home.customizeTitle')}
      footer={
        <div className="ml-auto flex gap-2">
          <Button onClick={onClose}>{t('actions.cancel')}</Button>
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>{t('actions.save')}</Button>
        </div>
      }
    >
      <p className="text-subtle mb-3 text-sm">{t('home.customizeHelp')}</p>
      <ul className="flex flex-col gap-1">
        {layout.map((item, i) => {
          const name = t(`home.sections.${item.key}`)
          return (
            <li key={item.key} className="border-border flex items-center gap-2 rounded-lg border px-3 py-1.5">
              <label className="flex flex-1 items-center gap-2 text-sm">
                <input type="checkbox" checked={item.visible}
                  onChange={(e) => setLayout((l) => l.map((x, j) => (j === i ? { ...x, visible: e.target.checked } : x)))} />
                {name}
              </label>
              <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === 0} aria-label={t('home.moveUp', { name })} onClick={() => move(i, -1)}>
                <ArrowUp size={15} aria-hidden />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === layout.length - 1} aria-label={t('home.moveDown', { name })} onClick={() => move(i, 1)}>
                <ArrowDown size={15} aria-hidden />
              </Button>
            </li>
          )
        })}
      </ul>
    </Dialog>
  )
}
