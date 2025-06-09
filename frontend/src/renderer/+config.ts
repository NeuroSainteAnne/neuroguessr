import type { Config } from 'vike/types'

export default {
  clientRouting: true,
  prerender: {
    enable: true,
    keepDistServer: true
  }
} satisfies Config