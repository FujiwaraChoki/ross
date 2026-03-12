import { motion, useReducedMotion } from 'framer-motion'
import { type ReactElement, type ReactNode } from 'react'

interface ShimmerProps {
  children: ReactNode
  active?: boolean
  className?: string
  /** CSS color for the shimmer highlight. Defaults to the current text color. */
  highlightColor?: string
  /** Animation duration in seconds. Defaults to 2. */
  duration?: number
}

/**
 * Wraps text content with a framer-motion shimmer effect.
 * When `active` is false, renders children with no animation overhead.
 */
export function Shimmer({
  children,
  active = true,
  className = '',
  highlightColor,
  duration = 2
}: ShimmerProps): ReactElement {
  const shouldReduceMotion = useReducedMotion()

  if (!active || shouldReduceMotion) {
    return <span className={className}>{children}</span>
  }

  const highlight = highlightColor ?? 'currentColor'

  return (
    <span className={`relative ${className}`}>
      <span>{children}</span>
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 block overflow-hidden text-ellipsis whitespace-nowrap"
        style={{
          backgroundImage: `linear-gradient(90deg, currentColor 40%, ${highlight} 50%, currentColor 60%)`,
          backgroundSize: '300% 100%',
          backgroundRepeat: 'no-repeat',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          willChange: 'background-position'
        }}
        animate={{ backgroundPosition: ['100% 50%', '-100% 50%'] }}
        transition={{
          duration,
          ease: 'linear',
          repeat: Infinity
        }}
      >
        {children}
      </motion.span>
    </span>
  )
}
