// Hulpfuncties voor facturen: gegevens van de uitgever (KvK, BTW, IBAN) komen uit de administratie
// van de toegewezen persoon (Wendy -> OYMB, Karima -> Bureau Sterk Na Geweld).
import { supabase } from "./supabaseClient";

// Geeft de bedrijfsgegevens waarmee voor deze klant gefactureerd wordt. Gooit een fout als jij dat niet mag.
export async function haalUitgever(clientId) {
  const { data, error } = await supabase.rpc("factuur_uitgever", { p_client: clientId });
  if (error) throw new Error(error.message);
  return data;
}

export async function volgendFactuurnummer(uitgeverWerkruimteId) {
  const { data, error } = await supabase.rpc("next_invoice_number", { p_werkruimte: uitgeverWerkruimteId });
  if (error || !data) throw new Error(error?.message || "Geen factuurnummer gekregen");
  return data;
}

export const btwFactor = (uitgever) => Number(uitgever?.btw_percentage ?? 21) / 100;
