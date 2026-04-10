'use server'

import { sql } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { searchBooksSequential } from '@/lib/book-search/orchestrator'
import type { EnglishBook } from '@/lib/book-search/types'

export type BookActionResult = {
  success: boolean
  error?: string
  bookId?: number
}

type CustomBookInput = {
  title: string
  author?: string
  summary?: string
  publisher?: string
  publishedDate?: string
}

type SearchBookInput = {
  title: string
  series?: string
  authors?: string[]
  summary?: string
  genres?: string[]
  isbn?: string
  isbn13?: string
  language?: string
  cover?: string
  publisher?: string
  publishedDate?: string
  pageCount?: number
  sourceRefs?: Record<string, string | undefined>
  sourceTrace?: string[]
}

export async function searchBooks(query: string): Promise<EnglishBook[]> {
  const user = await requireAuth()
  console.log('searchBooks auth user:', user)

  const trimmed = query.trim()
  if (!trimmed) return []

  try {
    const results = await searchBooksSequential(trimmed)
    console.log('searchBooks results count:', results.length)
    return results
  } catch (error) {
    console.error('searchBooks failed:', {
      query: trimmed,
      error,
    })
    throw error
  }
}

export async function addSearchedBookToLibrary(data: SearchBookInput): Promise<BookActionResult> {
  const user = await requireAuth()
  console.log('addSearchedBookToLibrary auth user:', user)

  const title = data.title.trim()
  if (!title) {
    return { success: false, error: 'Title is required' }
  }

  const authors = (data.authors ?? []).map((a) => a.trim()).filter(Boolean)
  const genres = (data.genres ?? []).map((g) => g.trim()).filter(Boolean)
  const sourceTrace = (data.sourceTrace ?? []).map((s) => s.trim()).filter(Boolean)
  const summary = data.summary?.trim() || null
  const isbn = data.isbn?.trim() || null
  const isbn13 = data.isbn13?.trim() || null
  const language = data.language?.trim() || null
  const cover = data.cover?.trim() || null
  const publisher = data.publisher?.trim() || null
  const publishedDate = data.publishedDate?.trim() || null
  const pageCount = typeof data.pageCount === 'number' ? data.pageCount : null
  const primaryAuthor = authors[0]?.toLowerCase() ?? null

  console.log('addSearchedBookToLibrary payload:', {
    userId: user.id,
    title,
    authors,
    genres,
    summary,
    isbn,
    isbn13,
    language,
    cover,
    publisher,
    publishedDate,
    pageCount,
    sourceRefs: data.sourceRefs ?? null,
    sourceTrace,
  })

  try {
    let existing: Array<{ id: number }> = []

    if (isbn13) {
      existing = await sql`
        SELECT id
        FROM books
        WHERE user_id = ${user.id}
          AND isbn_13 = ${isbn13}
        LIMIT 1
      `
    } else if (isbn) {
      existing = await sql`
        SELECT id
        FROM books
        WHERE user_id = ${user.id}
          AND isbn = ${isbn}
        LIMIT 1
      `
    } else if (primaryAuthor) {
      existing = await sql`
        SELECT id
        FROM books
        WHERE user_id = ${user.id}
          AND lower(title) = ${title.toLowerCase()}
          AND lower(COALESCE(authors[1], '')) = ${primaryAuthor}
        LIMIT 1
      `
    } else {
      existing = await sql`
        SELECT id
        FROM books
        WHERE user_id = ${user.id}
          AND lower(title) = ${title.toLowerCase()}
          AND (authors IS NULL OR array_length(authors, 1) = 0)
        LIMIT 1
      `
    }

    console.log('addSearchedBookToLibrary existing matches:', existing)

    if (existing.length > 0) {
      return { success: false, error: 'A matching book already exists in your library' }
    }
  } catch (error) {
    console.error('addSearchedBookToLibrary duplicate-check failed:', {
      userId: user.id,
      title,
      primaryAuthor,
      isbn,
      isbn13,
      error,
    })
    return { success: false, error: 'Duplicate check failed. Check server logs.' }
  }

  let result: Array<{ id: number }> = []

  try {
    result = await sql`
      INSERT INTO books (
        user_id,
        title,
        authors,
        summary,
        genres,
        isbn,
        isbn_13,
        language,
        cover_url,
        publisher,
        published_date,
        page_count,
        source_refs,
        source_trace
      ) VALUES (
        ${user.id},
        ${title},
        ${authors.length ? authors : null},
        ${summary},
        ${genres.length ? genres : null},
        ${isbn},
        ${isbn13},
        ${language},
        ${cover},
        ${publisher},
        ${publishedDate},
        ${pageCount},
        ${data.sourceRefs ? JSON.stringify(data.sourceRefs) : null}::jsonb,
        ${sourceTrace.length ? sourceTrace : null}
      )
      RETURNING id
    `

    console.log('addSearchedBookToLibrary insert with source metadata succeeded:', result)
  } catch (error) {
    console.error('addSearchedBookToLibrary insert with source metadata failed:', {
      userId: user.id,
      title,
      authors,
      genres,
      isbn,
      isbn13,
      language,
      publisher,
      publishedDate,
      pageCount,
      sourceRefs: data.sourceRefs ?? null,
      sourceTrace,
      error,
    })

    try {
      result = await sql`
        INSERT INTO books (
          user_id,
          title,
          authors,
          summary,
          genres,
          isbn,
          isbn_13,
          language,
          cover_url,
          publisher,
          published_date,
          page_count
        ) VALUES (
          ${user.id},
          ${title},
          ${authors.length ? authors : null},
          ${summary},
          ${genres.length ? genres : null},
          ${isbn},
          ${isbn13},
          ${language},
          ${cover},
          ${publisher},
          ${publishedDate},
          ${pageCount}
        )
        RETURNING id
      `

      console.log('addSearchedBookToLibrary fallback insert succeeded:', result)
    } catch (fallbackError) {
      console.error('addSearchedBookToLibrary fallback insert failed:', {
        userId: user.id,
        title,
        authors,
        genres,
        isbn,
        isbn13,
        language,
        cover,
        publisher,
        publishedDate,
        pageCount,
        fallbackError,
      })
      return { success: false, error: 'DB insert failed. Check server logs.' }
    }
  }

  revalidatePath('/library')
  revalidatePath('/dashboard')

  return { success: true, bookId: result[0].id }
}

