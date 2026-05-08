/**
 * 云影空蒙 Webview 增强脚本 (集成 SMG 0.7 限制突破)
 * 更新日期: 2026-05
 */

(function() {
    'use strict';

    // ==========================================
    // 第一部分：SMG 看看新闻 XHR 拦截逻辑 (立即执行)
    // ==========================================
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        if (url.includes('https://kapi.kankanews.com/content/pc/tv/')) {
            this.addEventListener('readystatechange', function() {
                if (this.readyState === 4 && this.status === 200) {
                    try {
                        const response = JSON.parse(this.responseText);
                        let modified = false;

                        // 解除直播/回看屏蔽限制
                        if (url.includes('/program/detail') && response.result) {
                            response.result.is_shield = 0;
                            response.result.is_review = 1;
                            modified = true;
                        }

                        // 处理列表数据
                        if (url.includes('/programs') && response.result?.programs) {
                            response.result.programs.forEach(program => {
                                program.is_shield = 0;
                                program.is_review = 1;
                                program.can_review = 1;
                                modified = true;
                            });
                        }

                        if (modified) {
                            Object.defineProperty(this, 'responseText', {
                                value: JSON.stringify(response),
                                writable: false
                            });
                        }
                    } catch (e) { console.error('[SMG-XHR] Error:', e); }
                }
            });
        }
        return originalOpen.apply(this, arguments);
    };

    // ==========================================
    // 第二部分：SMG 0.7 新增：Vue 实例劫持与页面限制解除逻辑
    // ==========================================
    const STYLE_ID = 'smgtv-unlock-style';
    
    function injectStyle(cssText) {
        const appendStyle = () => {
            if (document.getElementById(STYLE_ID)) return;
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = cssText;
            (document.head || document.documentElement).appendChild(style);
        };
        if (document.head || document.documentElement) appendStyle();
        else document.addEventListener('DOMContentLoaded', appendStyle, { once: true });
    }

    function getVueInstance(el) {
        return el?.__vue__ || el?.__vueParentComponent?.proxy || null;
    }

    function findTVComponent() {
        const tvEl = document.querySelector('.tv');
        if (tvEl) return getVueInstance(tvEl);
        
        const playerBox = document.querySelector('.player-box');
        if (!playerBox) return null;
        
        let el = playerBox.parentElement;
        while (el) {
            const instance = getVueInstance(el);
            if (instance && typeof instance.startCountdown === 'function') return instance;
            el = el.parentElement;
        }
        return null;
    }

    function patchComponent(component) {
        if (!component || component.__smgPatched) return;
        component.__smgPatched = true;

        // 1. 解除试看倒计时
        if (typeof component.countdown === 'number') {
            component.countdown = 99999999;
        }
        component.showOpenApp = false;
        component.showFlag = false;
        component.startCountdown = function() {
            console.log('[SMGTV] 已拦截试看倒计时');
        };

        if (component.liveTimer) {
            clearTimeout(component.liveTimer);
            component.liveTimer = null;
        }

        // 2. 自动恢复播放器
        if (!component.player && component.programObj?.id && typeof component.playProgram === 'function') {
            console.log('[SMGTV] 尝试重新激活播放器');
            component.playProgram();
        }

        // 3. 解除切换标签页/失去焦点自动暂停
        if (typeof component.pageVisibilityChange === 'function') {
            document.removeEventListener('visibilitychange', component.pageVisibilityChange);
            component.pageVisibilityChange = function() {
                console.log('[SMGTV] 已拦截切页自动暂停');
            };
            document.addEventListener('visibilitychange', component.pageVisibilityChange);
        }

        if (component._handlerUnload) {
            window.removeEventListener('unload', component._handlerUnload);
            component._handlerUnload = null;
        }
        console.log('[SMGTV] 0.7 补丁应用成功');
    }

    function initSMGPatch() {
        let attempts = 0;
        const maxAttempts = 50;
        const timer = setInterval(() => {
            const component = findTVComponent();
            if (component) {
                clearInterval(timer);
                patchComponent(component);
                return;
            }
            if (++attempts >= maxAttempts) clearInterval(timer);
        }, 200);
    }

    // 隐藏讨厌的提示层
    injectStyle(`.video-tip { display: none !important; }`);

    // ==========================================
    // 第三部分：原版 Webview 播放器逻辑
    // ==========================================
    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    var WebviewVideoPlayerImpl = {
        _resetCss() {
            const stylesheets = document.querySelectorAll('link[rel="stylesheet"], style:not(#'+STYLE_ID+')');
            stylesheets.forEach(sheet => sheet.remove());
            const elements = document.querySelectorAll('*');
            elements.forEach(element => element.removeAttribute('style'));
        },

        _getVideoEl() { return document.querySelector('video'); },

        async _waitVideoReady() {
            while (true) {
                const videoEl = this._getVideoEl();
                if (videoEl) return videoEl;
                await delay(100);
            }
        },

        async _fullscreenVideo() {
            const videoEl = this._getVideoEl();
            if (!videoEl) return;
            videoEl.style = 'position: fixed; left: -1px; top: -1px; height: calc(100vh + 2px); width: calc(100vw + 2px); z-index: 99999; background: black;';
            for (const child of document.body.children) {
                if (child.tagName !== 'VIDEO') child.style['z-index'] = -1;
            }
        },

        async initialize() {
            // 如果是看看新闻，执行 0.7 补丁初始化
            if (location.host.includes('kankanews.com')) {
                initSMGPatch();
            }

            await this._waitVideoReady();
            const error = await WebviewVideoPlayerImpl_hostInitialize[location.host]?.();
            if (error) return;

            this._resetCss();
            this._fullscreenVideo();

            const videoEl = this._getVideoEl();
            
            // 绑定 App 接口
            const safeCall = (fn, ...args) => {
                if (typeof WebviewVideoPlayerInterface !== 'undefined') {
                    WebviewVideoPlayerInterface[fn](...args);
                }
            };

            videoEl.addEventListener('play', () => safeCall('changeIsPlaying', true));
            videoEl.addEventListener('pause', () => safeCall('changeIsPlaying', false));
            videoEl.addEventListener('timeupdate', () => safeCall('changePosition', Math.floor(videoEl.currentTime * 1000)));
            videoEl.addEventListener('volumechange', () => { if (videoEl.volume === 0) videoEl.volume = 1; });

            videoEl.volume = 1;
            videoEl.autoplay = true;
            await delay(500);
            if (videoEl.paused) videoEl.play();

            // 分辨率监听
            while (true) {
                await delay(100);
                if (videoEl.videoWidth * videoEl.videoHeight > 0) {
                    safeCall('changeResolution', videoEl.videoWidth, videoEl.videoHeight);
                    break;
                }
            }
        },

        play() { this._getVideoEl()?.play(); },
        pause() { this._getVideoEl()?.pause(); },
        stop() { this.pause(); },
        setVolume(volume) {
            const videoEl = this._getVideoEl();
            if (videoEl) videoEl.volume = volume;
        },
    }

    var WebviewVideoPlayerImpl_hostInitialize = {
        'live.kankanews.com': async () => { /* 适配逻辑见 initialize 中的 initSMGPatch */ },
        'www.kankanews.com': async () => { },
        'tv.cctv.com': async () => {
            const errorMsgEl = document.getElementById('error_msg_player');
            if (errorMsgEl) {
                WebviewVideoPlayerImpl._resetCss();
                errorMsgEl.style = 'position: fixed; left: -1px; top: -1px; height: 100vh; width: 100vw; z-index: 99999; background: black; color: white; text-align: center; padding-top: 20%;';
                return true;
            }
        },
        'live.snrtv.com': async () => {
            const channel = new URLSearchParams(window.location.search).get('channel');
            document.querySelectorAll('.btnStream > li').forEach(li => { if(li.innerText.includes(channel)) li.click(); });
        },
        'live.jstv.com': async () => {
            const channel = new URLSearchParams(window.location.search).get('channel');
            document.querySelectorAll('#programMain .swiper-slide').forEach(li => { if(li.innerText.includes(channel)) li.querySelector('.imgBox')?.click(); });
        },
        'www.nbs.cn': async () => {
            const channel = new URLSearchParams(window.location.search).get('channel');
            document.querySelectorAll('.tv_list > .tv_c').forEach(li => { if(li.innerText.includes(channel)) li.click(); });
        },
        'www.brtn.cn': async () => {
            const channel = new URLSearchParams(window.location.search).get('channel');
            document.querySelectorAll('.right_list li').forEach(li => { if(li.innerText.includes(channel)) li.click(); });
        },
        "web.guangdianyun.tv": async () => {
            while (!document.querySelector('video')?.videoWidth) await delay(100);
        }
    };

    // 暴露接口并启动
    window.WebviewVideoPlayerImpl = WebviewVideoPlayerImpl;
    window.WebviewVideoPlayerImpl_hostInitialize = WebviewVideoPlayerImpl_hostInitialize;
    
    // 如果页面已经加载完成则立即初始化
    if (document.readyState === 'complete') {
        WebviewVideoPlayerImpl.initialize();
    } else {
        window.addEventListener('load', () => WebviewVideoPlayerImpl.initialize());
    }

})();
