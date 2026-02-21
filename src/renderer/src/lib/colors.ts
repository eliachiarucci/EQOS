export const BAND_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#22c55e', // Green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#14b8a6' // Teal
] as const

export function getNextAvailableColor(usedColors: string[]): string {
  for (const color of BAND_COLORS) {
    if (!usedColors.includes(color)) return color
  }
  return BAND_COLORS[0]
}
