import { NextRequest, NextResponse } from 'next/server'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { auth } from '@/auth'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 2 * 1024 * 1024 // 2MB
const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('avatar')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 })
    }

    const ext = EXT_BY_TYPE[file.type]
    if (!ext) {
      return NextResponse.json(
        { error: 'Unsupported image type. Use PNG, JPG, WEBP, or GIF.' },
        { status: 400 },
      )
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image must be 2MB or smaller' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    const dir = path.join(process.cwd(), 'public', 'uploads', 'avatars')
    await mkdir(dir, { recursive: true })

    // Cache-busting filename so the new avatar shows immediately
    const filename = `${session.user.id}-${Date.now()}.${ext}`
    await writeFile(path.join(dir, filename), buffer)

    const avatarUrl = `/uploads/avatars/${filename}`

    await prisma.user.update({
      where: { id: session.user.id },
      data: { avatar: avatarUrl },
    })

    return NextResponse.json({ avatar: avatarUrl })
  } catch (error) {
    console.error('[POST /api/account/avatar]', error)
    return NextResponse.json({ error: 'Failed to upload avatar' }, { status: 500 })
  }
}
