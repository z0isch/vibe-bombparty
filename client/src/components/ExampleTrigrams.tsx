interface ExampleTrigramsProps {
  trigramExamples: {
    trigram: string;
    exampleWords: string[];
    validWords: { word: string; roundNumber: number }[];
  }[];
}

export function ExampleTrigrams({ trigramExamples }: ExampleTrigramsProps) {
  if (!trigramExamples || trigramExamples.length === 0) return null;

  // Show only the first 3 examples by default
  const visibleExamples = trigramExamples.slice(0, 3);
  const hasMoreExamples = trigramExamples.length > 3;

  return (
    <div className="bg-blue-900/20 border border-blue-500/50 rounded-lg p-3">
      <div className="space-y-3">
        {visibleExamples.map((example, exampleIndex) => {
          const mostRecent =
            example.validWords && example.validWords.length > 0 ? example.validWords[0] : null;
          return (
            <div
              key={exampleIndex}
              className="border-t border-blue-500/30 pt-3 first:border-t-0 first:pt-0"
            >
              <div className="text-blue-400 font-medium text-xs mb-1.5">{example.trigram}</div>
              {mostRecent && (
                <div className="mb-2">
                  <a
                    href={`https://www.merriam-webster.com/dictionary/${mostRecent.word.toLowerCase()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-200 text-xs px-2 py-1 rounded hover:bg-green-800/40 transition-colors cursor-pointer flex items-center justify-between group"
                  >
                    <span>{mostRecent.word}</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                      <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                    </svg>
                  </a>
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                {example.exampleWords.map((word, wordIndex) => (
                  <a
                    key={wordIndex}
                    href={`https://www.merriam-webster.com/dictionary/${word.toLowerCase()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-200 text-xs px-2 py-1 rounded hover:bg-blue-800/40 transition-colors cursor-pointer flex items-center justify-between group"
                  >
                    <span>{word}</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity"
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
        })}
      </div>
      {hasMoreExamples && (
        <div className="mt-3 pt-3 border-t border-blue-500/30 text-center">
          <button
            onClick={() => {
              const container = document.querySelector('.trigram-history-modal');
              if (container) {
                container.classList.remove('hidden');
              }
            }}
            className="text-blue-400 text-xs hover:text-blue-300 transition-colors"
          >
            View History ({trigramExamples.length - 3} more)
          </button>
        </div>
      )}

      {/* Modal for full history */}
      <div
        className="trigram-history-modal hidden fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]"
        onClick={(e) => {
          // Only close if clicking the overlay itself, not its children
          if (e.target === e.currentTarget) {
            const container = document.querySelector('.trigram-history-modal');
            if (container) {
              container.classList.add('hidden');
            }
          }
        }}
      >
        <div className="bg-gray-900 rounded-lg p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto relative z-[99999]">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-white">Trigram History</h3>
            <button
              onClick={() => {
                const container = document.querySelector('.trigram-history-modal');
                if (container) {
                  container.classList.add('hidden');
                }
              }}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div className="space-y-4">
            {trigramExamples.map((example, exampleIndex) => {
              const mostRecent =
                example.validWords && example.validWords.length > 0 ? example.validWords[0] : null;
              return (
                <div
                  key={exampleIndex}
                  className="border-t border-blue-500/30 pt-4 first:border-t-0 first:pt-0"
                >
                  <div className="text-blue-400 font-medium text-sm mb-2">{example.trigram}</div>
                  {mostRecent && (
                    <div className="mb-3">
                      <a
                        href={`https://www.merriam-webster.com/dictionary/${mostRecent.word.toLowerCase()}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-200 text-sm px-2 py-1 rounded hover:bg-green-800/40 transition-colors cursor-pointer flex items-center justify-between group"
                      >
                        <span>{mostRecent.word}</span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                        </svg>
                      </a>
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    {example.exampleWords.map((word, wordIndex) => (
                      <a
                        key={wordIndex}
                        href={`https://www.merriam-webster.com/dictionary/${word.toLowerCase()}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-200 text-sm px-2 py-1 rounded hover:bg-blue-800/40 transition-colors cursor-pointer flex items-center justify-between group"
                      >
                        <span>{word}</span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity"
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
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
