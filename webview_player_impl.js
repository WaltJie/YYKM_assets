function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

var WebviewVideoPlayerImpl = {
  _resetCss() {
    const stylesheets = document.querySelectorAll('link[rel="stylesheet"], style')
    stylesheets.forEach(sheet => sheet.remove())

    const elements = document.querySelectorAll('*')
    elements.forEach(element => {
      element.removeAttribute('style')
    })
  },

  _getVideoEl() {
    return document.querySelector('video')
  },

  async _waitVideoReady() {
    while (true) {
      const videoEl = this._getVideoEl()
      if (videoEl) return videoEl
      await delay(100)
    }
  },

  async _fullscreenVideo() {
    const videoEl = this._getVideoEl()
    videoEl.style = 'position: fixed; left: -1px; top: -1px; height: calc(100vh + 2px); width: calc(100vw + 2px); z-index: 99999; background: black;'

    for (const child of document.body.children) {
      child.style['z-index'] = -1
    }
  },

  async initialize() {
    await this._waitVideoReady()

    const error = await WebviewVideoPlayerImpl_hostInitialize[location.host]?.()
    if (error) return

    this._resetCss()
    this._fullscreenVideo()

    const videoEl = this._getVideoEl()
    videoEl.addEventListener('play', () => {
      WebviewVideoPlayerInterface.changeIsPlaying(true)
    })

    videoEl.addEventListener('pause', () => {
      WebviewVideoPlayerInterface.changeIsPlaying(false)
    })

    videoEl.addEventListener('timeupdate', () => {
      WebviewVideoPlayerInterface.changePosition(Math.floor(videoEl.currentTime * 1000))
    })

    videoEl.addEventListener('volumechange', () => {
      if (videoEl.volume === 0) videoEl.volume = 1
    })

    videoEl.volume = 1
    videoEl.autoplay = true

    await delay(500)
    if (videoEl.paused) videoEl.play()

    while (true) {
      await delay(100)
      if (videoEl.videoWidth * videoEl.videoHeight == 0) continue

      WebviewVideoPlayerInterface.changeResolution(videoEl.videoWidth, videoEl.videoHeight)
      break
    }

    while (true) {
      await delay(100)
      if (videoEl.volume != 0) break
      videoEl.volume = 1
    }
  },

  play() {
    this._getVideoEl()?.play()
  },

  pause() {
    this._getVideoEl()?.pause()
  },

  stop() {
    this.pause()
  },

  setVolume(volume) {
    const videoEl = this._getVideoEl()
    if (videoEl) videoEl.volume = volume
  },
}

var WebviewVideoPlayerImpl_hostInitialize = {
  'tv.cctv.com': async () => {
    const errorMsgEl = document.getElementById('error_msg_player')
    if (errorMsgEl) {
      WebviewVideoPlayerImpl._resetCss()
      errorMsgEl.style = 'position: fixed; left: -1px; top: -1px; height: calc(2px + 100vh); width: calc(2px + 100vw); z-index: 99999; background: black; color: white; font-size: 3vw; text-align: center; padding-top: 25%;'
      return true
    }
  },

  'live.snrtv.com': async () => {
    const urlParams = new URLSearchParams(window.location.search)
    const channel = urlParams.get('channel')

    let liList = document.querySelectorAll('.btnStream > li')
    for (const li of liList) {
      if (li.innerText.includes(channel)) {
        li.click()
        break
      }
    }
  },

  'live.jstv.com': async () => {
    const urlParams = new URLSearchParams(window.location.search)
    const channel = urlParams.get('channel')

    let liList = document.querySelector('#programMain')?.querySelectorAll('.swiper-slide') || []
    for (const li of liList) {
      if (li.innerText.includes(channel)) {
        li.querySelector('.imgBox')?.click()
        break
      }
    }
  },

  'www.nbs.cn': async () => {
    const urlParams = new URLSearchParams(window.location.search)
    const channel = urlParams.get('channel')

    let liList = document.querySelectorAll('.tv_list > .tv_c')
    for (const li of liList) {
      if (li.innerText.includes(channel)) {
        li.click()
        break
      }
    }
  },

  'www.brtn.cn': async () => {
    const urlParams = new URLSearchParams(window.location.search)
    const channel = urlParams.get('channel')

    let liList = document.querySelectorAll('.right_list li')
    for (const li of liList) {
      if (li.innerText.includes(channel)) {
        li.click()
        break
      }
    }
}
