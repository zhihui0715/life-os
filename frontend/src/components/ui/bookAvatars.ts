/** The drawn book characters you can pick as an avatar (BookAvatar.tsx draws them; the backend checks the pattern). */
export const BOOK_AVATARS = ['book-1', 'book-2', 'book-3', 'book-4', 'book-5', 'book-6', 'book-7', 'book-8'] as const
export type BookAvatarId = (typeof BOOK_AVATARS)[number]

export const isBookAvatar = (v: string | null | undefined): v is BookAvatarId => !!v && (BOOK_AVATARS as readonly string[]).includes(v)
