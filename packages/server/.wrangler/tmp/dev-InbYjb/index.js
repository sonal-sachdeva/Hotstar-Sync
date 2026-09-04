var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/Room.ts
var DEFAULT_ROOM = /* @__PURE__ */ __name(() => ({
  playing: false,
  positionAtEpoch: 0,
  anchorServerTime: Date.now(),
  rate: 1,
  revision: 0
}), "DEFAULT_ROOM");
var Room = class {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.state.blockConcurrencyWhile(async () => {
      this.room = await this.state.storage.get("room") ?? DEFAULT_ROOM();
    });
  }
  state;
  env;
  static {
    __name(this, "Room");
  }
  room = DEFAULT_ROOM();
  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLocaleLowerCase() !== "websocket") {
      return new Response(" Exoected WebSocket", { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server);
    const me = { id: crypto.randomUUID().slice(0, 6), name: "guest" };
    server.serializeAttachment(me);
    this.send(server, { type: "state", state: this.room });
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, message) {
    let cmd;
    try {
      cmd = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      return;
    }
    if (cmd.type === "hello") {
      const me = ws.deserializeAttachment();
      me.name = cmd.name;
      ws.serializeAttachment(me);
      this.broadcastPresence();
      return;
    }
    if (cmd.type == "play") {
      this.room.playing = true;
      this.room.positionAtEpoch = cmd.position;
    } else if (cmd.type == "pause") {
      this.room.playing = false;
      this.room.positionAtEpoch = cmd.position;
    } else if (cmd.type == "seek") {
      this.room.positionAtEpoch = cmd.position;
    } else {
      return;
    }
    this.room.anchorServerTime = Date.now();
    this.room.revision++;
    await this.state.storage.put("room", this.room);
    this.broadcastState();
  }
  broadcastState() {
    const msg = { type: "state", state: this.room };
    for (const s of this.state.getWebSockets()) {
      this.send(s, msg);
    }
  }
  async webSocketClose(ws) {
    this.broadcastPresence(ws);
  }
  participants(exclude) {
    return this.state.getWebSockets().filter((s) => s !== exclude).map((s) => s.deserializeAttachment());
  }
  broadcastPresence(exclude) {
    const msg = { type: "presence", participants: this.participants(exclude) };
    for (const s of this.state.getWebSockets()) {
      if (s !== exclude) this.send(s, msg);
    }
  }
  send(ws, msg) {
    ws.send(JSON.stringify(msg));
  }
};

// src/index.ts
var src_default = {
  async fetch(request, env, ctx) {
    const parts = new URL(request.url).pathname.split("/").filter(Boolean);
    if (request.method === "POST" && parts.length === 1 && parts[0] === "rooms") {
      return Response.json({ roomId: crypto.randomUUID().slice(0, 8) });
    }
    if (parts.length == 3 && parts[0] == "rooms" && parts[2] == "ws") {
      const stub = env.ROOMS.get(env.ROOMS.idFromName(parts[1]));
      return stub.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  }
};

// ../../node_modules/.pnpm/wrangler@4.128.0_@cloudflare+workers-types@5.20260903.1/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../node_modules/.pnpm/wrangler@4.128.0_@cloudflare+workers-types@5.20260903.1/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-nShWWC/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../node_modules/.pnpm/wrangler@4.128.0_@cloudflare+workers-types@5.20260903.1/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-nShWWC/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  Room,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
