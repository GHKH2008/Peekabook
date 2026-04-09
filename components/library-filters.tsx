'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, X } from 'lucide-react'
import { useState, useTransition } from 'react'

export function LibraryFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState(searchParams.get('search') || '')

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== 'all') {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    startTransition(() => {
      router.push(`?${params.toString()}`)
    })
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    updateFilter('search', search)
  }

  function clearFilters() {
    setSearch('')
    startTransition(() => {
      router.push('/library')
    })
  }

  const hasFilters = searchParams.toString() !== ''

  return (
    <div className="flex flex-col md:flex-row gap-3">
      <form onSubmit={handleSearch} className="flex gap-2 flex-1">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search title, author, summary, ISBN, publisher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={isPending}>
          Search
        </Button>
      </form>

      <div className="flex gap-2">
        <Select
          value={searchParams.get('availability') || 'all'}
          onValueChange={(value) => updateFilter('availability', value)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Availability" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="requested">Requested</SelectItem>
            <SelectItem value="loaned">Loaned</SelectItem>
            <SelectItem value="unavailable">Unavailable</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get('visibility') || 'all'}
          onValueChange={(value) => updateFilter('visibility', value)}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Visibility" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Visibility</SelectItem>
            <SelectItem value="public">Public</SelectItem>
            <SelectItem value="friends">Friends</SelectItem>
            <SelectItem value="private">Private</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="icon" onClick={clearFilters}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
