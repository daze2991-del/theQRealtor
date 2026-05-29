import { createServiceSupabase } from "./supabase";
import type { Lead, Property, QRCodeRow } from "./types";

export type DashboardData = {
  properties: Property[];
  qrcodes: QRCodeRow[];
  leads: Lead[];
};

export async function getPublicProperty(propertyId: string, qrId: string) {
  const supabase = createServiceSupabase();

  const [{ data: property, error: propertyError }, { data: qr, error: qrError }] = await Promise.all([
    supabase.from("properties").select("*").eq("id", propertyId).single(),
    supabase.from("qrcodes").select("*").eq("id", qrId).eq("property_id", propertyId).single(),
  ]);

  if (propertyError || qrError) {
    return { property: null, qr: null };
  }

  return { property: property as Property, qr: qr as QRCodeRow };
}

export async function createLead(input: {
  propertyId: string;
  qrId: string;
  name: string;
  phone: string;
  email: string;
}) {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("leads")
    .insert({
      property_id: input.propertyId,
      qr_id: input.qrId,
      name: input.name,
      phone: input.phone,
      email: input.email,
    })
    .select()
    .single();

  if (error) throw error;

  await Promise.all([
    supabase.rpc("increment_qr_scan_count", { qr_code_id: input.qrId }),
    supabase.from("scan_events").insert({ qr_id: input.qrId }),
  ]);

  return data as Lead;
}
