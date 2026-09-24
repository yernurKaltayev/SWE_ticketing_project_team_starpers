// Calls to the implemented FastAPI endpoints (backend/app/api/v1).
import { api, patch, post, put } from '@/lib/api'
import type { OrganizerProfile, OrganizerProfileUpsert, User } from '@/lib/types'

export interface RegisterInput {
  email: string
  password: string
  full_name: string
  role: 'attendee' | 'organizer'
}

export const register = (data: RegisterInput) => post<User>('/auth/register', data)

export const verifyEmail = (token: string) => post<User>('/auth/verify-email', { token })

export const resendVerification = (email: string) =>
  post<{ detail: string }>('/auth/resend-verification', { email })

export const requestPasswordReset = (email: string) =>
  post<{ detail: string }>('/auth/password-reset/request', { email })

export const confirmPasswordReset = (token: string, new_password: string) =>
  post<{ detail: string }>('/auth/password-reset/confirm', { token, new_password })

export const updateMe = (full_name: string) => patch<User>('/users/me', { full_name })

export const getOrganizerProfile = () => api<OrganizerProfile>('/users/me/organizer-profile')

export const saveOrganizerProfile = (data: OrganizerProfileUpsert) =>
  put<OrganizerProfile>('/users/me/organizer-profile', data)

export const listUsers = (limit = 100, offset = 0) =>
  api<User[]>(`/users?limit=${limit}&offset=${offset}`)
