import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { Send } from "./pages/Send";
import { Receive } from "./pages/Receive";
import "./App.css";

function Home() {
  return (
    <div className="page home">
      <h1>FileDelivery</h1>
      <p className="tagline">Send files to any device, any brand.<br />No account. End-to-end encrypted.</p>
      <Link to="/send" className="btn-primary hero-btn">Send a file</Link>
      <p className="hint">To receive, open the link or scan the QR code from the sender's device.</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <header className="app-header">
        <Link to="/" className="app-logo">FileDelivery</Link>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/send" element={<Send />} />
          <Route path="/r/:sessionId" element={<Receive />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
