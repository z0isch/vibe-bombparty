import React from 'react';

interface FailedTrigramProps {
  trigram: string;
  examples: string[];
}

export function FailedTrigram({ trigram, examples }: FailedTrigramProps) {
  if (examples.length === 0) return null;

  return (
    <div className="bg-blue-900/20 border border-blue-500/50 rounded-lg p-4">
      <span className="text-blue-400 font-medium">{trigram}</span>:{' '}
      <div className="inline-flex gap-1 flex-wrap">
        {examples.map((word, index) => (
          <a
            key={index}
            href={`https://www.oed.com/search/dictionary/?q=${word.toLowerCase()}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-200 px-3 py-1 rounded hover:bg-blue-800/40 transition-colors cursor-pointer inline-flex items-center gap-1"
          >
            {word}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 opacity-75"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
            </svg>
          </a>
        ))}
      </div>
    </div>
  );
}
