import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import Login from "./Login";
import Dashboard from "./Dashboard";
import ClientenBeheer from "./ClientenBeheer";
import Facturen from "./Facturen";
import Organisaties from "./Organisaties";
import Intake from "./Intake";
import Instellingen from "./Instellingen";
import Samen from "./Samen";
import Retreats from "./Retreats";
import { WerkruimteProvider, useWerkruimte } from "./WerkruimteContext";

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
     <WerkruimteProvider>
      <NavBalk />
      <WerkruimteGate>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/klanten" element={<ClientenBeheer />} />
        <Route path="/organisaties" element={<Organisaties />} />
        <Route path="/intake" element={<Intake />} />
        <Route path="/facturen" element={<Facturen />} />
        <Route path="/instellingen" element={<Instellingen />} />
        <Route path="/samen" element={<Samen />} />
        <Route path="/retreats" element={<Retreats />} />
      </Routes>
      </WerkruimteGate>
     </WerkruimteProvider>
    </BrowserRouter>
  );
}

// Wacht tot de administraties geladen zijn; toont een duidelijke melding als je nog geen toegang hebt.
function WerkruimteGate({ children }) {
  const { klaar, actief } = useWerkruimte();
  if (!klaar) return <div style={{ color: "#999", padding: 40 }}>Laden...</div>;
  if (!actief)
    return (
      <div style={{ color: "#fff", padding: 40, maxWidth: 520 }}>
        Je account is nog niet gekoppeld aan een administratie. Vraag Wendy om je toe te voegen.
      </div>
    );
  // key = opnieuw laden van alle pagina's zodra je van administratie wisselt
  return <React.Fragment key={actief.id}>{children}</React.Fragment>;
}

function NavBalk() {
  const { werkruimtes, actief, kiesWerkruimte, isGedeeld } = useWerkruimte();
  const location = useLocation();
  const navigate = useNavigate();
  const [facturenMenuOpen, setFacturenMenuOpen] = useState(false);

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

  const facturenSubmenu = [
    { label: "Alle facturen", status: null },
    { label: "Openstaande facturen", status: "verzonden" },
    { label: "Betaald", status: "betaald" },
    { label: "Gecrediteerd", status: "gecrediteerd" },
  ];

  return (
    <div
      style={{
        background: "#000",
        borderBottom: "1px solid #1a1a1a",
        padding: "14px 20px 0 20px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        {werkruimtes.length > 1 ? (
          <select
            value={actief?.id || ""}
            onChange={(e) => { kiesWerkruimte(e.target.value); navigate("/dashboard"); }}
            style={{ background: "#111", color: "#fff", border: `1px solid ${PINK}`, borderRadius: 8, padding: "6px 10px", fontWeight: 800, fontSize: 14 }}
          >
            {werkruimtes.map((w) => (
              <option key={w.id} value={w.id}>{w.naam}</option>
            ))}
          </select>
        ) : (
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 16, letterSpacing: 0.3 }}>{actief?.naam || "OYMB"}</span>
        )}
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
        <button
          onClick={() => setFacturenMenuOpen((o) => !o)}
          style={{
            ...linkStyle("/facturen"),
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Facturen {facturenMenuOpen ? "▴" : "▾"}
        </button>
        {isGedeeld && <Link to="/retreats" style={linkStyle("/retreats")}>Retreats</Link>}
        {isGedeeld && <Link to="/samen" style={linkStyle("/samen")}>Agenda &amp; taken</Link>}
        <Link to="/instellingen" style={linkStyle("/instellingen")}>Instellingen</Link>
      </div>

      {facturenMenuOpen && (
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "10px 0",
            overflowX: "auto",
            whiteSpace: "nowrap",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {facturenSubmenu.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                navigate(item.status ? `/facturen?status=${item.status}` : "/facturen");
                setFacturenMenuOpen(false);
              }}
              style={{
                fontSize: 12,
                padding: "6px 14px",
                borderRadius: 20,
                border: "1px solid #333",
                background: "#111",
                color: "#ccc",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
