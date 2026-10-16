import type { ReactNode } from 'react';
import { Coins, FolderOpen, Gauge, Paperclip, RotateCcw, ScrollText, ShieldCheck, ShieldOff, Sparkles } from 'lucide-react';
import type { MessageRecord } from '../../../types/database';
import { EFFORT_LABEL, baseName, formatCredits, formatTokens } from './workSummary';

function Chip({ icon, children, title, isLight }: { icon: ReactNode; children: ReactNode; title?: string; isLight: boolean }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] border max-w-full ${
        isLight ? 'bg-white border-slate-200 text-slate-600' : 'bg-white/[0.025] border-white/[0.06] text-slate-400'
      }`}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Baris info eksekusi di kaki panel "Proses kerja": folder, izin, penalaran, pemakaian, dan tombol log CLI. */
export function RunInfoChips({
  msg,
  isLight,
  showLogs,
  onToggleLogs,
}: {
  msg: MessageRecord;
  isLight: boolean;
  showLogs: boolean;
  onToggleLogs: () => void;
}) {
  const info = msg.runInfo;
  const usage = msg.usage;
  const logs = msg.logs || [];
  const usageText = usage
    ? [
        usage.inputTokens + usage.outputTokens > 0 ? `${formatTokens(usage.inputTokens)} masuk · ${formatTokens(usage.outputTokens)} keluar` : '',
        usage.credits ? formatCredits(usage.credits) : '',
        usage.costUsd ? `$${usage.costUsd.toFixed(4)}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {info?.workspace && (
        <Chip isLight={isLight} title={info.workspace} icon={<FolderOpen className="w-3 h-3" />}>
          {baseName(info.workspace)}
        </Chip>
      )}
      {info?.permission && (
        <Chip
          isLight={isLight}
          title={info.permission === 'safe' ? 'Edit berkas diizinkan; aksi berisiko (mis. perintah shell) bisa ditolak oleh CLI' : 'Semua aksi diizinkan tanpa konfirmasi'}
          icon={info.permission === 'safe' ? <ShieldCheck className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
        >
          {info.permission === 'safe' ? 'Mode aman' : 'Otonom'}
        </Chip>
      )}
      {info?.effort && (
        <Chip isLight={isLight} title="Kedalaman penalaran Chat GUI" icon={<Gauge className="w-3 h-3" />}>
          Penalaran {EFFORT_LABEL[info.effort]}
        </Chip>
      )}
      {!!info?.attachmentCount && (
        <Chip isLight={isLight} icon={<Paperclip className="w-3 h-3" />}>
          {info.attachmentCount} lampiran dibaca agen
        </Chip>
      )}
      {info?.resumedSession && (
        <Chip isLight={isLight} title={`ID sesi CLI: ${info.resumedSession}`} icon={<RotateCcw className="w-3 h-3" />}>
          Melanjutkan sesi
        </Chip>
      )}
      {info?.fallback && (
        <Chip isLight={isLight} title={info.fallbackReason} icon={<Sparkles className="w-3 h-3" />}>
          Mode cadangan lokal
        </Chip>
      )}
      {usageText && (
        <Chip
          isLight={isLight}
          title={
            usage?.credits
              ? `Kredit terpakai pada giliran ini (dilaporkan CLI): ${usage.credits}. Ini pemakaian, bukan sisa kuota.`
              : `${usage!.inputTokens.toLocaleString('id-ID')} token masuk · ${usage!.outputTokens.toLocaleString('id-ID')} token keluar`
          }
          icon={<Coins className="w-3 h-3" />}
        >
          {usageText}
        </Chip>
      )}
      {logs.length > 0 && (
        <button
          type="button"
          onClick={onToggleLogs}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] border cursor-pointer transition-colors ${
            isLight ? 'border-slate-200 text-slate-600 hover:bg-white' : 'border-white/[0.06] text-slate-400 hover:bg-white/[0.04]'
          }`}
        >
          <ScrollText className="w-3 h-3" />
          {showLogs ? 'Sembunyikan log' : `Log CLI (${logs.length})`}
        </button>
      )}
    </div>
  );
}
