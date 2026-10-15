import type { CollectionConfig } from 'payload'

import { nadie, soloAdmin } from '../access'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: { useAsTitle: 'email' },
  auth: {
    maxLoginAttempts: 5,
    lockTime: 600_000,
    tokenExpiration: 7200,
    useAPIKey: false,
    cookies: { secure: true, sameSite: 'Strict' },
  },
  access: {
    read: soloAdmin,
    create: soloAdmin,
    update: soloAdmin,
    delete: nadie,
    unlock: soloAdmin,
  },
  fields: [],
}
