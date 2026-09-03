import type { VideoAdapter, PlaybackState, MediaIdentity, PlaybackEvent } from './VideoAdapter';

const PLAYBACK_EVENTS : PlaybackEvent[] = ['play', 'pause', 'seeking', 'seeked', 'ratechange'];

export class JioHotstarAdapter implements VideoAdapter {
    private video: HTMLVideoElement | null = null;
    private observer: MutationObserver | null = null;
    private listners = new Map<PlaybackEvent, Set<() => void>>();
    private boundHandlers = new Map<PlaybackEvent, () => void>();

    constructor() {
        this.resolveVideoElement();
        this.observer = new MutationObserver(() => {
            if(this.video && this.video.isConnected) return;
            const current = document.querySelector('video');
            if(current) this.attach(current);
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
    }

    private resolveVideoElement() {
        const el = document.querySelector('video');
        if(el) this.attach(el);
    }

    private attach(el: HTMLVideoElement) {
        this.detachListeners();
        this.video = el;
        for(const event of PLAYBACK_EVENTS) {
            const handler = () => {
                this.emit(event);
                this.boundHandlers.set(event, handler);
                el.addEventListener(event, handler);
            }
        }
    }

    private detachListeners() {
        if(!this.video) return;
        for(const [event, handler] of this.boundHandlers) {
            this.video.removeEventListener(event, handler);
        }
        this.boundHandlers.clear();
    }
    private emit(event: PlaybackEvent) {
        this.listners.get(event)?.forEach(cb => cb());
    }
    isReady(): boolean {
        return this.video !== null && this.video.readyState >=1;
    }

    getState(): PlaybackState | null {
        if(!this.video) return null;
        return {
            playing: !this.video.paused,
            currentTime: this.video.currentTime,
            duration: this.video.duration,
            rate: this.video.playbackRate
        }
    }

    getMediaIdentity(): MediaIdentity {
        const parts = location.pathname.split('/').filter(Boolean);
        const region = parts[0] || null;
        const watchIdx = parts.indexOf('watch');
        const contentId = watchIdx > 0 ? (parts[watchIdx - 1] ?? null): null;
        const showId = new URLSearchParams(location.search).get('ulp_id');
        return { showId, contentId, region };
    }

    async play(){
        await this.video?.play();
    }
    pause(){
        this.video?.pause();
    }
    seek(time: number){
        if(this.video) this.video.currentTime = time;
    }
    setRate(rate: number){
        if(this.video) this.video.playbackRate = rate;
    }
    on(event: PlaybackEvent, cb: () => void){
        if(!this.listners.has(event)) this.listners.set(event, new Set());
        this.listners.get(event)?.add(cb);
    }
    destroy(){
        this.detachListeners();
        this.observer?.disconnect();
        this.video = null;
    } 
}