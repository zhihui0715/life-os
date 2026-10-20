import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { LanguageSwitcher } from '../../app/LanguageSwitcher'
import { Button } from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Field'
import { Card } from '../../components/ui/states'
import { errorMessage } from '../../lib/errors'
import { useAuth } from './AuthProvider'

const schema = z.object({
  email: z.string().trim().min(1, 'required').email('email'),
  password: z.string().min(1, 'required'),
})
type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) })
  const err = (field: keyof FormValues) => {
    const msg = formState.errors[field]?.message
    return msg ? t(`validation.${msg}`) : undefined
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-2.5">
        <img src="/icon.svg" alt="" className="h-9 w-9" />
        <span className="text-lg font-semibold">{t('appName')}</span>
      </div>
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-xl font-semibold">{t('auth.title')}</h1>
        <p className="text-muted mt-1 mb-5">{t('auth.subtitle')}</p>
        <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((values) => login.mutate(values))}>
          <Field label={t('auth.email')} error={err('email')}>
            {(a) => <Input {...a} type="email" autoComplete="username" autoFocus {...register('email')} />}
          </Field>
          <Field label={t('auth.password')} error={err('password')}>
            {(a) => <Input {...a} type="password" autoComplete="current-password" {...register('password')} />}
          </Field>
          {login.error && (
            <p role="alert" className="bg-danger-soft text-danger rounded-md px-3 py-2">
              {errorMessage(t, login.error)}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={login.isPending} className="w-full justify-center">
            {login.isPending ? t('auth.signingIn') : t('auth.signIn')}
          </Button>
        </form>
      </Card>
      <div className="mt-6">
        <LanguageSwitcher />
      </div>
    </main>
  )
}
