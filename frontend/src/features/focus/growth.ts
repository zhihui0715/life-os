/** How far along the tomato plant is, as a stage name (for the caption under the timer). */
export type GrowthStage = 'seed' | 'sprout' | 'leaves' | 'bloom' | 'fruit' | 'ripening' | 'ripe'

export function growthStage(progress: number): GrowthStage {
  if (progress >= 1) return 'ripe'
  if (progress < 0.03) return 'seed'
  if (progress < 0.2) return 'sprout'
  if (progress < 0.42) return 'leaves'
  if (progress < 0.58) return 'bloom'
  if (progress < 0.72) return 'fruit'
  return 'ripening'
}
