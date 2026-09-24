import { Compass } from 'lucide-react'
import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AppLayout, RequireAuth } from '@/components/layout'
import { EmptyState, LinkButton } from '@/components/ui'
import { AccountPage } from '@/pages/account'
import { AdminPage } from '@/pages/admin'
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage, VerifyEmailPage } from '@/pages/auth'
import { CheckoutPage, EventPage } from '@/pages/event'
import { ExplorePage } from '@/pages/explore'
import { OrganizerDashboard } from '@/pages/organizer/dashboard'
import { EventEditorPage } from '@/pages/organizer/editor'
import { OrganizerEventsPage } from '@/pages/organizer/events'
import { ManageEventPage } from '@/pages/organizer/manage'
import { OrganizerProfilePage } from '@/pages/organizer/profile'
import { MyTicketsPage, TicketPage } from '@/pages/tickets'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function NotFound() {
  return (
    <EmptyState icon={Compass} title="Page not found" action={<LinkButton to="/">Explore events</LinkButton>}>
      The page you're looking for doesn't exist or has moved.
    </EmptyState>
  )
}

const organizer = ['organizer'] as const

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<ExplorePage />} />
          <Route path="events/:id" element={<EventPage />} />

          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
          <Route path="verify-email" element={<VerifyEmailPage />} />

          <Route path="checkout/:id" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
          <Route path="tickets" element={<RequireAuth><MyTicketsPage /></RequireAuth>} />
          <Route path="tickets/:id" element={<RequireAuth><TicketPage /></RequireAuth>} />
          <Route path="account" element={<RequireAuth><AccountPage /></RequireAuth>} />

          <Route path="organizer" element={<RequireAuth roles={[...organizer]}><OrganizerDashboard /></RequireAuth>} />
          <Route path="organizer/profile" element={<RequireAuth roles={[...organizer]}><OrganizerProfilePage /></RequireAuth>} />
          <Route path="organizer/events" element={<RequireAuth roles={[...organizer]}><OrganizerEventsPage /></RequireAuth>} />
          <Route path="organizer/events/new" element={<RequireAuth roles={[...organizer]}><EventEditorPage /></RequireAuth>} />
          <Route path="organizer/events/:id" element={<RequireAuth roles={[...organizer]}><ManageEventPage /></RequireAuth>} />
          <Route path="organizer/events/:id/edit" element={<RequireAuth roles={[...organizer]}><EventEditorPage /></RequireAuth>} />

          <Route path="admin" element={<RequireAuth roles={['platform_admin']}><AdminPage /></RequireAuth>} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
