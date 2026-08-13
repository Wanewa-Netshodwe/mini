import { useEffect, useState } from 'react'
import {
  Calendar as Cal,
  Views,
  momentLocalizer,
  Components,
  Event as RBCEvent,
  View,
  SlotInfo
} from 'react-big-calendar'
import moment from 'moment'
import { AppWrapper } from '@renderer/app/layout/AppWrapper.js'

interface MyCalendarEvent extends RBCEvent {
  id: string
  title: string
  start: Date
  end: Date
  status?: 'confirmed' | 'pending' | 'cancelled'
  location?: string
  candidate?: string
}


const statusColors: Record<string, string> = {
  confirmed: '#10b981',
  pending: '#f59e0b',
  cancelled: '#ef4444'
}

//  Event 
const MyEvent = ({ event }: { event: MyCalendarEvent }) => {
  return (
    <div
      className=" bg-[#123882]  h-full w-full"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        overflow: 'hidden',
        backgroundColor: statusColors[event.status ?? ''] || '#9ca3af'
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: statusColors[event.status ?? ''] || '#9ca3af',
          flexShrink: 0
        }}
      />
      <div
        style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, overflow: 'hidden' }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {event.title}
        </span>
        {event.location && (
          <span
            style={{
              fontSize: 10,
              opacity: 0.75,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {event.location}
          </span>
        )}
      </div>
    </div>
  )
}

// Toolbar ----
const MyToolbar = ({ label, onView, view }: any) => {
  const views = ['month', 'week', 'day', 'agenda']

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18, fontWeight: 600, marginLeft: 8 }}>{label}</span>
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        {views.map((v) => (
          <button
            key={v}
            onClick={() => onView(v)}
            style={{
              ...toolbarBtnStyle,
              textTransform: 'capitalize',
              backgroundColor: view === v ? '#111' : 'transparent',
              color: '#fff'
            }}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  )
}

const toolbarBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 12,
  borderRadius: 3,
  background: 'transparent',
  cursor: 'pointer'
}

//event panel
interface PanelState {
  mode: 'view' | 'edit' | 'create'
  event: MyCalendarEvent
}

