import { useEffect, useState } from 'react';
import { Check, Flag, X, Loader2 } from 'lucide-react';
import { Kbd, AiDecisionBadge } from '../ui/index.jsx';
import { cx } from '../../lib/format.js';

/**
 * Officer decision buttons. Keyboard: A / F / R. Sticky at the bottom on small screens.
 * `recommendation` is the legacy accept|flag|reject suggestion; `aiDecision` the four-way AI recommendation.
 * The officer's choice is always recorded separately from the AI recommendation.
 */
export default function DecisionBar({ recommendation, aiDecision, onDecide, busy, sticky = true }) {
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const decide = async (d) => {
    if (busy || pending) return;
    if (d === 'reject' && confirm !== 'reject') { setConfirm('reject'); setTimeout(() => setConfirm(null), 3000); return; }
    setPending(d); setConfirm(null);
    try { await onDecide({ decision: d, note }); } finally { setPending(null); }
  };

  useEffect(() => {
    const fn = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const map = { a: 'accept', f: 'flag', r: 'reject' };
      if (map[e.key]) decide(map[e.key]);
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const Btn = ({ d, cls, icon: Icon, label, k }) => (
    <button type="button" className={cx(cls, 'w-full justify-between')} disabled={busy} onClick={() => decide(d)}>
      <span className="flex items-center gap-2">{pending === d ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}{confirm === d ? 'Tap again to confirm' : label}</span>
      <span className="flex items-center gap-1">{recommendation === d && <span className="rounded bg-white/25 px-1 text-[10px] uppercase">suggested</span>}<Kbd>{k}</Kbd></span>
    </button>
  );

  const body = (
    <div className="space-y-2" role="group" aria-labelledby="officer-decision-heading">
      <div className="flex items-center justify-between gap-2">
        <p id="officer-decision-heading" className="text-[11px] font-semibold uppercase tracking-wider faint">Officer decision</p>
        {aiDecision && <AiDecisionBadge decision={aiDecision} prefix="AI:" />}
      </div>
      <Btn d="accept" cls="btn-success" icon={Check} label="Accept" k="A" />
      <Btn d="flag" cls="btn-warn" icon={Flag} label="Flag for review" k="F" />
      <Btn d="reject" cls="btn-danger" icon={X} label="Reject" k="R" />
      <input className="input min-h-10 text-xs" placeholder={recommendation ? 'Officer note — required reason if overriding the AI recommendation' : 'Officer note (optional)'} aria-label="Officer note" value={note} onChange={(e) => setNote(e.target.value)} />
      {recommendation && <p className="text-[11px] faint">Choosing anything other than the suggested option records an officer override; add the reason in the note.</p>}
    </div>
  );

  if (!sticky) return body;
  return (
    <>
      <div className="hidden lg:block">{body}</div>
      <div className="no-print fixed inset-x-0 bottom-16 z-20 border-t divider glass p-3 lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-3 gap-2">
          <button className="btn-success" disabled={busy} onClick={() => decide('accept')}>{pending === 'accept' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Accept</button>
          <button className="btn-warn" disabled={busy} onClick={() => decide('flag')}>{pending === 'flag' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}Flag</button>
          <button className="btn-danger" disabled={busy} onClick={() => decide('reject')}>{pending === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}{confirm === 'reject' ? 'Confirm' : 'Reject'}</button>
        </div>
      </div>
    </>
  );
}
