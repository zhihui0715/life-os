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
      <div className="mb-8 flex flex-col items-center gap-3">
        <img src="/icon.svg" alt="" className="animate-spin-in h-[76px] w-[76px] rounded-[18px] shadow-[0_12px_30px_-8px_rgb(0_0_0/0.35)]" />
        <span className="font-display text-[22px] font-bold tracking-tight">{t('appName')}</span>
      </div>
      <Card className="page-enter w-full max-w-sm p-6 sm:p-7">
        <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight">{t('auth.title')}</h1>
        <p className="text-subtle mt-1 mb-6">{t('auth.subtitle')}</p>
        <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((values) => login.mutate(values))}>
          <Field label={t('auth.email')} error={err('email')}>
            {(a) => <Input {...a} type="email" autoComplete="username" autoFocus {...register('email')} />}
          </Field>
          <Field label={t('auth.password')} error={err('password')}>
            {(a) => <Input {...a} type="password" autoComplete="current-password" {...register('password')} />}
          </Field>
          {login.error && (
            <p role="alert" className="bg-danger-soft text-danger animate-pop rounded-xl px-3.5 py-2.5">
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
