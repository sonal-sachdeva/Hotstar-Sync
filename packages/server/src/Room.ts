import { Participant, RoomState, ServerMessage, ClientCommand } from "@hotstar-sync/protocol";

const DEFAULT_ROOM = () : RoomState => ({
  playing: false,
  positionAtEpoch: 0,
  anchorServerTime: Date.now(),
  rate: 1,
  revision: 0,
});

export class Room {
    private room : RoomState = DEFAULT_ROOM();

    constructor(private state: DurableObjectState, private env : unknown) {
        this.state.blockConcurrencyWhile(async () => {
            this.room = await this.state.storage.get<RoomState>('room') ?? DEFAULT_ROOM();
        });
    }

    async fetch(request:Request) : Promise<Response> {
        if(request.headers.get('Upgrade')?.toLocaleLowerCase() !== 'websocket') {
            return new Response(' Exoected WebSocket', {status: 426});
    }
    const {0 : client, 1: server}  = new WebSocketPair();
    this.state.acceptWebSocket(server);
    const me : Participant = {id: crypto.randomUUID().slice(0,6) , name: 'guest'};
    server.serializeAttachment(me);
    this.send(server, {type:'state', state: this.room});
    this.broadcastPresence();
    return new Response(null, {status : 101, webSocket: client});
    }

    async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer){
        let cmd: ClientCommand;
        try{
            cmd = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
        }
        catch{
            return;
        }

        if(cmd.type === 'hello'){
            const me = ws.deserializeAttachment() as Participant;
            me.name = cmd.name;
            ws.serializeAttachment(me);
            this.broadcastPresence();
            return;
        }

        if(cmd.type == 'play'){
            this.room.playing = true;
            this.room.positionAtEpoch = cmd.position;
        }
        else if(cmd.type == 'pause'){
            this.room.playing = false;
            this.room.positionAtEpoch = cmd.position;
        }
        else if(cmd.type == 'seek'){
            this.room.positionAtEpoch = cmd.position;
        }
        else{
            return;
        }
        this.room.anchorServerTime = Date.now();
        this.room.revision++;
        await this.state.storage.put('room', this.room);
        this.broadcastState();
    }

    private broadcastState(){
        const msg : ServerMessage = {type : 'state', state: this.room};
        for(const s of this.state.getWebSockets()){
            this.send(s, msg);
        }
    }
    
    async webSocketClose(ws: WebSocket){
        this.broadcastPresence(ws);
    }

    private participants(exclude? : WebSocket) : Participant[] {
        return this.state.getWebSockets().filter((s) => s!==exclude).map((s) => s.deserializeAttachment() as Participant);
    }

    private broadcastPresence(exclude? : WebSocket){
        const msg : ServerMessage = {type : 'presence', participants: this.participants(exclude)};
        for(const s of this.state.getWebSockets()){
            if(s !== exclude) this.send(s, msg);
        }
    }

    private send(ws:WebSocket, msg: ServerMessage){
        ws.send(JSON.stringify(msg));
    }
}