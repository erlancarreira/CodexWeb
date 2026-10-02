export type TransportObservationSource = "playwright" | "cdp";
export type TransportRequestRole = "candidate" | "auxiliary";
export type TransportRequestLifecycle = "sent" | "accepted" | "streaming" | "finished" | "failed";
export type TransportFailureClassification = "benign" | "recoverable" | "terminal";

interface TransportObservationBase {
  readonly at: number;
  readonly source: TransportObservationSource;
  readonly requestId: string;
  readonly evidenceKey?: string;
}

export type TransportObservation =
  | (TransportObservationBase & {
      readonly type: "request_sent";
      readonly url: string;
      readonly method: string;
      readonly role: TransportRequestRole;
    })
  | (TransportObservationBase & {
      readonly type: "response_received";
      readonly status: number;
    })
  | (TransportObservationBase & {
      readonly type: "data_received";
      readonly bytes: number;
    })
  | (TransportObservationBase & { readonly type: "request_finished" })
  | (TransportObservationBase & {
      readonly type: "request_failed";
      readonly errorText: string;
    });

export interface TransportRequestState {
  readonly requestId: string;
  readonly role: TransportRequestRole;
  readonly url: string;
  readonly method: string;
  readonly sentAt: number;
  readonly lastActivityAt: number;
  readonly lifecycle: TransportRequestLifecycle;
  readonly responseStatus?: number;
  readonly responseAt?: number;
  readonly bytesReceived: number;
  readonly chunksReceived: number;
  readonly finishedAt?: number;
  readonly failedAt?: number;
  readonly failureText?: string;
  readonly evidenceKeys: readonly string[];
}

export interface TransportSessionState {
  readonly revision: number;
  readonly requests: Readonly<Record<string, TransportRequestState>>;
  readonly primaryRequestId?: string;
}

export interface TransportCorrelationPolicy {
  choosePrimary(
    requests: Readonly<Record<string, TransportRequestState>>,
    currentPrimaryRequestId?: string,
  ): string | undefined;
}

export function createTransportSessionState(): TransportSessionState {
  return { revision: 0, requests: {} };
}

function assertTimestamp(at: number): void {
  if (!Number.isFinite(at) || at < 0) throw new Error("Transport observation timestamp must be finite and non-negative");
}

function assertRequestId(requestId: string): void {
  if (!requestId.trim()) throw new Error("Transport observation requires a request id");
}

function evidenceSeen(state: TransportRequestState, evidenceKey?: string): boolean {
  return Boolean(evidenceKey && state.evidenceKeys.includes(evidenceKey));
}

function withEvidence(state: TransportRequestState, evidenceKey?: string): TransportRequestState {
  if (!evidenceKey || state.evidenceKeys.includes(evidenceKey)) return state;
  return { ...state, evidenceKeys: [...state.evidenceKeys, evidenceKey] };
}

function acceptedStatus(status: number | undefined): boolean {
  return status !== undefined && status >= 200 && status < 400;
}

export function classifyTransportFailure(request: TransportRequestState): TransportFailureClassification {
  const error = request.failureText ?? "";
  if (
    /ERR_ABORTED/i.test(error)
    && acceptedStatus(request.responseStatus)
    && request.bytesReceived > 0
  ) {
    return "benign";
  }
  if (request.responseStatus === undefined) return "recoverable";
  if (acceptedStatus(request.responseStatus) && request.bytesReceived > 0) return "recoverable";
  return "terminal";
}

export function requestHasAuthoritativeProgress(request: TransportRequestState): boolean {
  return acceptedStatus(request.responseStatus) && request.bytesReceived > 0;
}

export class AssistantTransportCorrelationPolicy implements TransportCorrelationPolicy {
  choosePrimary(
    requests: Readonly<Record<string, TransportRequestState>>,
    currentPrimaryRequestId?: string,
  ): string | undefined {
    const current = currentPrimaryRequestId ? requests[currentPrimaryRequestId] : undefined;
    if (
      current
      && current.role === "candidate"
      && current.lifecycle !== "finished"
      && current.lifecycle !== "failed"
      && (acceptedStatus(current.responseStatus) || requestHasAuthoritativeProgress(current))
    ) {
      // An active accepted primary is sticky. A concurrent matching request cannot steal authority
      // until the current request reaches a terminal transport state.
      return current.requestId;
    }

    const candidates = Object.values(requests).filter(request => request.role === "candidate");
    if (candidates.length === 0) return undefined;

    const score = (request: TransportRequestState): number => {
      if (requestHasAuthoritativeProgress(request)) return 50;
      if (acceptedStatus(request.responseStatus)) return request.lifecycle === "failed" ? 20 : 40;
      if (request.lifecycle === "failed") return 0;
      return 10;
    };

    candidates.sort((left, right) => {
      const scoreDifference = score(right) - score(left);
      if (scoreDifference !== 0) return scoreDifference;
      if (left.sentAt !== right.sentAt) return right.sentAt - left.sentAt;
      return left.requestId.localeCompare(right.requestId);
    });
    return candidates[0]?.requestId;
  }
}

