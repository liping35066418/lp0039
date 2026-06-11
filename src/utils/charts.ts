interface ChartConfig {
  width: number
  height: number
  padding?: { top: number; right: number; bottom: number; left: number }
  lineColor?: string
  fillColor?: string
  gridColor?: string
  textColor?: string
  yLabel?: string
  xLabel?: string
  yMin?: number
  yMax?: number
}

export function drawLineChart(
  ctx: CanvasRenderingContext2D,
  data: Array<{ x: number; y: number }>,
  config: ChartConfig,
) {
  const {
    width,
    height,
    padding = { top: 20, right: 20, bottom: 30, left: 50 },
    lineColor = '#00f5d4',
    fillColor,
    gridColor = 'rgba(30, 41, 59, 0.6)',
    textColor = '#9ca3af',
    yLabel,
    yMin: customYMin,
    yMax: customYMax,
  } = config

  if (data.length === 0) return

  const plotW = width - padding.left - padding.right
  const plotH = height - padding.top - padding.bottom

  const yValues = data.map((d) => d.y)
  const yMin = customYMin ?? Math.min(...yValues, 0)
  const yMax = customYMax ?? (Math.max(...yValues) * 1.1 || 1)

  const xMin = data[0].x
  const xMax = data[data.length - 1].x
  const xRange = xMax - xMin || 1

  const toCanvasX = (x: number) => padding.left + ((x - xMin) / xRange) * plotW
  const toCanvasY = (y: number) => padding.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH

  ctx.clearRect(0, 0, width, height)

  const gridLines = 5
  ctx.strokeStyle = gridColor
  ctx.lineWidth = 1
  ctx.font = '11px JetBrains Mono, monospace'
  ctx.fillStyle = textColor
  ctx.textAlign = 'right'

  for (let i = 0; i <= gridLines; i++) {
    const yVal = yMin + ((yMax - yMin) / gridLines) * i
    const cy = toCanvasY(yVal)
    ctx.beginPath()
    ctx.moveTo(padding.left, cy)
    ctx.lineTo(width - padding.right, cy)
    ctx.stroke()
    ctx.fillText(formatNumber(yVal), padding.left - 8, cy + 4)
  }

  if (yLabel) {
    ctx.save()
    ctx.translate(12, padding.top + plotH / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.fillStyle = textColor
    ctx.font = '10px Noto Sans SC, sans-serif'
    ctx.fillText(yLabel, 0, 0)
    ctx.restore()
  }

  if (fillColor) {
    ctx.beginPath()
    ctx.moveTo(toCanvasX(data[0].x), toCanvasY(data[0].y))
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(toCanvasX(data[i].x), toCanvasY(data[i].y))
    }
    ctx.lineTo(toCanvasX(data[data.length - 1].x), toCanvasY(yMin))
    ctx.lineTo(toCanvasX(data[0].x), toCanvasY(yMin))
    ctx.closePath()
    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom)
    gradient.addColorStop(0, fillColor)
    gradient.addColorStop(1, 'transparent')
    ctx.fillStyle = gradient
    ctx.fill()
  }

  ctx.beginPath()
  ctx.strokeStyle = lineColor
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  for (let i = 0; i < data.length; i++) {
    const cx = toCanvasX(data[i].x)
    const cy = toCanvasY(data[i].y)
    if (i === 0) ctx.moveTo(cx, cy)
    else ctx.lineTo(cx, cy)
  }
  ctx.stroke()

  if (data.length > 0) {
    const last = data[data.length - 1]
    const lx = toCanvasX(last.x)
    const ly = toCanvasY(last.y)
    ctx.beginPath()
    ctx.arc(lx, ly, 4, 0, Math.PI * 2)
    ctx.fillStyle = lineColor
    ctx.fill()
    ctx.beginPath()
    ctx.arc(lx, ly, 8, 0, Math.PI * 2)
    ctx.fillStyle = lineColor.replace(')', ',0.2)').replace('rgb', 'rgba')
    ctx.fill()
  }
}

export function drawGauge(
  ctx: CanvasRenderingContext2D,
  value: number,
  max: number,
  label: string,
  unit: string,
  width: number,
  height: number,
) {
  const cx = width / 2
  const cy = height / 2 + 10
  const radius = Math.min(width, height) * 0.38

  ctx.clearRect(0, 0, width, height)

  const startAngle = Math.PI * 0.75
  const endAngle = Math.PI * 2.25
  const totalAngle = endAngle - startAngle

  ctx.beginPath()
  ctx.arc(cx, cy, radius, startAngle, endAngle)
  ctx.strokeStyle = '#1e293b'
  ctx.lineWidth = 12
  ctx.lineCap = 'round'
  ctx.stroke()

  const ratio = Math.min(value / max, 1)
  const valueAngle = startAngle + totalAngle * ratio
  const gradient = ctx.createConicGradient(startAngle, cx, cy)
  gradient.addColorStop(0, '#00f5d4')
  gradient.addColorStop(0.5, '#eab308')
  gradient.addColorStop(1, '#ef4444')

  ctx.beginPath()
  ctx.arc(cx, cy, radius, startAngle, valueAngle)
  ctx.strokeStyle = gradient
  ctx.lineWidth = 12
  ctx.lineCap = 'round'
  ctx.stroke()

  const pointerAngle = valueAngle
  const pointerLen = radius - 20
  const px = cx + Math.cos(pointerAngle) * pointerLen
  const py = cy + Math.sin(pointerAngle) * pointerLen

  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(px, py)
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy, 5, 0, Math.PI * 2)
  ctx.fillStyle = '#e5e7eb'
  ctx.fill()

  ctx.font = 'bold 28px JetBrains Mono, monospace'
  ctx.fillStyle = '#e5e7eb'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(formatNumber(value), cx, cy - 10)

  ctx.font = '12px Noto Sans SC, sans-serif'
  ctx.fillStyle = '#9ca3af'
  ctx.fillText(unit, cx, cy + 15)

  ctx.font = '11px Noto Sans SC, sans-serif'
  ctx.fillStyle = '#6b7280'
  ctx.fillText(label, cx, cy + radius + 20)
}

