import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Button } from '../../components/ui/Button'
import { Field, PasswordInput } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { api } from '../../lib/api'
import { errorMessage, fieldError } from '../../lib/errors'

const MIN = 10 // backend/app/modules/auth/service.py MIN_PASSWORD_LENGTH

const schema = z
  .object({
    current_password: z.string().min(1, 'required'),
    new_password: z.string().min(MIN, 'password_too_short'),
    confirm: z.string().min(1, 'required'),
  })
  .refine((v) => v.new_password === v.confirm, { path: ['confirm'], message: 'password_mismatch' })
type FormValues = z.infer<typeof schema>

/** Change your password. Other devices are signed out; this one stays signed in. */
export function PasswordForm() {
  const { t } = useTranslation('settings')
  const toast = useToast()
  const { register, handleSubmit, formState, reset } = useForm<FormValues>({ resolver: zodResolver(schema) })
  const change = useMutation({
    mutationFn: ({ current_password, new_password }: FormValues) =>
      api('/auth/password', { method: 'POST', body: { current_password, new_password } }),
    onSuccess: () => {
      reset()
      toast(t('password.changed'))
    },
  })
  const err = (field: keyof FormValues) => {
    const msg = formState.errors[field]?.message
    if (msg) return t(`common:validation.${msg}`, { min: MIN })
    return field === 'confirm' ? undefined : fieldError(t, change.error, field)
  }
  const otherError = change.error && !err('current_password') && !err('new_password') ? errorMessage(t, change.error) : undefined

  return (
    <form noValidate className="mb-5 flex flex-col gap-3" onSubmit={handleSubmit((v) => change.mutate(v))}>
      <h3 className="text-[15px] font-semibold">{t('password.title')}</h3>
      <Field label={t('password.current')} error={err('current_password')}>
        {(a) => <PasswordInput {...a} autoComplete="current-password" {...register('current_password')} />}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('password.new')} error={err('new_password')} help={t('password.help', { min: MIN })}>
          {(a) => <PasswordInput {...a} autoComplete="new-password" {...register('new_password')} />}
        </Field>
        <Field label={t('password.confirm')} error={err('confirm')}>
          {(a) => <PasswordInput {...a} autoComplete="new-password" {...register('confirm')} />}
        </Field>
      </div>
      {otherError && (
        <p role="alert" className="bg-danger-soft text-danger rounded-xl px-3.5 py-2.5">
          {otherError}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={change.isPending} className="self-start">
        {change.isPending ? t('password.saving') : t('password.save')}
      </Button>
    </form>
  )
}
