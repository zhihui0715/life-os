import type { Scene } from '../theme'

/**
 * Still previews of Academia's scenes, for the picker tiles in Settings and the landing page (the real ones are painted
 * live by lib/academia/scene.ts). Kept out of the stylesheet so only the pages that show them carry them.
 */
export const SCENE_TILES: Record<Scene, string> = {
  library:
    'repeating-linear-gradient(90deg, #5a2a22 0 7px, #3e4a2f 7px 12px, #6b3a1f 12px 20px, #2f3b4f 20px 25px, #24170f 25px 26px) 0 0 / 30% 100% no-repeat, repeating-linear-gradient(90deg, #4a2c3d 0 6px, #7a4a24 6px 13px, #284034 13px 19px, #24170f 19px 20px) 100% 0 / 30% 100% no-repeat, radial-gradient(at 50% 0%, rgb(255 159 69 / 0.45), transparent 60%), #1a120c',
  chalkboard:
    'linear-gradient(180deg, transparent 86%, #5a3a20 86%), radial-gradient(at 30% 30%, rgb(223 230 220 / 0.18), transparent 40%), radial-gradient(at 70% 60%, rgb(223 230 220 / 0.12), transparent 40%), #1b271f',
  observatory:
    'radial-gradient(circle at 50% 50%, transparent 38%, rgb(201 164 92 / 0.5) 39%, transparent 40%, transparent 58%, rgb(201 164 92 / 0.35) 59%, transparent 60%), radial-gradient(1.5px 1.5px at 30% 25%, #fff1c9, transparent), radial-gradient(1.5px 1.5px at 70% 70%, #fff1c9, transparent), radial-gradient(#13213a, #070c18)',
  parchment:
    'linear-gradient(90deg, transparent 14%, rgb(181 65 58 / 0.45) 14% 15%, transparent 15%), repeating-linear-gradient(180deg, transparent 0 10px, rgb(125 156 192 / 0.3) 10px 11px), radial-gradient(#f6eedb, #e6d5b0)',
  botanical:
    'radial-gradient(ellipse 30% 12% at 22% 80%, rgb(85 102 58 / 0.55), transparent 70%), radial-gradient(ellipse 12% 30% at 80% 25%, rgb(107 85 48 / 0.5), transparent 70%), linear-gradient(135deg, #f7f1e1, #ece2c8)',
}
