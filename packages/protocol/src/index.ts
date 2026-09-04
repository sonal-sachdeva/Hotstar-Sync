export interface RoomState{
    playing: boolean;
    positionAtEpoch: number;   // playback seconds, captured AT anchorServerTime
    anchorServerTime: number;  // server clock (ms) when position was captured
    rate: number;              // 1 = normal speed
    revision: number;          // bumped every change; used to drop stale messages
}

export interface Participant{
    id : string;
    name : string;
}

export type ServerMessage = 
    | {type : 'state'; state : RoomState}
    | {type : 'presence'; participants : Participant[]};

export type ClientCommand = 
    | {type : 'hello', name : string}
    | {type : 'play', position : number}
    | {type : 'pause', position : number}
    | {type : 'seek', position : number}

