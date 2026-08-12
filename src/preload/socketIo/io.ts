import { io, Socket } from 'socket.io-client'
import { eventEmitter } from '../events/emitter'
export class SocketIO {
  private socket: Socket | null = null
  static Instance: SocketIO
  private userId: string | null = null
  private constructor() {
    const serverUrl = process.env.SERVER_URL?.trim() || 'http://localhost:3000'
    this.socket = io(serverUrl, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      auth: {}
    })
    this.listenToConnectionEvents()
  }
  public static getInstance(): SocketIO {
    if (!SocketIO.Instance) {
      SocketIO.Instance = new SocketIO()
    }
    return SocketIO.Instance
  }
  private listenToConnectionEvents() {
    if (!this.socket) return
    this.socket.on('connect', () => {
      console.log('Connected to communications server as', this.userId, this.socket?.id)
    })
    this.socket.on('emailMessage', (data) => {
      console.log('email message received:', data)
      setImmediate(() => {
        eventEmitter.emit('show', data)
      })
    })
    this.socket.on('emailMessageSent', (data) => {
      console.log('email message sent:', data)
      setImmediate(() => {
        eventEmitter.emit('emailSent', data)
      })
    })

    this.socket.on('whatsappMessage', (data) => {
      console.log('whatsapp message received:', data)
      setImmediate(() => {
        eventEmitter.emit('whatsappMessage', data)
      })
    })

    this.socket.on('whatsappMessageSent', (data) => {
      console.log('whatsapp message sent:', data)
      setImmediate(() => {
        eventEmitter.emit('whatsappSent', data)
      })
    })

    this.socket.on('connect_error', (error) => {
      console.error('Communications server connection failed:', error.message)
    })
  }

  public connect(userId: string) {
    const normalizedUserId = userId.trim()
    if (!normalizedUserId || !this.socket) return
    const changed = this.userId !== normalizedUserId
    this.userId = normalizedUserId
    this.socket.auth = { userId: normalizedUserId }
    if (changed && this.socket.connected) this.socket.disconnect()
    if (!this.socket.connected) this.socket.connect()
  }
  public sendMessage(event: string, data: unknown) {
    if (!this.socket?.connected) {
      console.warn(`Cannot send ${event}: communications server is not connected`)
      return
    }
    this.socket.emit(event, data)
  }
}
