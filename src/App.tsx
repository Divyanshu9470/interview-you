import { FormEvent, useEffect, useRef, useState } from "react";
import "./App.css";

type View = "chat" | "practice" | "settings";

type Message = {
  id: number;
  text: string;
  author: "user" | "assistant" | "error";
};

type PracticeCategory = "behavioral" | "technical" | "general";

type PracticeStage = "pick-category" | "loading-question" | "answering" | "loading-feedback" | "feedback";

type PracticeSession = {
  id: number;
  category: PracticeCategory;
  question: string;
  answer: string;
  feedback: string;
  score: number | null;
  timestamp: number;
};

const API_KEY_STORAGE_KEY = "interview-you:gemini-api-key";
const PRACTICE_HISTORY_STORAGE_KEY = "interview-you:practice-history";
const GEMINI_MODEL = "gemini-2.5-flash";
const PRACTICE_SECONDS = 120;

const CHAT_SYSTEM_INSTRUCTION =
  "You are Interview You, a friendly job-interview practice coach. " +
  "Ask thoughtful interview questions when the user wants to practice, " +
  "and when the user answers a question, give concise, constructive " +
  "feedback before moving on. Keep responses focused and encouraging.";

const CATEGORY_LABELS: Record<PracticeCategory, string> = {
  behavioral: "Behavioral",
  technical: "Technical",
  general: "General",
};

const CATEGORY_DESCRIPTIONS: Record<PracticeCategory, string> = {
  behavioral: "STAR-style questions about past experience and teamwork.",
  technical: "Role-relevant technical / problem-solving questions.",
  general: "Common questions like strengths, weaknesses, and motivation.",
};

