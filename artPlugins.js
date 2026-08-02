window.artPlugins = window.artPlugins || function(plugins) {
    var obj = {
        version: '2.2.0'
    };

    obj.init = (options) => {
        return Promise.all([
            obj.readyHls(),
            obj.readyArtplayer(),
            obj.readySupported()
        ]).then(() => obj.initArtplayer(options));
    };

    obj.readyHls = () => {
        const Hls = window.Hls || unsafeWindow.Hls;
        if (Hls) {
            return Promise.resolve();
        }
        return obj.loadJs('https://jsd.nn.ci/npm/hls.js@1.6.16/dist/hls.min.js');
    };

    obj.readyArtplayer = () => {
        const Artplayer = window.Artplayer || unsafeWindow.Artplayer;
        if (Artplayer) {
            return Promise.resolve();
        }
        return obj.loadJs('https://jsd.nn.ci/npm/artplayer@5.4.0/dist/artplayer.js');
    };

    obj.readySupported = () => {
        return Promise.resolve(plugins).then(info => {
            const { version } = obj;
            const stolen = GM_getValue('art-' + version, 0);
            const curlen = Object.values(obj).concat(info).reduce((prev, cur) => {
                return prev + cur.toString().length;
            }, 0);
            if (stolen) {
                if (new Set([ stolen, curlen ]).size > 1) {
                    return Promise.reject();
                }
            }
            else {
                GM_setValue('art-' + version, curlen);
            }
        });
    };

    obj.initArtplayer = (options) => {
        const Artplayer = window.Artplayer || unsafeWindow.Artplayer;
        const { isMobile } = Artplayer.utils;

        Object.assign(Artplayer, {
            ASPECT_RATIO: ['default', '自动', '4:3', '16:9'],
            AUTO_PLAYBACK_TIMEOUT: 1e4,
            NOTICE_TIME: 5e3,
        });

        options = Object.assign({
            container: '#artplayer',
            url: '',
            quality: [],
            type: 'hls',
            autoplay: true,
            autoPlayback: true,
            aspectRatio: true,
            contextmenu: [],
            customType: {
                hls: (video, url, art) => {
                    const Hls = window.Hls || unsafeWindow.Hls;
                    if (Hls.isSupported()) {
                        if (art.hls) art.hls.destroy();
                        const hls = art.hls = new Hls({
                            maxBufferLength: Hls.DefaultConfig.maxBufferLength * 10,
                            xhrSetup: (xhr, url) => {
                                const originalHost = (url.match(/^http(?:s)?:\/\/(.*?)\//) || [])[1];
                                if (originalHost === location.host) return;
                                if (/backhost=/.test(url)) {
                                    let backhosts, backhostParam = (decodeURIComponent(url || '').match(/backhost=(\[.*?\])/) || [])[1];
                                    if (backhostParam) {
                                        try {
                                            backhosts = JSON.parse(backhostParam);
                                        } catch (e) {}
                                        if (backhosts && backhosts.length) {
                                            backhosts = [].concat(backhosts, [originalHost]);
                                            const index = backhosts.findIndex(realHost => {
                                                return realHost === art.realHost;
                                            });
                                            art.realHost = backhosts[ index + 1 >= backhosts.length ? 0 : index + 1 ];
                                        }
                                    }
                                }
                                if (art.realHost) {
                                    url = url.replace(originalHost, art.realHost);
                                    xhr.open('GET', url, true);
                                }
                            }
                        });
                        hls.loadSource(url);
                        hls.attachMedia(video);

                        hls.on(Hls.Events.ERROR, (event, data) => {
                            if (data.fatal) {
                                switch(data.type) {
                                    case Hls.ErrorTypes.NETWORK_ERROR:
                                        if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR) {
                                            setTimeout(() => hls.loadSource(hls.url), 1e3);
                                        }
                                        else if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT || data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR) {
                                            hls.loadSource(hls.url);
                                        }
                                        else if (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR) {
                                            if ((hls.fragLoadError = (hls.fragLoadError || 0) + 1) < 5) {
                                                hls.loadSource(hls.url);
                                                hls.media.currentTime = art.currentTime;
                                                hls.media.play();
                                            }
                                            else {
                                                hls.destroy();
                                                art.notice.show = '播放错误次数过多，请刷新重试';
                                            }
                                        }
                                        else {
                                            setTimeout(() => hls.startLoad(), 1e3);
                                        }
                                        break;
                                    case Hls.ErrorTypes.MEDIA_ERROR:
                                        hls.recoverMediaError();
                                        break;
                                    default:
                                        hls.destroy();
                                        art.notice.show = '视频播放异常，请刷新重试';
                                        break;
                                }
                            }
                        });

                        art.on('destroy', () => hls.destroy());
                    }
                    else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                        video.src = url;
                    }
                    else {
                        alert('不支持的播放格式：m3u8');
                        art.notice.show = 'Unsupported playback format: m3u8';
                    }
                },
            },
            flip: false,
            icons: {
                loading: '<img src="https://artplayer.org/assets/img/ploading.gif">',
                state: '<img width="150" heigth="150" src="https://artplayer.org/assets/img/state.svg">',
                indicator: '<img width="16" heigth="16" src="https://artplayer.org/assets/img/indicator.svg">',
            },
            id: '',
            pip: !isMobile,
            poster: '',
            playbackRate: false,
            screenshot: true,
            setting: true,
            subtitle: {
                url: '',
                type: 'auto',
                style: {
                    color: '#fe9200',
                    bottom: '5%',
                    fontSize: '25px',
                    fontWeight: 400,
                    fontFamily: '',
                    textShadow: '',
                },
                encoding: 'utf-8',
                escape: false,
            },
            subtitleOffset: false,
            hotkey: true,
            fullscreen: true,
            fullscreenWeb: !isMobile,
        }, options);

        return new Artplayer(options, art => {
            if (fetch.toString().includes('[native code]')) {
                plugins.forEach((plugin) => {
                    art.plugins.add(plugin());
                });
                return;
            }
            art.destroy();
        });
    };

    obj.loadJs = (src) => {
        if (!window.instances) {
            window.instances = {};
        }
        if (!window.instances[src]) {
            window.instances[src] = new Promise((resolve, reject) => {
                const script = document.createElement("script")
                script.src = src;
                script.type = "text/javascript";
                script.onload = resolve;
                script.onerror = reject;
                Node.prototype.appendChild.call(document.head, script);
            });
        }
        return window.instances[src];
    };

    console.info(
        `%c artPlugins %c ${obj.version} %c https://scriptcat.org/zh-CN/users/13895`,
        'color: #fff; background: #5f5f5f',
        'color: #fff; background: #4bc729',
        ''
    );

    return obj;
}([
    () => {
        return (art) => {
            const Hls = window.Hls || unsafeWindow.Hls;
            const {
                hls,
                layers,
                notice,
                storage,
                constructor: {
                    CONTEXTMENU,
                    utils: { query, append, setStyle, clamp, debounce, throttle },
                }
            } = art;

            const app = window.cloudbase.init({
                env: 'js-3gyg0gq54003de57',
                accessKey: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjlkMWRjMzFlLWI0ZDAtNDQ4Yi1hNzZmLWIwY2M2M2Q4MTQ5OCJ9.eyJpc3MiOiJodHRwczovL2pzLTNneWcwZ3E1NDAwM2RlNTcuYXAtc2hhbmdoYWkudGNiLWFwaS50ZW5jZW50Y2xvdWRhcGkuY29tIiwic3ViIjoiYW5vbiIsImF1ZCI6ImpzLTNneWcwZ3E1NDAwM2RlNTciLCJleHAiOjQwNzQyMzM3MzQsImlhdCI6MTc3MDU1MDUzNCwibm9uY2UiOiJxOFpINmt3dlNXMjFZTjZSeHBxeTZnIiwiYXRfaGFzaCI6InE4Wkg2a3d2U1cyMVlONlJ4cHF5NmciLCJuYW1lIjoiQW5vbnltb3VzIiwic2NvcGUiOiJhbm9ueW1vdXMiLCJwcm9qZWN0X2lkIjoianMtM2d5ZzBncTU0MDAzZGU1NyIsInVzZXJfdHlwZSI6IiIsImNsaWVudF90eXBlIjoiY2xpZW50X3VzZXIiLCJpc19zeXN0ZW1fYWRtaW4iOmZhbHNlfQ.lHytqURNJjBnk0a2LcqQjqkXoNctaS2Yg4LeHrsAXnADXKdi1J8HmCs9bZLIx40qsDkYtwigqAf6oRpiIQMtn65yNFdlSmVrnNQllF6k1gm4qRxJwAyWfmqb5XhCkzMb4MXuy1ATu1t2HAwre3CDh-Nvpn_SBhXOaaXsDAgga_SUbH0Z-bAlx-b8zpfuYAjV9g7ph7scfeoX85bUlKp1BHg87mC2pNfVUN2cDutH-CT-sJNrY7-2rPRfQ8HlskXAhEYjiPVrJDIushFbph8mz_TlaFAK1Y-zyqX-zJnc0y7wOFZs7jHOB1GHqX8DYbyocda12G_ZpcSmT92zKp4sMQ',
            });

            async function user() {
                try {
                    const uinfo = await getUinfo();
                    const user = storage.get('user');
                    if (user) {
                        const { uid, updatedAt, expire_time } = user;
                        if ([
                            uid === uinfo.uk,
                            GM_getValue('updatedAt') === updatedAt,
                            Math.max(Date.parse(updatedAt) + 864e5 - Date.now(), 0),
                            storage.get('key').split('').reverse().join('') === btoa(encodeURIComponent(JSON.stringify(expire_time)))
                        ].every(s => s)) {
                            return user;
                        }
                    }

                    const { result } = await app.callFunction({
                        name: 'pan',
                        data: {
                            user: user || {},
                            host: location.host,
                            uid: uinfo.uk,
                            gminfo: GM_info,
                            uinfo
                        },
                    });
                    storage.set('user', result);

                    const { updatedAt, expire_time } = result;
                    GM_setValue('updatedAt', updatedAt);
                    storage.set('key', btoa(encodeURIComponent(JSON.stringify(expire_time))).split('').reverse().join(''));

                    return result;
                } catch (e) {
                    return {};
                }
            }

            async function submit(out_trade_no) {
                const count = storage.get(out_trade_no) || 0;
                if (count > 33) return;
                storage.set(out_trade_no, count + 1);

                try {
                    const uinfo = await getUinfo();
                    const { result } = await app.callFunction({
                        name: 'pan',
                        data: {
                            user: { out_trade_no },
                            host: location.host,
                            uid: uinfo.uk,
                            gminfo: GM_info,
                            uinfo
                        },
                    });
                    const { ec, em, updatedAt, expire_time } = result;
                    notice.show = em;
                    storage.set('user', result);
                    GM_setValue('updatedAt', updatedAt);
                    storage.set('key', btoa(encodeURIComponent(JSON.stringify(expire_time))).split('').reverse().join(''));
                    return user;
                } catch (e) {
                    return {};
                }
            }

            async function getUinfo() {
                const uk = typeof unsafeWindow.locals.get === 'function' ? unsafeWindow.locals.get('uk') : unsafeWindow.locals.uk;
                if (art.uinfo && art.uinfo.uk === uk) {
                    return art.uinfo;
                }
                return fetch('https://pan.baidu.com/rest/2.0/xpan/nas?method=uinfo').then(res => res.json()).then(res => {
                    if (res.errno === 0) {
                        art.uinfo = res;
                        return res;
                    }
                    return Promise.reject(res);
                });
            }

            function show() {
                isShow() || layers.update({
                    name: 'sponsor',
                    html: `
                          <div style="padding: 5px;"><div>喜欢这个脚本吗</div><div>赞赏体验更多增强功能</div></div>
                          <div style="padding: 5px;min-width: 280px;display: flex;flex-wrap: nowrap;">
                               <button id="open-afdian" style="padding: 5px; margin: 0 5px;border: none; border-radius: 3px; background: #09aaff; color: white; cursor: pointer;flex: 1 1 0;">打开爱发电</button>
                               <button id="copy-order" style="padding: 5px; margin: 0 5px;border: none; border-radius: 3px; background: #09aaff; color: white; cursor: pointer;flex: 1 1 0;">复制订单号</button>
                               <button id="update-script" style="padding: 5px; margin: 0 5px;border: none; border-radius: 3px; background: #09aaff; color: white; cursor: pointer;flex: 1 1 0;">检查更新</button>
                          </div>
                          <div style="padding: 5px"><input type="text" id="order-input" placeholder="输入爱发电订单号，体验更多功能" style="min-width: 250px;padding: 5px;border: none;border-radius: 3px;color: #000;" autocomplete="off"></div>
                          <div style="border-top: 1px solid #c6c6c6;display: flex;flex-wrap: nowrap;">
                               <button id="cancel-order" style="padding: 5px; border: none; border-radius: 3px; background: #ff5555; color: white; cursor: pointer;flex: 1 1 0;">取消</button>
                               <button id="submit-order" style="padding: 5px; border: none; border-radius: 3px; background: #ffad00; color: white; cursor: pointer;flex: 1 1 0;">提交</button>
                          </div>
                          `,
                    tooltip: '感谢支持，赞赏后不再提示',
                    style: {
                        position: 'absolute',
                        left: "50%",
                        top: "50%",
                        transform: "translate(-50%, -50%)",
                        background: 'rgba(0, 0, 0, 0.7)',
                        border: '1px solid #c6c6c6',
                        borderRadius: '8px',
                        textAlign: 'center'
                    },
                    click: (_, { isTrusted }) => {
                        isTrusted || art.destroy();
                        art.mask.show = false;
                        art.loading.show = false;
                    },
                    mounted: ($dom) => {
                        art.pause();
                        try {
                            hls.pauseBuffering();
                        } catch (e) {
                            hls.stopLoad();
                        }
                        setTimeout(() => {
                            art.mask.show = false;
                            art.loading.show = false;
                            art.controls.show = false;
                            art.setting.show = false;
                            art.constructor.CONTEXTMENU = false;
                        }, 1e3);

                        const $open = query('#open-afdian', $dom);
                        const $copy = query('#copy-order', $dom);
                        const $update = query('#update-script', $dom);
                        art.proxy($open, 'click', () => {
                            window.open('https://ifdian.net/order/create?plan_id=dc4bcdfa5c0a11ed8ee452540025c377', '_blank');
                        });
                        art.proxy($copy, 'click', () => {
                            window.open('https://ifdian.net/dashboard/order', '_blank');
                        });
                        art.proxy($update, 'click', () => {
                            window.open('https://scriptcat.org/scripts/code/340/%E7%99%BE%E5%BA%A6%E7%BD%91%E7%9B%98%E8%A7%86%E9%A2%91%E6%92%AD%E6%94%BE%E5%99%A8.user.js', '_blank');
                        });

                        const $input = query('#order-input', $dom);
                        const $cancel = query('#cancel-order', $dom);
                        const $submit = query('#submit-order', $dom);
                        art.proxy($cancel, 'click', ({ isTrusted }) => {
                            isTrusted && hide();
                        });
                        art.proxy($submit, 'click', ({ isTrusted }) => {
                            if (isTrusted && $input.value) {
                                const value = $input.value.trim();
                                if (value.match(/^20[\d]{23,26}$/)) {
                                    validate(value) && submit(value);
                                    hide();
                                }
                                else {
                                    notice.show = `\u6b64\u8ba2\u5355\u53f7\u4e0d\u5408\u89c4\u8303\uff0c\u8bf7\u91cd\u8bd5`;
                                }
                            }
                            else {
                                notice.show = `\u8bf7\u8f93\u5165\u8ba2\u5355\u53f7`;
                            }
                        });
                    },
                });
            }

            function hide() {
                if (layers.cache.get('sponsor')) {
                    layers.remove('sponsor');
                    art.constructor.CONTEXTMENU = CONTEXTMENU;
                    try {
                        hls.resumeBuffering();
                    } catch (e) {
                        hls.startLoad();
                    }
                }
            }

            function isShow() {
                return layers.cache.get('sponsor');
            }

            function validate(value) {
                value = value.slice(0, 14);
                const [, y, m, d, h, min, s] = (value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/) || []).map(Number);
                return [
                    clamp(m, 1, 12) === m,
                    clamp(d, 1, 31) === d,
                    clamp(h, 0, 23) === h,
                    clamp(min, 0, 59) === min,
                    clamp(s, 0, 59) === s,
                ].every(s => s);
            }

            function basic() {
                art.contextmenu.update({
                    index: 51,
                    html: '开通功能',
                    click: () => {
                        show();
                        art.contextmenu.show = false;
                    }
                });

                art.contextmenu.update({
                    index: 52,
                    html: '鼓励一下',
                    click: () => {
                        window.open('https://pc-index-skin.cdn.bcebos.com/6cb0bccb31e49dc0dba6336167be0a18.png', '_blank');
                        art.contextmenu.show = false;
                    }
                });

                art.setting.update({
                    html: '赞赏作者',
                    name: 'author-setting',
                    tooltip: '',
                    selector: [
                        {
                            html: '开通功能',
                            value: 0
                        },
                        {
                            html: '鼓励一下',
                            value: 1
                        },
                    ],
                    onSelect(item) {
                        if (item.value === 0) {
                            show();
                        }
                        else if (item.value === 1) {
                            window.open('https://pc-index-skin.cdn.bcebos.com/6cb0bccb31e49dc0dba6336167be0a18.png', '_blank');
                        }
                        return '';
                    },
                });
            }

            function init() {
                basic();

                art.on('video:ended', () => {
                    user().then(user => {
                        const { expire_time } = user;
                        if (!Math.max(expire_time - Date.now(), 0)) {
                            layers.update({
                                name: 'potser',
                                html: `<img style="width: 300px" src="https://pc-index-skin.cdn.bcebos.com/6cb0bccb31e49dc0dba6336167be0a18.png">`,
                                tooltip: '',
                                style: {
                                    position: 'absolute',
                                    top: '50px',
                                    right: '50px',
                                },
                                click: (_, e) => {
                                    window.open(e.target.src, '_blank');
                                }
                            });
                        }
                    });
                });

                hls.on(Hls.Events.FRAG_LOADED, throttle((event, data) => {
                    user().then(user => {
                        art.emit('user', user);
                        art.once('user', ({ expire_time }) => {
                            Math.max(expire_time - Date.now(), 0) ? hide() : show();
                        });
                    });
                }, clamp(420, art.duration / 100, art.duration / 3) * 1e3));
            }

            art.isReady ? init() : art.once('ready', init);

            return {
                name: 'user',
                user,
                show
            };
        }
    },
    () => {
        return (art) => {
            const {
                i18n,
                option,
                notice,
                storage,
                controls,
                constructor: {
                    utils: { isMobile, setStyle }
                }
            } = art;

            function getHtml(html) {
                return isMobile ? html.split(/\s/).shift() : html;
            }

            function update() {
                const { file, quality, getUrl, adToken } = option;
                const [ , width, height ] = ((file || {}).resolution || '').match(/width:(\d+),height:(\d+)/);
                const q = +width * +height;
                if (q > 2073600) {
                    quality.unshift({
                        html: '2K 1440P',
                        url: getUrl('M3U8_AUTO_2K') + '&adToken=' + encodeURIComponent(adToken),
                        default: !1,
                        type: 'hls'
                    });
                }
                if (q > 3686400) {
                    quality.unshift({
                        html: '4K 2160P',
                        url: getUrl('M3U8_AUTO_4K') + '&adToken=' + encodeURIComponent(adToken),
                        default: !1,
                        type: 'hls'
                    });
                }

                const qualityDefault = quality.find(item => item.default) || quality[0];

                controls.update({
                    name: 'quality',
                    html: qualityDefault ? getHtml(qualityDefault.html) : '',
                    selector: quality.map(item => {
                        return {
                            ...item
                        };
                    }),
                    onSelect: (item) => {
                        art.switchQuality(item.url);
                        notice.show = `${i18n.get('Switch Video')}: ${item.html}`;
                        storage.set('quality', getHtml(item.html));
                        return getHtml(item.html);
                    },
                    mounted: () => {
                        const quality = storage.get('quality');
                        if (quality) {
                            const selector = controls.cache.get('quality').option.selector;
                            const priority = selector.find(item => getHtml(item.html) === quality);
                            if (priority && !priority.default) {
                                art.switchQuality(priority.url);
                                controls.check(priority);
                            }
                        }
                    }
                });
            }

            function init() {
                art.once('user', ({ expire_time }) => {
                    if (Math.max(expire_time - Date.now(), 0)) {
                        update();

                        let id = option.id;
                        art.on('restart', () => {
                            if (id === option.id) {
                                const autoPlayback = art.layers.cache.get('auto-playback');
                                if (autoPlayback) {
                                    const { $ref } = autoPlayback;
                                    setStyle($ref, 'display', 'none');
                                }
                            }
                            else {
                                id = option.id;
                                update();
                            }
                        });
                    }
                });
            }

            art.isReady ? init() : art.once('ready', init);

            return {
                name: 'quality'
            };
        };
    },
    () => {
        return (art) => {
            const {
                i18n,
                proxy,
                option,
                controls,
                constructor: {
                    utils: { query, isMobile }
                }
            } = art;

            const options = {
                icon: '<i class="art-icon"><svg class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width="22" height="22"><path d="M810.666667 384H85.333333v85.333333h725.333334V384z m0-170.666667H85.333333v85.333334h725.333334v-85.333334zM85.333333 640h554.666667v-85.333333H85.333333v85.333333z m640-85.333333v256l213.333334-128-213.333334-128z" fill="#ffffff"></path></svg></i>',
            };

            i18n.update({
                'zh-cn': {
                    PlayList: '播放列表'
                }
            });

            function update(filelist = []) {
                controls.update({
                    html: isMobile ? options.icon: i18n.get('PlayList'),
                    name: 'playlist',
                    position: 'right',
                    style: {
                        paddingLeft: '10px',
                        paddingRight: '10px',
                    },
                    selector: filelist.map(item => {
                        return {
                            ...item,
                            html: item.name,
                            style: {
                                textAlign: 'left'
                            }
                        };
                    }),
                    onSelect: (item) => {
                        option.file = item;
                        if (typeof item.open === 'function') {
                            item.open();
                        }
                        return isMobile ? options.icon: i18n.get('PlayList');
                    },
                    mounted: () => {
                        const playlist = controls.cache.get('playlist');
                        const { $ref, option: { selector } } = playlist;
                        const $list = query('.art-selector-list', $ref);
                        const $value = query('.art-selector-value', $ref);
                        const totalheight = $list.offsetHeight;
                        const singleheight = $list.firstElementChild.offsetHeight;
                        proxy($value, 'click', (event) => {
                            const index = selector.findIndex(item => item.default);
                            $list.scrollTop = (index + 1) * singleheight - totalheight / 2;
                        });
                    }
                });
            }

            function init() {
                art.once('user', ({ expire_time }) => {
                    if (Math.max(expire_time - Date.now(), 0)) {
                        const { filelist } = option;
                        if ((filelist || []).length > 1) {
                            update(filelist);
                        }
                    }
                });
            }

            art.isReady ? init() : art.once('ready', init);

            return {
                name: 'playlist'
            };
        };
    },
    () => {
        return (art) => {
            const {
                i18n,
                icons,
                notice,
                layers,
                storage,
                plugins,
                setting,
                contextmenu,
                constructor: {
                    PLAYBACK_RATE,
                    SETTING_ITEM_WIDTH,
                    utils: { query, throttle, setStyle, inverseClass }
                }
            } = art;

            i18n.update({
                'zh-cn': {
                    Custom: '自定义'
                }
            });

            const $autoPlaybackrate = layers.update({
                name: 'auto-playbackrate',
                html: `<div>播放速度</div><input type="number" value="${art.playbackRate}" style="min-height: 20px;border: none; border-radius: 3px;text-align: center;color: #000;" step=".05" max="16" min=".1"><div class="art-auto-playback-close"><i class="art-icon art-icon-close"><svg class="icon" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="22" height="22" style="fill: var(--art-theme);width: 15px;height: 15px;"><path d="m571.733 512 268.8-268.8c17.067-17.067 17.067-42.667 0-59.733-17.066-17.067-42.666-17.067-59.733 0L512 452.267l-268.8-268.8c-17.067-17.067-42.667-17.067-59.733 0-17.067 17.066-17.067 42.666 0 59.733l268.8 268.8-268.8 268.8c-17.067 17.067-17.067 42.667 0 59.733 8.533 8.534 19.2 12.8 29.866 12.8s21.334-4.266 29.867-12.8l268.8-268.8 268.8 268.8c8.533 8.534 19.2 12.8 29.867 12.8s21.333-4.266 29.866-12.8c17.067-17.066 17.067-42.666 0-59.733L571.733 512z"></path></svg></i></div>`,
                tooltip: '',
                style: {
                    borderRadius: 'var(--art-border-radius)',
                    left: 'var(--art-padding)',
                    bottom: 'calc(var(--art-control-height) + var(--art-bottom-gap) + 10px)',
                    backgroundColor: 'var(--art-widget-background)',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px',
                    lineHeight: 1,
                    display: 'none',
                    position: 'absolute',
                },
                mounted: ($dom) => {
                    const $input = query('input', $dom);
                    const $close = query('.art-auto-playback-close', $dom);
                    art.proxy($input, 'change', () => {
                        const value = $input.value;
                        art.playbackRate = Number(value);
                    });
                    art.proxy($close, 'click', () => {
                        setStyle($dom, 'display', 'none');
                    });
                }
            });

            function getI18n(value) {
                return value === 1.0 ? i18n.get('Normal') : value ? value.toFixed(2) : i18n.get('Custom');
            }

            function getItem() {
                return PLAYBACK_RATE.includes(art.playbackRate) ? art.playbackRate : 0;
            }

            PLAYBACK_RATE.includes(0) || PLAYBACK_RATE.unshift(0);

            setting.update({
                width: SETTING_ITEM_WIDTH,
                name: 'playback-rate',
                html: i18n.get('Play Speed'),
                tooltip: getI18n(art.playbackRate),
                icon: icons.playbackRate,
                selector: PLAYBACK_RATE.map((item) => {
                    return {
                        value: item,
                        name: `playback-rate-${item}`,
                        default: item === getItem(),
                        html: getI18n(item),
                    };
                }),
                onSelect(item) {
                    if (item.value) {
                        art.playbackRate = item.value;
                        setStyle($autoPlaybackrate, 'display', 'none');
                    }
                    else {
                        const { user, show } = plugins.user;
                        user().then(({ expire_time }) => {
                            if (Math.max(expire_time - Date.now(), 0)) {
                                const $input = query('input', $autoPlaybackrate);
                                $input.value = art.playbackRate;
                                setStyle($autoPlaybackrate, 'display', 'flex');
                            }
                            else {
                                show();
                            }
                        });
                    }
                    return item.html;
                },
                mounted: () => {
                    const $default = setting.find(`playback-rate-${getItem()}`);
                    if ($default) setting.check($default);
                    art.on('video:ratechange', () => {
                        const $current = setting.find(`playback-rate-${getItem()}`);
                        if ($current) setting.check($current);
                    });
                }
            });

            contextmenu.update({
                index: 10,
                name: 'playbackRate',
                html: `${i18n.get('Play Speed')}: ${PLAYBACK_RATE.map((item) => `<span data-value="${item}">${getI18n(item)}</span>`).join('')}`,
                click: (contextmenu, event) => {
                    contextmenu.show = false;
                    const { value } = event.target.dataset;
                    if (Number(value)) {
                        art.playbackRate = Number(value);
                        setStyle($autoPlaybackrate, 'display', 'none');
                    }
                    else {
                        const { user, show } = plugins.user;
                        user().then(({ expire_time }) => {
                            if (Math.max(expire_time - Date.now(), 0)) {
                                const $input = query('input', $autoPlaybackrate);
                                $input.value = art.playbackRate;
                                setStyle($autoPlaybackrate, 'display', 'flex');
                            }
                            else {
                                show();
                            }
                        });
                    }
                },
                mounted: ($panel) => {
                    const $default = query(`[data-value='${getItem()}']`, $panel);
                    if ($default) inverseClass($default, 'art-current');
                    art.on('video:ratechange', () => {
                        const $current = query(`[data-value='${getItem()}']`, $panel);
                        if ($current) inverseClass($current, 'art-current');
                    });
                }
            });

            function init() {
                art.once('user', ({ expire_time }) => {
                    if (Math.max(expire_time - Date.now(), 0)) {
                        art.on('video:ratechange', () => storage.set('playbackRate', art.playbackRate));

                        const value = storage.get('playbackRate')
                        if (value) {
                            art.playbackRate = Number(value);
                        }
                    }
                });
            }

            art.isReady ? init() : art.once('ready', init);

            return {
                name: 'playbackRate'
            };
        }
    },
    () => {
        return (art) => {
            const {
                i18n,
                option,
                notice,
                storage,
                plugins,
                setting,
                controls,
                template,
                subtitle,
                contextmenu,
                constructor: {
                    utils: { getExt, query, append, isMobile, inverseClass }
                }
            } = art;

            const options = {
                icon: '<i class="art-icon"><svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" viewBox="0 0 48 48"><path d="M0 0h48v48H0z" fill="none"/><path fill="#ffffff" d="M40 8H8c-2.21 0-4 1.79-4 4v24c0 2.21 1.79 4 4 4h32c2.21 0 4-1.79 4-4V12c0-2.21-1.79-4-4-4zM8 24h8v4H8v-4zm20 12H8v-4h20v4zm12 0h-8v-4h8v4zm0-8H20v-4h20v4z"/></svg></i>',
                tooltip: '<label style="font-size: 0;padding: 4px;display: inline-block;"><span style="width: 20px;height: 20px;display: inline-block;border-radius: 50%;box-sizing: border-box;cursor: pointer;background: #FE9200;"></span></label>'
            };

            function blobToUrl(blob) {
                return blobToText(blob).then(text => {
                    return textToUrl(text);
                });
            }

            function blobToText(blob) {
                return new Promise((resolve, reject) => {
                    var reader = new FileReader();
                    reader.readAsText(blob, 'UTF-8');
                    reader.onload = (e) => {
                        var result = reader.result;
                        if (result.indexOf('�') > -1 && !reader.markGBK) {
                            reader.markGBK = true;
                            return reader.readAsText(blob, 'GBK');
                        }
                        else if (result.indexOf('') > -1 && !reader.markBIG5) {
                            reader.markBIG5 = true;
                            return reader.readAsText(blob, 'BIG5');
                        }
                        resolve(result);
                    };
                    reader.onerror = (err) => {
                        reject(err);
                    };
                });
            }

            function textToUrl(text) {
                const blob = new Blob([text], { type: 'text/plain' });
                const objectURL = URL.createObjectURL(blob);
                return objectURL;
            }

            function requestFile(url, bytes) {
                return fetch(url, {
                    headers: {
                        range: 'bytes='.concat(Array.isArray(bytes) ? bytes.join('-') : bytes || '0-'),
                        referer: location.protocol + '//' + location.host + '/',
                        'User-Agent': 'pan.baidu.com',
                    }
                }).then(result => {
                    return result.ok ? result.blob() : Promise.reject();
                });
            }

            function localFile(node) {
                return new Promise((resolve, reject) => {
                    node.onchange = (event) => {
                        if (event.target.files.length) {
                            const promises = [ ...event.target.files ].map(file => {
                                const { name } = file;
                                const type = getExt(name).toLowerCase();
                                if (['webvtt', 'vtt', 'srt', 'ssa', 'ass', 'smi'].includes(type)) {
                                    return blobToUrl(file).then(url => {
                                        return {
                                            url,
                                            type,
                                            name,
                                            html: `本地字幕「${type}」`
                                        };
                                    });
                                }
                            }).filter(Boolean);

                            Promise.all(promises).then((results) => {
                                resolve(results);
                            });
                        }

                        event.target.value = '';
                    }
                });
            }

            function detectFormat(text) {
                if (/(\d+)?[\r\n]?(\d{0,2}:?\d{2}:\d{2}.\d{3})\s?-?->\s?(\d{0,2}:?\d{2}:\d{2}.\d{3})/.test(text)) {
                    if (/^WEBVTT[\r\n]/.test(text)) {
                        return 'vtt';
                    }
                    return 'srt';
                }
                if (/\[Script Info\]/.test(text)) {
                    if (/\[V4\+ Styles\]/.test(text) && /Dialogue: .*?\d+,(\d+:\d{2}:\d{2}\.\d{2}),(\d+:\d{2}:\d{2}\.\d{2}),/.test(text)) {
                        return 'ass';
                    }
                    return 'ssa';
                }
                return '';
            }

            function getSublist() {
                const { getUrl, adToken } = option;
                const url = getUrl('M3U8_SUBTITLE_SRT') + '&adToken=' + encodeURIComponent(adToken);
                return fetch(url).then(result => {
                    return result.ok ? result.text() : Promise.reject();
                }).then(result => {
                    const parseSublist = function(t) {
                        const e = (t || '').split('\n'), i = [];
                        try {
                            for (var s = 2; s < e.length; s += 2) {
                                const n = e[s] || '';
                                if (-1 !== n.indexOf('#EXT-X-MEDIA:')) {
                                    for (var a = n.replace('#EXT-X-MEDIA:', '').split(','), o = {}, l = 0; l < a.length; l++) {
                                        const p = a[l].split('=');
                                        o[(p[0] || '').toLowerCase().replace('-', '_')] = String(p[1]).replace(/"/g, '');
                                    }
                                    o.url = e[s + 1];
                                    i.push(o);
                                }
                            }
                        } catch (r) {}
                        return i;
                    }(result);
                    return Promise.all(
                        parseSublist.map(item => {
                            return requestFile(item.url).then(blob => {
                                return blobToText(blob).then(text => {
                                    return {
                                        ...item,
                                        html: item.name,
                                        default: item.default === 'YES',
                                        type: detectFormat(text) || 'srt'
                                    }
                                });
                            });
                        })
                    ).catch(() => {
                        return parseSublist.map(item => {
                            return {
                                ...item,
                                html: item.name,
                                default: item.default === 'YES',
                                type: 'srt'
                            }
                        });
                    });
                });
            }

            function add(sublist = []) {
                if (!sublist.length) return;

                const defaultSubtitleOption = sublist.find(element => element.default) || Object.assign(sublist[0], { default: true });
                const style = {
                    ...option.subtitle.style,
                    ...storage.get('subtitleStyle')
                };
                const subtitleOption = Object.assign({}, option.subtitle, defaultSubtitleOption, { style });

                subtitle.init({
                    ...subtitleOption
                }).then(() => {
                    if (subtitleOption.name) {
                        notice.show = `加载字幕: ${subtitleOption.name}`;
                    }
                });

                controls.update({
                    html: isMobile ? options.icon : '字幕列表',
                    name: 'subtitle',
                    position: 'right',
                    style: {
                        paddingLeft: '10px',
                        paddingRight: '10px',
                    },
                    selector: sublist.map((item, index) => {
                        return {
                            ...item
                        };
                    }),
                    onSelect: (item) => {
                        const style = {
                            ...option.subtitle.style,
                            ...storage.get('subtitleStyle')
                        };
                        const subtitleOption = {
                            ...item,
                            style
                        };
                        subtitle.switch(item.url, subtitleOption);
                        return isMobile ? options.icon : '字幕列表';
                    }
                });
            }

            function update(sublist = []) {
                if (controls.cache.get('subtitle')) {
                    const selector = controls.cache.get('subtitle').option.selector;
                    sublist = sublist.concat(selector);
                    controls.update({
                        name: 'subtitle',
                        selector: sublist.map(item => {
                            return {
                                ...item
                            };
                        })
                    });
                }
                else {
                    add(sublist);
                }
            }

            setting.update({
                html: '字幕设置',
                name: 'subtitle',
                tooltip: '',
                icon: '<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" viewBox="0 0 48 48"><path d="M0 0h48v48H0z" fill="none"/><path fill="#ffffff" d="M40 8H8c-2.21 0-4 1.79-4 4v24c0 2.21 1.79 4 4 4h32c2.21 0 4-1.79 4-4V12c0-2.21-1.79-4-4-4zM8 24h8v4H8v-4zm20 12H8v-4h20v4zm12 0h-8v-4h8v4zm0-8H20v-4h20v4z"/></svg>',
                selector: [
                    {
                        html: '字幕显示',
                        name: 'state',
                        tooltip: '显示',
                        switch: true,
                        onSwitch(item) {
                            const state = !item.switch;

                            const { user, show } = plugins.user;
                            user().then(({ expire_time }) => {
                                if (Math.max(expire_time - Date.now(), 0)) {
                                    subtitle.show = state;
                                    item.tooltip = state ? '显示' : '隐藏';
                                }
                                else {
                                    show();
                                }
                            });

                            return state;
                        },
                        mounted(_, item) {
                            const state = subtitle.show;
                            item.switch = state;
                            item.tooltip = state ? '显示' : '隐藏';
                            art.on('subtitle', (state) => {
                                setTimeout(() => {
                                    if (item.switch !== state) {
                                        item.switch = state;
                                        item.tooltip = state ? '显示' : '隐藏';
                                    }
                                });
                            });
                        }
                    },
                    {
                        html: '字幕偏移',
                        name: 'offset',
                        tooltip: '0s',
                        range: [0, -10, 10, 0.1],
                        onChange(item) {
                            const offset = item.range[0];
                            art.subtitleOffset = offset;
                            return offset + 's';
                        },
                        mounted(_, item) {
                            art.on('subtitleOffset', (value) => {
                                setTimeout(() => {
                                    item.$range.value = value;
                                    item.tooltip = value + 's';
                                });
                            });
                        }
                    },
                    {
                        html: '字幕位置',
                        name: 'bottom',
                        tooltip: '5%',
                        range: [5, 1, 90, 1],
                        onChange(item) {
                            const bottom = item.range[0] + '%';
                            subtitle.style({ bottom });
                            storage.set('subtitleStyle', {
                                ...storage.get('subtitleStyle'),
                                bottom
                            });
                            return bottom;
                        },
                        mounted(_, item) {
                            const { bottom } = {
                                ...storage.get('subtitleStyle')
                            };
                            if (bottom) {
                                item.tooltip = bottom;
                                item.$range.value = parseFloat(bottom);
                            }
                        }
                    },
                    {
                        html: '字体大小',
                        name: 'fontSize',
                        tooltip: '25px',
                        range: [25, 10, 60, 1],
                        onChange(item) {
                            const fontSize = item.range[0] + 'px';
                            subtitle.style({ fontSize });
                            storage.set('subtitleStyle', {
                                ...storage.get('subtitleStyle'),
                                fontSize
                            });
                            return fontSize;
                        },
                        mounted(_, item) {
                            const { fontSize } = {
                                ...storage.get('subtitleStyle')
                            };
                            if (fontSize) {
                                item.tooltip = fontSize;
                                item.$range.value = parseFloat(fontSize);
                            }
                        }
                    },
                    {
                        html: '字体粗细',
                        name: 'fontWeight',
                        tooltip: 400,
                        range: [4, 1, 9, 1],
                        onChange(item) {
                            const fontWeight = item.range[0] * 100;
                            subtitle.style({ fontWeight });
                            storage.set('subtitleStyle', {
                                ...storage.get('subtitleStyle'),
                                fontWeight
                            });
                            return fontWeight;
                        },
                        mounted(_, item) {
                            const { fontWeight } = {
                                ...storage.get('subtitleStyle')
                            };
                            if (fontWeight) {
                                item.tooltip = fontWeight;
                                item.$range.value = fontWeight / 100;
                            }
                        }
                    },
                    {
                        html: '字体颜色',
                        name: 'color',
                        tooltip: options.tooltip,
                        selector: [
                            {
                                html: '预设',
                                name: 'color-presets',
                                tooltip: '<style>.panel-setting-color label{font-size: 0;padding: 4px;display: inline-block;}.panel-setting-color input{display: none;}.panel-setting-color span{width: 22px;height: 22px;display: inline-block;border-radius: 50%;box-sizing: border-box;cursor: pointer;}</style><div class="panel-setting-color"><label><input type="radio" value="#fff"><span style="background: #fff;"></span></label><label><input type="radio" value="#e54256"><span style="background: #e54256"></span></label><label><input type="radio" value="#ffe133"><span style="background: #ffe133"></span></label><label><input type="radio" name="dplayer-danmaku-color-1" value="#64DD17"><span style="background: #64DD17"></span></label><label><input type="radio" value="#39ccff"><span style="background: #39ccff"></span></label><label><input type="radio" value="#D500F9"><span style="background: #D500F9"></span></label></div>'
                            },
                            {
                                html: '默认颜色',
                                name: 'color-default',
                                tooltip: options.tooltip
                            },
                            {
                                html: '颜色选择器',
                                name: 'color-picker',
                                tooltip: options.tooltip.replace('#FE9200', '#000')
                            },
                        ],
                        onSelect(item, $dom, event) {
                            switch(item.name) {
                                case 'color-presets':
                                    if (event.target.nodeName === 'INPUT') {
                                        const color = event.target.value;
                                        subtitle.style({ color });
                                        storage.set('subtitleStyle', {
                                            ...storage.get('subtitleStyle'),
                                            color
                                        });
                                    }
                                    break;
                                case 'color-picker':
                                    if (!template.$colorPicker) {
                                        template.$colorPicker = append(template.$player, '<input hidden type="color">');
                                        template.$colorPicker.oninput = (event) => {
                                            const color = event.target.value;
                                            subtitle.style({ color });
                                            storage.set('subtitleStyle', {
                                                ...storage.get('subtitleStyle'),
                                                color
                                            });
                                            item.tooltip = item.$parent.tooltip = options.tooltip.replace('#FE9200', color);
                                        };
                                    }
                                    template.$colorPicker.click();
                                    break;
                                default:
                                    var color = '#FE9200';
                                    subtitle.style({ color });
                                    storage.set('subtitleStyle', {
                                        ...storage.get('subtitleStyle'),
                                        color
                                    });
                            }

                            return options.tooltip.replace('#FE9200', template.$subtitle.style.color);
                        },
                        mounted(_, item) {
                            const { color } = {
                                ...storage.get('subtitleStyle')
                            };
                            if (color) {
                                item.tooltip = options.tooltip.replace('#FE9200', color);
                            }
                        }
                    },
                    {
                        html: '字体类型',
                        name: 'fontFamily',
                        tooltip: i18n.get('Default'),
                        selector: [
                            {
                                html: '默认',
                                value: ''
                            },
                            {
                                html: '等宽 衬线',
                                value: '"Courier New", Courier, "Nimbus Mono L", "Cutive Mono", monospace'
                            },
                            {
                                html: '比例 衬线',
                                value: '"Times New Roman", Times, Georgia, Cambria, "PT Serif Caption", serif'
                            },
                            {
                                html: '等宽 无衬线',
                                value: '"Deja Vu Sans Mono", "Lucida Console", Monaco, Consolas, "PT Mono", monospace'
                            },
                            {
                                html: '比例 无衬线',
                                value: '"YouTube Noto", Roboto, "Arial Unicode Ms", Arial, Helvetica, Verdana, "PT Sans Caption", sans-serif'
                            },
                            {
                                html: 'Casual',
                                value: '"Comic Sans MS", Impact, Handlee, fantasy'
                            },
                            {
                                html: 'Cursive',
                                value: '"Monotype Corsiva", "URW Chancery L", "Apple Chancery", "Dancing Script", cursive'
                            },
                            {
                                html: 'Small Capitals',
                                value: '"Arial Unicode Ms", Arial, Helvetica, Verdana, "Marcellus SC", sans-serif'
                            }
                        ],
                        onSelect(item) {
                            const { html, value: fontFamily } = item;
                            subtitle.style({ fontFamily });
                            storage.set('subtitleStyle', {
                                ...storage.get('subtitleStyle'),
                                fontFamily
                            });
                            return html;
                        },
                        mounted(_, item) {
                            const { fontFamily } = {
                                ...storage.get('subtitleStyle')
                            };
                            if (fontFamily) {
                                const { selector } = item;
                                const currentItem = selector.find(item => item.value === fontFamily);
                                if (currentItem) {
                                    item.tooltip = currentItem.html;
                                }
                            }
                        }
                    },
                    {
                        html: '文字阴影',
                        name: 'textShadow',
                        tooltip: i18n.get('Default'),
                        selector: [
                            {
                                html: '默认',
                                value: 'rgb(0 0 0) 1px 0 1px, rgb(0 0 0) 0 1px 1px, rgb(0 0 0) -1px 0 1px, rgb(0 0 0) 0 -1px 1px, rgb(0 0 0) 1px 1px 1px, rgb(0 0 0) -1px -1px 1px, rgb(0 0 0) 1px -1px 1px, rgb(0 0 0) -1px 1px 1px'
                            },
                            {
                                html: '重墨',
                                value: 'rgb(0, 0, 0) 1px 0px 1px, rgb(0, 0, 0) 0px 1px 1px, rgb(0, 0, 0) 0px -1px 1px, rgb(0, 0, 0) -1px 0px 1px'
                            },
                            {
                                html: '描边',
                                value: 'rgb(0, 0, 0) 0px 0px 1px, rgb(0, 0, 0) 0px 0px 1px, rgb(0, 0, 0) 0px 0px 1px'
                            },
                            {
                                html: '45°投影',
                                value: 'rgb(0, 0, 0) 1px 1px 2px, rgb(0, 0, 0) 0px 0px 1px'
                            },
                            {
                                html: '阴影',
                                value: 'rgb(34, 34, 34) 1px 1px 1.4875px, rgb(34, 34, 34) 1px 1px 1.98333px, rgb(34, 34, 34) 1px 1px 2.47917px'
                            },
                            {
                                html: '凸起',
                                value: 'rgb(34, 34, 34) 1px 1px'
                            },
                            {
                                html: '下沉',
                                value: 'rgb(204, 204, 204) 1px 1px, rgb(34, 34, 34) -1px -1px'
                            },
                            {
                                html: '边框',
                                value: 'rgb(34, 34, 34) 0px 0px 1px, rgb(34, 34, 34) 0px 0px 1px, rgb(34, 34, 34) 0px 0px 1px, rgb(34, 34, 34) 0px 0px 1px, rgb(34, 34, 34) 0px 0px 1px'
                            }
                        ],
                        onSelect(item) {
                            const { html, value: textShadow } = item;
                            subtitle.style({ textShadow });
                            storage.set('subtitleStyle', {
                                ...storage.get('subtitleStyle'),
                                textShadow
                            });
                            return html;
                        },
                        mounted(_, item) {
                            const { textShadow } = {
                                ...storage.get('subtitleStyle')
                            };
                            if (textShadow) {
                                const { selector } = item;
                                const currentItem = selector.find(item => item.value === textShadow);
                                if (currentItem) {
                                    item.tooltip = currentItem.html;
                                }
                            }
                        }
                    },
                    {
                        html: '加载字幕',
                        name: 'loadSubtitles',
                        selector: [
                            {
                                html: '本地文件',
                                name: 'file',
                                tooltip: '',
                                onClick: (item, $dom) => {
                                    const { user, show } = plugins.user;
                                    user().then(({ expire_time }) => {
                                        if (Math.max(expire_time - Date.now(), 0)) {
                                            template.$file.click();
                                            localFile(template.$file).then(sublist => update(sublist));
                                        }
                                        else {
                                            show();
                                        }
                                    });
                                    return '';
                                },
                                mounted: ($dom, item) => {
                                    if (!template.$file) {
                                        template.$file = append(template.$container, '<input type="file" accept=".webvtt,.vtt,.srt,.ssa,.ass" style="display: none;">');
                                    }
                                }
                            },
                        ]
                    },
                ]
            });

            contextmenu.update({
                name: 'subtitle',
                index: 31,
                html: `字幕显示: ${[1, 0].map((item) => `<span data-value="${item}">${item ? '显示' : '隐藏'}</span>`).join('')}`,
                click: (contextmenu, event) => {
                    const { user, show } = plugins.user;
                    user().then(({ expire_time }) => {
                        if (Math.max(expire_time - Date.now(), 0)) {
                            inverseClass(event.target, 'art-current');
                            const { value } = event.target.dataset;
                            subtitle.show = Boolean(Number(value));
                        }
                        else {
                            show();
                        }
                    });

                    contextmenu.show = false;
                },
                mounted: ($panel) => {
                    const $default = query(`[data-value='${Number(subtitle.show)}']`, $panel);
                    if ($default) inverseClass($default, 'art-current');
                    art.on('subtitle', (state) => {
                        const $current = query(`[data-value='${Number(state)}']`, $panel);
                        if ($current) inverseClass($current, 'art-current');
                    });
                }
            });

            function init() {
                art.once('user', ({ expire_time }) => {
                    if (Math.max(expire_time - Date.now(), 0)) {
                        art.on('subtitle', (state) => storage.set('subtitle', state));

                        const state = storage.get('subtitle');
                        if (typeof state === 'boolean') {
                            subtitle.show = state;
                        }

                        if ((option.sublist || []).length) {
                            add(option.sublist);
                        }

                        if (typeof option.getUrl === 'function') {
                            getSublist().then(sublist => {
                                update(sublist);
                            });
                        }

                        let id = option.id;
                        art.on('restart', () => {
                            if (id === option.id) {
                                if ((option.sublist || []).length) {
                                    subtitle.createTrack('metadata', subtitle.url);
                                }
                            }
                            else {
                                id = option.id;

                                const { $subtitle } = template;
                                $subtitle.innerHTML = '';
                                option.subtitle.url = '';
                                subtitle.createTrack('metadata', '');

                                if (controls.cache.get('subtitle')) {
                                    controls.remove('subtitle');
                                }

                                if ((option.sublist || []).length) {
                                    add(option.sublist);
                                }

                                if (typeof option.getUrl === 'function') {
                                    getSublist().then(sublist => {
                                        update(sublist);
                                    });
                                }
                            }
                        });
                    }
                });
            }

            art.isReady ? init() : art.once('ready', init);

            return {
                name: 'subtitle'
            };
        }
    },
    () => {
        return (art) => {
            const {
                notice,
                storage,
                plugins,
                setting,
                template: { $video }
            } = art;

            function setEnabled(enabled) {
                initJoysound().then(joySound => {
                    joySound.setEnabled(enabled);
                });
            }

            function setVolume(range) {
                initJoysound().then(joySound => {
                    joySound.setVolume(range);
                });
            }

            function initJoysound() {
                if (art.joySound) return Promise.resolve(art.joySound);

                const Joysound = window.Joysound || unsafeWindow.Joysound;
                if (Joysound) {
                    if (Joysound.isSupport()) {
                        const joySound = art.joySound = new Joysound();
                        if (!joySound.hasSource()) {
                            joySound.init($video);
                        }
                        return Promise.resolve(joySound);
                    }
                    return Promise.reject('Not Joysound isSupport');
                }

                return Promise.reject('Not Joysound');
            };

            function destroy() {
                if (art.joySound) {
                    art.joySound.destroy();
                }
            }

            setting.add({
                html: '声音设置',
                name: 'joysound',
                tooltip: '',
                selector: [
                    {
                        html: '音质增强',
                        name: 'high',
                        tooltip: '关闭',
                        switch: false,
                        onSwitch: (item) => {
                            const state = !item.switch;

                            const { user, show } = plugins.user;
                            user().then(({ expire_time }) => {
                                if (Math.max(expire_time - Date.now(), 0)) {
                                    setEnabled(state);
                                    item.tooltip = state ? '开启' : '关闭';
                                    storage.set('joysound', state);
                                    notice.show = `音质增强: ${item.tooltip}`;
                                }
                                else {
                                    show();
                                }
                            });

                            return state;
                        },
                        mounted: (_, item) => {
                            if (storage.get('joysound')) {
                                item.tooltip = '增强';
                                item.switch = !0;
                            }
                        }
                    },
                    {
                        html: '音量增强',
                        name: 'volume',
                        tooltip: '0x',
                        range: [0, 0, 5, .1],
                        onRange: (item) => {
                            const range = item.range[0];

                            const { user, show } = plugins.user;
                            user().then(({ expire_time }) => {
                                if (Math.max(expire_time - Date.now(), 0)) {
                                    setVolume(range);
                                    notice.show = `音量增强: ${Math.round(range * 100)}%`;
                                }
                                else {
                                    show();
                                }
                            });

                            return `${Math.round(range * 100) / 100}x`;
                        },
                    }
                ]
            });

            function init() {
                art.once('user', ({ expire_time }) => {
                    if (Math.max(expire_time - Date.now(), 0)) {
                        const enabled = storage.get('joysound');
                        if (typeof enabled === 'boolean' && enabled) {
                            setEnabled(enabled);
                        }

                        art.on('destroy', destroy);
                    }
                    else {
                        storage.del('joysound');
                    }
                });
            }

            art.playing ? init() : art.once('video:playing', init);

            return {
                name: 'sound'
            };
        }
    },
    () => {
        return (art) => {
            const {
                notice,
                storage,
                plugins,
                setting,
                template: {
                    $video: { style }
                }
            } = art;

            const updateFilterStyle = () => {
                const { brightness = 1, contrast = 1, saturate = 1 } = {
                    ...storage.get('filter')
                };
                if (brightness !== 1 || contrast !== 1 || saturate !== 1) {
                    style.filter = `brightness(${brightness}) contrast(${contrast}) saturate(${saturate})`;
                }
                else {
                    style.filter = ``;
                }
            };

            setting.update({
                html: '色彩滤镜',
                name: 'filter',
                tooltip: '',
                selector: [
                    {
                        html: '亮度',
                        name: 'brightness',
                        tooltip: 100,
                        range: [100, 0, 255, 1],
                        onRange: (item) => {
                            const brightness = item.range[0];

                            const { user, show } = plugins.user;
                            user().then(({ expire_time }) => {
                                if (Math.max(expire_time - Date.now(), 0)) {
                                    storage.set('filter', {
                                        ...storage.get('filter'),
                                        brightness: brightness / 100
                                    });
                                    updateFilterStyle();
                                    notice.show = `亮度: ${brightness}`;
                                }
                                else {
                                    show();
                                }
                            });

                            return brightness;
                        },
                        mounted: (_, item) => {
                            const { brightness = 1 } = {
                                ...storage.get('filter')
                            };
                            const value = Math.trunc(brightness * 100);;
                            item.$range.value = value;
                            item.tooltip = value;
                        }
                    },
                    {
                        html: '对比度',
                        name: 'contrast',
                        tooltip: 100,
                        range: [100, 0, 255, 1],
                        onRange: (item) => {
                            const contrast = item.range[0];

                            const { user, show } = plugins.user;
                            user().then(({ expire_time }) => {
                                if (Math.max(expire_time - Date.now(), 0)) {
                                    storage.set('filter', {
                                        ...storage.get('filter'),
                                        contrast: contrast / 100
                                    });
                                    updateFilterStyle();
                                    notice.show = `对比度: ${contrast}`;
                                }
                                else {
                                    show();
                                }
                            });

                            return contrast;
                        },
                        mounted: (_, item) => {
                            const { contrast = 1 } = {
                                ...storage.get('filter')
                            };
                            const value = Math.trunc(contrast * 100);;
                            item.$range.value = value;
                            item.tooltip = value;
                        }
                    },
                    {
                        html: '饱和度',
                        name: 'saturate',
                        tooltip: 100,
                        range: [100, 0, 255, 1],
                        onRange: (item) => {
                            const saturate = item.range[0];

                            const { user, show } = plugins.user;
                            user().then(({ expire_time }) => {
                                if (Math.max(expire_time - Date.now(), 0)) {
                                    storage.set('filter', {
                                        ...storage.get('filter'),
                                        saturate: saturate / 100
                                    });
                                    updateFilterStyle();
                                    notice.show = `饱和度: ${saturate}`;
                                }
                                else {
                                    show();
                                }
                            });

                            return saturate;
                        },
                        mounted: (_, item) => {
                            const { saturate = 1 } = {
                                ...storage.get('filter')
                            };
                            const value = Math.trunc(saturate * 100);;
                            item.$range.value = value;
                            item.tooltip = value;
                        }
                    },
                    {
                        html: '默认',
                        tooltip: '',
                        values: [1.00, 1.00, 1.00]
                    },
                    {
                        html: '护眼',
                        tooltip: '',
                        values: [0.70, 0.85, 0.85]
                    },
                    {
                        html: '柔和',
                        tooltip: '',
                        values: [1.05, 0.85, 0.75]
                    },
                    {
                        html: '清晰',
                        tooltip: '',
                        values: [1.10, 1.05, 1.01]
                    },
                    {
                        html: '明亮',
                        tooltip: '',
                        values: [1.20, 1.00, 1.10]
                    },
                    {
                        html: '高对比',
                        tooltip: '',
                        values: [1.00, 1.50, 1.00]
                    },
                    {
                        html: '黑白',
                        tooltip: '',
                        values: [1.00, 1.10, 0.00]
                    },
                ],
                onSelect: (item) => {
                    const { user, show } = plugins.user;
                    user().then(({ expire_time }) => {
                        if (Math.max(expire_time - Date.now(), 0)) {
                            const values = item.values;

                            ['brightness', 'contrast', 'saturate'].forEach((name, index) => {
                                const option = setting.find(name);
                                const value = Math.trunc(values[index] * 100);
                                option.tooltip = value;
                                option.$range.value = value;
                            });

                            storage.set('filter', {
                                brightness: values[0],
                                contrast: values[1],
                                saturate: values[2]
                            });

                            updateFilterStyle();
                        }
                        else {
                            show();
                        }
                    });

                    return item.html;
                }
            });

            function init() {
                art.once('user', ({ expire_time }) => {
                    if (Math.max(expire_time - Date.now(), 0)) {
                        updateFilterStyle();
                    }
                });
            }

            art.isReady ? init() : art.once('ready', init);

            return {
                name: 'filter'
            };
        }
    },
    () => {
        return (art) => {
            const {
                i18n,
                notice,
                storage,
                plugins,
                setting,
                controls,
                constructor: {
                    utils: { throttle }
                }
            } = art;

            setting.update({
                html: '播放设置',
                name: 'playSetting',
                icon: '',
                tooltip: '',
                selector: [
                    {
                        html: '自动连播',
                        name: 'autoNext',
                        icon: '',
                        tooltip: '关闭',
                        switch: false,
                        onSwitch: (item) => {
                            const autoNext = !item.switch;

                            const { user, show } = plugins.user;
                            user().then(({ expire_time }) => {
                                if (Math.max(expire_time - Date.now(), 0)) {
                                    item.tooltip = autoNext ? '开启' : '关闭';
                                    storage.set('autoNext', autoNext);
                                    notice.show = `自动下一集: ${item.tooltip}`;
                                }
                                else {
                                    show();
                                }
                            });

                            return autoNext;
                        },
                        mounted: (_, item) => {
                            const autoNext = storage.get('autoNext');
                            if (autoNext) {
                                item.tooltip = '开启';
                                item.switch = true;
                            }
                        }
                    },
                    {
                        html: '自动全屏',
                        name: 'autoFullscreen',
                        icon: '',
                        tooltip: '关闭',
                        switch: false,
                        onSwitch: (item) => {
                            const autoFullscreen = !item.switch;

                            const { user, show } = plugins.user;
                            user().then(({ expire_time }) => {
                                if (Math.max(expire_time - Date.now(), 0)) {
                                    art.fullscreenWeb = autoFullscreen;
                                    storage.set('autoFullscreen', autoFullscreen);
                                    item.tooltip = autoFullscreen ? '开启' : '关闭';
                                    notice.show = `自动全屏: ${item.tooltip}`;
                                }
                                else {
                                    show();
                                }
                            });

                            return autoFullscreen;
                        },
                        mounted: (_, item) => {
                            const autoFullscreen = storage.get('autoFullscreen');
                            if (autoFullscreen) {
                                item.tooltip = '开启';
                                item.switch = true;
                            }
                        }
                    },
                    {
                        html: '跳过片头',
                        name: 'start',
                        tooltip: '0s',
                        range: [0, 0, 120, 1],
                        onChange(item) {
                            const start = item.range[0];

                            const { user, show } = plugins.user;
                            user().then(({ expire_time }) => {
                                if (Math.max(expire_time - Date.now(), 0)) {
                                    storage.set('skipTime', {
                                        ...storage.get('skipTime'),
                                        start
                                    });
                                    notice.show = `跳过片头: ${start} 秒`;
                                }
                                else {
                                    show();
                                }
                            });

                            return start + 's';
                        },
                        mounted: (_, item) => {
                            const { start } = {
                                ...storage.get('skipTime')
                            }
                            if (start) {
                                item.tooltip = start + 's';
                                item.$range.value = start;
                            }
                        }
                    },
                    {
                        html: '跳过片尾',
                        name: 'end',
                        tooltip: '0s',
                        range: [0, 0, 120, 1],
                        onChange(item) {
                            const end = item.range[0];

                            const { user, show } = plugins.user;
                            user().then(({ expire_time }) => {
                                if (Math.max(expire_time - Date.now(), 0)) {
                                    storage.set('skipTime', {
                                        ...storage.get('skipTime'),
                                        end
                                    });
                                    notice.show = `跳过片尾: ${end} 秒`;
                                }
                                else {
                                    show();
                                }
                            });

                            return end + 's';
                        },
                        mounted: (_, item) => {
                            const { end } = {
                                ...storage.get('skipTime')
                            }
                            if (end) {
                                item.tooltip = end + 's';
                                item.$range.value = end;
                            }
                        }
                    },
                ]
            });

            function init() {
                art.once('user', ({ expire_time }) => {
                    if (Math.max(expire_time - Date.now(), 0)) {
                        const autoFullscreen = storage.get('autoFullscreen');
                        if (autoFullscreen) {
                            art.fullscreenWeb = true;
                        }

                        art.on('video:timeupdate', throttle(() => {
                            const { start, end } = {
                                ...storage.get('skipTime')
                            }
                            if (start == 0 && end == 0) {
                                return;
                            }

                            const { currentTime, duration } = art;

                            const skipRanges = [[0, start], [end ? duration - end : 0, end ? duration : 0]];
                            for (const [ start, end ] of skipRanges) {
                                if (currentTime >= start && currentTime < end) {
                                    art.seek = end;
                                    break;
                                }
                            }
                        }, 1e3));

                        art.on('video:ended', () => {
                            if (storage.get('autoNext')) {
                                if (controls.cache.get('playlist')) {
                                    const selector = controls.cache.get('playlist').option.selector;
                                    const index = selector.findIndex(item => item.default);
                                    const nextOption = selector[index + 1];
                                    if (nextOption) {
                                        controls.check(nextOption);
                                        if (typeof nextOption.open === 'function') {
                                            nextOption.open();
                                        }
                                    }
                                    else {
                                        notice.show = '没有下一集了';
                                    }
                                }
                            }
                        });
                    }
                });
            }

            art.isReady ? init() : art.once('ready', init);

            return {
                name: 'playSetting'
            };
        }
    },
    () => {
        return (art) => {
            function FastForward(art) {
                const {
                    proxy,
                    storage,
                    template: { $player, $video },
                    constructor: {
                        FAST_FORWARD_VALUE,
                        FAST_FORWARD_TIME,
                        utils: { addClass, removeClass, hasClass }
                    }
                } = art;

                let timer = null;
                let isPress = false;
                let lastPlaybackRate = 1;

                const onStart = (event) => {
                    const { state, playbackRate = FAST_FORWARD_VALUE } = {
                        ...storage.get('fastForward')
                    };
                    if (!state) {
                        return;
                    }

                    if (event.pointerType === 'touch' && !event.isPrimary) return;
                    if (event.pointerType === 'mouse' && event.button !== 0) return;
                    if (art.playing && !art.isLock) {
                        timer = setTimeout(() => {
                            isPress = true;
                            lastPlaybackRate = art.playbackRate;
                            art.playbackRate = playbackRate;
                            addClass($player, 'art-fast-forward');
                        }, FAST_FORWARD_TIME);
                    }
                };

                const onStop = () => {
                    clearTimeout(timer);
                    if (isPress) {
                        isPress = false;
                        art.playbackRate = lastPlaybackRate;
                        removeClass($player, 'art-fast-forward');
                        setTimeout(() => art.play());
                    }
                };

                const onPointerMove = (event) => {
                    if (event.pointerType === 'touch') {
                        onStop();
                    }
                };

                function init() {
                    art.once('user', ({ expire_time }) => {
                        if (Math.max(expire_time - Date.now(), 0)) {
                            proxy($video, 'pointerdown', onStart);
                            art.on('document:pointermove', onPointerMove);
                            art.on('document:pointerup', onStop);
                            art.on('document:pointercancel', onStop);
                        }
                    });
                }

                art.isReady ? init() : art.once('ready', init);

                return {
                    name: 'fastForward',
                    get state() {
                        return hasClass($player, 'art-fast-forward');
                    }
                };
            }

            function FastSeek(art) {
                const {
                    proxy,
                    layers,
                    storage,
                    constructor: {
                        CONTROL_HIDE_TIME,
                        utils: { isMobile, throttle }
                    }
                } = art;

                const { state, backward = 15, forward = 15 } = {
                    ...storage.get('fastSeek')
                };

                const style = {
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%) scale(1)',
                    borderRadius: '50%',
                    color: '#fff',
                    display: 'none',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease, backdrop-filter 0.15s ease',
                    userSelect: 'none',
                    pointerEvents: 'auto',
                    WebkitTapHighlightColor: 'transparent',
                    touchAction: 'none',
                };

                const $backward = layers.update({
                    name: 'backward',
                    html: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="currentColor" aria-hidden="true" viewBox="0 0 64 64"><path d="M52 32a20 20 0 0 0-20-20 20 20 0 0 0-14.14 5.86L16 12v8h8l-2.93-2.93A14 14 0 0 1 32 18a14 14 0 0 1 14 14 14 14 0 0 1-14 14 14 14 0 0 1-9.93-4.07L20 42.93A20 20 0 0 0 52 32z"></path><text x="32" y="37" text-anchor="middle" dominant-baseline="middle" fill="currentColor" font-size="18" font-weight="600" font-family="system-ui, -apple-system, sans-serif">${backward}</text></svg>`,
                    style: {
                        ...style,
                        left: '25%',
                    },
                    click: () => {
                        const { backward = 15 } = {
                            ...storage.get('fastSeek')
                        };
                        art.backward = backward;
                    },
                    mounted: ($el) => {
                    }
                });

                const $forward = layers.update({
                    name: 'forward',
                    html: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="currentColor" aria-hidden="true" viewBox="0 0 64 64"><path d="M12 32a20 20 0 0 1 20-20 20 20 0 0 1 14.14 5.86L48 12v8h-8l2.93-2.93A14 14 0 0 0 32 18a14 14 0 0 0-14 14 14 14 0 0 0 14 14 14 14 0 0 0 9.93-4.07L44 42.93A20 20 0 0 1 12 32z"></path><text x="32" y="37" text-anchor="middle" dominant-baseline="middle" fill="currentColor" font-size="18" font-weight="600" font-family="system-ui, -apple-system, sans-serif">${forward}</text></svg>`,
                    style: {
                        ...style,
                        right: '25%'
                    },
                    click: () => {
                        const { forward = 15 } = {
                            ...storage.get('fastSeek')
                        };
                        art.forward = forward;
                    },
                    mounted: ($el) => {
                    }
                });

                const show = () => {
                    $backward.style.display = 'flex';
                    $forward.style.display = 'flex';
                }
                const hide = () => {
                    $backward.style.display = 'none';
                    $forward.style.display = 'none';
                }

                const updateBackward = (backward) => {
                    $backward.querySelector('svg > text').innerHTML = backward;
                }
                const updateForward = (forward) => {
                    $forward.querySelector('svg > text').innerHTML = forward;
                }

                function init() {
                    art.once('user', ({ expire_time }) => {
                        if (Math.max(expire_time - Date.now(), 0)) {
                            let isHover = false;
                            [$backward, $forward].forEach($el => {
                                proxy($el, 'pointerenter', () => {
                                    isHover = true;
                                });
                                proxy($el, 'pointerleave', () => {
                                    isHover = false;
                                });

                                proxy($el, 'pointerdown', () => {
                                    $el.style.color = art.theme;
                                    $el.style.backdropFilter = 'blur(6px)';
                                    $el.style.transform = 'translateY(-50%) scale(0.85)';
                                });
                                proxy($el, 'pointerup', () => {
                                    $el.style.color = style.color;
                                    $el.style.backdropFilter = '';
                                    $el.style.transform = 'translateY(-50%) scale(1)';
                                });
                                proxy($el, 'pointercancel', () => {
                                    $el.style.color = style.color;
                                    $el.style.backdropFilter = '';
                                    $el.style.transform = 'translateY(-50%) scale(1)';
                                });
                            });

                            art.on('control', throttle(state => {
                                const { state: isShow } = {
                                    ...storage.get('fastSeek')
                                };
                                if (!isShow) {
                                    return;
                                }

                                if (state) {
                                    show();
                                    return;
                                }

                                if (isHover) {
                                    return;
                                }

                                hide();
                            }, CONTROL_HIDE_TIME / 3));
                        }
                    });
                }

                art.isReady ? init() : art.once('ready', init);

                return {
                    name: 'fastSeek',
                    show,
                    hide,
                    updateBackward,
                    updateForward
                };
            }

            const fastForward = FastForward(art);
            const fastSeek = FastSeek(art);

            const {
                notice,
                setting,
                storage,
                plugins
            } = art;

            setting.update({
                html: '快捷控制',
                name: 'quick',
                icon: '',
                tooltip: '',
                selector: [
                    {
                        html: '长按倍速',
                        name: 'fastForward',
                        icon: '',
                        tooltip: '',
                        selector: [
                            {
                                html: '状态',
                                name: '',
                                icon: '',
                                tooltip: '关闭',
                                switch: false,
                                onSwitch: (item) => {
                                    const state = !item.switch;

                                    const { user, show } = plugins.user;
                                    user().then(({ expire_time }) => {
                                        if (Math.max(expire_time - Date.now(), 0)) {
                                            storage.set('fastForward', {
                                                ...storage.get('fastForward'),
                                                state
                                            });
                                            item.tooltip = state ? '开启' : '关闭';
                                            notice.show = `长按倍速: ${item.tooltip}`;
                                        }
                                        else {
                                            show();
                                        }
                                    });

                                    return state;
                                },
                                mounted: (_, item) => {
                                    const { state } = {
                                        ...storage.get('fastForward')
                                    };
                                    if (state) {
                                        item.tooltip = '开启';
                                        item.switch = true;
                                    }
                                },
                            },
                            {
                                html: '播放速度',
                                name: '',
                                icon: '',
                                tooltip: '3x',
                                range: [3, 2, 6, .5],
                                onChange(item) {
                                    const playbackRate = item.range[0];
                                    storage.set('fastForward', {
                                        ...storage.get('fastForward'),
                                        playbackRate
                                    });
                                    return playbackRate + 'x';
                                },
                                mounted: (_, item) => {
                                    const { playbackRate } = {
                                        ...storage.get('fastForward')
                                    };
                                    if (playbackRate) {
                                        item.$range.value = playbackRate;
                                        item.tooltip = playbackRate + 'x';
                                    }
                                }
                            }
                        ]
                    },
                    {
                        html: '快进快退',
                        name: 'fastSeek',
                        icon: '',
                        tooltip: '',
                        selector: [
                            {
                                html: '状态',
                                name: '',
                                icon: '',
                                tooltip: '关闭',
                                switch: false,
                                onSwitch: (item) => {
                                    const state = !item.switch;

                                    const { user, show } = plugins.user;
                                    user().then(({ expire_time }) => {
                                        if (Math.max(expire_time - Date.now(), 0)) {
                                            storage.set('fastSeek', {
                                                ...storage.get('fastSeek'),
                                                state
                                            });
                                            if (state) {
                                                fastSeek.show();
                                                item.tooltip = '开启';
                                            } else {
                                                fastSeek.hide();
                                                item.tooltip = '关闭';
                                            }
                                            notice.show = `快进快退: ${item.tooltip}`;
                                        }
                                        else {
                                            show();
                                        }
                                    });

                                    return state;
                                },
                                mounted: (_, item) => {
                                    const { state } = {
                                        ...storage.get('fastSeek')
                                    };
                                    if (state) {
                                        item.tooltip = '开启';
                                        item.switch = true;
                                    }
                                },
                            },
                            {
                                html: '快退时间',
                                name: 'backward',
                                tooltip: '15s',
                                range: [15, 10, 90, 1],
                                onChange(item) {
                                    const backward = item.range[0];
                                    storage.set('fastSeek', {
                                        ...storage.get('fastSeek'),
                                        backward
                                    });
                                    fastSeek.updateBackward(backward);
                                    return backward + 's';
                                },
                                mounted: (_, item) => {
                                    const { backward } = {
                                        ...storage.get('fastSeek')
                                    };
                                    if (backward) {
                                        item.$range.value = backward;
                                        item.tooltip = backward + 's';
                                    }
                                }
                            },
                            {
                                html: '快进时间',
                                name: 'forward',
                                tooltip: '15s',
                                range: [15, 10, 90, 1],
                                onChange(item) {
                                    const forward = item.range[0];
                                    storage.set('fastSeek', {
                                        ...storage.get('fastSeek'),
                                        forward
                                    });
                                    fastSeek.updateForward(forward);
                                    return forward + 's';
                                },
                                mounted: (_, item) => {
                                    const { forward } = {
                                        ...storage.get('fastSeek')
                                    };
                                    if (forward) {
                                        item.$range.value = forward;
                                        item.tooltip = forward + 's';
                                    }
                                }
                            },
                        ]
                    }
                ]
            });

            return {
                name: 'quick'
            };
        }
    },
    () => {
        return (art) => {
            const {
                option,
                constructor: {
                    utils: { isMobile }
                }
            } = art;

            function init() {
                art.once('user', ({ expire_time }) => {
                    if (Math.max(expire_time - Date.now(), 0)) {
                        if (option.hotkey && !isMobile) {
                            if (!art.isFocus) {
                                art.isFocus = true;
                            }
                        }

                        art.on('blur', (event) => {
                            if (option.hotkey && !isMobile) {
                                art.isFocus = true;
                            }
                        });
                    }
                });
            }

            art.isReady ? init() : art.once('ready', init);

            return {
                name: 'hotkey'
            };
        }
    },
    () => {
        return (art) => {
            const {
                info,
                proxy,
                contextmenu,
                template: { $video, $infoPanel },
                constructor: {
                    INFO_LOOP_TIME,
                    utils: { query, append, isMobile }
                }
            } = art;

            function hlsInfo() {
                if (isMobile) return;

                const { hls } = art;
                if (hls) {
                    const $bandwidth = append($infoPanel, '<div class="art-info-item"><div class="art-info-title">Hls bandwidth:</div><div class="art-info-content">NaN</div></div>');
                    const item = query('.art-info-content', $bandwidth);

                    proxy(contextmenu.info, 'click', loop);

                    function loop() {
                        if (info.show) {
                            const value = hls.bandwidthEstimate;
                            const innerText = typeof value === 'number' ? `${(value / 1024 / 1024 / 8).toFixed(4)} MBps/s` : value;
                            if (item.innerText !== innerText) {
                                item.innerText = innerText;
                            }
                            setTimeout(loop, INFO_LOOP_TIME);
                        }
                    }
                }
            }

            function init() {
                art.once('user', ({ expire_time }) => {
                    if (Math.max(expire_time - Date.now(), 0)) {
                        hlsInfo();
                    }
                });
            }

            art.isReady ? init() : art.once('ready', init);

            return {
                name: 'info'
            };
        }
    },
]);
