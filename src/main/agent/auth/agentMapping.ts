import { randomUUID } from 'crypto'
import dotenv from 'dotenv'
import { Db } from '../firebase/firebase'

dotenv.config()

let db = Db.getInstance().firestore

export interface AgentMappingData {
  agentEmail: string
  userId: string
  userEmail?: string
  userPhone?: string
  agentName?: string
}

const normalizePhoneNumber = (value: string): string | undefined => {
  let digits = value.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = `27${digits.slice(1)}`
  return digits.length === 10 ? digits : undefined
}

const mappingIdFor = (agentEmail: string, phone?: string): string =>
  `${agentEmail.trim().toLowerCase()}:${normalizePhoneNumber(phone ?? '') ?? 'no-phone'}`

// gets the userid for the socket.io connection,
export const getOrCreateUserId = async (
  agentEmail: string
): Promise<{ userId: string; isNew: boolean }> => {
  if (!db) {
    console.warn('[AgentMapping] Firestore unavailable — generating local UUID for this session.')
    return { userId: randomUUID(), isNew: true }
  }

  try {
    const emailIndex = db.collection('agent-email-index').doc(agentEmail.trim().toLowerCase())
    const indexed = await emailIndex.get()
    const mappingId = indexed.exists ? indexed.data()?.mappingId : undefined
    const docRef = mappingId
      ? db.collection('agent-user-mapping').doc(mappingId)
      : db.collection('agent-user-mapping').doc(mappingIdFor(agentEmail))
    const snap = await docRef.get()

    if (snap.exists) {
      const data = snap.data()
      if (data?.userId) {
        console.log(`[AgentMapping] Existing userId found for ${agentEmail}: ${data.userId}`)
        return { userId: data.userId as string, isNew: false }
      }
    }

    // Not found — generate a new UUID and write it
    const newId = randomUUID()
    console.log(`[AgentMapping] No userId found for ${agentEmail}. Generated new UUID: ${newId}`)
    const canonicalId = mappingIdFor(agentEmail)
    const canonicalRef = db.collection('agent-user-mapping').doc(canonicalId)
    const batch = db.batch()
    batch.set(
      canonicalRef,
      { userId: newId, agentEmail, createdAt: new Date().toISOString() },
      { merge: true }
    )
    batch.set(emailIndex, {
      mappingId: canonicalId,
      userId: newId,
      agentEmail: agentEmail.trim().toLowerCase()
    })
    await batch.commit()
    return { userId: newId, isNew: true }
  } catch (error) {
    console.error('[AgentMapping] Error in getOrCreateUserId:', error)
    // Fall back to a new UUID so the app doesn't block
    return { userId: randomUUID(), isNew: true }
  }
}

export const initAgentMapping = async (
  data: AgentMappingData
): Promise<{ success: boolean; error?: string }> => {
  const { agentEmail, userId, userEmail, userPhone, agentName } = data
  try {
    console.log(
      `[AgentMapping] Initializing agent mapping for email: ${agentEmail}, userId: ${userId}`
    )
    if (!db) {
      console.warn(`[AgentMapping] Firestore instance not initialized. Skipping Firestore sync.`)
      return { success: true }
    }

    const normalizedEmail = agentEmail.trim().toLowerCase()
    const normalizedPhone = userPhone ? normalizePhoneNumber(userPhone) : undefined
    const emailIndexRef = db.collection('agent-email-index').doc(normalizedEmail)
    const previousIndex = await emailIndexRef.get()
    const previousMappingId = previousIndex.exists ? previousIndex.data()?.mappingId : undefined
    const mappingId = normalizedPhone
      ? mappingIdFor(normalizedEmail, userPhone)
      : previousMappingId || mappingIdFor(normalizedEmail)
    const mappingRef = db.collection('agent-user-mapping').doc(mappingId)
    const batch = db.batch()

    if (normalizedPhone && previousMappingId && previousMappingId !== mappingId) {
      const previousRef = db.collection('agent-user-mapping').doc(previousMappingId)
      const previous = await previousRef.get()
      const previousPhone = previous.exists ? previous.data()?.userPhoneNormalized : undefined
      if (previousPhone && previousPhone !== normalizedPhone) {
        batch.delete(db.collection('agent-phone-index').doc(previousPhone))
      }
      batch.delete(previousRef)
    }
    batch.set(
      mappingRef,
      {
        userId,
        agentEmail: normalizedEmail,
        ...(userEmail ? { userEmail } : {}),
        ...(userPhone ? { userPhone } : {}),
        ...(normalizedPhone ? { userPhoneNormalized: normalizedPhone } : {}),
        ...(agentName ? { agentName } : {}),
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    )
    batch.set(emailIndexRef, { mappingId, userId, agentEmail: normalizedEmail })
    if (normalizedPhone) {
      batch.set(db.collection('agent-phone-index').doc(normalizedPhone), {
        mappingId,
        userId,
        agentEmail: normalizedEmail
      })
    }
    await batch.commit()
    console.log(`[AgentMapping] Successfully initialized agent mapping for email: ${agentEmail}`)
    return { success: true }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`[AgentMapping] Error initializing agent mapping for email ${agentEmail}:`, error)
    return { success: false, error: msg }
  }
}