export function drawRadarChart(
  ctx: CanvasRenderingContext2D,
  datasets: Array<{ label: string; values: number[]; color: string }>,
  labels: string[],
  width: number,
  height: number,
) {
  const cx = width / 2
  const cy = height / 2
  const radius = Math.min(width, height) * 0.35
  const n = labels.length
  const angleStep = (Math.PI * 2) / n

  ctx.clearRect(0, 0, width, height)

  for (let ring = 1; ring <= 4; ring++) {
    const r = (radius * ring) / 4
    ctx.beginPath()
    for (let i = 0; i <= n; i++) {
      const angle = -Math.PI / 2 + i * angleStep
      const x = cx + Math.cos(angle) * r
      const y = cy + Math.sin(angle) * r
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.6)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + i * angleStep
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius)
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)'
    ctx.stroke()

    const labelR = radius + 15
    const lx = cx + Math.cos(angle) * labelR
    const ly = cy + Math.sin(angle) * labelR
    ctx.font = '11px Noto Sans SC, sans-serif'
    ctx.fillStyle = '#9ca3af'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(labels[i], lx, ly)
  }

  datasets.forEach((dataset) => {
    ctx.beginPath()
    for (let i = 0; i <= n; i++) {
      const idx = i % n
      const angle = -Math.PI / 2 + idx * angleStep
      const r = (dataset.values[idx] / 100) * radius
      const x = cx + Math.cos(angle) * r
      const y = cy + Math.sin(angle) * r
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fillStyle = dataset.color.replace(')', ',0.15)').replace('rgb', 'rgba')
    ctx.fill()
    ctx.strokeStyle = dataset.color
    ctx.lineWidth = 2
    ctx.stroke()
  })

  const legendY = height - 20
  let legendX = 20
  ctx.font = '11px Noto Sans SC, sans-serif'
  datasets.forEach((ds) => {
    ctx.fillStyle = ds.color
    ctx.fillRect(legendX, legendY - 6, 10, 10)
    legendX += 14
    ctx.fillStyle = '#9ca3af'
    ctx.textAlign = 'left'
    ctx.fillText(ds.label, legendX, legendY + 2)
    legendX += ctx.measureText(ds.label).width + 16
  })
}

export function drawBarChart(
  ctx: CanvasRenderingContext2D,
  data: Array<{ label: string; values: number[]; colors: string[] }>,
  valueLabels: string[],
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height)
  if (data.length === 0) return

  const padding = { top: 10, right: 20, bottom: 30, left: 120 }
  const plotW = width - padding.left - padding.right
  const plotH = height - padding.top - padding.bottom
  const barHeight = Math.min(24, plotH / data.length - 4)
  const totalValues = valueLabels.length

  data.forEach((item, idx) => {
    const y = padding.top + (plotH / data.length) * idx + (plotH / data.length - barHeight) / 2
    const total = item.values.reduce((s, v) => s + v, 0) || 1
    let xOffset = padding.left

    ctx.font = '11px JetBrains Mono, monospace'
    ctx.fillStyle = '#9ca3af'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    const displayName = item.label.length > 20 ? '...' + item.label.slice(-20) : item.label
    ctx.fillText(displayName, padding.left - 8, y + barHeight / 2)

    item.values.forEach((val, vi) => {
      const w = (val / total) * plotW
      ctx.fillStyle = item.colors[vi] || '#374151'
      ctx.fillRect(xOffset, y, Math.max(w, 1), barHeight)
      if (w > 30) {
        ctx.font = '9px JetBrains Mono, monospace'
        ctx.fillStyle = '#0a0e1a'
        ctx.textAlign = 'center'
        ctx.fillText(`${val.toFixed(0)}ms`, xOffset + w / 2, y + barHeight / 2)
      }
      xOffset += w
    })
  })

  const legendY = height - 8
  let legendX = padding.left
  ctx.font = '10px Noto Sans SC, sans-serif'
  valueLabels.forEach((label, i) => {
    const colors = data[0]?.colors || []
    ctx.fillStyle = colors[i] || '#374151'
    ctx.fillRect(legendX, legendY - 6, 8, 8)
    legendX += 12
    ctx.fillStyle = '#9ca3af'
    ctx.textAlign = 'left'
    ctx.fillText(label, legendX, legendY)
    legendX += ctx.measureText(label).width + 16
  })
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  if (n >= 100) return n.toFixed(0)
  if (n >= 10) return n.toFixed(1)
  return n.toFixed(2)
}
