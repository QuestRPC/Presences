declare function report(data: {
  type: 'movie' | 'episode' | 'video' | 'live'
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

function isLiveStream(video: HTMLVideoElement): boolean {
  return !isFinite(video.duration)
}

function getThumbnail(videoId: string | null): string | undefined {
  const og = document.querySelector<HTMLMetaElement>('meta[property="og:image"]')
  if (og?.content?.startsWith('https://')) return og.content
  if (videoId) return 'https://i.ytimg.com/vi/' + videoId + '/maxresdefault.jpg'
  return undefined
}

function scrape() {
  const path = window.location.pathname
  const params = new URLSearchParams(window.location.search)

  if (path === '/watch') {
    const video = getVideo()
    if (!video || isNaN(video.duration)) return null

    const title = getTitle()
    if (!title) return null

    const live = isLiveStream(video)

    return {
      type: (live ? 'live' : 'video') as 'live' | 'video',
      title,
      episodeTitle: getChannel() ?? undefined,
      currentTime: live ? 0 : Math.floor(video.currentTime),
      duration: live ? 0 : Math.floor(video.duration),
      isLive: live,
      paused: video.paused,
      imageUrl: getThumbnail(params.get('v'))
    }
  }

  if (path === '/results') {
    const query = params.get('search_query')
    return {
      type: 'video' as const,
      title: 'YouTube',
      episodeTitle: query ? 'Searching: ' + query : 'Searching...',
      currentTime: 0,
      duration: 0,
      isLive: false,
      paused: false,
      imageUrl: undefined
    }
  }

  // Homepage, subscriptions, channel pages, etc.
  return {
    type: 'video' as const,
    title: 'YouTube',
    episodeTitle: 'Browsing...',
    currentTime: 0,
    duration: 0,
    isLive: false,
    paused: false,
    imageUrl: undefined
  }
}

function poll(): void {
  const data = scrape()
  if (data) {
    const k = JSON.stringify({
      t: data.title, e: data.episodeTitle,
      l: data.isLive, p: data.paused,
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

// On navigation, reset the key so the next poll reports immediately
function onNav(): void {
  lastKey = ''
  poll()
}

setTimeout(startPoll, 1000)

const _orig = history.pushState.bind(history)
history.pushState = function() { _orig.apply(history, arguments as any); setTimeout(onNav, 100) }
window.addEventListener('popstate', () => setTimeout(onNav, 100))

// @ts-ignore — runs as a module factory function body, top-level return is valid at runtime
return function cleanup() {
  stopPoll()
  history.pushState = _orig
}
