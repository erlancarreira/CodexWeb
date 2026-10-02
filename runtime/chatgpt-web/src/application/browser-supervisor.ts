export interface SupervisedBrowserResource {
  close(): Promise<void>;
}

/**
 * Owns browser worker instances only. Runtime/tunnel processes remain owned by their existing
 * supervisors; this boundary prevents browser resource lifecycle from leaking into those domains.
 */
export class BrowserSupervisor<T extends SupervisedBrowserResource> {
  private readonly resources = new Map<string, T>();

  acquire(key: string, create: () => T): T {
    if (!key.trim()) throw new Error("Browser supervisor requires a non-empty key");
    const existing = this.resources.get(key);
    if (existing) return existing;
    const resource = create();
    this.resources.set(key, resource);
    return resource;
  }

  forget(key: string, resource: T): boolean {
    if (this.resources.get(key) !== resource) return false;
    this.resources.delete(key);
    return true;
  }

  size(): number {
    return this.resources.size;
  }

  async closeAll(): Promise<void> {
    const resources = [...this.resources.values()];
    this.resources.clear();
    const results = await Promise.allSettled(resources.map(resource => resource.close()));
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map(result => result.reason);
    if (failures.length > 0) {
      throw new AggregateError(failures, `${failures.length} supervised browser resource(s) failed to close`);
    }
  }
}
