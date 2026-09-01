import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('Hobby deployment routing', () => {
  it('routes every API path through the single serverless entrypoint', () => {
    const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as { rewrites: Array<{ source: string; destination: string }> }
    expect(config.rewrites).toContainEqual({ source: '/api/:path*', destination: '/api' })
  })
})
