'use server'

import { sql } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export type BorrowActionResult = {
  success: boolean
  error?: string
}

export async function createBorrowRequest(
  bookId: number,
  ownerId: number,
  message?: string
): Promise<BorrowActionResult> {
  const user = await requireAuth()
  
  if (ownerId === user.id) {
    return { success: false, error: 'Cannot request your own book' }
  }
  
  // Check if book exists and is available
  const book = await sql`
    SELECT id, availability, user_id FROM books 
    WHERE id = ${bookId} AND user_id = ${ownerId}
  `
  
  if (book.length === 0) {
    return { success: false, error: 'Book not found' }
  }
  
  if (book[0].availability !== 'available') {
    return { success: false, error: 'Book is not available for borrowing' }
  }
  
  // Check if there's already a pending request
  const existing = await sql`
    SELECT id FROM borrow_requests 
    WHERE book_id = ${bookId} 
    AND requester_id = ${user.id} 
    AND status = 'pending'
  `
  
  if (existing.length > 0) {
    return { success: false, error: 'You already have a pending request for this book' }
  }
  
  await sql`
    INSERT INTO borrow_requests (book_id, requester_id, owner_id, message)
    VALUES (${bookId}, ${user.id}, ${ownerId}, ${message || null})
  `
  
  // Update book availability
  await sql`
    UPDATE books SET availability = 'requested', updated_at = NOW()
    WHERE id = ${bookId}
  `
  
  revalidatePath('/requests')
  revalidatePath(`/book/${bookId}`)
  
  return { success: true }
}

export async function approveBorrowRequest(requestId: number): Promise<BorrowActionResult> {
  const user = await requireAuth()
  
  const request = await sql`
    SELECT * FROM borrow_requests 
    WHERE id = ${requestId} AND owner_id = ${user.id} AND status = 'pending'
  `
  
  if (request.length === 0) {
    return { success: false, error: 'Request not found' }
  }
  
  const req = request[0]
  
  // Update request status
  await sql`
    UPDATE borrow_requests SET status = 'approved', updated_at = NOW()
    WHERE id = ${requestId}
  `
  
  // Create loan record
  await sql`
    INSERT INTO loans (book_id, borrower_id, lender_id, borrow_request_id)
    VALUES (${req.book_id}, ${req.requester_id}, ${user.id}, ${requestId})
  `
  
  // Update book availability
  await sql`
    UPDATE books SET availability = 'loaned', updated_at = NOW()
    WHERE id = ${req.book_id}
  `
  
  // Reject other pending requests for this book
  await sql`
    UPDATE borrow_requests 
    SET status = 'rejected', updated_at = NOW()
    WHERE book_id = ${req.book_id} 
    AND id != ${requestId} 
    AND status = 'pending'
  `
  
  revalidatePath('/requests')
  revalidatePath('/loans')
  revalidatePath(`/book/${req.book_id}`)
  
  return { success: true }
}

export async function rejectBorrowRequest(requestId: number): Promise<BorrowActionResult> {
  const user = await requireAuth()
  
  const request = await sql`
    SELECT * FROM borrow_requests 
    WHERE id = ${requestId} AND owner_id = ${user.id} AND status = 'pending'
  `
  
  if (request.length === 0) {
    return { success: false, error: 'Request not found' }
  }
  
  const req = request[0]
  
  await sql`
    UPDATE borrow_requests SET status = 'rejected', updated_at = NOW()
    WHERE id = ${requestId}
  `
  
  // Check if there are other pending requests
  const otherRequests = await sql`
    SELECT id FROM borrow_requests 
    WHERE book_id = ${req.book_id} AND status = 'pending'
  `
  
  if (otherRequests.length === 0) {
    await sql`
      UPDATE books SET availability = 'available', updated_at = NOW()
      WHERE id = ${req.book_id}
    `
  }
  
  revalidatePath('/requests')
  revalidatePath(`/book/${req.book_id}`)
  
  return { success: true }
}

export async function markLoanReturned(loanId: number): Promise<BorrowActionResult> {
  const user = await requireAuth()
  
  const loan = await sql`
    SELECT * FROM loans 
    WHERE id = ${loanId} AND lender_id = ${user.id} AND status = 'active'
  `
  
  if (loan.length === 0) {
    return { success: false, error: 'Loan not found' }
  }
  
  await sql`
    UPDATE loans 
    SET status = 'returned', returned_at = NOW(), updated_at = NOW()
    WHERE id = ${loanId}
  `
  
  await sql`
    UPDATE books SET availability = 'available', updated_at = NOW()
    WHERE id = ${loan[0].book_id}
  `
  
  revalidatePath('/loans')
  revalidatePath(`/book/${loan[0].book_id}`)
  
  return { success: true }
}
