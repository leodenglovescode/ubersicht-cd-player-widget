import { React, css, run } from 'uebersicht'

export const refreshFrequency = 1000

export const command = `
INFO=$(osascript -e '
  try
    tell application "Music"
      if player state is playing or player state is paused then
        set trackName to name of current track
        set artistName to artist of current track
        set pPos to player position
        set pDur to duration of current track
        set pState to player state
        
        set hasArt to "false"
        try
          set theArt to raw data of artwork 1 of current track
          set fileName to "./music-cover.jpg"
          set outFile to open for access POSIX file fileName with write permission
          set eof outFile to 0
          write theArt to outFile
          close access outFile
          set hasArt to "true"
        on error
          try
            close access POSIX file fileName
          end try
        end try
        
        return trackName & "|" & artistName & "|" & pPos & "|" & pDur & "|" & pState & "|" & hasArt
      else
        return "Not Playing"
      end if
    end tell
  on error
    return "Error"
  end try
')

# If music is stopped or errored, exit early
if [[ "$INFO" == *"Not Playing"* ]] || [[ "$INFO" == *"Error"* ]]; then
  echo "$INFO"
  exit 0
fi

# Split the output safely
IFS='|' read -r tName tArtist pPos pDur pState hasArt <<< "$INFO"

# If AppleScript found local art, exit early and pass it to the UI
if [[ "$hasArt" == "true" ]]; then
  echo "$INFO"
  exit 0
fi

# --- GFW / PROXY CONFIGURATION ---
PROXY_URL=""

# --- API Cache Check ---
CACHE_FILE="./music-cache.txt"
CACHED_TRACK=$(cat "$CACHE_FILE" 2>/dev/null)
CURRENT_TRACK_KEY="$tName|$tArtist"

if [[ "$CACHED_TRACK" == "$CURRENT_TRACK_KEY" ]]; then
  if [[ -s "./music-cover.jpg" ]]; then
    echo "$tName|$tArtist|$pPos|$pDur|$pState|true"
  else
    echo "$tName|$tArtist|$pPos|$pDur|$pState|false"
  fi
  exit 0
fi

# New streaming track detected!
echo "$CURRENT_TRACK_KEY" > "$CACHE_FILE"

# 1. Safely URL-encode
QUERY=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1]))" "$tName $tArtist")

# 2. Fetch API via Proxy
API_RES=$(curl -s --connect-timeout 5 -x "$PROXY_URL" "https://itunes.apple.com/search?term=$QUERY&entity=song&limit=1")

# 3. Extract high-res URL
ART_URL=$(echo "$API_RES" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['results'][0]['artworkUrl100'].replace('100x100bb', '600x600bb') if data.get('results') else '')" 2>/dev/null)

# 4. Download the actual image directly via proxy
if [[ -n "$ART_URL" ]]; then
  curl -s --connect-timeout 5 -x "$PROXY_URL" -o "./music-cover.jpg" "$ART_URL"
  echo "$tName|$tArtist|$pPos|$pDur|$pState|true"
else
  rm -f "./music-cover.jpg"
  echo "$tName|$tArtist|$pPos|$pDur|$pState|false"
fi
`

export const className = css`
  position: fixed;
  top: 240px;
  right: 30px;
  z-index: 999;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto;
  user-select: none;
  pointer-events: auto;
`

const runAppleScript = (script) => {
  run(script).catch((error) => console.error(error))
}

const handlePlayPause = () => {
  runAppleScript(`osascript -e 'tell application "Music" to playpause'`)
}

const handleNext = () => {
  runAppleScript(`osascript -e 'tell application "Music" to next track'`)
}

const handlePrevious = () => {
  runAppleScript(`osascript -e 'tell application "Music" to previous track'`)
}

const handleVolume = (direction) => {
  const delta = direction === 'up' ? 5 : -5
  runAppleScript(`osascript -e 'set vol to (output volume of (get volume settings)); set newVol to vol + ${delta}; if newVol > 100 then set newVol to 100; if newVol < 0 then set newVol to 0; set volume output volume newVol'`)
}

