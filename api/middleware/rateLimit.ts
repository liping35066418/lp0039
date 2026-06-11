import { Request, Response, NextFunction } from 'express'

interface Bucket {
  tokens: number
  lastRefill: number
}

const buckets = new Map<string, Bucket>()
const MAX_TOKENS = 100
const REFILL_RATE = 100 / 60

function getBucket(ip: string): Bucket {
  let bucket = buckets.get(ip)
  if (!bucket) {
    bucket = { tokens: MAX_TOKENS, lastRefill: Date.now() }
    buckets.set(ip, bucket)
  }
  return bucket
}

function refill(bucket: Bucket): void {
  const now = Date.now()
  const elapsed = (now - bucket.lastRefill) / 1000
  bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + elapsed * REFILL_RATE)
  bucket.lastRefill = now
}

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  const bucket = getBucket(ip)
  refill(bucket)
  if (bucket.tokens < 1) {
    res.status(429).json({ error: 'Too many requests' })
    return
  }
  bucket.tokens -= 1
  next()
}
