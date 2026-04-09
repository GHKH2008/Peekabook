'use server'

import { sql } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { searchGoogleBooks, parseGoogleBook, enrichGoogleBook, type GoogleBook } from '@/lib/google-books'
import { revalidatePath } from 'next/cache'

export async function searchBooks(query: string, langRestrict?: string): Promise<GoogleBook[]> {
  return searchGoogleBooks(query, langRestrict === 'all' ? undefined : langRestrict)
}

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

const DUPLICATE_BOOK_ERROR = 'This book is already in your library'

function normalizeIdentifier(value: string | null | undefined): string | null {
  const normalized = String(value || '').replace(/[^0-9X]/gi, '').toUpperCase()
  return normalized || null
}

async function findDuplicateBookId(
  userId: number,
  bookData: ReturnType<typeof parseGoogleBook>
): Promise<number | null> {
  const checks: Array<{ column: 'google_books_id' | 'isbn_13' | 'isbn'; value: string | null }> = [
    { column: 'google_books_id', value: bookData.google_books_id || null },
    { column: 'isbn_13', value: normalizeIdentifier(bookData.isbn_13) },
    { column: 'isbn', value: normalizeIdentifier(bookData.isbn) },
  ]

  for (const check of checks) {
    if (!check.value) continue

    const existing =
      check.column === 'google_books_id'
        ? await sql`
            SELECT id
            FROM books
            WHERE user_id = ${userId}
              AND google_books_id = ${check.value}
            LIMIT 1
          `
        : check.column === 'isbn_13'
          ? await sql`
              SELECT id
              FROM books
              WHERE user_id = ${userId}
                AND isbn_13 = ${check.value}
              LIMIT 1
            `
          : await sql`
              SELECT id
              FROM books
              WHERE user_id = ${userId}
                AND isbn = ${check.value}
              LIMIT 1
            `

    if (existing.length > 0) {
      return existing[0].id as number
    }
  }

  return null
}

export async function addBookToLibrary(googleBook: GoogleBook): Promise<BookActionResult> {
  const user = await requireAuth()

  let enrichedBook = googleBook

  try {
    enrichedBook = await enrichGoogleBook(googleBook)
  } catch (error) {
    console.error('Book enrichment failed, continuing with original data', error)
    enrichedBook = googleBook
  }

  const bookData = parseGoogleBook(enrichedBook)
  bookData.isbn = normalizeIdentifier(bookData.isbn)
  bookData.isbn_13 = normalizeIdentifier(bookData.isbn_13)

  try {
    const duplicateId = await findDuplicateBookId(user.id, bookData)
    if (duplicateId) {
      return { success: false, error: DUPLICATE_BOOK_ERROR, bookId: duplicateId }
    }

    const result = await sql`
      INSERT INTO books (
        user_id,
        google_books_id,
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
        is_adult
      ) VALUES (
        ${user.id},
        ${bookData.google_books_id},
        ${bookData.title},
        ${bookData.authors},
        ${bookData.summary},
        ${bookData.genres},
        ${bookData.isbn},
        ${bookData.isbn_13},
        ${bookData.language},
        ${bookData.cover_url},
        ${bookData.publisher},
        ${bookData.published_date},
        ${bookData.page_count},
        ${bookData.is_adult}
      )
      RETURNING id
    `

    revalidatePath('/library')
    revalidatePath('/dashboard')

    return { success: true, bookId: result[0].id }
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    ) {
      return { success: false, error: DUPLICATE_BOOK_ERROR }
    }

    console.error('Failed to add book to library', {
      error,
      bookData,
      userId: user.id,
    })

    return {
      success: false,
      error: 'Failed to add book to library',
    }
  }
}

export async function addCustomBookToLibrary(data: CustomBookInput): Promise<BookActionResult> {
  const user = await requireAuth()

  const title = data.title.trim()
  const author = data.author?.trim()
  const summary = data.summary?.trim()
  const publisher = data.publisher?.trim()
  const publishedDate = data.publishedDate?.trim()

  if (!title) {
    return { success: false, error: 'Title is required' }
  }

  const existing = await sql`
    SELECT id
    FROM books
    WHERE user_id = ${user.id}
      AND lower(title) = ${title.toLowerCase()}
      AND (
        (${author ? author.toLowerCase() : null} IS NULL AND (authors IS NULL OR array_length(authors, 1) = 0))
        OR (${author ? author.toLowerCase() : null} IS NOT NULL AND lower(COALESCE(authors[1], '')) = ${author ? author.toLowerCase() : ''})
      )
    LIMIT 1
  `

  if (existing.length > 0) {
    return { success: false, error: 'A matching title/author already exists in your library' }
  }

  const result = await sql`
    INSERT INTO books (
      user_id, title, authors, summary, publisher, published_date
    ) VALUES (
      ${user.id}, ${title}, ${author ? [author] : null}, ${summary || null}, ${publisher || null}, ${publishedDate || null}
    )
    RETURNING id
  `

  revalidatePath('/library')
  revalidatePath('/dashboard')

  return { success: true, bookId: result[0].id }
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
}

export async function deleteBook(bookId: number): Promise<BookActionResult> {
  const user = await requireAuth()

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
}