export async function addCustomBookToLibrary(data: CustomBookInput): Promise<BookActionResult> {
  const user = await requireAuth()
  console.log('addCustomBookToLibrary auth user:', user)

  const title = data.title.trim()
  const author = data.author?.trim()
  const summary = data.summary?.trim() || null
  const publisher = data.publisher?.trim() || null
  const publishedDate = data.publishedDate?.trim() || null
  const normalizedAuthor = author ? author.toLowerCase() : null

  console.log('addCustomBookToLibrary payload:', {
    userId: user.id,
    title,
    author,
    summary,
    publisher,
    publishedDate,
  })

  if (!title) {
    return { success: false, error: 'Title is required' }
  }

  try {
    let existing: Array<{ id: number }> = []

    if (normalizedAuthor) {
      existing = await sql`
        SELECT id
        FROM books
        WHERE user_id = ${user.id}
          AND lower(title) = ${title.toLowerCase()}
          AND lower(COALESCE(authors[1], '')) = ${normalizedAuthor}
        LIMIT 1
      `
    } else {
      existing = await sql`
        SELECT id
        FROM books
        WHERE user_id = ${user.id}
          AND lower(title) = ${title.toLowerCase()}
          AND (authors IS NULL OR array_length(authors, 1) = 0)
        LIMIT 1
      `
    }

    console.log('addCustomBookToLibrary existing matches:', existing)

    if (existing.length > 0) {
      return { success: false, error: 'A matching title/author already exists in your library' }
    }
  } catch (error) {
    console.error('addCustomBookToLibrary duplicate-check failed:', {
      userId: user.id,
      title,
      author,
      error,
    })
    return { success: false, error: 'Duplicate check failed. Check server logs.' }
  }

  try {
    const result = await sql`
      INSERT INTO books (
        user_id,
        title,
        authors,
        summary,
        publisher,
        published_date
      ) VALUES (
        ${user.id},
        ${title},
        ${author ? [author] : null},
        ${summary},
        ${publisher},
        ${publishedDate}
      )
      RETURNING id
    `

    console.log('addCustomBookToLibrary insert succeeded:', result)

    revalidatePath('/library')
    revalidatePath('/dashboard')

    return { success: true, bookId: result[0].id }
  } catch (error) {
    console.error('addCustomBookToLibrary insert failed:', {
      userId: user.id,
      title,
      author,
      summary,
      publisher,
      publishedDate,
      error,
    })
    return { success: false, error: 'DB insert failed. Check server logs.' }
  }
}

export async function updateBook(
  bookId: number,
  data: {
    visibility?: 'public' | 'friends' | 'private'
    availability?: 'available' | 'requested' | 'loaned' | 'unavailable'
    is_adult?: boolean
  }
): Promise<BookActionResult> {
  const user = await requireAuth()
  console.log('updateBook auth user:', user, 'bookId:', bookId, 'data:', data)

  try {
    const book = await sql`
      SELECT id FROM books WHERE id = ${bookId} AND user_id = ${user.id}
    `

    if (book.length === 0) {
      return { success: false, error: 'Book not found or you do not own it' }
    }

    if (data.visibility !== undefined) {
      await sql`UPDATE books SET visibility = ${data.visibility} WHERE id = ${bookId}`
    }
    if (data.availability !== undefined) {
      await sql`UPDATE books SET availability = ${data.availability} WHERE id = ${bookId}`
    }
    if (data.is_adult !== undefined) {
      await sql`UPDATE books SET is_adult = ${data.is_adult} WHERE id = ${bookId}`
    }

    await sql`UPDATE books SET updated_at = NOW() WHERE id = ${bookId}`

    revalidatePath('/library')
    revalidatePath(`/book/${bookId}`)

    return { success: true }
  } catch (error) {
    console.error('updateBook failed:', {
      userId: user.id,
      bookId,
      data,
      error,
    })
    return { success: false, error: 'Update failed. Check server logs.' }
  }
}

export async function deleteBook(bookId: number): Promise<BookActionResult> {
  const user = await requireAuth()
  console.log('deleteBook auth user:', user, 'bookId:', bookId)

  try {
    const book = await sql`
      SELECT id FROM books WHERE id = ${bookId} AND user_id = ${user.id}
    `

    if (book.length === 0) {
      return { success: false, error: 'Book not found or you do not own it' }
    }

    await sql`DELETE FROM books WHERE id = ${bookId}`

    revalidatePath('/library')
    revalidatePath('/dashboard')

    return { success: true }
  } catch (error) {
    console.error('deleteBook failed:', {
      userId: user.id,
      bookId,
      error,
    })
    return { success: false, error: 'Delete failed. Check server logs.' }
  }
}
