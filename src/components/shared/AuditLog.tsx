import type { ReviewEvent } from '@/types';
import { formatDateTime, snakeToTitle } from '@/lib/utils';

export function AuditLog({ events }: { events: ReviewEvent[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="font-medium text-gray-900">Activity log</h2>
      </div>
      <div className="p-5">
        {events.length === 0 ? (
          <p className="text-sm text-gray-400">No activity yet.</p>
        ) : (
          <ol className="relative border-l border-gray-200 space-y-4 ml-2">
            {events.map((event) => (
              <li key={event.id} className="ml-4">
                <div className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full border-2 border-white bg-gray-300" />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {snakeToTitle(event.event_type)}
                    </p>
                    {event.note && (
                      <p className="text-sm text-gray-600 mt-0.5">{event.note}</p>
                    )}
                    {event.actor_role && (
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">
                        by {event.actor_role}
                      </p>
                    )}
                  </div>
                  <time
                    dateTime={event.created_at}
                    className="text-xs text-gray-400 flex-shrink-0"
                  >
                    {formatDateTime(event.created_at)}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
