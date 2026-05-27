import { parsePayload, runAgentTask } from './agent-core.mjs';

try {
  const result = await runAgentTask(parsePayload(), {
    onProgress: (event) => {
      if (process.env.AGENT_PROGRESS === '1') {
        process.stderr.write(`__AGENT_PROGRESS__${JSON.stringify(event)}\n`);
      }
    },
  });
  process.stdout.write(JSON.stringify(result, null, 2));
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