const EventPanel = ({
  panel,
  onClose,
  onSave,
  onDelete,
  onEdit
}: {
  panel: PanelState
  onClose: () => void
  onSave: (event: MyCalendarEvent) => void
  onDelete: (id: string) => void
  onEdit: () => void
}) => {
  const [draft, setDraft] = useState<MyCalendarEvent>(panel.event)
  const isEditing = panel.mode === 'edit' || panel.mode === 'create'

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        width: 300,
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        padding: 16,
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        zIndex: 20
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
          {panel.mode === 'create' ? 'New event' : isEditing ? 'Edit event' : panel.event.title}
        </h3>
        <button
          onClick={onClose}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: 14,
            color: '#9ca3af'
          }}
        >
          ✕
        </button>
      </div>

      {isEditing ? (
        <div
          style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            Title
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              style={{
                padding: '6px 8px',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                fontSize: 13
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            Candidate
            <input
              value={draft.candidate ?? ''}
              onChange={(e) => setDraft({ ...draft, candidate: e.target.value })}
              style={{
                padding: '6px 8px',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                fontSize: 13
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            Location
            <input
              value={draft.location ?? ''}
              onChange={(e) => setDraft({ ...draft, location: e.target.value })}
              style={{
                padding: '6px 8px',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                fontSize: 13
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            Status
            <select
              value={draft.status ?? 'pending'}
              onChange={(e) =>
                setDraft({ ...draft, status: e.target.value as MyCalendarEvent['status'] })
              }
              style={{
                padding: '6px 8px',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                fontSize: 13
              }}
            >
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>

          <div style={{ display: 'flex', gap: 4 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
              Start
              <input
                type="time"
                value={moment(draft.start).format('HH:mm')}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(':').map(Number)
                  const d = new Date(draft.start)
                  d.setHours(h, m)
                  setDraft({ ...draft, start: d })
                }}
                style={{
                  padding: '6px 8px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  fontSize: 13
                }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
              End
              <input
                type="time"
                value={moment(draft.end).format('HH:mm')}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(':').map(Number)
                  const d = new Date(draft.end)
                  d.setHours(h, m)
                  setDraft({ ...draft, end: d })
                }}
                style={{
                  padding: '6px 8px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  fontSize: 13
                }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={() => onSave(draft)}
              style={{ ...toolbarBtnStyle, flex: 1, backgroundColor: '#111', color: '#fff' }}
            >
              Save
            </button>
            {panel.mode === 'edit' && (
              <button
                onClick={() => onDelete(draft.id)}
                style={{ ...toolbarBtnStyle, color: '#ef4444', borderColor: '#fecaca' }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          style={{
            marginTop: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontSize: 13,
            color: '#374151'
          }}
        >
          <span>
            <strong>When:</strong> {moment(panel.event.start).format('ddd, MMM D · HH:mm')} –{' '}
            {moment(panel.event.end).format('HH:mm')}
          </span>
          {panel.event.candidate && (
            <span>
              <strong>Candidate:</strong> {panel.event.candidate}
            </span>
          )}
          {panel.event.location && (
            <span>
              <strong>Location:</strong> {panel.event.location}
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong>Status:</strong>
            <span
              style={{
                color: statusColors[panel.event.status ?? ''] || '#6b7280',
                fontWeight: 500,
                textTransform: 'capitalize'
              }}
            >
              {panel.event.status ?? 'unknown'}
            </span>
          </span>

          <button onClick={onEdit} style={{ ...toolbarBtnStyle, marginTop: 8 }}>
            Edit
          </button>
        </div>
      )}
    </div>
  )
}

export const Calendar = () => {
  const mLocalizer = momentLocalizer(moment)
  const [view, setView] = useState<View>(Views.MONTH)
  const [events, setEvents] = useState<MyCalendarEvent[]>([])
  const [panel, setPanel] = useState<PanelState | null>(null)


  const USER_ID =
    localStorage.getItem('client_uuid') || localStorage.getItem('user_email') || 'local-user'

  const mapGoogleEventToCalendarEvent = (gEvent: any): MyCalendarEvent => {
    const startIso = gEvent.start?.dateTime || gEvent.start?.date
    const endIso = gEvent.end?.dateTime || gEvent.end?.date
    return {
      id: gEvent.id || `g-${Date.now()}`,
      title: gEvent.summary || '(No title)',
      start: startIso ? new Date(startIso) : new Date(),
      end: endIso ? new Date(endIso) : new Date(Date.now() + 60 * 60 * 1000),
      status: gEvent.status === 'cancelled' ? 'cancelled' : 'confirmed',
      location: gEvent.location
    }
  }

  useEffect(() => {
    let isMounted = true
    const fetchGoogleEvents = async () => {
      try {
        if (window.calendarAuth?.getEvents) {
          const res = await window.calendarAuth.getEvents(USER_ID)
          if (res.success && res.events && isMounted) {
            const mapped = res.events.map(mapGoogleEventToCalendarEvent)
            if (mapped.length > 0) {
              setEvents(mapped)
            }
          }
        }
      } catch (err) {
        console.error('Error fetching Google Calendar events:', err)
      }
    }
    fetchGoogleEvents()
    return () => {
      isMounted = false
    }
  }, [])

  const openView = (event: MyCalendarEvent) => setPanel({ mode: 'view', event })

  const openCreate = (slot: SlotInfo) => {
    setPanel({
      mode: 'create',
      event: {
        id: `tmp-${Date.now()}`,
        title: '',
        start: slot.start as Date,
        end: slot.end as Date,
        status: 'pending'
      }
    })
  }

  const handleSave = async (event: MyCalendarEvent) => {
    const exists = events.some((e) => e.id === event.id)

    setEvents((prev) =>
      exists ? prev.map((e) => (e.id === event.id ? event : e)) : [...prev, event]
    )
    setPanel(null)

    try {
      if (window.calendarAuth) {
        const payload = {
          summary: event.title || 'New Event',
          location: event.location,
          start: { dateTime: event.start.toISOString() },
          end: { dateTime: event.end.toISOString() }
        }

        if (exists && !event.id.startsWith('tmp-')) {
          await window.calendarAuth.updateEvent(USER_ID, event.id, payload)
        } else {
          const res = await window.calendarAuth.createEvent(USER_ID, payload)
          if (res.success && res.event?.id) {
            setEvents((prev) =>
              prev.map((e) => (e.id === event.id ? { ...e, id: res.event.id } : e))
            )
          }
        }
      }
    } catch (err) {
      console.error('Error syncing event with Google Calendar:', err)
    }
  }

  const handleDelete = async (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id))
    setPanel(null)

    try {
      if (window.calendarAuth && !id.startsWith('tmp-')) {
        await window.calendarAuth.deleteEvent(USER_ID, id)
      }
    } catch (err) {
      console.error('Error deleting event from Google Calendar:', err)
    }
  }

  const calendarComponents: Components<MyCalendarEvent, object> = {
    event: MyEvent,
    toolbar: MyToolbar
  }

  const dayPropGetter = (date: Date) => {
    const today = moment().startOf('day')
    const day = moment(date).startOf('day')


    if (day.isBefore(today)) {
      return {
        style: {
          backgroundColor: '#32332b'
        }
      }
    }

    if (day.isSame(today)) {
      return {
        style: {
          backgroundColor: '#706f2b'
        }
      }
    }

    return {}
  }

  return (
    <AppWrapper>
      <div style={{ padding: '16px', position: 'relative' }} className="p-6 w-full h-screen">
        <Cal
          localizer={mLocalizer}
          view={view}
          onView={(v) => setView(v)}
          events={events}
          style={{ height: '95%' }}
          date={new Date()}
          defaultView="day"
          components={calendarComponents}
          className="scroll-box  font-light text-[16px]"
          timeslots={1}
          selectable
          onSelectEvent={(event) => openView(event as MyCalendarEvent)}
          onSelectSlot={openCreate}
          dayPropGetter={dayPropGetter}
          eventPropGetter={() => ({
            style: {
              backgroundColor: 'transparent',
              border: 'none',
              padding: '2px 4px'
            }
          })}
        />

        {panel && (
          <EventPanel
            panel={panel}
            onClose={() => setPanel(null)}
            onSave={handleSave}
            onDelete={handleDelete}
            onEdit={() => setPanel({ mode: 'edit', event: panel.event })}
          />
        )}
      </div>
    </AppWrapper>
  )
}
