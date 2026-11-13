'use client'

import Image, { type ImageProps } from 'next/image'
import { useState } from 'react'

type Props = Omit<ImageProps, 'onError' | 'src'> & {
  src: string
  /** Shown when `src` fails to load (for example a deleted S3 object). */
  fallbackSrc?: string
}

/**
 * The image to render after the `failed` URLs did not load: the primary `src`, then
 * `fallbackSrc`, else null (render nothing, so no broken-image icon is shown).
 */
export function resolveCoverSrc(
  src: string,
  fallbackSrc: string | undefined,
  failed: ReadonlySet<string>,
): string | null {
  if (!failed.has(src)) return src
  if (fallbackSrc && !failed.has(fallbackSrc)) return fallbackSrc
  return null
}

/**
 * A CMS cover image that never shows a broken image: when the file is missing it swaps to
 * `fallbackSrc`, or renders nothing so the surrounding placeholder (or a `has-[img]`
 * wrapper) takes over.
 */
export default function CoverImage({ src, fallbackSrc, unoptimized, alt, ...rest }: Props) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const current = resolveCoverSrc(src, fallbackSrc, failed)
  if (current === null) return null
  const usingFallback = current !== src
  return (
    <Image
      {...rest}
      key={current}
      alt={alt}
      src={current}
      // The fallback is a local asset; only the primary keeps the caller's optimization choice.
      unoptimized={usingFallback ? undefined : unoptimized}
      onError={() => setFailed((previous) => new Set(previous).add(current))}
    />
  )
}
