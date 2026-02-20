import React, { useState, useEffect } from 'react';
import './CommandMessage.css';

// ── Dice Roll ──────────────────────────────────────────────────
function RollMessage({ data }) {
  const [animating, setAnimating] = useState(true);
  const [displayNum, setDisplayNum] = useState(1);

  useEffect(() => {
    if (!animating) return;
    let frame = 0;
    const totalFrames = 20;
    const interval = setInterval(() => {
      setDisplayNum(Math.floor(Math.random() * data.sides) + 1);
      frame++;
      if (frame >= totalFrames) {
        clearInterval(interval);
        setDisplayNum(data.result);
        setAnimating(false);
      }
    }, 75);
    return () => clearInterval(interval);
  }, [animating, data.sides, data.result]);

  return (
    <div className="cmd-message cmd-roll">
      <div className="cmd-roll-dice">
        <span className="cmd-roll-icon">🎲</span>
        <span className="cmd-roll-label">d{data.sides}</span>
      </div>
      <div className={`cmd-roll-result ${animating ? 'animating' : 'final'}`}>
        {displayNum}
      </div>
    </div>
  );
}

// ── Coin Flip ──────────────────────────────────────────────────
function CoinflipMessage({ data }) {
  const [animating, setAnimating] = useState(true);
  const [displaySide, setDisplaySide] = useState('heads');

  useEffect(() => {
    if (!animating) return;
    let frame = 0;
    const totalFrames = 12;
    const interval = setInterval(() => {
      setDisplaySide(frame % 2 === 0 ? 'heads' : 'tails');
      frame++;
      if (frame >= totalFrames) {
        clearInterval(interval);
        setDisplaySide(data.result);
        setAnimating(false);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [animating, data.result]);

  return (
    <div className="cmd-message cmd-coinflip">
      <div className={`cmd-coin ${animating ? 'flipping' : ''}`}>
        {displaySide === 'heads' ? '👑' : '🪙'}
      </div>
      <div className={`cmd-coinflip-result ${animating ? '' : 'visible'}`}>
        {data.result === 'heads' ? 'Heads!' : 'Tails!'}
      </div>
    </div>
  );
}

// ── Magic 8-Ball ───────────────────────────────────────────────
function EightBallMessage({ data }) {
  return (
    <div className="cmd-message cmd-8ball">
      <div className="cmd-8ball-question">"{data.question}"</div>
      <div className="cmd-8ball-answer">
        <span className="cmd-8ball-icon">🎱</span>
        <span>{data.answer}</span>
      </div>
    </div>
  );
}

// ── Choose ─────────────────────────────────────────────────────
function ChooseMessage({ data }) {
  return (
    <div className="cmd-message cmd-choose">
      <div className="cmd-choose-options">
        {data.options.map((opt, i) => (
          <span key={i} className={`cmd-choose-option ${opt === data.result ? 'chosen' : ''}`}>
            {opt}
          </span>
        ))}
      </div>
      <div className="cmd-choose-result">
        I choose: <strong>{data.result}</strong>
      </div>
    </div>
  );
}

// ── Rock Paper Scissors ────────────────────────────────────────
const RPS_EMOJI = { rock: '🪨', paper: '📄', scissors: '✂️' };
const RPS_RESULT = { win: 'You win!', lose: 'You lose!', tie: "It's a tie!" };

function RPSMessage({ data }) {
  return (
    <div className="cmd-message cmd-rps">
      <div className="cmd-rps-matchup">
        <div className="cmd-rps-choice">
          <span className="cmd-rps-emoji">{RPS_EMOJI[data.userChoice]}</span>
          <span className="cmd-rps-label">You</span>
        </div>
        <span className="cmd-rps-vs">vs</span>
        <div className="cmd-rps-choice">
          <span className="cmd-rps-emoji">{RPS_EMOJI[data.botChoice]}</span>
          <span className="cmd-rps-label">Bot</span>
        </div>
      </div>
      <div className={`cmd-rps-result ${data.result}`}>
        {RPS_RESULT[data.result]}
      </div>
    </div>
  );
}

// ── Server Info ────────────────────────────────────────────────
function ServerInfoMessage({ data }) {
  return (
    <div className="cmd-message cmd-serverinfo">
      <div className="cmd-serverinfo-title">{data.name}</div>
      <div className="cmd-serverinfo-grid">
        <div className="cmd-serverinfo-stat">
          <span className="cmd-stat-label">Members</span>
          <span className="cmd-stat-value">{data.memberCount}</span>
        </div>
        <div className="cmd-serverinfo-stat">
          <span className="cmd-stat-label">Channels</span>
          <span className="cmd-stat-value">{data.channelCount}</span>
        </div>
        <div className="cmd-serverinfo-stat">
          <span className="cmd-stat-label">Roles</span>
          <span className="cmd-stat-value">{data.roleCount}</span>
        </div>
      </div>
    </div>
  );
}

// ── Remind Me ──────────────────────────────────────────────────
function RemindMeMessage({ data }) {
  const formatDuration = (dur) => {
    const units = { w: 'week', d: 'day', h: 'hour', m: 'minute', s: 'second' };
    const match = dur.match(/^(\d+)([smhdw])$/i);
    if (!match) return dur;
    const [, num, unit] = match;
    const label = units[unit.toLowerCase()] || unit;
    return `${num} ${label}${parseInt(num) !== 1 ? 's' : ''}`;
  };

  return (
    <div className="cmd-message cmd-remindme">
      <div className="cmd-remindme-header">
        <span className="cmd-remindme-icon">⏰</span>
        <span>Reminder set for {formatDuration(data.duration)}</span>
      </div>
      <div className="cmd-remindme-message">"{data.message}"</div>
    </div>
  );
}

// ── Poll ───────────────────────────────────────────────────────
function PollMessage({ data, message, socket, currentUser }) {
  const totalVotes = Object.values(data.votes || {}).reduce((sum, arr) => sum + arr.length, 0);
  const userVoteEntry = Object.entries(data.votes || {}).find(([, voters]) => voters.includes(currentUser?.id));
  const userVoteIndex = userVoteEntry ? parseInt(userVoteEntry[0]) : -1;

  const handleVote = (optionIndex) => {
    if (!socket || !currentUser) return;
    socket.emit('poll:vote', { channelId: message.channelId, messageId: message.id, optionIndex });
  };

  return (
    <div className="cmd-message cmd-poll">
      <div className="cmd-poll-header">
        <span className="cmd-poll-icon">📊</span>
        <span className="cmd-poll-question">{data.question}</span>
      </div>
      <div className="cmd-poll-options">
        {data.options.map((option, i) => {
          const voteCount = (data.votes?.[i] || []).length;
          const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
          const isSelected = userVoteIndex === i;

          return (
            <button
              key={i}
              className={`cmd-poll-option ${isSelected ? 'selected' : ''}`}
              onClick={() => handleVote(i)}
            >
              <div className="cmd-poll-bar" style={{ width: `${percentage}%` }} />
              <span className="cmd-poll-option-text">{option}</span>
              <span className="cmd-poll-option-count">{voteCount} ({percentage}%)</span>
            </button>
          );
        })}
      </div>
      <div className="cmd-poll-footer">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</div>
    </div>
  );
}

// ── Criticize / Daily Roast ────────────────────────────────────
function CriticizeMessage({ data }) {
  const isStart = data.action === 'start';
  const isStop = data.action === 'stop';
  const isDaily = data.action === 'daily';

  return (
    <div className={`cmd-message cmd-criticize ${isDaily ? 'daily' : ''}`}>
      <div className="cmd-criticize-header">
        <span className="cmd-criticize-icon">{isStop ? '🔇' : '🔥'}</span>
        <span className="cmd-criticize-target">{data.target}</span>
        {isStart && <span className="cmd-criticize-badge">Daily Roast</span>}
        {isStop && <span className="cmd-criticize-badge stop">Stopped</span>}
      </div>
      {(isStart || isDaily) && data.roast && (
        <div className="cmd-criticize-roast">{data.roast}</div>
      )}
      {isStart && (
        <div className="cmd-criticize-footer">Run /criticize {data.target} again to stop</div>
      )}
    </div>
  );
}

// ── Main CommandMessage ────────────────────────────────────────
function CommandMessage({ commandData, message, socket, currentUser, server }) {
  if (!commandData) return null;

  switch (commandData.type) {
    case 'roll': return <RollMessage data={commandData} />;
    case 'coinflip': return <CoinflipMessage data={commandData} />;
    case '8ball': return <EightBallMessage data={commandData} />;
    case 'choose': return <ChooseMessage data={commandData} />;
    case 'rps': return <RPSMessage data={commandData} />;
    case 'serverinfo': return <ServerInfoMessage data={commandData} />;
    case 'remindme': return <RemindMeMessage data={commandData} />;
    case 'poll': return <PollMessage data={commandData} message={message} socket={socket} currentUser={currentUser} />;
    case 'criticize': return <CriticizeMessage data={commandData} />;
    case 'quack': return null; // Image shown via attachments
    default: return null;
  }
}

export default React.memo(CommandMessage);
