import { useEffect, useRef } from 'react'

//listen for inbound emails and WhatsApp messages, process them with the agent, and send replies
export const InboundEmailProcessor = () => {
  const handledMessageIds = useRef(new Set<string>())

  useEffect(() => {
    const unsubscribe = window.onUpdate(async (data: any) => {
      const messageId = data?.message_id || data?.id
      const duplicateKey = messageId ? String(messageId) : `${data?.from || 'unknown'}-${data?.date || Date.now()}`
      if (handledMessageIds.current.has(duplicateKey)) return

      const promptText = data?.content || data?.body || data?.text || data?.plainText || data?.subject
      if (!promptText) {
        console.warn('[Email] Ignored inbound email without usable text content', data)
        return
      }

      handledMessageIds.current.add(duplicateKey)
      
      try {
        const result = await window.agent.run(promptText)
        if (!result.success) throw new Error(result.text || 'Agent could not process the email')

        window.socket.sendMessage('Emailreply', {
          originalMessageId: messageId,
          to: data.from || data.sender,
          references: data.references,
          subject: data.subject?.startsWith('Re:') ? data.subject : `Re: ${data.subject || 'Agent Response'}`,
          body: result.text,
          from: data.to,
          userId: data.userId,
          agentName: localStorage.getItem('agent_name') || 'Agent'
        })
        console.log(`[Email] Agent completed and queued reply for ${messageId}`)
        await window.systemNotification('Email response ready', `Your agent replied to ${data.from || 'an email sender'}.`)
      } catch (error) {
        console.error(`[Email] Failed to process ${messageId}:`, error)
        handledMessageIds.current.delete(duplicateKey)
      }
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const unsubscribe = window.onWhatsAppMessage(async (data: any) => {
      const rawText = String(data?.body || data?.text || data?.message || '').trim()
      const sender = data?.from || data?.phone || data?.sender
      if (!rawText || !sender) return

      const messageId = data?.message_id || data?.id
     
      try {

        const result = await window.agent.run(rawText)
        if (!result.success) throw new Error(result.text || 'Agent could not process the WhatsApp message')

        window.socket.sendMessage('Whatsappreply', {
          to: sender,
          body: result.text,
          originalMessageId: messageId,
          userId: data.userId
        })
        await window.systemNotification('WhatsApp response ready', `Your agent replied to ${sender}.`)
      } catch (error) {
        console.error(`[WhatsApp] Failed to process ${messageId || sender}:`, error)
      }
    })

    return () => unsubscribe()
  }, [])

  return null
}
