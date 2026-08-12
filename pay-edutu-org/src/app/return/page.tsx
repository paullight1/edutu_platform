import { redirect } from 'next/navigation';

// Provider returns are display-only. The canonical billing API and its webhook
// processor own all payment and entitlement state.
export default function ReturnPage() {
  redirect('/result');
}
