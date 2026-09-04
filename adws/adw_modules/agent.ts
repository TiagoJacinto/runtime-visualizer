import type { AgentCall, EnvelopeBase, Phase } from "./data_types";
import type { Run } from "./runner";

export interface AgentMessage {
  phase: string;
  call: AgentCall;
}

export interface Agent {
  execute(run: Run, phase: Phase, call: AgentCall): Promise<EnvelopeBase>;
}

export class InMemoryAgent implements Agent {
  readonly messages: AgentMessage[] = [];
  private readonly responses: EnvelopeBase[];

  constructor(responses: EnvelopeBase[]) {
    this.responses = [...responses];
  }

  async execute(run: Run, phase: Phase, call: AgentCall): Promise<EnvelopeBase> {
    this.messages.push({ phase: phase.params.name, call });
    const response = this.responses.shift();
    if (!response) throw new Error(`in-memory agent has no response for ${phase.params.name}`);
    for (const gate of call.gates) {
      const report = gate(response, run);
      if (!report.passed) throw new Error(report.violations.join("; "));
    }
    return response;
  }
}
