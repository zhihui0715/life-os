import type { TFunction } from 'i18next'

import { ApiError } from './api'

/** Server error codes → translated, user-friendly text (the server never sends UI text). */
export function errorMessage(t: TFunction, error: unknown): string {
  const code = error instanceof ApiError ? error.code : 'unknown'
  return t(`common:errors.${code}`, { defaultValue: t('common:errors.unknown') })
}

/** First field error for a field, translated by its stable `type`. */
export function fieldError(t: TFunction, error: unknown, field: string): string | undefined {
  if (!(error instanceof ApiError) || !error.fields?.[field]?.length) return undefined
  const type = error.fields[field][0].type
  return t(`common:validation.${type}`, { defaultValue: t('common:validation.invalid') })
}
