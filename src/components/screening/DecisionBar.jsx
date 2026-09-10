import { useState } from 'react';
import { Check, Flag, X, Loader2 } from 'lucide-react';

/** Officer decision buttons shown on the results screen. */
export default function DecisionBar({ recommendation, onDecide, busy }) {
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(null);
  const decide = async (d) => { setPending(d); try { await onDecide({ decision: d, note }); } finally { setPending(null); } };
  const Btn = ({ d, cls, icon: Icon, label }) => (
    <button type="button" className={`${cls} w-full`} disabled={busy} onClick={() => decide(d)}>
      {pending === d ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}{label}{recommendation === d && <span className="ml-1 rounded bg-white/25 px-1 text-[10px] uppercase">suggested</span>}
    </button>
  );
  return (
    <div className="space-y-2">
      <Btn d="accept" cls="btn-success" icon={Check} label="Accept" />
      <Btn d="flag" cls="btn-warn" icon={Flag} label="Flag for review" />
      <Btn d="reject" cls="btn-danger" icon={X} label="Reject" />
      <input className="input min-h-10 text-xs" placeholder="Officer note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
    </div>
  );
}
