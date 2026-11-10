import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AmbiencePicker, MinutesPicker } from './TimerControls'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: { count?: number }) => (o?.count != null ? `${o.count} min` : k) }),
}))

function Harness({ initial = 25, onChange }: { initial?: number; onChange?: (n: number) => void }) {
  const [v, setV] = useState(initial)
  return (
    <>
      <MinutesPicker label="Focus" values={[15, 25, 45]} value={v} min={1} max={240} onChange={(n) => { setV(n); onChange?.(n) }} />
      <output data-testid="value">{v}</output>
    </>
  )
}

const value = () => screen.getByTestId('value').textContent
afterEach(cleanup)

describe('MinutesPicker', () => {
  it('picks a preset', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '45 min' }))
    expect(value()).toBe('45')
  })

  it('takes any typed length and clamps out-of-range values on blur', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'timer.custom' }))
    const box = screen.getByRole('spinbutton')
    fireEvent.change(box, { target: { value: '37' } })
    expect(value()).toBe('37')
    fireEvent.change(box, { target: { value: '999' } })
    expect(value()).toBe('37') // not applied while out of range
    fireEvent.blur(box)
    expect(value()).toBe('240')
    expect(box).toHaveValue(240)
    fireEvent.change(box, { target: { value: '' } })
    fireEvent.blur(box)
    expect(value()).toBe('240') // empty box keeps the last value
  })

  it('opens on the custom box when the saved length is not a preset', () => {
    render(<Harness initial={70} />)
    expect(screen.getByRole('spinbutton')).toHaveValue(70)
    expect(screen.getByRole('button', { name: '70 min' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('AmbiencePicker', () => {
  it('saves the chosen sound and volume on this device', () => {
    render(<AmbiencePicker />)
    expect(screen.queryByRole('slider')).toBeNull() // off by default: no volume
    fireEvent.click(screen.getByRole('button', { name: /sound.kinds.rain/ }))
    fireEvent.change(screen.getByRole('slider'), { target: { value: '30' } })
    expect(JSON.parse(localStorage.getItem('lifeos.ambience')!)).toEqual({ kind: 'rain', volume: 0.3 })
  })
})
