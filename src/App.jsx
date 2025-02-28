import React, { useState, useRef, useEffect } from "react";
import YouTube from "react-youtube";
import { scroller, Element } from "react-scroll";
import "./App.css";

// const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
const BACKEND_URL = "http://localhost:8000";

const App = () => {
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
  
  const playerRef = useRef(null);
  const intervalRef = useRef(null);
  const isSeekingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const captionsContainerRef = useRef(null);
  const repeatSegmentIndexRef = useRef(-1);

  // Extract video ID from URL
  const extractVideoId = (url) => {
    if (!url) return "";
    
    // Regular expression to extract YouTube video ID
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    
    return (match && match[2].length === 11) ? match[2] : "";
  };

  // Process URL input
  const handleUrlChange = (e) => {
    const url = e.target.value;
    setVideoUrl(url);
    const id = extractVideoId(url);
    setVideoId(id);
  };

  // Fetch transcript from backend API
  const getTranscript = async () => {
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
      const response = await fetch(`${BACKEND_URL}/transcript`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: videoUrl }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
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

  // Update time more accurately
  const onReady = (event) => {
    playerRef.current = event.target;

    if (!intervalRef.current) {
      intervalRef.current = setInterval(() => {
        if (playerRef.current && !isSeekingRef.current) {
          const exactTime = playerRef.current.getCurrentTime();
          setCurrentTime(exactTime);
        }
      }, 100); // 100ms for smoother updates
    }
  };

  // Handle player state changes
  const onStateChange = (event) => {
    if (event.data === YouTube.PlayerState.PAUSED && isRepeating && repeatSegment) {
      // Check if user really wanted to pause the video
      setTimeout(() => {
        if (playerRef.current.getPlayerState() === YouTube.PlayerState.PAUSED) {
          setIsRepeating(false); // Turn off repeat mode if user paused the video
          repeatSegmentIndexRef.current = -1;
        } else {
          playerRef.current.seekTo(repeatSegment.start, true);
          playerRef.current.playVideo();
        }
      }, 300);
    }
  };
  
  // Scroll to the active caption, modified to respect repeating segment
  const scrollToActiveCaption = (index) => {
    // Only scroll when not in repeat mode or if in repeat mode, index matches repeatSegmentIndex
    if (index >= 0 && autoScroll && !userScrolling && 
        (!isRepeating || (isRepeating && index === repeatSegmentIndexRef.current))) {
      
      // Clear any existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      scroller.scrollTo(`caption-${index}`, {
        duration: 500,
        delay: 0,
        smooth: 'easeInOutQuart',
        containerId: 'captions-container',
        offset: -80
      });
    }
  };

  // Update current caption based on playback time
  useEffect(() => {
    if (!captions.length || isSeekingRef.current) return;

    const index = captions.findIndex(
      (caption) =>
        currentTime >= caption.start &&
        currentTime < caption.start + caption.duration
    );

    // Update current caption only when not in repeat mode
    // Or if in repeat mode, only update when index matches repeatSegmentIndex
    if (index !== -1 && index !== currentCaptionIndex) {
      if (!isRepeating || (isRepeating && index === repeatSegmentIndexRef.current)) {
        setCurrentCaptionIndex(index);
        
        if (autoScroll && !userScrolling) {
          scrollToActiveCaption(index);
        }
      }
    }

    // Handle repeat functionality
    if (isRepeating && repeatSegment) {
      const repeatEnd = repeatSegment.start + repeatSegment.duration;
      if (currentTime >= repeatEnd) {
        playerRef.current.seekTo(repeatSegment.start, true);
      }
    }
  }, [currentTime, captions, currentCaptionIndex, isRepeating, repeatSegment, autoScroll, userScrolling]);

  // Handle user scrolling detection
  useEffect(() => {
    const container = document.getElementById('captions-container');
    if (!container) return;

    const handleScroll = () => {
      // Set user scrolling to true
      setUserScrolling(true);
      
      // Clear previous timeout if exists
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      // Reset user scrolling after a delay (2 seconds)
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

  // Handle caption click - seek to that time and enable repeating
  const handleCaptionClick = (caption, index) => {
    if (playerRef.current) {
      isSeekingRef.current = true;
      
      // Set repeating for this segment
      setIsRepeating(true);
      setRepeatSegment(caption);
      setCurrentCaptionIndex(index);
      repeatSegmentIndexRef.current = index; // Store the index of the repeating segment
      
      // Seek to the beginning of the segment with exact timing
      playerRef.current.seekTo(caption.start, true);
      playerRef.current.playVideo();
      
      // Scroll to the selected segment
      if (autoScroll) {
        scrollToActiveCaption(index);
      }
      
      setTimeout(() => {
        isSeekingRef.current = false;
      }, 300);
    }
  };

  // Format time for display (seconds to MM:SS.MS)
  const formatTime = (seconds) => {
    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const ms = Math.floor((seconds - totalSeconds) * 10); // Get 1 decimal place
    
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  // Toggle repeat mode
  const toggleRepeat = () => {
    if (!isRepeating && currentCaptionIndex !== -1) {
      setIsRepeating(true);
      setRepeatSegment(captions[currentCaptionIndex]);
      repeatSegmentIndexRef.current = currentCaptionIndex;
    } else {
      setIsRepeating(false);
      setRepeatSegment(null);
      repeatSegmentIndexRef.current = -1;
    }
  };

  // Toggle auto scroll
  const toggleAutoScroll = () => {
    setAutoScroll(!autoScroll);
  };

  // Cleanup intervals when component unmounts
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="container">
      <div className="input-section">
        <h1>Trình phát YouTube với phụ đề song ngữ</h1>
        <input
          type="text"
          value={videoUrl}
          onChange={handleUrlChange}
          placeholder="Nhập URL video YouTube"
          className="url-input"
        />
        <button 
          onClick={getTranscript} 
          disabled={isLoading || !videoId}
          className="submit-button"
        >
          {isLoading ? "Đang tải..." : "Lấy phụ đề"}
        </button>
      </div>

      <div className="content">
        {/* Luôn hiển thị video section, ẩn chỉ nội dung bên trong */}
        <div className="video-section">
          <h2>Video</h2>
          
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
                >
                  {isRepeating ? "Tắt lặp lại" : "Bật lặp lại"} 
                </button>
                <button 
                  onClick={toggleAutoScroll} 
                  className={`control-button ${autoScroll ? 'active' : ''}`}
                >
                  {autoScroll ? "Tắt tự động cuộn" : "Bật tự động cuộn"}
                </button>
              </div>
              {isRepeating && repeatSegment && (
                <div className="repeat-info">
                  Đang lặp lại: "{repeatSegment.english}"
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
          <h2>Phụ đề</h2>
          
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
                  <div className="caption-header">
                    <span className="caption-time">{formatTime(caption.start)}</span>
                  </div>
                  <p className="caption-english">{caption.english}</p>
                  <p className="caption-vietnamese">{caption.vietnamese}</p>
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