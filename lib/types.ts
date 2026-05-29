export type Plan = "free" | "pro";

export type Profile = {
  id: string;
  email: string | null;
  name: string | null;
  plan: Plan;
  created_at: string;
};

export type Property = {
  id: string;
  user_id: string;
  address: string;
  agent_name: string | null;
  active: boolean;
  created_at: string;
};

export type QRCodeRow = {
  id: string;
  property_id: string;
  label: string;
  scan_count: number;
  lat: number | null;
  lng: number | null;
  created_at: string;
};

export type Lead = {
  id: string;
  property_id: string;
  qr_id: string;
  name: string;
  phone: string;
  email: string;
  created_at: string;
};

export type ScanEvent = {
  id: string;
  qr_id: string;
  lat: number | null;
  lng: number | null;
  created_at: string;
};
