export const STUDY_STUDIO_LAYOUT_KEY = 'fengsha-study-studio-layout-v1'

export interface StudyStudioLayout {
  leftCollapsed: boolean
  leftWidth: number
  rightCollapsed: boolean
  rightWidth: number
}

export const DEFAULT_STUDY_STUDIO_LAYOUT: StudyStudioLayout = {
  leftCollapsed: false,
  leftWidth: 330,
  rightCollapsed: false,
  rightWidth: 320
}

const MIN_SIDE_WIDTH = 260
const MAX_SIDE_WIDTH = 620

export const clampStudySideWidth = (width: number, maximum = MAX_SIDE_WIDTH): number =>
  Math.round(Math.min(Math.max(MIN_SIDE_WIDTH, width), Math.max(MIN_SIDE_WIDTH, maximum)))

export const parseStudyStudioLayout = (raw: string | null): StudyStudioLayout => {
  if (!raw) {
    return DEFAULT_STUDY_STUDIO_LAYOUT
  }
  try {
    const value = JSON.parse(raw) as unknown
    if (!(value && typeof value === 'object')) {
      return DEFAULT_STUDY_STUDIO_LAYOUT
    }
    const candidate = value as Partial<StudyStudioLayout>
    return {
      leftCollapsed:
        typeof candidate.leftCollapsed === 'boolean'
          ? candidate.leftCollapsed
          : DEFAULT_STUDY_STUDIO_LAYOUT.leftCollapsed,
      leftWidth:
        typeof candidate.leftWidth === 'number'
          ? clampStudySideWidth(candidate.leftWidth)
          : DEFAULT_STUDY_STUDIO_LAYOUT.leftWidth,
      rightCollapsed:
        typeof candidate.rightCollapsed === 'boolean'
          ? candidate.rightCollapsed
          : DEFAULT_STUDY_STUDIO_LAYOUT.rightCollapsed,
      rightWidth:
        typeof candidate.rightWidth === 'number'
          ? clampStudySideWidth(candidate.rightWidth)
          : DEFAULT_STUDY_STUDIO_LAYOUT.rightWidth
    }
  } catch {
    return DEFAULT_STUDY_STUDIO_LAYOUT
  }
}
