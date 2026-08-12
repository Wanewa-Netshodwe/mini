import axios, { AxiosInstance } from 'axios'
import { configDotenv } from 'dotenv'

configDotenv()
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatResult {
  text: string
  model: string
  raw?: unknown
}
export class LLM {
  private model = ''
  private temperature: number = 0.6
  private free: boolean = true
  private api: AxiosInstance | null = null
  private static instance: LLM | null = null
  private static currentFree: boolean | null = null

  private constructor(free: boolean) {
    this.free = free
    const rawApiKey = free ? process.env.DEEPSEEK_API_KEY : process.env.OPENAI_API_KEY
    if (!rawApiKey || rawApiKey.trim() === '') {
      throw new Error(
        `API key is missing for ${free ? 'DeepSeek' : 'OpenAI'}. Please set the appropriate environment variable.`
      )
    }

    let apiKey = rawApiKey.replace(/[\r\n]+/g, '').trim()

    if (free) {
      this.api = axios.create({
        baseURL: 'https://opencode.ai/'
      })
      this.model = 'deepseek-v4-flash-free'
    } else {
      this.api = axios.create({
        baseURL: 'https://api.openai.com/',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        }
      })
      this.model = 'gpt-5.6-luna'
    }
  }

  public static getInstance(free: boolean = true): LLM {
    const useFree = process.env.USE_FREE_LLM === 'true' ? true : free
    if (!this.instance || this.currentFree !== useFree) {
      this.instance = new LLM(useFree)
      this.currentFree = useFree
    }
    return this.instance
  }

  private extractResponsesText(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return ''
    const p = payload as Record<string, unknown>
    if (typeof p.output_text === 'string') return p.output_text
    const parts: string[] = []
    const output = Array.isArray(p.output) ? (p.output as Record<string, unknown>[]) : []
    for (const item of output) {
      if (item.type !== 'message') continue
      const content = Array.isArray(item.content) ? (item.content as Record<string, unknown>[]) : []
      for (const block of content) {
        const text = (block as Record<string, unknown>).text
        if ((block as Record<string, unknown>).type === 'output_text' && typeof text === 'string')
          parts.push(text)
      }
    }
    return parts.join('\n').trim()
  }

  private extractChatText(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return ''
    const p = payload as Record<string, unknown>
    const choices = Array.isArray(p.choices) ? (p.choices as Record<string, unknown>[]) : []
    const first = choices[0] as Record<string, unknown> | undefined
    const content = (first?.message as Record<string, unknown> | undefined)?.content
    if (typeof content === 'string') return content
    return ''
  }

  private extractText(free: boolean, payload: unknown): string {
    const text = free ? this.extractChatText(payload) : this.extractResponsesText(payload)
    return text || this.extractChatText(payload) || this.extractResponsesText(payload)
  }

  public async prompt(messages: ChatMessage[]): Promise<ChatResult> {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n')
    const nonSystem = messages.filter((m) => m.role !== 'system')
    let body: any = {}
    let data: string
    let raw: any = {}

    switch (this.model) {
      case 'deepseek-v4-flash-free':
        body = {
          model: this.model,
          messages: [
            ...(system ? [{ role: 'system' as const, content: system }] : []),
            ...nonSystem.map((m) => ({ role: m.role, content: m.content }))
          ],
          temperature: this.temperature
        }
        break
      case 'gpt-5.6-luna':
        body = {
          model: 'gpt-5.6-luna',
          instructions: system || undefined,
          input: nonSystem.map((m) => ({ role: m.role, content: m.content }))
        }
        break
      default:
        body = {
          model: this.model,
          messages: [
            ...(system ? [{ role: 'system' as const, content: system }] : []),
            ...nonSystem.map((m) => ({ role: m.role, content: m.content }))
          ],
          temperature: this.temperature
        }
        break
    }

    try {
      if (!this.api) {
        throw new Error('API instance is not initialized.')
      }

      const endpoint = this.free
        ? 'zen/v1/chat/completions'
        : this.model === 'gpt-5.6-luna'
          ? 'v1/responses'
          : 'v1/chat/completions'

      const response = await this.api.post(endpoint, body)
      raw = response.data
      data = this.extractText(this.free, response.data)
      return {
        text: data.trim(),
        model: this.model,
        raw
      }
    } catch (error: any) {
      console.error('Error occurred while fetching LLM response:', error)
      if (error?.response?.data) {
        console.error('Response error details:', error.response.data)
      }
      throw error
    }
  }
}
