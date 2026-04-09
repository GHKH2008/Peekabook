import { NextResponse } from 'next/server'
import { searchGoogleBooks } from '@/lib/google-books'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q')?.trim()
  const language = searchParams.get('lang')?.trim() || undefined
  const debug = searchParams.get('debug') === '1'

  if (!query) return NextResponse.json([])

  const books = await searchGoogleBooks(query, language)

  if (!debug) return NextResponse.json(books)

  return NextResponse.json({
    results: books,
    debug: books.map((book) => ({
      id: book.id,
      title: book.volumeInfo.title,
      sources: book.sourceTrace,
      merge: book.sourceDetails?.debug,
    })),
  })
}
