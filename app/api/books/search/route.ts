import { NextResponse } from "next/server"

async function searchOpenLibrary(query: string) {
  const res = await fetch(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10`
  )

  if (!res.ok) return []

  const data = await res.json()

  return (data.docs || []).map((book: any) => ({
    source: "openlibrary",
    sourceId: book.key,
    title: book.title,
    authors: book.author_name || [],
    publishedYear: book.first_publish_year,
    isbn13: book.isbn || [],
    coverUrl: book.cover_i
      ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg`
      : null,
  }))
}

async function searchGoogleBooks(query: string) {
  const res = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}`
  )

  if (!res.ok) return []

  const data = await res.json()

  return (data.items || []).map((item: any) => ({
    source: "google",
    sourceId: item.id,
    title: item.volumeInfo.title,
    authors: item.volumeInfo.authors || [],
    publishedYear: item.volumeInfo.publishedDate
      ? parseInt(item.volumeInfo.publishedDate)
      : null,
    coverUrl: item.volumeInfo.imageLinks?.thumbnail || null,
  }))
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get("q")

  if (!query) {
    return NextResponse.json([])
  }

  const [openLib, google] = await Promise.all([
    searchOpenLibrary(query),
    searchGoogleBooks(query),
  ])

  // combine results
  const results = [...openLib, ...google]

  return NextResponse.json(results)
}
