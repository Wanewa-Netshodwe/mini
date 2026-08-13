import { Firestore } from '@google-cloud/firestore'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import dotenv from 'dotenv'
dotenv.config()

const serverDir =
  typeof __dirname !== 'undefined' ? __dirname : join(fileURLToPath(import.meta.url))

const keyFilename = process.env.GOOGLE_KEY_FILENAME || join(serverDir, 'serviceAccount.json')

const hasServiceAccount = existsSync(keyFilename)

if (!hasServiceAccount) {
  console.warn(
    `[CalendarAuth] No service account found at "${keyFilename}". Firestore token storage disabled.`
  )
}
export class Db {
  private static instance: Db | null = null
  public firestore: Firestore | null = null
  private constructor() {
    this.firestore = new Firestore({
      ignoreUndefinedProperties: true,
      projectId: process.env.GOOGLE_PROJECT_ID || 'nth-highlander-482810-m2',
      keyFilename,
      databaseId: process.env.GOOGLE_DATABASE_ID || 'communication'
    })
  }
  public static getInstance() {
    if (!Db.instance) {
      Db.instance = new Db()
    }
    return Db.instance
  }
}
