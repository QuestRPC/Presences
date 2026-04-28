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

var POLL = 5000
var lastKey = ''
var timer: ReturnType<typeof setInterval> | null = null

function getMovieId(): string | null {
  const m = window.location.pathname.match(/\/watch\/(\d+)/)
  return m ? m[1] : null
}

async function fetchMeta(movieId: string): Promise<any> {
  try {
    const res = await fetch(
      'https://www.netflix.com/nq/website/memberapi/release/metadata?movieid=' + movieId,
      { credentials: 'include' }
    )
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

function detectLive(video: HTMLVideoElement): boolean {
  if (!isFinite(video.duration)) return true
  if (video.duration > 21600) return true
  return false
}

function findEpisode(seasons: any[], episodeId: number): { season: number; episode: number; title: string } | null {
  for (const s of seasons) {
    for (const ep of s.episodes || []) {
      if (ep.id === episodeId) {
        return { season: s.seq, episode: ep.seq, title: ep.title }
      }
    }
  }
  return null
}

function getBestArtwork(artwork: any[]): string | undefined {
  if (!Array.isArray(artwork) || artwork.length === 0) return undefined
  return artwork.reduce((best: any, cur: any) => (cur.w > best.w ? cur : best)).url
}

async function scrape() {
  const movieId = getMovieId()
  if (!movieId) return null

  const video = document.querySelector<HTMLVideoElement>('video')
  if (!video || isNaN(video.duration)) return null

  const live = detectLive(video)
  const meta = await fetchMeta(movieId)
  if (!meta?.video) return null

  const v = meta.video
  const title: string = v.title
  if (!title) return null

  const type: 'movie' | 'episode' = v.type === 'show' ? 'episode' : 'movie'
  let season: number | undefined
  let episode: number | undefined
  let episodeTitle: string | undefined

  if (type === 'episode' && v.currentEpisode) {
    const found = findEpisode(v.seasons || [], v.currentEpisode)
    if (found) {
      season = found.season
      episode = found.episode
      episodeTitle = found.title
    }
  }

  const imageUrl = getBestArtwork(v.artwork) ?? getBestArtwork(v.boxart)

  return {
    type, title, episodeTitle, season, episode,
    currentTime: live ? 0 : Math.floor(video.currentTime),
    duration: live ? 0 : Math.floor(video.duration),
    isLive: live,
    paused: video.paused,
    imageUrl
  }
}

async function poll(): Promise<void> {
  const data = await scrape()
  if (data) {
    const k = JSON.stringify({
      t: data.title, s: data.season, e: data.episode,
      l: data.isLive, p: data.paused,
      c: data.isLive ? 0 : Math.floor(data.currentTime / 5)
    })
    if (k !== lastKey) { lastKey = k; report(data) }
  } else {
    if (lastKey) { lastKey = ''; clear() }
  }
}

function onWatch(): boolean {
  return window.location.pathname.startsWith('/watch')
}

function startPoll(): void {
  if (!timer) { timer = setInterval(poll, POLL); poll() }
}

function stopPoll(): void {
  if (timer) clearInterval(timer)
  timer = null
  lastKey = ''
  clear()
}

function check(): void {
  if (onWatch()) { if (!timer) setTimeout(startPoll, 2000) }
  else if (timer) stopPoll()
}

if (onWatch()) setTimeout(startPoll, 1500)

const _orig = history.pushState.bind(history)
history.pushState = function () { _orig.apply(history, arguments as any); setTimeout(check, 100) }
window.addEventListener('popstate', () => setTimeout(check, 100))

// @ts-ignore — runs as a new Function() body, top-level return is valid at runtime
return function cleanup() {
  stopPoll()
  history.pushState = _orig
}