function loadPracticeHistory(): PracticeSession[] {
  try {
    const raw = localStorage.getItem(PRACTICE_HISTORY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PracticeSession[]) : [];
  } catch {
    return [];
  }
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function App() {
  const [activeView, setActiveView] = useState<View>("chat");

  // --- Chat state ---
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: "Welcome to Interview You. Add your API key in Settings, then start practicing.",
      author: "assistant",
    },
  ]);
  const [draftMessage, setDraftMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  // --- Settings state ---
  const [apiKey, setApiKey] = useState("");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  // --- Practice state ---
  const [practiceCategory, setPracticeCategory] = useState<PracticeCategory | null>(null);
  const [practiceStage, setPracticeStage] = useState<PracticeStage>("pick-category");
  const [practiceQuestion, setPracticeQuestion] = useState("");
  const [practiceAnswer, setPracticeAnswer] = useState("");
  const [practiceFeedback, setPracticeFeedback] = useState("");
  const [practiceScore, setPracticeScore] = useState<number | null>(null);
  const [practiceError, setPracticeError] = useState("");
  const [timeLeft, setTimeLeft] = useState(PRACTICE_SECONDS);
  const [practiceHistory, setPracticeHistory] = useState<PracticeSession[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (stored) {
      setApiKey(stored);
      setApiKeyDraft(stored);
    }
    setPracticeHistory(loadPracticeHistory());
  }, []);

  // Countdown timer for the "answering" stage. No AI assistance happens here.
  useEffect(() => {
    if (practiceStage !== "answering") {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [practiceStage]);

  // When the timer hits zero, auto-submit whatever has been typed so far.
  useEffect(() => {
    if (practiceStage === "answering" && timeLeft === 0) {
      void submitPracticeAnswer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, practiceStage]);

  async function callGeminiRaw(systemInstruction: string, userText: string): Promise<string> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: "user", parts: [{ text: userText }] }],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error?.message ?? `Request failed with status ${response.status}.`);
    }

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? "")
      .join("");

    if (!text) {
      throw new Error("The model returned an empty response.");
    }

    return text;
  }

  async function callGeminiChat(history: Message[], latestUserText: string): Promise<string> {
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
          systemInstruction: { parts: [{ text: CHAT_SYSTEM_INSTRUCTION }] },
          contents,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error?.message ?? `Request failed with status ${response.status}.`);
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
      const reply = await callGeminiChat(historySnapshot, value);
      setMessages((current) => [...current, { id: Date.now() + 1, text: reply, author: "assistant" }]);
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

  async function startPractice(category: PracticeCategory) {
    if (!apiKey) {
      setActiveView("settings");
      return;
    }

    setPracticeCategory(category);
    setPracticeStage("loading-question");
    setPracticeError("");
    setPracticeAnswer("");
    setPracticeFeedback("");
    setPracticeScore(null);

    try {
      const prompt =
        `Give me exactly ONE realistic ${CATEGORY_LABELS[category].toLowerCase()} job interview ` +
        "question. Reply with ONLY the question text itself - no numbering, no quotes, no preamble.";
      const question = (await callGeminiRaw(CHAT_SYSTEM_INSTRUCTION, prompt)).trim();
      setPracticeQuestion(question);
      setTimeLeft(PRACTICE_SECONDS);
      setPracticeStage("answering");
    } catch (error) {
      setPracticeError(error instanceof Error ? error.message : "Could not generate a question.");
      setPracticeStage("pick-category");
    }
  }

  async function submitPracticeAnswer() {
    if (practiceStage !== "answering" || !practiceCategory) return;

    setPracticeStage("loading-feedback");
    const answerGiven = practiceAnswer.trim() || "(No answer given before time ran out.)";

    try {
      const prompt =
        `Interview question: "${practiceQuestion}"\n\n` +
        `Candidate's answer: "${answerGiven}"\n\n` +
        "Act as an interview coach. Respond with ONLY valid JSON in this exact shape, no markdown " +
        'fences, no extra text: {"score": <integer 1-5>, "feedback": "<2-4 sentences of honest, ' +
        'constructive feedback>"}';
      const raw = await callGeminiRaw(CHAT_SYSTEM_INSTRUCTION, prompt);

      let score: number | null = null;
      let feedback = raw.trim();
      try {
        const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```$/, "");
        const parsed = JSON.parse(cleaned);
        if (typeof parsed.score === "number") score = parsed.score;
        if (typeof parsed.feedback === "string") feedback = parsed.feedback;
      } catch {
        // Fall back to showing the raw text if it wasn't valid JSON.
      }

      setPracticeFeedback(feedback);
      setPracticeScore(score);
      setPracticeStage("feedback");

      const session: PracticeSession = {
        id: Date.now(),
        category: practiceCategory,
        question: practiceQuestion,
        answer: answerGiven,
        feedback,
        score,
        timestamp: Date.now(),
      };
      const updatedHistory = [session, ...practiceHistory].slice(0, 50);
      setPracticeHistory(updatedHistory);
      localStorage.setItem(PRACTICE_HISTORY_STORAGE_KEY, JSON.stringify(updatedHistory));
    } catch (error) {
      setPracticeError(error instanceof Error ? error.message : "Could not get feedback.");
      setPracticeStage("answering");
    }
  }

  function resetPractice() {
    setPracticeCategory(null);
    setPracticeStage("pick-category");
    setPracticeQuestion("");
    setPracticeAnswer("");
    setPracticeFeedback("");
    setPracticeScore(null);
    setPracticeError("");
  }

  function clearPracticeHistory() {
    setPracticeHistory([]);
    localStorage.removeItem(PRACTICE_HISTORY_STORAGE_KEY);
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
            className={activeView === "practice" ? "tab active" : "tab"}
            onClick={() => setActiveView("practice")}
          >
            Practice
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
                  {message.author === "user" ? "You" : message.author === "error" ? "Error" : "Assistant"}:
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
      ) : null}

      {activeView === "practice" ? (
        <section className="panel" aria-label="Practice screen">
          {practiceError ? <p className="message error">{practiceError}</p> : null}

          {practiceStage === "pick-category" ? (
            <div className="practice-categories">
              <p className="hint">
                Pick a category. You will get one question, a {PRACTICE_SECONDS / 60}-minute timer, and
                no AI help while you answer - just like a real interview.
              </p>
              {(Object.keys(CATEGORY_LABELS) as PracticeCategory[]).map((category) => (
                <button
                  key={category}
                  type="button"
                  className="category-card"
                  onClick={() => void startPractice(category)}
                >
                  <strong>{CATEGORY_LABELS[category]}</strong>
                  <span>{CATEGORY_DESCRIPTIONS[category]}</span>
                </button>
              ))}
            </div>
          ) : null}

          {practiceStage === "loading-question" ? <p className="hint">Generating your question...</p> : null}

          {practiceStage === "answering" || practiceStage === "loading-feedback" ? (
            <div className="practice-active">
              <p className="practice-category-tag">{practiceCategory ? CATEGORY_LABELS[practiceCategory] : ""}</p>
              <p className="practice-question">{practiceQuestion}</p>
              <p className={timeLeft <= 10 ? "practice-timer low" : "practice-timer"}>{formatTime(timeLeft)}</p>
              <textarea
                className="practice-answer"
                value={practiceAnswer}
                onChange={(event) => setPracticeAnswer(event.currentTarget.value)}
                placeholder="Type your answer here. No AI help during this timer - answer as you would live."
                disabled={practiceStage === "loading-feedback"}
                rows={6}
              />
              <button
                type="button"
                onClick={() => void submitPracticeAnswer()}
                disabled={practiceStage === "loading-feedback"}
              >
                {practiceStage === "loading-feedback" ? "Getting feedback..." : "Submit answer"}
              </button>
            </div>
          ) : null}

          {practiceStage === "feedback" ? (
            <div className="practice-active">
              <p className="practice-category-tag">{practiceCategory ? CATEGORY_LABELS[practiceCategory] : ""}</p>
              <p className="practice-question">{practiceQuestion}</p>
              <p className="practice-your-answer">
                <strong>Your answer:</strong> {practiceAnswer.trim() || "(No answer given before time ran out.)"}
              </p>
              <div className="practice-feedback">
                {practiceScore !== null ? (
                  <p className="practice-score">Score: {practiceScore} / 5</p>
                ) : null}
                <p>{practiceFeedback}</p>
              </div>
              <div className="practice-buttons">
                <button type="button" onClick={() => practiceCategory && void startPractice(practiceCategory)}>
                  Next question
                </button>
                <button type="button" className="secondary" onClick={resetPractice}>
                  Change category
                </button>
              </div>
            </div>
          ) : null}

          {practiceHistory.length > 0 ? (
            <div className="practice-history">
              <div className="practice-history-header">
                <h2>Past sessions</h2>
                <button type="button" className="secondary" onClick={clearPracticeHistory}>
                  Clear history
                </button>
              </div>
              {practiceHistory.map((session) => (
                <div key={session.id} className="history-item">
                  <p className="history-meta">
                    {CATEGORY_LABELS[session.category]} - {new Date(session.timestamp).toLocaleString()}
                    {session.score !== null ? ` - ${session.score}/5` : ""}
                  </p>
                  <p className="history-question">{session.question}</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {activeView === "settings" ? (
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
              Get a free key from Google AI Studio, then paste it here. It is stored only on this device.
            </p>
          </form>
        </section>
      ) : null}
    </main>
  );
}

export default App;
