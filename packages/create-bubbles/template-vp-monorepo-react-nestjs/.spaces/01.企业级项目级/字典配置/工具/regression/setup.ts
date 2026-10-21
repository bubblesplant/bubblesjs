import { vi } from 'vite-plus/test'

vi.mock('@/i18n', () => ({ tr: (value: string) => value }))
