/**
 * 云影空蒙 Webview 增强脚本 (含 SMG 看看新闻限制突破)
 * 合并日期: 2026-04
 */

(function() {
    'use strict';

    // ==========================================
    // 第一部分：SMG 看看新闻 XHR 拦截逻辑 (立即执行)
    // ==========================================
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        // 检查是否是看看新闻的电视节目 API 请求
        if (url.includes('https://kapi.kankanews.com/content/pc/tv/')) {
            this.addEventListener('readystatechange', function() {
                if (this.readyState === 4 && this.status === 200) {
                    try {
                        const response = JSON.parse(this.responseText);
                        let modified = false;

                        // 处理单个节目详情接口 (解除屏蔽, 开启回看)
                        if (url.includes('/program/detail') && response.result) {
                            response.result.is_shield = 0;
                            response.result.is_review = 1;
                            modified = true;
                        }

                        // 处理节目列表接口
                        if (url.includes('/programs') && response.result?.programs) {
                            response.result.programs.forEach(program => {
                                program.is_shield = 0;
                                program.is_review = 1;
                                program.can_review = 1;
                                modified = true;
                            });
                        }

                        if (modified) {
                            // 强制覆盖响应内容
                            Object.defineProperty(this, 'responseText', {
                                value: JSON.stringify(response),
                                writable: false
                            });
                        }
                    } catch (e) {
                        console.error('SMG Inject Error:', e);
                    }
                }
            });
        }
        return originalOpen.apply(this, arguments);
    };

    // ==========================================
    // 第二部分：原版 Webview 播放器逻辑
    // ==========================================
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
            if (!videoEl) return;
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
                if (typeof WebviewVideoPlayerInterface !== 'undefined') {
                    WebviewVideoPlayerInterface.changeIsPlaying(true)
                }
            })

            videoEl.addEventListener('pause', () => {
                if (typeof WebviewVideoPlayerInterface !== 'undefined') {
                    WebviewVideoPlayerInterface.changeIsPlaying(false)
                }
            })

            videoEl.addEventListener('timeupdate', () => {
                if (typeof WebviewVideoPlayerInterface !== 'undefined') {
                    WebviewVideoPlayerInterface.changePosition(Math.floor(videoEl.currentTime * 1000))
                }
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
                if (typeof WebviewVideoPlayerInterface !== 'undefined') {
                    WebviewVideoPlayerInterface.changeResolution(videoEl.videoWidth, videoEl.videoHeight)
                }
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
    // 第三部分：各站点初始化配置 (含 Kankanews 适配)
    // ==========================================
    var WebviewVideoPlayerImpl_hostInitialize = {
        'live.kankanews.com': async () => { /* 适配看看新闻直播域 */ },
        'www.kankanews.com': async () => { /* 适配看看新闻主站回看 */ },

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
                if (li.innerText.includes(channel)) { li.click(); break; }
            }
        },

        'live.jstv.com': async () => {
            const urlParams = new URLSearchParams(window.location.search)
            const channel = urlParams.get('channel')
            let liList = document.querySelector('#programMain')?.querySelectorAll('.swiper-slide') || []
            for (const li of liList) {
                if (li.innerText.includes(channel)) { li.querySelector('.imgBox')?.click(); break; }
            }
        },

        'www.nbs.cn': async () => {
            const urlParams = new URLSearchParams(window.location.search)
            const channel = urlParams.get('channel')
            let liList = document.querySelectorAll('.tv_list > .tv_c')
            for (const li of liList) {
                if (li.innerText.includes(channel)) { li.click(); break; }
            }
        },

        'www.brtn.cn': async () => {
            const urlParams = new URLSearchParams(window.location.search)
            const channel = urlParams.get('channel')
            let liList = document.querySelectorAll('.right_list li')
            for (const li of liList) {
                if (li.innerText.includes(channel)) { li.click(); break; }
            }
        },

        "web.guangdianyun.tv": async () => {
            while (true) {
                if (document.querySelector('video')?.videoWidth) break
                await delay(100)
            }
        },
    };

    // 暴露到全局，供 App 调用
    window.WebviewVideoPlayerImpl = WebviewVideoPlayerImpl;
    window.WebviewVideoPlayerImpl_hostInitialize = WebviewVideoPlayerImpl_hostInitialize;

    // 启动初始化
    WebviewVideoPlayerImpl.initialize();

})();
