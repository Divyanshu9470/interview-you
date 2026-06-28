import { FormEvent, useEffect, useState } from "react";
import "./App.css";

type View = "chat" | "settings";

type Message = {
  id: number;
  text: string;
  author: "user" | "assistant" | "error";
};

const API_KEY_STORAGE_KEY = "interview-you:gemini-api-key";
const GEMINI_MODEL = "gemini-2.5-flash";
const SYSTEM_INSTRUCTION =
  "You are Interview You, a friendly job-interview practice coach. " +
  "Ask thoughtful interview questions when the user wants to practice, " +
  "and when the user answers a question, give concise, constructive " +
  "feedback before moving on. Keep responses focused and encouraging.";

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
  const [apiKey, setApiKey] = useState("");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Load any previously saved key when the app starts.
  useEffect(() => {
    const stored = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (stored) {
      setApiKey(stored);
      setApiKeyDraft(stored);
    }
  }, []);

  async function callGemini(history: Message[], latestUserText: string): Promise<string> {
    const contents = [
      ...history
        .filter((message) => message.author === "user" || message.author === "assistant")
        .map((message) => ({
          role: message.author === "user" ? "user" : "model",
          parts: [{ text: message.text }],
        })),
      { role: "user", parts: [{ text: latestUserText }] },
    ];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const message = data?.error?.message ?? `Request failed with status ${response.status}.`;
      throw new Error(message);
    }

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? "")
      .join("");

    if (!text) {
      throw new Error("The model returned an empty response.");
    }

    return text;
  }

  async function onSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = draftMessage.trim();
    if (!value || isSending) return;

    if (!apiKey) {
      setMessages((current) => [
        ...current,
        { id: Date.now(), text: value, author: "user" },
        {
          id: Date.now() + 1,
          text: "No API key set yet. Go to Settings and add your Gemini API key first.",
          author: "error",
        },
      ]);
      setDraftMessage("");
      setActiveView("settings");
      return;
    }

    const historySnapshot = messages;
    setMessages((current) => [...current, { id: Date.now(), text: value, author: "user" }]);
    setDraftMessage("");
    setIsSending(true);

    try {
      const reply = await callGemini(historySnapshot, value);
      setMessages((current) => [
        ...current,
        { id: Date.now() + 1, text: reply, author: "assistant" },
      ]);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Something went wrong reaching Gemini.";
      setMessages((current) => [...current, { id: Date.now() + 1, text, author: "error" }]);
    } finally {
      setIsSending(false);
    }
  }

  function onSaveApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = apiKeyDraft.trim();
    localStorage.setItem(API_KEY_STORAGE_KEY, trimmed);
    setApiKey(trimmed);
    setSaveStatus(trimmed ? "API key saved on this device." : "API key cleared.");
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
              <p key={message.id} className={`message ${message.author}`}>
                <strong>
                  {message.author === "user"
                    ? "You"
                    : message.author === "error"
                      ? "Error"
                      : "Assistant"}
                  :
                </strong>{" "}
                {message.text}
              </p>
            ))}
            {isSending ? (
              <p className="message assistant pending">
                <strong>Assistant:</strong> Thinking...
              </p>
            ) : null}
          </div>

          <form className="composer" onSubmit={onSendMessage}>
            <input
              value={draftMessage}
              onChange={(event) => setDraftMessage(event.currentTarget.value)}
              placeholder="Ask an interview question..."
              aria-label="Message"
              disabled={isSending}
            />
            <button type="submit" disabled={isSending || !draftMessage.trim()}>
              Send
            </button>
          </form>
        </section>
      ) : (
        <section className="panel" aria-label="Settings screen">
          <form className="settings-form" onSubmit={onSaveApiKey}>
            <label htmlFor="api-key">Gemini API key</label>
            <input
              id="api-key"
              type="password"
              value={apiKeyDraft}
              onChange={(event) => setApiKeyDraft(event.currentTarget.value)}
              placeholder="Enter your Gemini API key"
              autoComplete="off"
            />
            <button type="submit">Save</button>
            {saveStatus ? <p className="status">{saveStatus}</p> : null}
            <p className="hint">
              Get a free key from Google AI Studio, then paste it here. It is stored only on
              this device.
            </p>
          </form>
        </section>
      )}
    </main>
  );
}

export default App;
