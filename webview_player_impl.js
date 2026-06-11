/**
 * 云影空蒙 Webview 增强脚本 (支持动态拉取 GitHub 外部脚本)
 */

(function() {
    'use strict';

    // ==========================================
    // 第一部分：动态加载外部脚本 (实现自动更新)
    // ==========================================
    if (location.host.includes('kankanews.com')) {
        const githubRawUrl = 'https://raw.githubusercontent.com/Popukok/smg_live/refs/heads/main/smg_fivestar.user.js';
        
        try {
            // 优先使用同步请求，确保在网页 Vue 框架加载前注入 XHR 拦截逻辑
            const xhr = new XMLHttpRequest();
            xhr.open('GET', githubRawUrl, false); // false 代表同步执行
            xhr.send();
            
            if (xhr.status === 200) {
                const script = document.createElement('script');
                script.textContent = xhr.responseText;
                (document.head || document.documentElement).appendChild(script);
                console.log('[SMG Dynamic Loader] 同步拉取并注入最新版脚本成功');
            } else {
                throw new Error('HTTP Status: ' + xhr.status);
            }
        } catch (e) {
            console.warn('[SMG Dynamic Loader] 同步拉取失败，尝试降级为异步加载...', e);
            // 降级方案：异步 Fetch 加载
            fetch(githubRawUrl)
                .then(response => response.text())
                .then(code => {
                    const script = document.createElement('script');
                    script.textContent = code;
                    (document.head || document.documentElement).appendChild(script);
                    console.log('[SMG Dynamic Loader] 异步拉取并注入最新版脚本成功');
                })
                .catch(err => console.error('[SMG Dynamic Loader] 脚本加载彻底失败:', err));
        }
    }

    // ==========================================
    // 第二部分：原版 Webview 播放器核心逻辑
    // ==========================================
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    var WebviewVideoPlayerImpl = {
        _resetCss() {
            // 注意：这里特别排除了 GitHub 脚本中注入的 smgtv-unlock-style，防止被 App 误删
            const stylesheets = document.querySelectorAll('link[rel="stylesheet"], style:not(#smgtv-unlock-style)')
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
            if (!videoEl) return;
            videoEl.style = 'position: fixed; left: -1px; top: -1px; height: calc(100vh + 2px); width: calc(100vw + 2px); z-index: 99999; background: black;'

            for (const child of document.body.children) {
                if (child.tagName !== 'VIDEO') {
                    child.style['z-index'] = -1
                }
            }
        },

        async initialize() {
            await this._waitVideoReady()

            const error = await WebviewVideoPlayerImpl_hostInitialize[location.host]?.()
            if (error) return

            this._resetCss()
            this._fullscreenVideo()

            const videoEl = this._getVideoEl()
            
            // 安全调用 App 接口，防止在浏览器调试时报错中断
            const safeCall = (fn, ...args) => {
                if (typeof WebviewVideoPlayerInterface !== 'undefined') {
                    WebviewVideoPlayerInterface[fn](...args);
                }
            };

            videoEl.addEventListener('play', () => safeCall('changeIsPlaying', true))
            videoEl.addEventListener('pause', () => safeCall('changeIsPlaying', false))
            videoEl.addEventListener('timeupdate', () => safeCall('changePosition', Math.floor(videoEl.currentTime * 1000)))
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

                safeCall('changeResolution', videoEl.videoWidth, videoEl.videoHeight)
                break
            }

            while (true) {
                await delay(100)
                if (videoEl.volume != 0) break
                videoEl.volume = 1
            }
        },

        play() { this._getVideoEl()?.play() },
        pause() { this._getVideoEl()?.pause() },
        stop() { this.pause() },
        setVolume(volume) {
            const videoEl = this._getVideoEl()
            if (videoEl) videoEl.volume = volume
        },
    }

    // ==========================================
    // 第三部分：各站点初始化配置
    // ==========================================
    var WebviewVideoPlayerImpl_hostInitialize = {
        // 为看看新闻保留空方法，确保能够执行到 _fullscreenVideo() 的全屏化逻辑
        'live.kankanews.com': async () => { },
        'www.kankanews.com': async () => { },

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
        },

        "web.guangdianyun.tv": async () => {
            while (true) {
                if (document.querySelector('video')?.videoWidth) break
                await delay(100)
            }
        },
    }

    window.WebviewVideoPlayerImpl = WebviewVideoPlayerImpl;
    window.WebviewVideoPlayerImpl_hostInitialize = WebviewVideoPlayerImpl_hostInitialize;

    // 启动初始化
    if (document.readyState === 'complete') {
        WebviewVideoPlayerImpl.initialize();
    } else {
        window.addEventListener('load', () => WebviewVideoPlayerImpl.initialize());
    }

})();
