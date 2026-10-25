import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { z } from 'zod'

import { LanguageSwitcher } from '../../app/LanguageSwitcher'
import { Button } from '../../components/ui/Button'
import { Field, Input, PasswordInput } from '../../components/ui/Field'
import { Card } from '../../components/ui/states'
import { ApiError } from '../../lib/api'
import { errorMessage } from '../../lib/errors'
import { useAuth } from './AuthProvider'

const MIN = 10 // backend/app/modules/auth/service.py MIN_PASSWORD_LENGTH

const schema = z
  .object({
    display_name: z.string().trim().min(1, 'required').max(100, 'string_too_long'),
    email: z.string().trim().min(1, 'required').email('email'),
    password: z.string().min(MIN, 'password_too_short'),
    confirm: z.string().min(1, 'required'),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'password_mismatch',
  })
type FormValues = z.infer<typeof schema>

/** Anyone can make their own account here; it starts signed in, in the language picked below. */
export function SignupPage() {
  const { t, i18n } = useTranslation()
  const { signup } = useAuth()
  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })
  const serverFields = signup.error instanceof ApiError ? signup.error.fields : undefined
  const err = (field: keyof FormValues) => {
    const type = formState.errors[field]?.message ?? serverFields?.[field]?.[0]?.type
    return type
      ? t(`validation.${type}`, {
          min: MIN,
          defaultValue: t('validation.invalid'),
        })
      : undefined
  }
  const fieldNames = ['display_name', 'email', 'password'] as const
  const otherError = signup.error && !fieldNames.some((f) => serverFields?.[f]) ? errorMessage(t, signup.error) : undefined

  const submit = ({ display_name, email, password }: FormValues) =>
    signup.mutate({
      display_name,
      email,
      password,
      locale: i18n.language === 'zh-CN' ? 'zh-CN' : 'en',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-8 flex flex-col items-center gap-3">
        <img src="/icon.svg" alt="" className="animate-spin-in h-[76px] w-[76px] rounded-[18px] shadow-[0_12px_30px_-8px_rgb(0_0_0/0.35)]" />
        <span className="font-display text-[22px] font-bold tracking-tight">{t('appName')}</span>
      </div>
      <Card className="page-enter w-full max-w-sm p-6 sm:p-7">
        <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight">{t('auth.signupTitle')}</h1>
        <p className="text-subtle mt-1 mb-6">{t('auth.signupSubtitle')}</p>
        <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit(submit)}>
          <Field label={t('auth.name')} error={err('display_name')}>
            {(a) => <Input {...a} autoComplete="name" autoFocus {...register('display_name')} />}
          </Field>
          <Field label={t('auth.email')} error={err('email')}>
            {(a) => <Input {...a} type="email" autoComplete="email" {...register('email')} />}
          </Field>
          <Field label={t('auth.password')} error={err('password')} help={t('auth.passwordHint', { min: MIN })}>
            {(a) => <PasswordInput {...a} autoComplete="new-password" {...register('password')} />}
          </Field>
          <Field label={t('auth.confirmPassword')} error={err('confirm')}>
            {(a) => <PasswordInput {...a} autoComplete="new-password" {...register('confirm')} />}
          </Field>
          {otherError && (
            <p role="alert" className="bg-danger-soft text-danger animate-pop rounded-xl px-3.5 py-2.5">
              {otherError}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={signup.isPending} className="w-full justify-center">
            {signup.isPending ? t('auth.signingUp') : t('auth.signUp')}
          </Button>
        </form>
        <p className="text-subtle mt-5 text-center">
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="text-accent font-semibold">
            {t('auth.signIn')}
          </Link>
        </p>
      </Card>
      <div className="mt-6">
        <LanguageSwitcher />
      </div>
    </main>
  )
}
