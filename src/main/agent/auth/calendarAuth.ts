import { google, Auth } from 'googleapis'
import { Firestore } from '@google-cloud/firestore'
import { randomBytes } from 'crypto'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import dotenv from 'dotenv'

dotenv.config()

let db: Firestore | null = null

const serverDir =
  typeof __dirname !== 'undefined' ? __dirname : join(fileURLToPath(import.meta.url), '..')

const keyFilename =
  process.env.GOOGLE_KEY_FILENAME || join(serverDir, 'serviceAccount.json')

const hasServiceAccount = existsSync(keyFilename)

if (!hasServiceAccount) {
  console.warn(
    `[CalendarAuth] No service account found at "${keyFilename}". Firestore token storage disabled.`
  )
} else {
  try {
    db = new Firestore({
      ignoreUndefinedProperties: true,
      projectId: process.env.GOOGLE_PROJECT_ID || 'nth-highlander-482810-m2',
      keyFilename,
      databaseId: process.env.GOOGLE_DATABASE_ID || 'communication'
    })
    // Suppress internal gRPC/stream errors to prevent unhandled rejections
    ;(db as any)._settings?.promise?.catch?.(() => {})
  } catch (err) {
    console.warn('[CalendarAuth] Firestore initialization warning:', err)
    db = null
  }
}

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar'

export interface PendingOAuthState {
  userId: string
  expiresAt: number
}

export class CalendarAuth {
  private static instance: CalendarAuth | null = null
  private oauth: Auth.OAuth2Client
  private pendingStates = new Map<string, PendingOAuthState>()

  private constructor() {
    this.oauth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost/oauth2callback'
    )
  }

  public static getInstance(): CalendarAuth {
    if (!CalendarAuth.instance) {
      CalendarAuth.instance = new CalendarAuth()
    }
    return CalendarAuth.instance
  }

  public generateAuthUrl(userId: string): { url: string; state: string } {
    if (!userId) {
      throw new Error('userId is required to start Google OAuth')
    }
    const state = randomBytes(24).toString('hex')
    this.pendingStates.set(state, {
      userId,
      expiresAt: Date.now() + 30 * 60 * 1000
    })
    const url = this.oauth.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [CALENDAR_SCOPE],
      state
    })
    return { url, state }
  }

  public async handleCallback(code: string, state: string): Promise<string> {
    const pending = this.pendingStates.get(state)
    if (!pending || pending.expiresAt < Date.now()) {
      throw new Error('Invalid or expired OAuth state')
    }
    this.pendingStates.delete(state)
    const { tokens } = await this.oauth.getToken(code)
    this.oauth.setCredentials(tokens)
    await this.saveTokens(pending.userId, tokens)
    return pending.userId
  }

  public async getAuthedClient(userId: string): Promise<Auth.OAuth2Client> {
    const tokens = await this.loadTokens(userId)
    if (!tokens) {
      throw new Error(`User ${userId} is not connected to Google Calendar. Connect in Settings.`)
    }
    this.oauth.setCredentials(tokens)
    if (this.isExpired(tokens)) {
      const { credentials } = await this.oauth.refreshAccessToken()
      await this.saveTokens(userId, credentials)
      this.oauth.setCredentials(credentials)
    }
    return this.oauth
  }

  public async isAuthenticated(userId: string): Promise<boolean> {
    const tokens = await this.loadTokens(userId)
    return !!tokens
  }

  public async disconnect(userId: string): Promise<void> {
    const tokens = await this.loadTokens(userId)
    if (tokens?.access_token) {
      await this.oauth.revokeToken(tokens.access_token).catch(() => {})
    }
    if (db) {
      try {
        await db.collection('calendar-auth').doc(userId).delete()
      } catch (err) {
        console.error(`Error deleting tokens for user ${userId}:`, err)
      }
    }
  }

  private async saveTokens(userId: string, tokens: Auth.Credentials): Promise<void> {
    if (!db) {
      console.warn('[CalendarAuth] Firestore DB is not initialized. Tokens not persisted.')
      return
    }
    try {
      await db
        .collection('calendar-auth')
        .doc(userId)
        .set(
          {
            tokens: {
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              expiry_date: tokens.expiry_date,
              token_type: tokens.token_type,
              scope: tokens.scope
            },
            updatedAt: new Date().toISOString()
          },
          { merge: true }
        )
    } catch (error) {
      console.error(`Error saving calendar tokens for user ${userId}:`, error)
    }
  }

  private async loadTokens(userId: string): Promise<Auth.Credentials | null> {
    if (!db) return null
    try {
      const docRef = db.collection('calendar-auth').doc(userId)
      const docSnap = await docRef.get()
      return docSnap.exists ? (docSnap.data()?.tokens as Auth.Credentials) : null
    } catch (error) {
      console.error(`Error fetching calendar tokens for user ${userId}:`, error)
      return null
    }
  }

  private isExpired(tokens?: Auth.Credentials | null): boolean {
    if (!tokens?.expiry_date) return true
    return tokens.expiry_date < Date.now() + 60 * 1000
  }
}

export const CalendarAuthInstance = CalendarAuth.getInstance()
