import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { supabase } from "./supabaseClient";
import Login from "./Login";
import ClientenBeheer from "./ClientenBeheer";
import Facturen from "./Facturen";

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
        <Route path="/" element={<ClientenBeheer />} />
        <Route path="/klanten" element={<ClientenBeheer />} />
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
    color: location.pathname === pad ? PINK : "#999",
    textDecoration: "none",
    fontWeight: 600,
    fontSize: 14,
  });

  return (
    <div
      style={{
        background: "#000",
        borderBottom: "1px solid #222",
        padding: "14px 20px",
        display: "flex",
        alignItems: "center",
        gap: 24,
      }}
    >
      <span style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginRight: 8 }}>OYMB</span>
      <Link to="/klanten" style={linkStyle("/klanten")}>Klanten</Link>
      <Link to="/facturen" style={linkStyle("/facturen")}>Facturen</Link>
      <div style={{ flex: 1 }} />
      <button
        onClick={uitloggen}
        style={{ background: "none", border: "1px solid #333", color: "#999", borderRadius: 6, padding: "6px 12px", fontSize: 13, cursor: "pointer" }}
      >
        Uitloggen
      </button>
    </div>
  );
}
