import React, { useState, useRef, useEffect } from "react";
import YouTube from "react-youtube";
import { scroller, Element } from "react-scroll";
import "./App.css";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

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
  
  const playerRef = useRef(null);
  const intervalRef = useRef(null);
  const isSeekingRef = useRef(false);

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

  // When video is ready
  const onReady = (event) => {
    playerRef.current = event.target;

    if (!intervalRef.current) {
      intervalRef.current = setInterval(() => {
        if (playerRef.current && !isSeekingRef.current) {
          setCurrentTime(playerRef.current.getCurrentTime());
        }
      }, 500);
    }
  };

  // Handle player state changes
  const onStateChange = (event) => {
    if (event.data === YouTube.PlayerState.PAUSED && isRepeating && repeatSegment) {
      // Kiểm tra nếu người dùng thực sự muốn dừng video
      setTimeout(() => {
        if (playerRef.current.getPlayerState() === YouTube.PlayerState.PAUSED) {
          setIsRepeating(false); // Tắt chế độ lặp lại nếu người dùng dừng video
        } else {
          playerRef.current.seekTo(repeatSegment.start, true);
          playerRef.current.playVideo();
        }
      }, 500);
    }
  };
  

  // Scroll to the active caption
  const scrollToActiveCaption = (index) => {
    if (index >= 0) {
      scroller.scrollTo(`caption-${index}`, {
        duration: 800,
        delay: 0,
        smooth: 'easeInOutQuart',
        containerId: 'captions-container',
        offset: -100 // Offset to center the element in the container
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

    if (index !== -1 && index !== currentCaptionIndex) {
      setCurrentCaptionIndex(index);
      scrollToActiveCaption(index);
    }

    // Handle repeat functionality
    if (isRepeating && repeatSegment) {
      const repeatEnd = repeatSegment.start + repeatSegment.duration;
      if (currentTime >= repeatEnd) {
        playerRef.current.seekTo(repeatSegment.start, true);
      }
    }
  }, [currentTime, captions, currentCaptionIndex, isRepeating, repeatSegment]);

  // Handle caption click - seek to that time and enable repeating
  const handleCaptionClick = (caption, index) => {
    if (playerRef.current) {
      isSeekingRef.current = true;
      
      // Set repeating for this segment
      setIsRepeating(true);
      setRepeatSegment(caption);
      setCurrentCaptionIndex(index);
      
      // Seek to the beginning of the segment
      playerRef.current.seekTo(caption.start, true);
      playerRef.current.playVideo();
      
      setTimeout(() => {
        isSeekingRef.current = false;
      }, 500);
    }
  };

  // Toggle repeat mode
  const toggleRepeat = () => {
    setIsRepeating(!isRepeating);
    if (!isRepeating && currentCaptionIndex !== -1) {
      setRepeatSegment(captions[currentCaptionIndex]);
    } else {
      setRepeatSegment(null);
    }
  };

  // Cleanup intervals when component unmounts
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
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
        {videoId && (
          <div className="video-section">
            <h2>Video</h2>
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
            <div className="repeat-controls">
              <button 
                onClick={toggleRepeat} 
                className={`repeat-button ${isRepeating ? 'active' : ''}`}
              >
                {isRepeating ? "Tắt lặp lại" : "Bật lặp lại"} 
              </button>
              {isRepeating && repeatSegment && (
                <div className="repeat-info">
                  Đang lặp lại: "{repeatSegment.english}"
                </div>
              )}
            </div>
          </div>
        )}

        <div className="captions-section">
          <h2>Phụ đề</h2>
          
          {isLoading && (
            <div className="loading-indicator">
              <p>Đang tải phụ đề, vui lòng đợi...</p>
            </div>
          )}
          
          {error && (
            <div className="error-message">
              <p>{error}</p>
            </div>
          )}
          
          {!isLoading && !error && captions.length === 0 && (
            <p>Chưa có phụ đề hoặc URL video chưa được nhập</p>
          )}
          
          <Element 
            id="captions-container" 
            className="captions-container" 
            name="captions-container"
          >
            {captions.map((caption, index) => (
              <Element
                key={index}
                name={`caption-${index}`}
                className={`caption ${index === currentCaptionIndex ? "active" : ""}`}
                onClick={() => handleCaptionClick(caption, index)}
              >
                <p className="caption-english">{caption.english}</p>
                <p className="caption-vietnamese">{caption.vietnamese}</p>
              </Element>
            ))}
          </Element>
        </div>
      </div>
    </div>
  );
};

export default App; 