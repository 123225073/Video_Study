import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { RemoteImage } from '@renderer/components/ui/remote-image'
import { usePanZoom } from '@renderer/hooks/use-pan-zoom'
import { Download, Maximize2, Minus, Plus } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 4
const ZOOM_STEP = 0.25

interface LearningImageViewerProps {
  alt: string
  onDownload: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
  source: string | null
}

export function LearningImageViewer({
  alt,
  onDownload,
  onOpenChange,
  open,
  source
}: LearningImageViewerProps) {
  const { t } = useTranslation()
  const panZoom = usePanZoom({
    initialZoom: 1,
    maxZoom: MAX_ZOOM,
    minZoom: MIN_ZOOM,
    zoomStep: ZOOM_STEP
  })

  useEffect(() => {
    if (open && source) {
      panZoom.reset()
    }
  }, [open, panZoom.reset, source])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="h-[90vh] max-w-[92vw] overflow-hidden border-stone-700 bg-stone-950 p-0 text-stone-50 sm:max-w-[92vw]">
        <DialogTitle className="sr-only">{t('learning.imageStudio.viewerTitle')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('learning.imageStudio.viewerDescription')}
        </DialogDescription>
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between border-stone-800 border-b px-4">
            <span className="font-medium text-sm">{t('learning.imageStudio.viewerTitle')}</span>
            <div className="flex items-center gap-1.5">
              <Button
                aria-label={t('learning.imageStudio.zoomOut')}
                disabled={panZoom.zoom <= MIN_ZOOM}
                onClick={panZoom.zoomOut}
                size="icon"
                variant="ghost"
              >
                <Minus />
              </Button>
              <span className="w-12 text-center font-mono text-stone-300 text-xs">
                {Math.round(panZoom.zoom * 100)}%
              </span>
              <Button
                aria-label={t('learning.imageStudio.zoomIn')}
                disabled={panZoom.zoom >= MAX_ZOOM}
                onClick={panZoom.zoomIn}
                size="icon"
                variant="ghost"
              >
                <Plus />
              </Button>
              <Button onClick={panZoom.reset} size="sm" variant="ghost">
                <Maximize2 /> {t('learning.imageStudio.fitWindow')}
              </Button>
              <Button onClick={onDownload} size="sm" variant="secondary">
                <Download /> {t('learning.imageStudio.download')}
              </Button>
            </div>
          </div>
          <div
            aria-label={t('learning.imageStudio.viewerDescription')}
            className={`grid min-h-0 flex-1 touch-none place-items-center overflow-hidden bg-[radial-gradient(circle_at_center,_#292524_0,_#0c0a09_62%)] p-8 ${
              panZoom.zoom > 1
                ? panZoom.dragging
                  ? 'cursor-grabbing'
                  : 'cursor-grab'
                : 'cursor-zoom-in'
            }`}
            onDoubleClick={panZoom.reset}
            onDragStart={(event) => event.preventDefault()}
            onPointerCancel={panZoom.onPointerCancel}
            onPointerDown={panZoom.onPointerDown}
            onPointerMove={panZoom.onPointerMove}
            onPointerUp={panZoom.onPointerUp}
            onWheel={panZoom.onWheel}
            role="application"
          >
            {source ? (
              <div
                className="grid max-h-full max-w-full place-items-center"
                style={{
                  transform: `translate3d(${panZoom.offset.x}px, ${panZoom.offset.y}px, 0) scale(${panZoom.zoom})`,
                  transformOrigin: 'center'
                }}
              >
                <RemoteImage
                  alt={alt}
                  className="pointer-events-none max-h-full max-w-full select-none rounded-md object-contain shadow-2xl"
                  src={source}
                />
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
