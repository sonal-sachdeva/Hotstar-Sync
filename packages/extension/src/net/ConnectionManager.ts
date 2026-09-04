import type {ClientCommand, ServerMessage} from '@hotstar-sync/protocol';

interface Handlers{
    onMessage : (msg : ServerMessage) => void;
    onStatus?: (open:boolean) => void;
}

export class ConnectionManager{
    private ws : WebSocket | null = null;
    private closed = false;
    private backoff = 1000;
    private queue : ClientCommand[] = [];

    constructor(private url: string, private handlers : Handlers){}
        
    connect(){
            const ws = new WebSocket(this.url);
            this.ws = ws;
            ws.onopen = () => {
                this.backoff = 1000;
                this.handlers.onStatus?.(true);
                for(const cmd of this.queue){
                    ws.send(JSON.stringify(cmd));
                }
                this.queue = [];
            };
            ws.onmessage = (e) => {
                try{
                    this.handlers.onMessage(JSON.parse(e.data) as ServerMessage);
                }
                catch{}
            };
            ws.onclose = () => {
                this.handlers.onStatus?.(false);
                if(!this.closed){
                    this.scheduleReconnect();
                }
            };
            ws.onerror = () => {
                ws.close();
            }
    }

    private scheduleReconnect(){
        setTimeout(() => this.connect(), this.backoff);
        this.backoff = Math.min(this.backoff * 2, 15000);
    }

    send(cmd: ClientCommand){
        if(this.ws && this.ws.readyState === WebSocket.OPEN){
            this.ws.send(JSON.stringify(cmd));
        }
        else{
            this.queue.push(cmd);
        }
    }

    close(){
        this.closed = true;
        if(this.ws) this.ws.close();
    }
}