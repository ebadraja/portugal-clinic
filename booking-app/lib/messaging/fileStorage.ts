import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import fs from 'fs/promises'
import path from 'path'
import { MESSAGING_ATTACHMENTS_BUCKET, SIGNED_URL_EXPIRY_SECONDS } from '@/lib/messaging/fileSharingConfig'

export type UploadFileInput = {
  file: Buffer
  filename: string
  mimeType: string
  conversationId: string
  messageId: string
}

export type UploadFileResult = {
  storageKey: string
  originalName: string
  mimeType: string
  sizeBytes: number
  backend: 'supabase' | 'local'
}

let adminClient: SupabaseClient | null = null

export function isSupabaseStorageEnabled(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function getLocalStorageRoot(): string {
  return (
    process.env.MESSAGING_ATTACHMENTS_DIR ||
    path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'messaging-attachments')
  )
}

function resolveLocalPath(storageKey: string): string {
  if (!storageKey || storageKey.includes('..') || path.isAbsolute(storageKey)) {
    throw new Error('Invalid storage key')
  }
  const root = path.resolve(getLocalStorageRoot())
  const full = path.resolve(root, storageKey)
  if (full !== root && !full.startsWith(`${root}${path.sep}`)) {
    throw new Error('Invalid storage key')
  }
  return full
}

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase storage is not configured')
  }
  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return adminClient
}

export function resetSupabaseClientForTests(): void {
  adminClient = null
}

async function ensureBucket(client: SupabaseClient): Promise<void> {
  const { data: buckets } = await client.storage.listBuckets()
  const exists = buckets?.some((b) => b.name === MESSAGING_ATTACHMENTS_BUCKET)
  if (exists) return

  const { error } = await client.storage.createBucket(MESSAGING_ATTACHMENTS_BUCKET, {
    public: false,
    fileSizeLimit: 25 * 1024 * 1024,
  })
  if (error && !error.message.toLowerCase().includes('already exists')) {
    throw error
  }
}

async function uploadToLocal(input: UploadFileInput, storageKey: string): Promise<UploadFileResult> {
  const fullPath = resolveLocalPath(storageKey)
  await fs.mkdir(path.dirname(fullPath), { recursive: true })
  await fs.writeFile(fullPath, input.file)

  return {
    storageKey,
    originalName: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.file.length,
    backend: 'local',
  }
}

async function uploadToSupabase(input: UploadFileInput, storageKey: string): Promise<UploadFileResult> {
  const client = getSupabaseAdmin()
  await ensureBucket(client)

  const { error } = await client.storage.from(MESSAGING_ATTACHMENTS_BUCKET).upload(storageKey, input.file, {
    contentType: input.mimeType,
    upsert: false,
  })

  if (error) {
    throw new Error(`Failed to store file: ${error.message}`)
  }

  return {
    storageKey,
    originalName: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.file.length,
    backend: 'supabase',
  }
}

export async function uploadFile(input: UploadFileInput): Promise<UploadFileResult> {
  const storageKey = `${input.conversationId}/${input.messageId}/${input.filename}`

  if (isSupabaseStorageEnabled()) {
    try {
      return await uploadToSupabase(input, storageKey)
    } catch (error) {
      console.error('[fileStorage] Supabase upload failed, falling back to local disk:', error)
    }
  }

  return uploadToLocal(input, storageKey)
}

export async function readFile(storageKey: string): Promise<Buffer> {
  try {
    const localPath = resolveLocalPath(storageKey)
    return await fs.readFile(localPath)
  } catch (localError) {
    if (!isSupabaseStorageEnabled()) {
      throw localError
    }
  }

  const client = getSupabaseAdmin()
  const { data, error } = await client.storage.from(MESSAGING_ATTACHMENTS_BUCKET).download(storageKey)
  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to read file')
  }
  return Buffer.from(await data.arrayBuffer())
}

export async function getSignedDownloadUrl(storageKey: string): Promise<string> {
  if (!isSupabaseStorageEnabled()) {
    throw new Error('Signed URLs require Supabase storage')
  }

  const client = getSupabaseAdmin()
  const { data, error } = await client.storage
    .from(MESSAGING_ATTACHMENTS_BUCKET)
    .createSignedUrl(storageKey, SIGNED_URL_EXPIRY_SECONDS)

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? 'Failed to generate download URL')
  }

  return data.signedUrl
}

export async function fileExistsOnLocalDisk(storageKey: string): Promise<boolean> {
  try {
    await fs.access(resolveLocalPath(storageKey))
    return true
  } catch {
    return false
  }
}

export async function deleteFile(storageKey: string): Promise<void> {
  if (await fileExistsOnLocalDisk(storageKey)) {
    await fs.unlink(resolveLocalPath(storageKey))
    return
  }

  if (!isSupabaseStorageEnabled()) return

  const client = getSupabaseAdmin()
  const { error } = await client.storage.from(MESSAGING_ATTACHMENTS_BUCKET).remove([storageKey])
  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`)
  }
}
