export type PlaybackEvent = 'play' | 'pause' | 'seeking' | 'seeked' | 'ratechange';

export interface MediaIdentity{
    showId: string| null;
    contentId: string| null;
    region: string| null;
}

export interface PlaybackState {
    playing : boolean;
    currentTime: number;
    duration: number;
    rate : number;
}

export interface VideoAdapter {
    isReady(): boolean;
    getState(): PlaybackState | null;
    getMediaIdentity(): MediaIdentity;
    play(): Promise<void>;
    pause(): void;
    seek(time: number): void;
    setRate(rate: number): void;
    on(event: PlaybackEvent, cb: () => void): void;
    destroy(): void;
}