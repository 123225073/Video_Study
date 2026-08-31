import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { RemoteImage } from '@renderer/components/ui/remote-image'
import { Download, Maximize2, Minus, Plus } from 'lucide-react'
import { type PointerEvent, useEffect, useRef, useState, type WheelEvent } from 'react'
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

const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

export function LearningImageViewer({
  alt,
  onDownload,
  onOpenChange,
  open,
  source
}: LearningImageViewerProps) {
  const { t } = useTranslation()
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragOrigin = useRef<{ offsetX: number; offsetY: number; x: number; y: number } | null>(null)

  const fit = (): void => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }

  useEffect(() => {
    if (open && source) {
      setZoom(1)
      setOffset({ x: 0, y: 0 })
    }
  }, [open, source])

  const updateZoom = (nextZoom: number): void => {
    const value = clampZoom(nextZoom)
    setZoom(value)
    if (value <= 1) {
      setOffset({ x: 0, y: 0 })
    }
  }

  const onWheel = (event: WheelEvent<HTMLDivElement>): void => {
    event.preventDefault()
    updateZoom(zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP))
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (zoom <= 1) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    dragOrigin.current = {
      offsetX: offset.x,
      offsetY: offset.y,
      x: event.clientX,
      y: event.clientY
    }
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (!dragOrigin.current) {
      return
    }
    setOffset({
      x: dragOrigin.current.offsetX + event.clientX - dragOrigin.current.x,
      y: dragOrigin.current.offsetY + event.clientY - dragOrigin.current.y
    })
  }

  const stopDragging = (): void => {
    dragOrigin.current = null
  }

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
                disabled={zoom <= MIN_ZOOM}
                onClick={() => updateZoom(zoom - ZOOM_STEP)}
                size="icon"
                variant="ghost"
              >
                <Minus />
              </Button>
              <span className="w-12 text-center font-mono text-stone-300 text-xs">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                aria-label={t('learning.imageStudio.zoomIn')}
                disabled={zoom >= MAX_ZOOM}
                onClick={() => updateZoom(zoom + ZOOM_STEP)}
                size="icon"
                variant="ghost"
              >
                <Plus />
              </Button>
              <Button onClick={fit} size="sm" variant="ghost">
                <Maximize2 /> {t('learning.imageStudio.fitWindow')}
              </Button>
              <Button onClick={onDownload} size="sm" variant="secondary">
                <Download /> {t('learning.imageStudio.download')}
              </Button>
            </div>
          </div>
          <div
            aria-label={t('learning.imageStudio.viewerDescription')}
            className={`grid min-h-0 flex-1 place-items-center overflow-hidden bg-[radial-gradient(circle_at_center,_#292524_0,_#0c0a09_62%)] p-8 ${
              zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
            }`}
            onDoubleClick={fit}
            onPointerCancel={stopDragging}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={stopDragging}
            onWheel={onWheel}
            role="application"
          >
            {source ? (
              <div
                className="grid max-h-full max-w-full place-items-center"
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                  transformOrigin: 'center'
                }}
              >
                <RemoteImage
                  alt={alt}
                  className="max-h-full max-w-full select-none rounded-md object-contain shadow-2xl"
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
