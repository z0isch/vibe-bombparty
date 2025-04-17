import React from 'react';

interface CircularCountdownProps {
  timeLeft: number;
  totalTime: number;
}

export function CircularCountdown({ timeLeft, totalTime }: CircularCountdownProps) {
  const radius = 25;
  const circumference = 2 * Math.PI * radius;
  const progress = (timeLeft / totalTime) * circumference;
  const isLowTime = timeLeft <= 3;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg className="transform -rotate-90 w-20 h-20">
        {/* Background circle */}
        <circle
          cx="40"
          cy="40"
          r={radius}
          className="stroke-gray-700"
          strokeWidth="6"
          fill="transparent"
        />
        {/* Progress circle */}
        <circle
          cx="40"
          cy="40"
          r={radius}
          className={`${
            isLowTime ? 'stroke-red-500' : 'stroke-blue-500'
          } transition-all duration-1000`}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          fill="transparent"
          strokeLinecap="round"
        />
      </svg>
      {/* Centered time text */}
      <div
        className={`absolute font-mono text-2xl ${isLowTime ? 'text-red-500' : 'text-gray-300'}`}
      >
        {timeLeft}
      </div>
    </div>
  );
}
