import type { SupabaseClient } from '@supabase/supabase-js'

export type MediaType = 'image' | 'video' | 'audio' | 'document'

export const DISPAROS_MEDIA_BUCKET = 'disparos-media'

export const MEDIA_ACCEPT: Record<MediaType, string> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
  document: '.pdf,.doc,.docx,.txt,.xls,.xlsx',
}

function sanitizeFileName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .toLowerCase()
}

function buildPath(type: MediaType, fileName: string) {
  return `${type}/${Date.now()}-${sanitizeFileName(fileName)}`
}

export async function uploadDisparoMedia(
  client: SupabaseClient,
  type: MediaType,
  file: File
) {
  const path = buildPath(type, file.name)

  const { error } = await client.storage
    .from(DISPAROS_MEDIA_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined })

  if (error) throw error

  const { data } = client.storage.from(DISPAROS_MEDIA_BUCKET).getPublicUrl(path)
  return { path, url: data.publicUrl }
}

export async function listDisparoMedia(
  client: SupabaseClient,
  type: MediaType
) {
  const { data, error } = await client.storage
    .from(DISPAROS_MEDIA_BUCKET)
    .list(type, { limit: 40, sortBy: { column: 'name', order: 'desc' } })

  if (error) throw error

  return (data || [])
    .filter((item) => item.name)
    .map((item) => {
      const path = `${type}/${item.name}`
      const { data: pub } = client.storage
        .from(DISPAROS_MEDIA_BUCKET)
        .getPublicUrl(path)
      return {
        name: item.name,
        path,
        url: pub.publicUrl,
      }
    })
}
