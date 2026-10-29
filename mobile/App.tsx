import { useEffect, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { ApiError, type User } from './src/api'
import { client } from './src/client'

interface Event { id: string; title: string; city: string; startsAt: string; status: string }
interface Ticket { id: string; holderName: string; ticketTypeName: string; status: string }
const message = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong'

function Action({ label, onPress, busy = false, secondary = false, disabled = false }: {
  label: string; onPress: () => void; busy?: boolean; secondary?: boolean; disabled?: boolean
}) {
  return <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={onPress}
    style={[styles.button, secondary && styles.secondary, (busy || disabled) && styles.disabled]}>
    {busy ? <ActivityIndicator color="#172333" /> : <Text style={styles.buttonText}>{label}</Text>}
  </Pressable>
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [booting, setBooting] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [events, setEvents] = useState<Event[]>([])
  const [selected, setSelected] = useState<Event | null>(null)
  const [code, setCode] = useState('')
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    client.restore().then(restored => { if (active) setUser(restored) })
      .catch(e => { if (active) setError(message(e)) })
      .finally(() => { if (active) setBooting(false) })
    return () => { active = false }
  }, [])

  async function loadEvents() {
    const assigned = await client.api<Event[]>('/checkin/events')
    setEvents(assigned)
    setSelected(previous => assigned.find(event => event.id === previous?.id) ?? null)
  }
  useEffect(() => {
    if (user) loadEvents().catch(e => setError(message(e)))
    else { setEvents([]); setSelected(null); setTicket(null); setCode('') }
  }, [user])

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('')
    try { await action() }
    catch (e) {
      setError(message(e))
      if (e instanceof ApiError && e.status === 401) setUser(null)
    } finally { setBusy(false) }
  }
  async function checkIn() {
    if (!selected) return
    setTicket(null)
    await run(async () => {
      const admitted = await client.api<Ticket>(`/checkin/${selected.id}`, {
        method: 'POST', body: JSON.stringify({ code: code.trim() }),
      })
      setTicket(admitted)
      setCode('')
      setNotice('Admission confirmed')
    })
  }

  if (booting) return <View style={styles.loading}><ActivityIndicator size="large" /></View>
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <StatusBar style="light" />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.brand}>BiletFlow</Text>
      <Text style={styles.subtitle}>Event check-in</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
      {!user ? <View style={styles.card}>
        <Text style={styles.heading}>Staff sign in</Text>
        <Text style={styles.muted}>Use the Event Admin account assigned to you by your organizer.</Text>
        <Text style={styles.label}>Email</Text>
        <TextInput accessibilityLabel="Email" style={styles.input} value={email} onChangeText={setEmail}
          keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" />
        <Text style={styles.label}>Password</Text>
        <TextInput accessibilityLabel="Password" style={styles.input} value={password} onChangeText={setPassword}
          secureTextEntry autoCapitalize="none" autoComplete="current-password" />
        <Action label="Sign in" busy={busy} onPress={() => run(async () => {
          const staff = await client.login(email.trim(), password)
          setPassword(''); setUser(staff)
        })} />
      </View> : <>
        <View style={styles.row}><Text style={styles.staff}>{user.full_name}</Text>
          <Pressable accessibilityRole="button" onPress={() => run(async () => {
            await client.logout(); setUser(null)
          })}><Text style={styles.link}>Sign out</Text></Pressable>
        </View>
        <View style={styles.card}>
          <Text style={styles.heading}>Your assigned events</Text>
          <Text style={styles.muted}>Only events assigned to your staff account appear here.</Text>
          {events.length === 0 && <Text style={styles.empty}>No events assigned yet. Ask your organizer to add your account.</Text>}
          {events.map(event => <Pressable accessibilityRole="button" key={event.id}
            onPress={() => { setSelected(event); setTicket(null); setError(''); setNotice(''); setCode('') }}
            style={[styles.event, selected?.id === event.id && styles.selected]}>
            <Text style={styles.eventTitle}>{event.title}</Text>
            <Text style={styles.muted}>{event.city} · {new Date(event.startsAt).toLocaleString()} · {event.status}</Text>
          </Pressable>)}
          <Action label="Refresh events" secondary busy={busy} onPress={() => run(loadEvents)} />
        </View>
        {selected && <View style={styles.card}>
          <Text style={styles.heading}>Check a ticket</Text>
          <Text style={styles.muted}>{selected.title}</Text>
          <Text style={styles.label}>Admission code</Text>
          <TextInput accessibilityLabel="Admission code" style={styles.input} value={code} onChangeText={setCode}
            autoCapitalize="none" autoCorrect={false} placeholder="Paste the code from the ticket QR" />
          <Text style={styles.muted}>Online validation is required. A promotional QR code cannot admit a guest.</Text>
          <Action label="Validate and check in" busy={busy}
            disabled={!code.trim() || selected.status !== 'published'} onPress={checkIn} />
          {ticket && <View style={styles.result}>
            <Text style={styles.heading}>{ticket.holderName}</Text>
            <Text style={styles.muted}>{ticket.ticketTypeName} · Checked in</Text>
            <Action label="Undo this check-in" secondary busy={busy} onPress={() => run(async () => {
              await client.api(`/checkin/${selected.id}/${ticket.id}`, { method: 'DELETE' })
              setTicket(null); setNotice('Check-in reversed')
            })} />
          </View>}
        </View>}
      </>}
    </ScrollView>
  </KeyboardAvoidingView>
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#142130' },
  loading: { flex: 1, justifyContent: 'center', backgroundColor: '#eef1f5' },
  content: { padding: 22, paddingTop: 64, paddingBottom: 48, gap: 18 },
  brand: { color: '#ffd450', fontSize: 36, fontWeight: '800' },
  subtitle: { color: '#fff', fontSize: 18, marginTop: -12 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 22, gap: 14 },
  heading: { color: '#172333', fontSize: 21, fontWeight: '700' },
  muted: { color: '#576474', fontSize: 14, lineHeight: 21 },
  label: { fontSize: 14, fontWeight: '600', color: '#172333' },
  input: { borderWidth: 1, borderColor: '#cbd3df', borderRadius: 12, padding: 14, color: '#172333', fontSize: 16 },
  button: { backgroundColor: '#ffd450', padding: 15, borderRadius: 28, alignItems: 'center' },
  secondary: { backgroundColor: '#edf1f6' },
  disabled: { opacity: 0.55 },
  buttonText: { color: '#172333', fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  staff: { color: '#fff', fontWeight: '600', fontSize: 16 },
  link: { color: '#ffd450', fontSize: 15 },
  event: { padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#d9e0e8', gap: 6 },
  selected: { borderColor: '#bf8b00', backgroundColor: '#fff9df' },
  eventTitle: { color: '#172333', fontSize: 16, fontWeight: '600' },
  empty: { color: '#576474', paddingVertical: 12 },
  error: { backgroundColor: '#fff0ee', color: '#94291e', padding: 16, borderRadius: 12 },
  notice: { backgroundColor: '#e5f6ec', color: '#145632', padding: 16, borderRadius: 12 },
  result: { backgroundColor: '#e5f6ec', padding: 16, borderRadius: 12, gap: 12 },
})
