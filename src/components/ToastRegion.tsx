import { Check } from 'lucide-react';

export interface ToastMessage {
  id: number;
  title: string;
  detail: string;
}

interface ToastRegionProps {
  messages: ToastMessage[];
}

export function ToastRegion({ messages }: ToastRegionProps) {
  return (
    <div className="toast-region" aria-live="polite" aria-atomic="false">
      {messages.map((message) => (
        <div className="toast" key={message.id} role="status">
          <span className="toast__icon" aria-hidden="true"><Check size={14} /></span>
          <span>
            <strong>{message.title}</strong>
            <small>{message.detail}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