function reduceRequest(
  existing: TransportRequestState | undefined,
  observation: TransportObservation,
): TransportRequestState {
  if (observation.type === "request_sent") {
    if (existing) {
      if (
        existing.url !== observation.url
        || existing.method !== observation.method
        || existing.role !== observation.role
      ) {
        throw new Error(`Transport request ${observation.requestId} was redefined with different metadata`);
      }
      return withEvidence(existing, observation.evidenceKey);
    }
    return {
      requestId: observation.requestId,
      role: observation.role,
      url: observation.url,
      method: observation.method,
      sentAt: observation.at,
      lastActivityAt: observation.at,
      lifecycle: "sent",
      bytesReceived: 0,
      chunksReceived: 0,
      evidenceKeys: observation.evidenceKey ? [observation.evidenceKey] : [],
    };
  }

  if (!existing) {
    throw new Error(`Transport observation ${observation.type} arrived before request_sent for ${observation.requestId}`);
  }
  if (evidenceSeen(existing, observation.evidenceKey)) return existing;

  switch (observation.type) {
    case "response_received": {
      if (!Number.isSafeInteger(observation.status) || observation.status < 100 || observation.status > 599) {
        throw new Error("Transport response status must be a valid HTTP status");
      }
      if (existing.lifecycle === "finished") throw new Error("Finished transport request cannot receive another response");
      if (existing.lifecycle === "failed") throw new Error("Failed transport request cannot receive another response");
      const canReplaceRedirect = existing.responseStatus !== undefined
        && existing.responseStatus >= 300
        && existing.responseStatus < 400
        && observation.status !== existing.responseStatus
        && existing.bytesReceived === 0;
      if (existing.responseStatus !== undefined && existing.responseStatus !== observation.status && !canReplaceRedirect) {
        throw new Error(`Transport request ${existing.requestId} received conflicting response statuses`);
      }
      return withEvidence({
        ...existing,
        lifecycle: "accepted",
        responseStatus: observation.status,
        responseAt: observation.at,
        lastActivityAt: observation.at,
      }, observation.evidenceKey);
    }

    case "data_received":
      if (!Number.isSafeInteger(observation.bytes) || observation.bytes <= 0) {
        throw new Error("Transport data observation requires positive safe-integer bytes");
      }
      if (existing.lifecycle === "finished" || existing.lifecycle === "failed") {
        throw new Error("Terminal transport request cannot receive data");
      }
      return withEvidence({
        ...existing,
        lifecycle: "streaming",
        bytesReceived: existing.bytesReceived + observation.bytes,
        chunksReceived: existing.chunksReceived + 1,
        lastActivityAt: observation.at,
      }, observation.evidenceKey);

    case "request_finished":
      if (existing.lifecycle === "failed") throw new Error("Failed transport request cannot finish successfully");
      return withEvidence({
        ...existing,
        lifecycle: "finished",
        finishedAt: observation.at,
        lastActivityAt: observation.at,
      }, observation.evidenceKey);

    case "request_failed":
      if (existing.lifecycle === "finished") throw new Error("Finished transport request cannot fail");
      return withEvidence({
        ...existing,
        lifecycle: "failed",
        failedAt: observation.at,
        failureText: observation.errorText,
        lastActivityAt: observation.at,
      }, observation.evidenceKey);
  }
}

export function reduceTransportSession(
  state: TransportSessionState,
  observation: TransportObservation,
  correlationPolicy: TransportCorrelationPolicy = new AssistantTransportCorrelationPolicy(),
): TransportSessionState {
  assertTimestamp(observation.at);
  assertRequestId(observation.requestId);

  const previous = state.requests[observation.requestId];
  const nextRequest = reduceRequest(previous, observation);
  if (nextRequest === previous) return state;

  const requests = { ...state.requests, [observation.requestId]: nextRequest };
  const primaryRequestId = correlationPolicy.choosePrimary(requests, state.primaryRequestId);
  return {
    revision: state.revision + 1,
    requests,
    ...(primaryRequestId ? { primaryRequestId } : {}),
  };
}
