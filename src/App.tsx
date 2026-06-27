import { FormEvent, useState } from "react";
import "./App.css";

type View = "chat" | "settings";

type Message = {
  id: number;
  text: string;
  author: "user" | "assistant";
};

const API_KEY_STORAGE = "interview-you.api-key";

function App() {
  const [activeView, setActiveView] = useState<View>("chat");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: "Welcome to Interview You. Add your API key in Settings, then start practicing.",
      author: "assistant",
    },
  ]);
  const [draftMessage, setDraftMessage] = useState("");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) ?? "");
  const [saveStatus, setSaveStatus] = useState("");

  function onSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = draftMessage.trim();
    if (!value) return;

    setMessages((current) => [
      ...current,
      { id: Date.now(), text: value, author: "user" },
      {
        id: Date.now() + 1,
        text: "This is a scaffolded desktop UI. Integrate your interview assistant backend next.",
        author: "assistant",
      },
    ]);
    setDraftMessage("");
  }

  function onSaveApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    localStorage.setItem(API_KEY_STORAGE, apiKey.trim());
    setSaveStatus("Saved API key locally for this desktop app.");
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>Interview You</h1>
        <div className="tabs" role="tablist" aria-label="App sections">
          <button
            type="button"
            className={activeView === "chat" ? "tab active" : "tab"}
            onClick={() => setActiveView("chat")}
          >
            Chat
          </button>
          <button
            type="button"
            className={activeView === "settings" ? "tab active" : "tab"}
            onClick={() => setActiveView("settings")}
          >
            Settings
          </button>
        </div>
      </header>

      {activeView === "chat" ? (
        <section className="panel" aria-label="Chat screen">
          <div className="messages" aria-live="polite">
            {messages.map((message) => (
              <p
                key={message.id}
                className={message.author === "user" ? "message user" : "message assistant"}
              >
                <strong>{message.author === "user" ? "You" : "Assistant"}:</strong> {message.text}
              </p>
            ))}
          </div>

          <form className="composer" onSubmit={onSendMessage}>
            <input
              value={draftMessage}
              onChange={(event) => setDraftMessage(event.currentTarget.value)}
              placeholder="Ask an interview question..."
              aria-label="Message"
            />
            <button type="submit">Send</button>
          </form>
        </section>
      ) : (
        <section className="panel" aria-label="Settings screen">
          <form className="settings-form" onSubmit={onSaveApiKey}>
            <label htmlFor="api-key">API key</label>
            <input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.currentTarget.value)}
              placeholder="Enter your API key"
            />
            <button type="submit">Save</button>
            {saveStatus ? <p className="status">{saveStatus}</p> : null}
          </form>
        </section>
      )}
    </main>
  );
}

export default App;
