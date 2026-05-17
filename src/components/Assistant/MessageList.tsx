import { SearchResultItem } from '../Search/SearchResult';
import { AssistantMessage } from '../../store';

interface Props {
  messages: AssistantMessage[];
}

export function MessageList({ messages }: Props) {
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
        Posez une question sur vos fichiers…
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-4 p-4">
      {messages.map((msg) => (
        <div key={msg.createdAt} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          {msg.role === 'user' ? (
            <div className="max-w-xs px-3 py-2 bg-indigo-600 rounded-2xl rounded-tr-sm text-sm text-white">
              {msg.content}
            </div>
          ) : (
            <div className="flex-1 space-y-2">
              {msg.content && (
                <div className="px-3 py-2 bg-zinc-800 rounded-2xl rounded-tl-sm text-sm text-zinc-200">
                  {msg.content}
                </div>
              )}
              {msg.files.length > 0 && (
                <div className="space-y-1">
                  {msg.files.map((f) => (
                    <SearchResultItem
                      key={f.id}
                      result={{
                        id: f.id,
                        name: f.name,
                        path: f.path,
                        category: f.category ?? 'other',
                        subcategory: f.subcategory ?? '',
                        tags: [],
                        year: 0,
                        score: 0,
                      }}
                      isSelected={false}
                      query=""
                      onClick={() => {}}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
