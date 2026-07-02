import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { supabase } from "./supabaseClient";
import Login from "./Login";
import Dashboard from "./Dashboard";
import ClientenBeheer from "./ClientenBeheer";
import Facturen from "./Facturen";
import Organisaties from "./Organisaties";
import Intake from "./Intake";

const PINK = "#F984E5";

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = nog aan het laden

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div style={{ minHeight: "100vh", background: "#000", color: "#999", display: "flex", alignItems: "center", justifyContent: "center" }}>
        Laden...
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  return (
    <BrowserRouter>
      <NavBalk />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/klanten" element={<ClientenBeheer />} />
        <Route path="/organisaties" element={<Organisaties />} />
        <Route path="/intake" element={<Intake />} />
        <Route path="/facturen" element={<Facturen />} />
      </Routes>
    </BrowserRouter>
  );
}

function NavBalk() {
  const location = useLocation();

  async function uitloggen() {
    await supabase.auth.signOut();
  }

  const linkStyle = (pad) => ({
    color: location.pathname === pad ? "#fff" : "#888",
    textDecoration: "none",
    fontWeight: 600,
    fontSize: 14,
    padding: "6px 2px",
    borderBottom: location.pathname === pad ? `2px solid ${PINK}` : "2px solid transparent",
    transition: "color 0.15s ease",
  });

  return (
    <div
      style={{
        background: "#000",
        borderBottom: "1px solid #1a1a1a",
        padding: "14px 20px 0 20px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ color: "#fff", fontWeight: 800, fontSize: 16, letterSpacing: 0.3 }}>OYMB</span>
        <button
          onClick={uitloggen}
          style={{ background: "none", border: "1px solid #2a2a2a", color: "#999", borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer", fontWeight: 500 }}
        >
          Uitloggen
        </button>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          overflowX: "auto",
          whiteSpace: "nowrap",
          WebkitOverflowScrolling: "touch",
          paddingBottom: 2,
        }}
      >
        <Link to="/dashboard" style={linkStyle("/dashboard")}>Dashboard</Link>
        <Link to="/klanten" style={linkStyle("/klanten")}>Klanten</Link>
        <Link to="/organisaties" style={linkStyle("/organisaties")}>Organisaties</Link>
        <Link to="/intake" style={linkStyle("/intake")}>Intake</Link>
        <Link to="/facturen" style={linkStyle("/facturen")}>Facturen</Link>
      </div>
    </div>
  );
}
