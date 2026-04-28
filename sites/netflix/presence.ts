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

var TITLE_SEL = [
  '[data-uia="video-title"] h4',
  '.ellipsize-text h4',
  '.watch-video--player-view h4',
  '.VideoContainer h4'
]
var SUB_SEL = [
  '[data-uia="video-title"] span:last-child',
  '.ellipsize-text span:last-child'
]

function qf(sels: string[]): string | null {
  for (const sel of sels) {
    const el = document.querySelector(sel)
    const t = el?.textContent?.trim()
    if (t) return t
  }
  return null
}

function getMovieId(): string | null {
  const m = window.location.pathname.match(/\/watch\/(\d+)/)
  return m ? m[1] : null
}

function onWatch(): boolean {
  return window.location.pathname.startsWith('/watch')
}

function detectLive(video: HTMLVideoElement): boolean {
  if (!isFinite(video.duration)) return true
  if (video.duration > 21600) return true
  return false
}

function parseEp(text: string): { season?: number; episode?: number } {
  const m = text.match(/S(\d+)[:\s]*E(\d+)/i) || text.match(/Season\s+(\d+).*?Episode\s+(\d+)/i)
  return m ? { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) } : {}
}

function getDomImage(): string | undefined {
  const og = document.querySelector<HTMLMetaElement>('meta[property="og:image"]')
  if (og?.content?.startsWith('https://') && !og.content.includes('nflx-static') && !og.content.includes('/default')) {
    return og.content
  }
  let best: string | undefined, bestArea = 0
  for (const img of document.querySelectorAll<HTMLImageElement>('img')) {
    if (!/nflxso\.net|nflximg\.net|nflximg\.com/.test(img.src)) continue
    const area = img.naturalWidth * img.naturalHeight
    if (area > bestArea) { bestArea = area; best = img.src }
  }
  return best
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

function findEpisode(seasons: any[], episodeId: number): { season: number; episode: number; title: string } | null {
  for (const s of seasons) {
    for (const ep of (s.episodes || [])) {
      if (ep.id === episodeId) return { season: s.seq, episode: ep.seq, title: ep.title }
    }
  }
  return null
}

function getBestImage(arr: any[]): string | undefined {
  if (!Array.isArray(arr) || arr.length === 0) return undefined
  return arr.reduce((a: any, b: any) => (b.w > a.w ? b : a)).url
}

async function scrape() {
  if (!onWatch()) return null

  const video = document.querySelector<HTMLVideoElement>('video')
  if (!video || isNaN(video.duration)) return null

  const live = detectLive(video)

  // --- DOM baseline (always works) ---
  const domTitle = qf(TITLE_SEL) || document.title.replace(/\s*[|–\-]\s*Netflix\s*$/i, '').trim()
  if (!domTitle) return null

  const sub = qf(SUB_SEL)
  let type: 'movie' | 'episode' = 'movie'
  let season: number | undefined, episode: number | undefined, episodeTitle: string | undefined

  if (sub) {
    const ep = parseEp(sub)
    if (ep.season != null) {
      type = 'episode'
      season = ep.season
      episode = ep.episode
      const em = sub.match(/S\d+[:\s]*E\d+\s*[–·\-]?\s*(.+)/i)
      episodeTitle = em ? em[1].trim() : undefined
    }
  }

  let title = domTitle
  let imageUrl = getDomImage()

  // --- API enrichment (best-effort) ---
  const movieId = getMovieId()
  if (movieId) {
    const meta = await fetchMeta(movieId)
    const v = meta?.video
    if (v) {
      if (v.title) title = v.title
      if (v.type === 'show') type = 'episode'
      if (type === 'episode' && v.currentEpisode) {
        const found = findEpisode(v.seasons || [], v.currentEpisode)
        if (found) { season = found.season; episode = found.episode; episodeTitle = found.title }
      }
      imageUrl = getBestImage(v.artwork) ?? getBestImage(v.boxart) ?? imageUrl
    }
  }

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

function startPoll(): void {
  if (!timer) { timer = setInterval(poll, POLL); poll() }
}

function stopPoll(): void {
  if (timer) clearInterval(timer)
  timer = null; lastKey = ''; clear()
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
