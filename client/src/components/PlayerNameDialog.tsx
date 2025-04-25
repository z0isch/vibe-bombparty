import { useEffect, useState } from 'react';

import * as moduleBindings from '../generated';

interface PlayerNameDialogProps {
  conn: moduleBindings.DbConnection;
  onClose: () => void;
}

export function PlayerNameDialog({ conn, onClose }: PlayerNameDialogProps) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Prevent scrolling of the background when modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent | undefined) => {
    e?.preventDefault();
    if (!conn) return;

    if (!username.trim()) {
      setError('Username cannot be empty');
      return;
    }

    try {
      await conn.reducers.registerPlayer(username.trim());
      onClose();
    } catch (error) {
      setError('Failed to set username. Please try again.');
      console.error('Failed to register player:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold mb-4">Choose Your Name</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="username" className="block text-sm font-medium mb-2">
              Username
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              placeholder="Enter your username"
              autoFocus
            />
            {error && <p className="mt-2 text-red-500 text-sm">{error}</p>}
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                // Set a default username
                const defaultUsername = `Player${Math.floor(Math.random() * 1000)}`;
                setUsername(defaultUsername);
              }}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
            >
              Random Name
            </button>
            <button type="submit" className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
