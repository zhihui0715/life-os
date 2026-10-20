import { useTranslation } from 'react-i18next'

import { Dialog } from '../../components/ui/Dialog'
import { QuickAddInput } from './QuickAddInput'

/** Mobile "+" button. Only tasks for now; events, habit check-ins and journal entries join in later stages. */
export function QuickAddDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('tasks')
  return (
    <Dialog open={open} onClose={onClose} title={t('actions.newTask')}>
      <QuickAddInput view="inbox" autoFocus onAdded={onClose} />
    </Dialog>
  )
}
