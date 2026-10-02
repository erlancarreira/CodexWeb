import type { ToolRuntimePort } from "../../ports/tool-runtime";
import type {
  BrokerToolRequest,
  BrokerToolResult,
  TurnBrokerOwner,
} from "./turn-broker";

export class ChatGptBrokerToolRuntime implements ToolRuntimePort<BrokerToolRequest, BrokerToolResult> {
  constructor(
    private readonly broker: TurnBrokerOwner,
    private readonly token: () => Promise<string>,
  ) {}

  async nextBatch(signal?: AbortSignal): Promise<BrokerToolRequest[]> {
    return this.broker.nextToolBatch(await this.token(), signal);
  }

  async complete(callId: string, result: BrokerToolResult): Promise<void> {
    await this.broker.completeTool(await this.token(), callId, result);
  }

  async revoke(reason?: Error): Promise<void> {
    await this.broker.revoke(await this.token(), reason);
  }
}
