import {Room} from './Room';
export {Room};


export interface Env{
    ROOMS : DurableObjectNamespace;
}

export default {
    async fetch ( request : Request, env : Env, ctx : ExecutionContext ) : Promise<Response> {
        const parts = new URL(request.url).pathname.split('/').filter(Boolean);

        if(request.method === 'POST' && parts.length === 1 && parts[0] === 'rooms') {
            return Response.json({roomId: crypto.randomUUID().slice(0, 8)});
        }

        if(parts.length == 3 && parts[0] == 'rooms' && parts[2] == 'ws'){
            const stub = env.ROOMS.get(env.ROOMS.idFromName(parts[1]));
            return stub.fetch(request);
        }
        return new Response('Not found', {status: 404});
    },
}