import { stripPunctuation } from '../normalize'
import type { NormalizedBookResult } from '../types'

export async function fetchJson(url: string, timeoutMs = 5000): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'PeekabookBot/1.0 (+contact admin)' } })
    if (!res.ok) return null
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchHtml(url: string, timeoutMs = 5000): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'PeekabookBot/1.0 (+contact admin)' } })
    if (!res.ok) return null
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

export function readMetaContent(html: string, key: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i'),
  ]
  for (const pattern of patterns) {
    const m = html.match(pattern)
    if (m?.[1]) return m[1].trim()
  }
  return undefined
}

export function withAttribution(item: NormalizedBookResult, fields: string[]): NormalizedBookResult {
  return {
    ...item,
    source_attribution: [
      {
        source: item.source,
        source_id: item.source_id,
        source_url: item.canonical_url,
        fields,
      },
    ],
  }
}

export function isLikelySameTitle(a: string, b: string): boolean {
  return stripPunctuation(a) === stripPunctuation(b)
}
