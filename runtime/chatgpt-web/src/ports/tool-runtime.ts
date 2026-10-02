export interface ToolRuntimePort<TRequest, TResult> {
  nextBatch(signal?: AbortSignal): Promise<TRequest[]>;
  complete(callId: string, result: TResult): Promise<void>;
  revoke(reason?: Error): Promise<void>;
}
