declare function report(data: {
  type: 'movie' | 'episode'
  title: string
  episodeTitle?: string
  season?: number
  episode?: number
  currentTime: number
  duration: number
  isLive: boolean
  paused: boolean
  imageUrl?: string
}): void

declare function clear(): void

var POLL = 3000
var lastKey = ''
var timer: ReturnType<typeof setInterval> | null = null

function isWatching(): boolean {
  return window.location.pathname === '/watch'
}

function getVideo(): HTMLVideoElement | null {
  return (
    document.querySelector<HTMLVideoElement>('video.html5-main-video') ??
    document.querySelector<HTMLVideoElement>('video')
  )
}

function getTitle(): string | null {
  for (const sel of [
    'ytd-watch-metadata h1 yt-formatted-string',
    '#above-the-fold h1 yt-formatted-string',
    'h1.ytd-watch-metadata yt-formatted-string',
    'h1.ytd-video-primary-info-renderer yt-formatted-string'
  ]) {
    const t = document.querySelector<HTMLElement>(sel)?.textContent?.trim()
    if (t) return t
  }
  const docTitle = document.title.replace(/\s*-\s*YouTube\s*$/i, '').trim()
  return docTitle || null
}

function getChannel(): string | null {
  for (const sel of [
    'ytd-video-owner-renderer #channel-name a',
    '#owner #channel-name a',
    '#channel-name a'
  ]) {
    const t = document.querySelector<HTMLElement>(sel)?.textContent?.trim()
    if (t) return t
  }
  return null
}

function isLive(): boolean {
  const video = getVideo()
  if (!video || isNaN(video.duration)) return false
  return !isFinite(video.duration)
}

function getThumbnail(): string | undefined {
  const og = document.querySelector<HTMLMetaElement>('meta[property="og:image"]')
  if (og?.content?.startsWith('https://')) return og.content
  const videoId = new URLSearchParams(window.location.search).get('v')
  if (videoId) return 'https://i.ytimg.com/vi/' + videoId + '/maxresdefault.jpg'
  return undefined
}

function scrape() {
  if (!isWatching()) return null

  const video = getVideo()
  if (!video || isNaN(video.duration)) return null

  const title = getTitle()
  if (!title) return null

  const live = isLive()
  const channel = getChannel()

  return {
    type: 'movie' as const,
    title,
    episodeTitle: channel ?? undefined,
    currentTime: live ? 0 : Math.floor(video.currentTime),
    duration: live ? 0 : Math.floor(video.duration),
    isLive: live,
    paused: video.paused,
    imageUrl: getThumbnail()
  }
}

function poll(): void {
  const data = scrape()
  if (data) {
    const k = JSON.stringify({
      t: data.title,
      l: data.isLive,
      p: data.paused,
      c: data.isLive ? 0 : Math.floor(data.currentTime / 5)
    })
    if (k !== lastKey) { lastKey = k; report(data) }
  } else {
    if (lastKey) { lastKey = ''; clear() }
  }
}

function startPoll(): void {
  if (!timer) { timer = setInterval(poll, POLL); poll() }
}

function stopPoll(): void {
  if (timer) clearInterval(timer)
  timer = null; lastKey = ''; clear()
}

function check(): void {
  if (isWatching()) { if (!timer) setTimeout(startPoll, 1000) }
  else if (timer) stopPoll()
}

if (isWatching()) setTimeout(startPoll, 1000)

const _orig = history.pushState.bind(history)
history.pushState = function() { _orig.apply(history, arguments as any); setTimeout(check, 100) }
window.addEventListener('popstate', () => setTimeout(check, 100))

// @ts-ignore — runs as a module factory function body, top-level return is valid at runtime
return function cleanup() {
  stopPoll()
  history.pushState = _orig
}
