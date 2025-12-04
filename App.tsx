import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, MapPin, Sparkles, AlertCircle, CloudDrizzle, Mic, MicOff, Image as ImageIcon, Loader2, Sun } from 'lucide-react';
import { WeatherIcon, Volume2, VolumeX, Sunrise, Sunset, Droplets, Thermometer, Eye, Gauge, Activity, Umbrella, Clock, Waves, RefreshCw, Zap } from './components/Icons';
import { getCurrentWeather, getForecast } from './services/weatherService';
import { streamWeatherInsight, parseSearchQuery, generateWeatherScene } from './services/geminiService';
import { CurrentWeather, ForecastResponse, Unit, ForecastItem } from './types';

// --- Local Clock Component ---
const LocalClock: React.FC<{ timezoneOffset: number }> = ({ timezoneOffset }) => {
  const [time, setTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      // Create date with current UTC time
      const now = new Date();
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const cityTime = new Date(utc + (1000 * timezoneOffset));
      setTime(cityTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [timezoneOffset]);

  return <span className="font-mono text-xl md:text-2xl font-bold tracking-widest">{time}</span>;
};

const App: React.FC = () => {
  // Weather State
  const [city, setCity] = useState<string>('New Delhi');
  const [currentWeather, setCurrentWeather] = useState<CurrentWeather | null>(null);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [unit, setUnit] = useState<Unit>(Unit.CELSIUS);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // App State
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // AI State
  const [insight, setInsight] = useState<string>('');
  const [loadingInsight, setLoadingInsight] = useState<boolean>(false);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [loadingBg, setLoadingBg] = useState<boolean>(false);
  const [bgQuotaError, setBgQuotaError] = useState<boolean>(false);
  const [retryCountdown, setRetryCountdown] = useState<number>(0);
  const [userIntent, setUserIntent] = useState<string>('');

  // Voice & TTS State
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // Initialize Speech Recognition & Synthesis
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setSearchQuery(transcript);
        handleSearch(null, transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
    
    if ('speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  // Timer Effect for Quota Reset
  useEffect(() => {
    if (retryCountdown > 0) {
      const timer = setTimeout(() => {
        setRetryCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [retryCountdown]);

  const toggleVoiceSearch = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
      setSearchQuery('Listening...');
    }
  };

  const toggleTTS = () => {
    if (isSpeaking) {
      synthRef.current?.cancel();
      setIsSpeaking(false);
    } else if (insight) {
      const utterance = new SpeechSynthesisUtterance(insight);
      utterance.onend = () => setIsSpeaking(false);
      synthRef.current?.speak(utterance);
      setIsSpeaking(true);
    }
  };

  useEffect(() => {
    return () => {
      synthRef.current?.cancel();
    };
  }, []);

  const fetchData = useCallback(async (targetCity: string, intent?: string) => {
    setLoading(true);
    setError(null);
    setInsight('');
    setBgImage(null);
    setBgQuotaError(false);
    setRetryCountdown(0); // Reset timer on new valid search
    synthRef.current?.cancel();
    setIsSpeaking(false);
    
    try {
      const [weatherData, forecastData] = await Promise.all([
        getCurrentWeather(targetCity, '', unit),
        getForecast(targetCity, '', unit)
      ]);

      setCurrentWeather(weatherData);
      setForecast(forecastData);
      setCity(targetCity);

      // AI Operations (Non-blocking)
      setLoadingInsight(true);
      let accumulatedText = "";
      streamWeatherInsight(weatherData, unit, intent, (chunk) => {
        accumulatedText += chunk;
        setInsight(accumulatedText);
      }).finally(() => setLoadingInsight(false));

      setLoadingBg(true);
      generateWeatherScene(weatherData)
        .then((result) => {
            if (result.imageData) {
              setBgImage(result.imageData);
              setBgQuotaError(false);
            } else if (result.isQuotaError) {
              setBgQuotaError(true);
              setRetryCountdown(86400); // Start 24h countdown
            }
        })
        .catch(err => console.warn("Background generation skipped:", err))
        .finally(() => setLoadingBg(false));

    } catch (err: any) {
      setError(err.message || "Could not find weather data. Please try another city.");
      setCurrentWeather(null);
      setForecast(null);
    } finally {
      setLoading(false);
    }
  }, [unit]);

  const retryBackgroundGeneration = async () => {
    if (!currentWeather || retryCountdown > 0) return;
    
    setLoadingBg(true);
    // Keep quota error true until success or different error to prevent flickering
    
    try {
      const result = await generateWeatherScene(currentWeather);
      if (result.imageData) {
        setBgImage(result.imageData);
        setBgQuotaError(false);
        setRetryCountdown(0);
      } else if (result.isQuotaError) {
        setBgQuotaError(true);
        setRetryCountdown(86400); // Restart 24h countdown if it fails again
      }
    } catch (e) {
      console.error("Retry failed", e);
    } finally {
      setLoadingBg(false);
    }
  };

  useEffect(() => {
    fetchData('New Delhi');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  useEffect(() => {
    if (currentWeather) {
      fetchData(city);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit]);

  const handleSearch = async (e: React.FormEvent | null, manualQuery?: string) => {
    if (e) e.preventDefault();
    const query = manualQuery || searchQuery;
    if (!query.trim()) return;

    let targetCity = query;
    let intent = '';

    if (query.trim().split(' ').length > 2 || query.length > 20) {
       setLoading(true); 
       try {
         const parsed = await parseSearchQuery(query);
         targetCity = parsed.city;
         intent = parsed.intent || '';
         setUserIntent(intent);
       } catch (error) {
         console.warn("Parsing failed, using raw query");
       }
    } else {
        setUserIntent('');
    }

    await fetchData(targetCity, intent);
  };

  const getDailyForecast = (list: ForecastItem[]) => {
    return list.slice(0, 5);
  };

  const getBackgroundClass = (weatherCode?: string) => {
    if (!weatherCode) return "from-slate-900 to-slate-800";
    if (weatherCode.startsWith('01')) return "from-blue-400 to-blue-600";
    if (weatherCode.startsWith('02') || weatherCode.startsWith('03')) return "from-blue-300 to-blue-500";
    if (weatherCode.startsWith('09') || weatherCode.startsWith('10')) return "from-slate-600 to-slate-800";
    if (weatherCode.startsWith('11')) return "from-indigo-800 to-purple-900";
    if (weatherCode.startsWith('13')) return "from-blue-100 to-slate-300";
    return "from-slate-800 to-slate-900";
  };

  const formatTime = (timestamp: number) => {
    // Basic local time formatter for sunrise/set independent of timezone offset for now
    // Ideally we shift this too, but browser handles it okay usually
    return new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  const getAQIColor = (aqi: number) => {
      if (aqi <= 50) return "text-green-400";
      if (aqi <= 100) return "text-yellow-400";
      if (aqi <= 150) return "text-orange-400";
      return "text-red-500";
  };

  const getAQIDescription = (aqi: number) => {
      if (aqi <= 50) return "Good";
      if (aqi <= 100) return "Moderate";
      if (aqi <= 150) return "Unhealthy for Sensitive";
      return "Unhealthy";
  };

  const formatCountdown = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`min-h-screen relative flex flex-col items-center p-4 md:p-8 font-sans overflow-x-hidden transition-all duration-1000 bg-gradient-to-br ${getBackgroundClass(currentWeather?.weather[0]?.icon)}`}>
      
      {/* Generated Background Layer */}
      <div 
        className={`absolute inset-0 z-0 transition-opacity duration-1000 ${bgImage ? 'opacity-100' : 'opacity-0'}`}
        style={{ 
          backgroundImage: bgImage ? `url(${bgImage})` : 'none', 
          backgroundSize: 'cover', 
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 w-full max-w-7xl flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
        <div className="flex items-center gap-2">
           <div className="bg-white/20 p-2 rounded-lg backdrop-blur-md shadow-lg">
             <CloudDrizzle className="w-8 h-8 text-white" />
           </div>
           <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight drop-shadow-md">SkyCast AI</h1>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:flex-none w-full md:w-96">
            <form onSubmit={(e) => handleSearch(e)} className="relative w-full">
              <input
                type="text"
                placeholder="Search city..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-12 py-3 rounded-2xl bg-white/20 border border-white/20 text-white placeholder-white/70 backdrop-blur-md focus:outline-none focus:bg-white/30 focus:ring-2 focus:ring-white/40 transition-all shadow-lg"
              />
              <Search className="absolute left-3.5 top-3.5 w-5 h-5 text-white/70" />
            </form>
            <button 
              onClick={toggleVoiceSearch}
              className={`absolute right-2 top-2 p-1.5 rounded-xl transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-white/70 hover:bg-white/20'}`}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          </div>

          <button 
            onClick={() => setUnit(unit === Unit.CELSIUS ? Unit.FAHRENHEIT : Unit.CELSIUS)}
            className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/20 transition-all text-white font-bold shadow-lg"
          >
            {unit === Unit.CELSIUS ? '°C' : '°F'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 w-full max-w-7xl flex flex-col gap-6">
        
        {error && (
          <div className="w-full bg-red-500/80 backdrop-blur-md text-white p-4 rounded-2xl flex items-center gap-3 animate-bounce shadow-lg border border-red-400/30">
            <AlertCircle className="w-6 h-6" />
            <p>{error}</p>
          </div>
        )}

        {loading ? (
          <div className="w-full h-96 flex flex-col items-center justify-center gap-6 text-white">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <CloudDrizzle className="w-8 h-8 opacity-50 animate-pulse" />
              </div>
            </div>
            <p className="text-xl font-light tracking-wide animate-pulse">Scanning atmospheric data...</p>
          </div>
        ) : currentWeather ? (
          <>
            {/* Top Bento Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
              
              {/* 1. Main Weather Card (Large) */}
              <div className="md:col-span-2 lg:col-span-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-[2rem] p-8 text-white shadow-2xl relative overflow-hidden group">
                <div className="relative z-10 flex flex-col justify-between h-full">
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col space-y-2">
                      <div className="flex items-center gap-2 px-3 py-1 bg-black/20 rounded-full text-white/90 text-sm backdrop-blur-sm w-fit">
                        <MapPin className="w-4 h-4" />
                        <span className="font-medium tracking-wide">{currentWeather.name}, {currentWeather.sys.country}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                         <Clock className="w-4 h-4 text-white/70" />
                         <LocalClock timezoneOffset={currentWeather.timezone} />
                      </div>
                    </div>
                    <div className="p-4 bg-white/10 rounded-full backdrop-blur-md">
                        <WeatherIcon code={currentWeather.weather[0].icon} className="w-16 h-16" />
                    </div>
                  </div>
                  
                  <div className="mt-8">
                    <div className="text-[6rem] md:text-[7rem] leading-none font-bold tracking-tighter drop-shadow-2xl">
                      {Math.round(currentWeather.main.temp)}°
                    </div>
                    <div className="text-2xl font-light capitalize text-white/90 mt-2">
                       {currentWeather.weather[0].description}
                    </div>
                    <div className="flex items-center gap-4 mt-4 text-white/70">
                       <span>H: {Math.round(currentWeather.main.temp_max)}°</span>
                       <span>L: {Math.round(currentWeather.main.temp_min)}°</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. AI Insight Card (Medium) */}
              <div className="md:col-span-1 lg:col-span-2 bg-gradient-to-br from-indigo-900/60 to-purple-900/60 backdrop-blur-xl border border-white/20 rounded-[2rem] p-8 text-white shadow-2xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-yellow-300" />
                      <h3 className="text-lg font-bold">Smart Analysis</h3>
                    </div>
                    <button onClick={toggleTTS} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                       {isSpeaking ? <VolumeX className="w-4 h-4 text-red-300" /> : <Volume2 className="w-4 h-4 text-white/70" />}
                    </button>
                  </div>
                  <div className="min-h-[100px] text-base font-light leading-relaxed text-white/90">
                    {loadingInsight && !insight ? (
                       <p className="animate-pulse opacity-70">Analyzing atmosphere...</p>
                    ) : (
                       <p>{insight}</p>
                    )}
                  </div>
                </div>
                
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5">
                    <div className="flex items-center gap-2 text-xs text-white/40">
                      <ImageIcon className="w-3 h-3" />
                      <span>
                        {loadingBg ? 'Rendering scene...' : bgImage ? 'Live scene generated' : bgQuotaError ? 'Standard atmosphere (Quota)' : 'Standard atmosphere'}
                      </span>
                    </div>

                    {bgQuotaError && (
                      <>
                        {retryCountdown > 0 ? (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/20 text-red-200 text-xs font-medium border border-red-500/30 transition-all">
                                <Clock className="w-3 h-3 animate-pulse" />
                                <span>Resets in {formatCountdown(retryCountdown)}</span>
                            </div>
                        ) : (
                            <button 
                                onClick={retryBackgroundGeneration}
                                disabled={loadingBg}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/20 hover:bg-amber-500/40 text-amber-200 text-xs font-medium transition-all border border-amber-500/30 cursor-pointer"
                            >
                                <Zap className="w-3 h-3" />
                                {loadingBg ? 'Checking...' : 'Check Quota / Retry'}
                                {!loadingBg && <RefreshCw className="w-3 h-3 ml-1" />}
                            </button>
                        )}
                      </>
                    )}
                </div>
              </div>

              {/* 3. Detailed Metrics Grid (Small Cards) */}
              {/* AQI */}
              <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-6 flex flex-col justify-between hover:bg-white/10 transition-colors">
                 <div className="flex items-center gap-2 text-white/60 mb-2">
                    <Activity className="w-5 h-5" />
                    <span className="text-sm font-bold uppercase">Air Quality</span>
                 </div>
                 <div className="flex flex-col">
                    <span className={`text-3xl font-bold ${currentWeather.aqi ? getAQIColor(currentWeather.aqi.us_aqi) : 'text-white'}`}>
                        {currentWeather.aqi?.us_aqi || 'N/A'}
                    </span>
                    <span className="text-xs text-white/60">{currentWeather.aqi ? getAQIDescription(currentWeather.aqi.us_aqi) : ''}</span>
                 </div>
                 {currentWeather.aqi && (
                    <div className="mt-2 text-xs text-white/40">
                       PM2.5: {currentWeather.aqi.pm2_5}
                    </div>
                 )}
              </div>

               {/* Wind */}
               <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-6 flex flex-col justify-between hover:bg-white/10 transition-colors">
                 <div className="flex items-center gap-2 text-white/60 mb-2">
                    <Waves className="w-5 h-5" />
                    <span className="text-sm font-bold uppercase">Wind</span>
                 </div>
                 <div className="flex flex-col">
                    <span className="text-3xl font-bold text-white">{Math.round(currentWeather.wind.speed)} <span className="text-lg font-normal text-white/50">m/s</span></span>
                    <span className="text-xs text-white/60">Direction: {currentWeather.wind.deg}°</span>
                 </div>
              </div>

              {/* Humidity */}
              <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-6 flex flex-col justify-between hover:bg-white/10 transition-colors">
                 <div className="flex items-center gap-2 text-white/60 mb-2">
                    <Droplets className="w-5 h-5" />
                    <span className="text-sm font-bold uppercase">Humidity</span>
                 </div>
                 <span className="text-3xl font-bold text-white">{currentWeather.main.humidity}%</span>
                 <div className="text-xs text-white/60">Dew Point: {Math.round(currentWeather.dew_point)}°</div>
              </div>

              {/* UV Index */}
              <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-6 flex flex-col justify-between hover:bg-white/10 transition-colors">
                 <div className="flex items-center gap-2 text-white/60 mb-2">
                    <Sun className="w-5 h-5" />
                    <span className="text-sm font-bold uppercase">UV Index</span>
                 </div>
                 <span className="text-3xl font-bold text-white">{currentWeather.uv_index?.toFixed(1) || 'N/A'}</span>
                 <div className="text-xs text-white/60">
                    {currentWeather.uv_index > 8 ? 'Very High' : currentWeather.uv_index > 5 ? 'High' : 'Moderate'}
                 </div>
              </div>

               {/* Visibility */}
               <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-6 flex flex-col justify-between hover:bg-white/10 transition-colors">
                 <div className="flex items-center gap-2 text-white/60 mb-2">
                    <Eye className="w-5 h-5" />
                    <span className="text-sm font-bold uppercase">Visibility</span>
                 </div>
                 <span className="text-3xl font-bold text-white">{(currentWeather.visibility / 1000).toFixed(1)} <span className="text-lg font-normal text-white/50">km</span></span>
              </div>

               {/* Pressure */}
               <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-6 flex flex-col justify-between hover:bg-white/10 transition-colors">
                 <div className="flex items-center gap-2 text-white/60 mb-2">
                    <Gauge className="w-5 h-5" />
                    <span className="text-sm font-bold uppercase">Pressure</span>
                 </div>
                 <span className="text-3xl font-bold text-white">{Math.round(currentWeather.main.pressure)} <span className="text-lg font-normal text-white/50">hPa</span></span>
              </div>
            </div>

            {/* Hourly & Sun Times Section */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mt-2">
                {/* Hourly Slider */}
                <div className="lg:col-span-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-[2rem] p-6 overflow-hidden">
                    <h4 className="text-sm font-bold text-white/70 uppercase tracking-wider mb-4 px-2">24-Hour Forecast</h4>
                    <div className="flex overflow-x-auto pb-4 gap-4 no-scrollbar cursor-grab active:cursor-grabbing">
                        {forecast?.hourly?.map((item, i) => (
                           <div key={i} className="flex-none flex flex-col items-center gap-2 min-w-[70px] p-3 rounded-xl hover:bg-white/5 transition-colors group">
                              <span className="text-xs text-white/60">{new Date(item.dt * 1000).getHours()}:00</span>
                              <WeatherIcon code={item.weather[0].icon} className="w-6 h-6 group-hover:scale-110 transition-transform" />
                              <span className="font-bold text-lg">{Math.round(item.temp)}°</span>
                              {item.pop !== undefined && item.pop > 0 && (
                                <span className="text-[10px] text-blue-300 flex items-center"><Umbrella className="w-2 h-2 mr-1"/> {item.pop}%</span>
                              )}
                           </div>
                        ))}
                    </div>
                </div>

                {/* Sun Times */}
                <div className="lg:col-span-1 bg-white/5 backdrop-blur-md border border-white/10 rounded-[2rem] p-6 flex flex-col justify-center gap-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                           <Sunrise className="w-8 h-8 text-orange-300" />
                           <div className="flex flex-col">
                              <span className="text-xs text-white/50 uppercase">Sunrise</span>
                              <span className="text-xl font-bold">{formatTime(currentWeather.sys.sunrise)}</span>
                           </div>
                        </div>
                    </div>
                    <div className="w-full h-px bg-white/10"></div>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                           <Sunset className="w-8 h-8 text-purple-300" />
                           <div className="flex flex-col">
                              <span className="text-xs text-white/50 uppercase">Sunset</span>
                              <span className="text-xl font-bold">{formatTime(currentWeather.sys.sunset)}</span>
                           </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 5-Day Forecast Row */}
            <div className="mt-4">
              <h2 className="text-xl font-bold text-white mb-4 px-2 flex items-center gap-3 opacity-90">
                5-Day Outlook
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {forecast && getDailyForecast(forecast.list).map((item, idx) => (
                  <div 
                    key={item.dt} 
                    className="bg-white/5 hover:bg-white/15 backdrop-blur-md border border-white/10 rounded-3xl p-6 flex flex-col items-center justify-between gap-4 transition-all duration-300 transform hover:-translate-y-2 hover:shadow-xl group text-white"
                    style={{ animationDelay: `${idx * 100}ms` }}
                  >
                    <span className="text-sm font-semibold opacity-70 tracking-wider">
                      {new Date(item.dt * 1000).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
                    </span>
                    <div className="bg-white/10 p-3 rounded-full group-hover:scale-110 transition-transform duration-300 shadow-inner">
                      <WeatherIcon code={item.weather[0].icon} className="w-10 h-10" />
                    </div>
                    <div className="flex flex-col items-center w-full">
                       <span className="text-3xl font-bold">{Math.round(item.main.temp)}°</span>
                       <span className="text-xs opacity-60 capitalize text-center w-full truncate px-1 mt-1">{item.weather[0].description}</span>
                    </div>
                    <div className="w-full flex justify-between text-[10px] opacity-50 px-2 mt-2">
                       <span>Rain: {item.pop}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center mt-32 text-white/60 text-center animate-pulse">
             <CloudDrizzle className="w-24 h-24 opacity-20 mb-4" />
             <p className="text-xl">Waiting for sky data...</p>
          </div>
        )}
      </main>
      
      <footer className="relative z-10 mt-12 py-6 text-white/30 text-sm font-light text-center w-full">
        SkyCast AI &copy; {new Date().getFullYear()} • Powered by Gemini, Open-Meteo & React
      </footer>
    </div>
  );
};

export default App;