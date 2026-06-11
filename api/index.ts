import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import './database.js'
import { rateLimit } from './middleware/rateLimit.js'
import speedRouter from './routes/speed.js'
import reportsRouter from './routes/reports.js'
import monitorRouter from './routes/monitor.js'
import performanceRouter from './routes/performance.js'

const PORT = 8679

const app = express()
const server = createServer(app)

const wss = new WebSocketServer({ server, path: '/ws' })
app.locals.wss = wss

app.use(cors())
app.use(express.json({ limit: '100mb' }))
app.use(express.raw({ type: 'application/octet-stream', limit: '100mb' }))
app.use(rateLimit)

app.use('/api/speed', speedRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/monitor', monitorRouter)
app.use('/api/performance', performanceRouter)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() })
})

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'connected', data: { timestamp: Date.now() } }))
})

server.listen(PORT, () => {
  console.log(`SpeedRadar server running on port ${PORT}`)
})
