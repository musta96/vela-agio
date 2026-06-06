import { logMandateEvent, type ClientRole } from "./mandates";

const KEY = "vela.clientContext.v1";

export type ClientContext = {
  clientId: string;
  displayName: string;
  role: ClientRole;
  enteredAt: string;
};

function read(): ClientContext | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ClientContext) : null;
  } catch {
    return null;
  }
}

function write(ctx: ClientContext | null) {
  try {
    if (ctx) sessionStorage.setItem(KEY, JSON.stringify(ctx));
    else sessionStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent("vela:client-context-change"));
  } catch {
    /* ignore */
  }
}

export function getActiveClientContext(): ClientContext | null {
  return read();
}

export async function enterClientContext(opts: {
  actorId: string;
  clientId: string;
  displayName: string;
  role?: ClientRole;
}) {
  const ctx: ClientContext = {
    clientId: opts.clientId,
    displayName: opts.displayName,
    role: opts.role ?? "advisor_ro",
    enteredAt: new Date().toISOString(),
  };
  write(ctx);
  await logMandateEvent({
    actorId: opts.actorId,
    clientId: opts.clientId,
    action: "switch_context",
    clientRole: ctx.role,
    metadata: { event: "enter" },
  });
}

export async function exitClientContext(actorId?: string) {
  const cur = read();
  write(null);
  if (cur && actorId) {
    await logMandateEvent({
      actorId,
      clientId: cur.clientId,
      action: "switch_context",
      clientRole: cur.role,
      metadata: { event: "exit" },
    });
  }
}

export function subscribeClientContext(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener("vela:client-context-change", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("vela:client-context-change", handler);
    window.removeEventListener("storage", handler);
  };
}