import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import YouTube from "react-youtube";
import { scroller, Element } from "react-scroll";
import "./App.css";

const BACKEND_URL = "http://localhost:8000";

const App = () => {
  // State management
  const [videoUrl, setVideoUrl] = useState("");
  const [videoId, setVideoId] = useState("");
  const [captions, setCaptions] = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentCaptionIndex, setCurrentCaptionIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isRepeating, setIsRepeating] = useState(false);
  const [repeatSegment, setRepeatSegment] = useState(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [userScrolling, setUserScrolling] = useState(false);
  const [selectedLanguages, setSelectedLanguages] = useState({
    primary: 'english',
    secondary: 'vietnamese'
  });
  
  // Refs
  const playerRef = useRef(null);
  const intervalRef = useRef(null);
  const isSeekingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const captionsContainerRef = useRef(null);
  const repeatSegmentIndexRef = useRef(-1);

  // Extract video ID from URL
  const extractVideoId = (url) => {
    if (!url) return "";
    
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    
    return (match && match[2].length === 11) ? match[2] : "";
  };

  // Process URL input with debounce
  const handleUrlChange = (e) => {
    const url = e.target.value;
    setVideoUrl(url);
    
    // Extract ID immediately for better UX
    const id = extractVideoId(url);
    setVideoId(id);
  };

  // Fetch captions from backend API
  const getCaptions = async () => {
    if (!videoId) {
      setError("Vui lòng nhập URL YouTube hợp lệ");
      return;
    }
    
    setIsLoading(true);
    setError("");
    setCaptions([]);
    setIsRepeating(false);
    setRepeatSegment(null);
    repeatSegmentIndexRef.current = -1;
    
    try {
      // Updated to match your backend structure - using /captions endpoint
      const response = await fetch(`${BACKEND_URL}/captions?videoId=${videoId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Không tìm thấy phụ đề cho video này");
        } else if (response.status === 403) {
          throw new Error("Không có quyền truy cập video này");
        } else {
          throw new Error(`Lỗi máy chủ: ${response.status}`);
        }
      }
      
      const data = await response.json();
      
      if (data && data.captions && data.captions.length > 0) {
        setCaptions(data.captions);
      } else {
        setError("Không thể tìm thấy phụ đề cho video này");
      }
    } catch (error) {
      console.error("Lỗi khi tải phụ đề:", error);
      setError(`Lỗi khi tải phụ đề: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize player and time tracking
  const onReady = (event) => {
    playerRef.current = event.target;

    // Clear existing interval if any
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Set up new interval
    intervalRef.current = setInterval(() => {
      if (playerRef.current && !isSeekingRef.current) {
        const exactTime = playerRef.current.getCurrentTime();
        setCurrentTime(exactTime);
      }
    }, 100);
  };

  // Handle player state changes
  const onStateChange = (event) => {
    if (event.data === YouTube.PlayerState.PAUSED && isRepeating && repeatSegment) {
      // Small delay to check if pause was intentional
      setTimeout(() => {
        if (!playerRef.current) return;
        
        if (playerRef.current.getPlayerState() === YouTube.PlayerState.PAUSED) {
          // User intentionally paused, so disable repeat
          setIsRepeating(false);
          repeatSegmentIndexRef.current = -1;
          setRepeatSegment(null);
        } else {
          // Auto-pause from repeat, so continue repeating
          playerRef.current.seekTo(repeatSegment.start, true);
          playerRef.current.playVideo();
        }
      }, 300);
    }
  };
  
  // Enhanced scroll to caption
  const scrollToActiveCaption = useCallback((index) => {
    if (index < 0 || !autoScroll || userScrolling) return;
    
    // Only scroll in repeat mode if index matches the repeating segment
    if (isRepeating && index !== repeatSegmentIndexRef.current) return;
    
    // Clear any existing scroll timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    // Use react-scroll for smooth scrolling
    scroller.scrollTo(`caption-${index}`, {
      duration: 500,
      delay: 0,
      smooth: 'easeInOutQuart',
      containerId: 'captions-container',
      offset: -80
    });
  }, [autoScroll, userScrolling, isRepeating]);

  // Update current caption based on video time
  useEffect(() => {
    if (!captions.length || isSeekingRef.current || !playerRef.current) return;

    const index = captions.findIndex(
      (caption) =>
        currentTime >= caption.start &&
        currentTime < caption.start + caption.duration
    );

    // Update current caption based on time
    if (index !== -1 && index !== currentCaptionIndex) {
      // Only update if not in repeat mode or if in repeat mode and this is the repeating segment
      if (!isRepeating || (isRepeating && index === repeatSegmentIndexRef.current)) {
        setCurrentCaptionIndex(index);
        
        if (autoScroll && !userScrolling) {
          scrollToActiveCaption(index);
        }
      }
    }

    // Handle repeating logic
    if (isRepeating && repeatSegment) {
      const repeatEnd = repeatSegment.start + repeatSegment.duration;
      // Add a small buffer (0.1s) to prevent edge case issues
      if (currentTime >= repeatEnd - 0.1) {
        playerRef.current.seekTo(repeatSegment.start, true);
      }
    }
  }, [
    currentTime, 
    captions, 
    currentCaptionIndex, 
    isRepeating, 
    repeatSegment, 
    autoScroll, 
    userScrolling, 
    scrollToActiveCaption
  ]);

  // Detect user scrolling to pause auto-scroll
  useEffect(() => {
    const container = document.getElementById('captions-container');
    if (!container) return;

    const handleScroll = () => {
      setUserScrolling(true);
      
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      // Reset user scrolling flag after 2 seconds of inactivity
      scrollTimeoutRef.current = setTimeout(() => {
        setUserScrolling(false);
      }, 2000);
    };

    container.addEventListener('scroll', handleScroll);
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Handle caption click to enable repeating mode
  const handleCaptionClick = useCallback((caption, index) => {
    if (!playerRef.current) return;
    
    isSeekingRef.current = true;
    
    // Enable repeating for this segment
    setIsRepeating(true);
    setRepeatSegment(caption);
    setCurrentCaptionIndex(index);
    repeatSegmentIndexRef.current = index;
    
    // Seek to the beginning of the segment
    playerRef.current.seekTo(caption.start, true);
    playerRef.current.playVideo();
    
    // Scroll to the selected segment if auto-scroll is enabled
    if (autoScroll) {
      scrollToActiveCaption(index);
    }
    
    // Reset seeking flag after a short delay
    setTimeout(() => {
      isSeekingRef.current = false;
    }, 300);
  }, [playerRef, autoScroll, scrollToActiveCaption]);

  // Format time for display (seconds to MM:SS.MS)
  const formatTime = (seconds) => {
    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const ms = Math.floor((seconds - totalSeconds) * 10);
    
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  // Toggle repeat mode
  const toggleRepeat = useCallback(() => {
    if (!isRepeating && currentCaptionIndex !== -1) {
      // Enable repeat mode for current caption
      setIsRepeating(true);
      setRepeatSegment(captions[currentCaptionIndex]);
      repeatSegmentIndexRef.current = currentCaptionIndex;
    } else {
      // Disable repeat mode
      setIsRepeating(false);
      setRepeatSegment(null);
      repeatSegmentIndexRef.current = -1;
    }
  }, [isRepeating, currentCaptionIndex, captions]);

  // Toggle auto-scroll feature
  const toggleAutoScroll = useCallback(() => {
    setAutoScroll(prev => !prev);
  }, []);

  // Toggle language selection
  const toggleLanguage = useCallback((type, language) => {
    setSelectedLanguages(prev => ({
      ...prev,
      [type]: language
    }));
  }, []);

  // Add keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (!playerRef.current) return;
      
      switch (e.key) {
        case ' ': // Space bar
          if (playerRef.current.getPlayerState() === YouTube.PlayerState.PLAYING) {
            playerRef.current.pauseVideo();
          } else {
            playerRef.current.playVideo();
          }
          e.preventDefault();
          break;
        case 'r': // 'r' key for repeat
          toggleRepeat();
          break;
        case 's': // 's' key for scrolling
          toggleAutoScroll();
          break;
        default:
          break;
      }
    };
    
    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [toggleRepeat, toggleAutoScroll]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      // Clear all intervals and timeouts
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      // Reset refs
      playerRef.current = null;
      repeatSegmentIndexRef.current = -1;
    };
  }, []);

  // Get available languages from captions data
  const availableLanguages = useMemo(() => {
    if (!captions.length) return ['english', 'vietnamese'];
    
    // Get all unique language keys from the first caption
    return Object.keys(captions[0]).filter(key => 
      typeof captions[0][key] === 'string' && 
      key !== 'start' && 
      key !== 'duration'
    );
  }, [captions]);

  const handleLesson = (url) => {
    setVideoUrl(url);
    const id = extractVideoId(url);
    setVideoId(id);
    getCaptions();
  }

  return (
    <div className="container">
      <div className="input-section">
        <h1>Trình phát YouTube với phụ đề song ngữ</h1>
        <div className="input-group">
          <input
            type="text"
            value={videoUrl}
            onChange={handleUrlChange}
            placeholder="Nhập URL video YouTube"
            className="url-input"
          />
          <button 
            onClick={getCaptions} 
            disabled={isLoading || !videoId}
            className="submit-button"
          >
            {isLoading ? "Đang tải..." : "Lấy phụ đề"}
          </button>
        </div>
      </div>

      <div className="content">
        {/* Video section */}
        <div className="video-section">
          <h2>Video</h2>
          <div>
            <button onClick={() => handleLesson("https://www.youtube.com/watch?v=2f7ZhqYPl-0")}>Lesson: Level 1</button>
            <button onClick={() => handleLesson("https://www.youtube.com/watch?v=w2qNbNxEbhg")}>Lesson: Level 2</button>
            <button onClick={() => handleLesson("https://www.youtube.com/watch?v=tMKFLLyfonk")}>Lesson: Level 3</button>
            <button onClick={() => window.open("https://drive.google.com/file/d/0B-hTIM3aG_oJOVhCLUNSU1lxN00/edit?pref=2&pli=1&resourcekey=0-nNY5G_suRKyihly635uwwA", "_blank")}>
              Tài liệu TOEIC
            </button>
          </div>
          
          {videoId ? (
            <div className="video-wrapper">
              <YouTube
                videoId={videoId}
                onReady={onReady}
                onStateChange={onStateChange}
                opts={{ 
                  playerVars: { 
                    autoplay: 1, 
                    controls: 1,
                    modestbranding: 1,
                    rel: 0
                  } 
                }}
                className="youtube-player"
              />
              <div className="player-controls">
                <button 
                  onClick={toggleRepeat} 
                  className={`control-button ${isRepeating ? 'active' : ''}`}
                  title="Phím tắt: R"
                >
                  {isRepeating ? "Tắt lặp lại" : "Bật lặp lại"} 
                </button>
                <button 
                  onClick={toggleAutoScroll} 
                  className={`control-button ${autoScroll ? 'active' : ''}`}
                  title="Phím tắt: S"
                >
                  {autoScroll ? "Tắt tự động cuộn" : "Bật tự động cuộn"}
                </button>
              </div>
              {isRepeating && repeatSegment && (
                <div className="repeat-info">
                  Đang lặp lại: "{repeatSegment[selectedLanguages.primary]}"
                </div>
              )}
            </div>
          ) : (
            <div className="placeholder-message">
              Chưa có phụ đề hoặc URL video chưa được nhập
            </div>
          )}
          
        </div>

        <div className="captions-section">
          
          <div className="language-controls">
            <h2 className="caption-title">Phụ đề</h2>
            {captions.length > 0 && (
              <>
                <div className="language-selector">
                  <label>Ngôn ngữ chính:</label>
                  <select 
                    value={selectedLanguages.primary}
                    onChange={(e) => toggleLanguage('primary', e.target.value)}
                  >
                    {availableLanguages.map(lang => (
                      <option key={`primary-${lang}`} value={lang}>
                        {lang.charAt(0).toUpperCase() + lang.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="language-selector">
                  <label>Ngôn ngữ phụ:</label>
                  <select 
                    value={selectedLanguages.secondary}
                    onChange={(e) => toggleLanguage('secondary', e.target.value)}
                  >
                    {availableLanguages.map(lang => (
                      <option key={`secondary-${lang}`} value={lang}>
                        {lang.charAt(0).toUpperCase() + lang.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
          
          {isLoading ? (
            <div className="loading-indicator">
              <p>Đang tải phụ đề, vui lòng đợi...</p>
            </div>
          ) : error ? (
            <div className="error-message">
              <p>{error}</p>
            </div>
          ) : captions.length === 0 ? (
            <div className="placeholder-message">
              <p>
                Nhập URL video YouTube và nhấn "Lấy phụ đề" để bắt đầu
              </p>
            </div>
          ) : (
            <Element 
              id="captions-container" 
              className="captions-container" 
              name="captions-container"
              ref={captionsContainerRef}
            >
              {captions.map((caption, index) => (
                <Element
                  key={index}
                  name={`caption-${index}`}
                  className={`caption ${index === currentCaptionIndex ? "active" : ""}`}
                  onClick={() => handleCaptionClick(caption, index)}
                >
                  <p className="caption-primary">{caption[selectedLanguages.primary]}</p>
                  <p className="caption-secondary">{caption[selectedLanguages.secondary]}</p>
                </Element>
              ))}
            </Element>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;