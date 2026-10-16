/*
 * The `payments` array the client understands.
 *
 * Several responses (box/payment/get, the capacity expansions, shop buys) carry
 * the player's premium-currency balances as `payments: [{ mst_payment_id, amount }]`.
 * The client replaces its cached balances with whatever comes back, so a handler
 * that omits `payments` makes the game show every currency as 0 until the box is
 * fetched again -- exactly the "karidama went to 0, fixed by a restart" bug.
 *
 * Always emit every known karidama id, even at 0, plus any extra currency the
 * account happens to hold: the client expects the complete list, not only the
 * ones the player owns.
 */
import { KARIDAMA_IDS } from './karidamaService.js';

export interface RigaPayment {
  mst_payment_id: number;
  amount: number;
}

type Voce = { mst_payment_id?: number | null; amount?: number | null };

export function saldiPayments(payments: Voce[] | undefined | null): RigaPayment[] {
  const posseduti = new Map<number, number>();
  for (const p of payments ?? []) {
    if (typeof p?.mst_payment_id === 'number') {
      posseduti.set(p.mst_payment_id, Number(p.amount ?? 0) || 0);
    }
  }

  const out: RigaPayment[] = KARIDAMA_IDS.map((id) => ({
    mst_payment_id: Number(id),
    amount: posseduti.has(Number(id)) ? posseduti.get(Number(id))! : 0,
  }));

  for (const [id, amount] of posseduti) {
    if (!(KARIDAMA_IDS as readonly number[]).includes(id)) {
      out.push({ mst_payment_id: id, amount });
    }
  }
  return out;
}

/** Plain-object copy for a whole-array dotted `$set`. */
export function paymentsDaSalvare(payments: Voce[] | undefined | null): RigaPayment[] {
  return (payments ?? [])
    .filter((p) => typeof p?.mst_payment_id === 'number')
    .map((p) => ({ mst_payment_id: Number(p.mst_payment_id), amount: Number(p.amount ?? 0) || 0 }));
}
