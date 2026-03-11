import { AgentProvider, useAgent } from "@inngest/use-agent";

export function MyAgentUI() {
  const { messages, sendMessage, status } = useAgent();

  const onSubmit = (e) => {
    e.preventDefault();
    const value = new FormData(e.currentTarget).get("input");
    sendMessage(value);
  };

  return (
    <div>
      <ul>
        {messages.map(({ id, role, parts }) => (
          <li key={id}>
            <div>{role}</div>
            {parts.map(({ id, type, content }) =>
              type === "text" ? <div key={id}>{content}</div> : null
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={onSubmit}>
        <input name="input" />
        <button type="submit" disabled={status !== "ready"}>Send</button>
      </form>
    </div>
  );
}

