// frontend/src/lib/pricing.ts
export type ServiceId = "consultation" | "followup" | "registration";

export interface ServiceItem {
  id: ServiceId;
  name: string;
  price: number; // ₹
  description?: string;
  selectable?: boolean; // registration is not selectable (auto-added)
}

export const TAX_RATE = 0.10; // 10% GST
export const DEFAULT_REGISTRATION_FEE = 1;

export const SERVICE_CATALOG: ServiceItem[] = [
  { id: "consultation", name: "Consultation", price: 2, description: "Doctor consultation", selectable: true },
  { id: "followup",     name: "Doctor's Follow-up", price: 300, description: "Follow-up within policy window", selectable: true },
  // Registration is added automatically for walk-ins, not a toggle
  { id: "registration", name: "Registration Fee", price: DEFAULT_REGISTRATION_FEE, selectable: false },
];

export function calcBill(selected: ServiceId[], includeRegistration = true) {
  const selectedItems = SERVICE_CATALOG.filter(s => selected.includes(s.id));
  const reg = includeRegistration ? SERVICE_CATALOG.find(s => s.id === "registration")?.price ?? 0 : 0;

  const subtotal = selectedItems.reduce((sum, s) => sum + s.price, 0) + reg;
  const tax = Math.round(subtotal * TAX_RATE);
  const total = subtotal + tax;

  return {
    items: selectedItems.map(s => ({ id: s.id, name: s.name, price: s.price })),
    registrationFee: reg,
    subtotal,
    tax,
    total,
  };
}
