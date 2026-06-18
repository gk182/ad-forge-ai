'use client';

import { Search, PenTool, Mic, Video, Check, X, Loader2 } from 'lucide-react';
import type { PipelineStep, StepStatus } from '@/features/pipeline/pipeline.types';

interface PipelineStepperProps {
  steps: PipelineStep[];
}

const ICONS: Record<string, React.ReactNode> = {
  search: <Search className="w-5 h-5" />,
  'pen-tool': <PenTool className="w-5 h-5" />,
  mic: <Mic className="w-5 h-5" />,
  video: <Video className="w-5 h-5" />,
};

function getStatusStyles(status: StepStatus) {
  switch (status) {
    case 'completed':
      return {
        ring: 'border-[var(--success)] bg-[var(--success)]/10',
        icon: 'text-[var(--success)]',
        label: 'text-[var(--success)]',
        line: 'bg-[var(--success)]',
      };
    case 'active':
      return {
        ring: 'border-[var(--primary)] bg-[var(--primary)]/10 animate-pulse-glow',
        icon: 'text-[var(--primary)]',
        label: 'text-white',
        line: 'bg-[var(--border)]',
      };
    case 'error':
      return {
        ring: 'border-[var(--danger)] bg-[var(--danger)]/10',
        icon: 'text-[var(--danger)]',
        label: 'text-[var(--danger)]',
        line: 'bg-[var(--danger)]/30',
      };
    default:
      return {
        ring: 'border-[var(--border)] bg-transparent',
        icon: 'text-[var(--muted)]',
        label: 'text-[var(--muted)]',
        line: 'bg-[var(--border)]',
      };
  }
}

function StepIcon({ step }: { step: PipelineStep }) {
  if (step.status === 'completed') return <Check className="w-5 h-5" />;
  if (step.status === 'error') return <X className="w-5 h-5" />;
  if (step.status === 'active') return <Loader2 className="w-5 h-5 animate-spin" />;
  return ICONS[step.icon] || <Search className="w-5 h-5" />;
}

export function PipelineStepper({ steps }: PipelineStepperProps) {
  return (
    <div className="w-full">
      <div className="flex items-start justify-between relative">
        {steps.map((step, index) => {
          const styles = getStatusStyles(step.status);
          const isLast = index === steps.length - 1;

          return (
            <div key={step.id} className="flex flex-col items-center flex-1 relative">
              {!isLast && (
                <div className="absolute top-6 left-[calc(50%+20px)] right-[calc(-50%+20px)] h-[2px]">
                  <div className={`h-full rounded-full transition-all duration-500 ${styles.line}`} />
                </div>
              )}

              <div className={`relative z-10 w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${styles.ring}`}>
                <span className={`transition-colors duration-300 ${styles.icon}`}>
                  <StepIcon step={step} />
                </span>
              </div>

              <p className={`mt-3 text-xs font-medium text-center max-w-[100px] leading-tight transition-colors duration-300 ${styles.label}`}>
                {step.label}
              </p>

              {step.status === 'error' && step.error && (
                <p className="mt-1 text-[10px] text-[var(--danger)] text-center max-w-[120px] leading-tight">
                  {step.error}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