const formatTime = (seconds) => {
  const sec = Math.floor(parseFloat(seconds) || 0)
  const mins = Math.floor(sec / 60)
  const secs = sec % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const getColorFromText = (text) => {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i)
    hash = hash & hash
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 75%, 50%)`
}

export const render = ({ output }) => {
  let trackName = "Not Playing"
  let artist = "No Artist"
  let isPlaying = false
  let currentTime = "0:00"
  let duration = "0:00"
  let hasArtwork = false
  let accentColor = '#FF006E'

  if (output) {
    const cleanOutput = output.trim()
    if (!cleanOutput.includes("Error") && !cleanOutput.includes("Not Playing")) {
      const parts = cleanOutput.split("|")
      if (parts.length >= 6) {
        trackName = parts[0].trim()
        artist = parts[1].trim()
        currentTime = formatTime(parts[2])
        duration = formatTime(parts[3])
        isPlaying = parts[4].toLowerCase().trim() === "playing"
        hasArtwork = parts[5].trim() === "true"
        accentColor = getColorFromText(trackName)
      }
    }
  }

  // Load the image directly from the widget's own folder
  const finalImageUrl = hasArtwork 
    ? `music-cover.jpg?t=${encodeURIComponent(trackName)}` 
    : null;

  return (
    <>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        /* Drops down from the top */
        @keyframes slideDownIn {
          0% { 
            transform: translateY(-50px); 
            opacity: 0; 
          }
          100% { 
            transform: translateY(0); 
            opacity: 1; 
          }
        }

        /* Slides back up to the top and disappears */
        @keyframes slideUpOut {
          0% { 
            transform: translateY(0); 
            opacity: 1; 
          }
          100% { 
            transform: translateY(-50px); 
            opacity: 0; 
          }
        }

        button {
          -webkit-app-region: no-drag;
        }
      `}</style>
      <div style={{
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '24px',
        padding: '28px',
        width: '280px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        color: '#000',
      }}>
        {/* CD Section */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: '24px',
        }}>
          
          {/* SLIDE ANIMATION WRAPPER */}
          <div 
            key={trackName} 
            style={{
              // Triggers drop-in when playing, and slide-up when stopped
              animation: trackName !== "Not Playing" 
                ? 'slideDownIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards' 
                : 'slideUpOut 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              marginBottom: '20px',
              // Failsafe to keep it hidden if stopped
              opacity: trackName === "Not Playing" ? 0 : 1,
            }}
          >
            {/* SPIN ANIMATION WRAPPER */}
            <div style={{
              position: 'relative',
              width: '142px',
              height: '142px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: isPlaying ? 'spin 3s linear infinite' : 'none',
            }}>
              {/* Album Art Circle (Border added, outer pink background removed) */}
              <div style={{
                width: '140px',
                height: '140px',
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${accentColor}, ${accentColor}88)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '56px',
                fontWeight: 'bold',
                color: 'white',
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                overflow: 'hidden',
                border: '1px solid rgba(0, 0, 0, 0.15)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              }}>
                {finalImageUrl ? (
                  <img 
                    src={finalImageUrl} 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    alt="Album Art"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                ) : (
                  trackName.charAt(0).toUpperCase()
                )}
              </div>

              {/* CD Center Hole */}
              <div style={{
                position: 'absolute',
                width: '19px',
                height: '19px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.2)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: '1px solid rgba(0,0,0,0.5)',
                boxShadow: '0 3px 8px rgba(0, 0, 0, 0.6), inset 0 1px 4px rgba(255, 255, 255, 0.3)',
                zIndex: 2,
              }} />
            </div>
          </div>

          {/* Track Info */}
          <div style={{
            textAlign: 'center',
            marginBottom: '16px',
            width: '100%',
          }}>
            <div style={{
              fontSize: '16px',
              fontWeight: '600',
              color: '#000',
              marginBottom: '4px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {trackName}
            </div>
            <div style={{
              fontSize: '13px',
              color: 'rgba(0, 0, 0, 0.6)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {artist}
            </div>
          </div>

          {/* Time */}
          <div style={{
            fontSize: '12px',
            color: 'rgba(0, 0, 0, 0.5)',
            fontWeight: '500',
            marginBottom: '16px',
            letterSpacing: '0.5px',
          }}>
            {currentTime} / {duration}
          </div>
        </div>

        {/* Controls */}
        <div style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '12px',
        }}>
          <button 
            onClick={handlePrevious}
            style={{
              flex: 1,
              padding: '10px 12px',
              background: 'rgba(0, 0, 0, 0.08)',
              border: 'none',
              color: '#000',
              borderRadius: '12px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
              transition: 'all 0.25s',
            }}
            onMouseEnter={(e) => e.target.style.background = 'rgba(0, 0, 0, 0.12)'}
            onMouseLeave={(e) => e.target.style.background = 'rgba(0, 0, 0, 0.08)'}
          >
            ⏮ Back
          </button>
          
          <button 
            onClick={handlePlayPause}
            style={{
              flex: 1,
              padding: '10px 12px',
              background: accentColor,
              border: 'none',
              color: 'white',
              borderRadius: '12px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '700',
              transition: 'all 0.25s',
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.8'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            {isPlaying ? "⏸ Pause" : "▶ Play"}
          </button>
          
          <button 
            onClick={handleNext}
            style={{
              flex: 1,
              padding: '10px 12px',
              background: 'rgba(0, 0, 0, 0.08)',
              border: 'none',
              color: '#000',
              borderRadius: '12px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
              transition: 'all 0.25s',
            }}
            onMouseEnter={(e) => e.target.style.background = 'rgba(0, 0, 0, 0.12)'}
            onMouseLeave={(e) => e.target.style.background = 'rgba(0, 0, 0, 0.08)'}
          >
            Next ⏭
          </button>
        </div>

        {/* Volume */}
        <div style={{
          display: 'flex',
          gap: '8px',
        }}>
          <button 
            onClick={() => handleVolume('down')}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: 'rgba(0, 0, 0, 0.08)',
              border: 'none',
              color: '#000',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.25s',
            }}
            onMouseEnter={(e) => e.target.style.background = 'rgba(0, 0, 0, 0.12)'}
            onMouseLeave={(e) => e.target.style.background = 'rgba(0, 0, 0, 0.08)'}
          >
            🔉
          </button>
          <button 
            onClick={() => handleVolume('up')}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: 'rgba(0, 0, 0, 0.08)',
              border: 'none',
              color: '#000',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.25s',
            }}
            onMouseEnter={(e) => e.target.style.background = 'rgba(0, 0, 0, 0.12)'}
            onMouseLeave={(e) => e.target.style.background = 'rgba(0, 0, 0, 0.08)'}
          >
            🔊
          </button>
        </div>
      </div>
    </>
  )
}