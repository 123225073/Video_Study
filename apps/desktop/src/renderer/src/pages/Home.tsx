import { UnifiedDownloadHistory } from '../components/download/UnifiedDownloadHistory'
import { LearningHero } from '../components/learning/LearningHero'

interface HomeProps {
  onOpenLearning: () => void
  onOpenSupportedSites?: () => void
  onOpenSettings?: () => void
  onOpenCookiesSettings?: () => void
}

export function Home({
  onOpenLearning,
  onOpenSupportedSites,
  onOpenSettings,
  onOpenCookiesSettings
}: HomeProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <UnifiedDownloadHistory
          onOpenCookiesSettings={onOpenCookiesSettings}
          onOpenSettings={onOpenSettings}
          onOpenSupportedSites={onOpenSupportedSites}
          topContent={<LearningHero onOpenLearning={onOpenLearning} />}
        />
      </div>
    </div>
  )
}
