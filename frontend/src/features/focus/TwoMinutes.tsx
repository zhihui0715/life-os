import { Timer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { Button, type ButtonProps } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { errorMessage } from '../../lib/errors'
import { play } from '../../lib/sound'
import { useFocusAction } from './api'

/** Starting is the hard part: a 2-minute focus session on a task. At 0:00 the clock keeps counting, so you can keep going. */
export const TWO_MINUTES = 2

export function TwoMinuteButton({ taskId, onStarted, variant = 'secondary', size = 'sm', className }: {
  taskId: string
  onStarted?: () => void
} & Pick<ButtonProps, 'variant' | 'size' | 'className'>) {
  const { t } = useTranslation('focus')
  const action = useFocusAction()
  const navigate = useNavigate()
  const toast = useToast()
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={action.isPending}
      title={t('twoMinutes.help')}
      onClick={() => {
        play('success')
        action.mutate(
          { kind: 'start', planned_minutes: TWO_MINUTES, break_minutes: 0, task_id: taskId },
          {
            onSuccess: () => {
              onStarted?.()
              navigate('/focus')
            },
            onError: (e) => toast(errorMessage(t, e), 'error'),
          },
        )
      }}
    >
      <Timer size={15} aria-hidden />
      {t('twoMinutes.start')}
    </Button>
  )
}
