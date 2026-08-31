import { type PointerEvent, useCallback, useRef, useState, type WheelEvent } from 'react'

interface PanZoomOptions {
  baselineZoom?: number
  initialOffset?: PanZoomOffset
  initialZoom?: number
  maxZoom: number
  minZoom: number
  zoomStep: number
}

interface PanZoomOffset {
  x: number
  y: number
}

interface DragOrigin extends PanZoomOffset {
  clientX: number
  clientY: number
  pointerId: number
}

/**
 * Keep mouse/touch panning and wheel zoom behavior identical across visual viewers.
 */
export const usePanZoom = ({
  baselineZoom,
  initialOffset = { x: 0, y: 0 },
  initialZoom = 1,
  maxZoom,
  minZoom,
  zoomStep
}: PanZoomOptions) => {
  const restingZoom = baselineZoom ?? initialZoom
  const [zoom, setZoomState] = useState(initialZoom)
  const [offset, setOffset] = useState<PanZoomOffset>(initialOffset)
  const [dragging, setDragging] = useState(false)
  const dragOrigin = useRef<DragOrigin | null>(null)

  const reset = useCallback((): void => {
    dragOrigin.current = null
    setDragging(false)
    setZoomState(restingZoom)
    setOffset({ x: 0, y: 0 })
  }, [restingZoom])

  const setZoom = useCallback(
    (requested: number): void => {
      const nextZoom = Math.min(maxZoom, Math.max(minZoom, requested))
      setZoomState(nextZoom)
      if (nextZoom <= restingZoom) {
        setOffset({ x: 0, y: 0 })
      }
    },
    [maxZoom, minZoom, restingZoom]
  )

  const onWheel = useCallback(
    (event: WheelEvent<HTMLElement>): void => {
      event.preventDefault()
      setZoom(zoom + (event.deltaY < 0 ? zoomStep : -zoomStep))
    },
    [setZoom, zoom, zoomStep]
  )

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>): void => {
      const interactiveTarget = (event.target as HTMLElement).closest(
        'button, a, input, textarea, select, [role="button"]'
      )
      if (event.button !== 0 || zoom <= restingZoom || interactiveTarget) {
        return
      }
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      dragOrigin.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        x: offset.x,
        y: offset.y
      }
      setDragging(true)
    },
    [offset.x, offset.y, restingZoom, zoom]
  )

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>): void => {
    const origin = dragOrigin.current
    if (!(origin && origin.pointerId === event.pointerId)) {
      return
    }
    event.preventDefault()
    setOffset({
      x: origin.x + event.clientX - origin.clientX,
      y: origin.y + event.clientY - origin.clientY
    })
  }, [])

  const stopDragging = useCallback((event?: PointerEvent<HTMLElement>): void => {
    const origin = dragOrigin.current
    if (event && origin && event.currentTarget.hasPointerCapture(origin.pointerId)) {
      event.currentTarget.releasePointerCapture(origin.pointerId)
    }
    dragOrigin.current = null
    setDragging(false)
  }, [])

  return {
    dragging,
    offset,
    onPointerCancel: stopDragging,
    onPointerDown,
    onPointerMove,
    onPointerUp: stopDragging,
    onWheel,
    reset,
    setZoom,
    zoom,
    zoomIn: (): void => setZoom(zoom + zoomStep),
    zoomOut: (): void => setZoom(zoom - zoomStep)
  }
}
