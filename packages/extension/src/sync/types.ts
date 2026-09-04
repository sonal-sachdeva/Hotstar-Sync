// The playback facts the sync math needs.
export interface RoomState {
  playing: boolean;
  positionAtEpoch: number;   // playback seconds, captured AT anchorServerTime
  anchorServerTime: number;  // server clock (ms) when position was captured
  rate: number;              // 1 = normal speed
  revision: number;          // bumped every change; used to drop stale messages
}