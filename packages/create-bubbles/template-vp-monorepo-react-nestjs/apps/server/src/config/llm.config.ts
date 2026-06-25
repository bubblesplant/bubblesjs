import { registerAs } from '@nestjs/config'

export default registerAs('llm', () => ({
  url: process.env.LLM_API_URL,
  model: process.env.LLM_API_MODEL,
  apiKey: process.env.LLM_API_KEY,
}))
