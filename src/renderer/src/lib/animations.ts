export const ANIMATION_EASE = [0.22, 1, 0.36, 1] as const

export const fadeInUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: ANIMATION_EASE }
}

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.3, ease: ANIMATION_EASE }
}
