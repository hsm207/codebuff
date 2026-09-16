import type { SkillsMap } from '@codebuff/common/types/skill'

/** Reads nothing — for rows that need the walk to run with zero skills. */
export const noSkillsReader = (_skillsDir: string): SkillsMap => ({})
