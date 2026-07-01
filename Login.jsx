import React, { useState } from "react";
import { supabase } from "./supabaseClient";

const PINK = "#F984E5";

export default function Login() {
  const [email, setEmail] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [foutmelding, setFoutmelding] = useState("");
  const [bezig, setBezig] = useState(false);

  async function inloggen(e) {
    e.preventDefault();
    setBezig(true);
    setFoutmelding("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: wachtwoord });
    setBezig(false);
    if (error) setFoutmelding("Inloggen mislukt: " + error.message);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#000",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        padding: 20,
      }}
    >
      <form
        onSubmit={inloggen}
        style={{ background: "#fff", color: "#111", borderRadius: 16, padding: 32, width: 360, maxWidth: "100%" }}
      >
        <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>OYMB Klantensysteem</h1>
        <p style={{ color: "#888", fontSize: 14, margin: "0 0 24px" }}>Log in met je account</p>

        <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 4 }}>E-mail</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
          required
        />

        <label style={{ display: "block", fontSize: 13, color: "#555", margin: "14px 0 4px" }}>Wachtwoord</label>
        <input
          type="password"
          value={wachtwoord}
          onChange={(e) => setWachtwoord(e.target.value)}
          style={inputStyle}
          required
        />

        {foutmelding && <p style={{ color: "#c0392b", fontSize: 13, marginTop: 12 }}>{foutmelding}</p>}

        <button type="submit" disabled={bezig} style={{ ...primaryBtn, width: "100%", marginTop: 20 }}>
          {bezig ? "Bezig..." : "Inloggen"}
        </button>
      </form>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #ddd",
  fontSize: 14,
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const primaryBtn = {
  background: PINK,
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 18px",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};
