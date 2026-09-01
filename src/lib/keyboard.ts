/**
 * Where the on-screen keyboard actually is.
 *
 * Opening the keyboard does not shrink the layout viewport on iOS, and on
 * Android it depends on a viewport flag. `position: fixed; bottom: 0` therefore
 * pins to the bottom of a viewport the keyboard is now covering — which is
 * exactly where the formatting toolbar was ending up: on screen as far as the
 * layout was concerned, and completely unreachable in practice.
 *
 * The *visual* viewport is the one that knows about the keyboard. The gap
 * between the two is what the keyboard covers, and that gets published as
 * `--kb-inset` for the toolbar (and anything else pinned to the bottom) to sit
 * on top of.
 */

/** Below this, the difference is browser-chrome drift rather than a keyboard. */
const KEYBOARD_MIN_PX = 90

export function trackKeyboardInset(): () => void {
  const viewport = window.visualViewport
  const root = document.documentElement
  if (!viewport) return () => {}

  let frame = 0

  const publish = () => {
    frame = 0
    const covered = window.innerHeight - viewport.height - viewport.offsetTop
    const inset = covered > KEYBOARD_MIN_PX ? Math.round(covered) : 0

    root.style.setProperty('--kb-inset', `${inset}px`)
    // The home indicator sits under the keyboard, so its safe area stops
    // applying the moment the keyboard is up — keeping it would leave a strip
    // of dead space between the toolbar and the keys.
    if (inset > 0) root.style.setProperty('--kb-safe', '0px')
    else root.style.removeProperty('--kb-safe')
    root.dataset.keyboard = inset > 0 ? 'open' : 'closed'
  }

  // resize and scroll both fire in bursts while the keyboard animates.
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(publish)
  }

  publish()
  viewport.addEventListener('resize', schedule)
  viewport.addEventListener('scroll', schedule)
  window.addEventListener('orientationchange', schedule)

  return () => {
    if (frame) cancelAnimationFrame(frame)
    viewport.removeEventListener('resize', schedule)
    viewport.removeEventListener('scroll', schedule)
    window.removeEventListener('orientationchange', schedule)
    root.style.removeProperty('--kb-inset')
    root.style.removeProperty('--kb-safe')
    delete root.dataset.keyboard
  }
}

/** How much of the screen bottom is currently unusable, in px. */
export function keyboardInset(): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--kb-inset')
  return parseFloat(value) || 0
}
