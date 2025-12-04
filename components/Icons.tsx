import React from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Sun,
  Wind,
  Moon,
  Sunrise,
  Sunset,
  Volume2,
  VolumeX,
  Droplets,
  Thermometer,
  Eye,
  Gauge,
  Activity,
  Umbrella,
  Clock,
  Waves,
  RefreshCw,
  Zap
} from 'lucide-react';

interface WeatherIconProps {
  code: string; // OpenWeatherMap icon code (e.g., '01d', '04n')
  className?: string;
}

export const WeatherIcon: React.FC<WeatherIconProps> = ({ code, className = "w-6 h-6" }) => {
  // OWM codes: https://openweathermap.org/weather-conditions
  // d = day, n = night

  const getIcon = () => {
    switch (code) {
      case '01d': return <Sun className={`${className} text-yellow-400`} />;
      case '01n': return <Moon className={`${className} text-slate-300`} />;
      case '02d': 
      case '02n':
        return <Cloud className={`${className} text-gray-400`} />; // Few clouds
      case '03d':
      case '03n':
        return <Cloud className={`${className} text-gray-500`} />; // Scattered clouds
      case '04d':
      case '04n':
        return <Cloud className={`${className} text-gray-600`} />; // Broken clouds
      case '09d':
      case '09n':
        return <CloudDrizzle className={`${className} text-blue-400`} />; // Shower rain
      case '10d':
      case '10n':
        return <CloudRain className={`${className} text-blue-500`} />; // Rain
      case '11d':
      case '11n':
        return <CloudLightning className={`${className} text-yellow-600`} />; // Thunderstorm
      case '13d':
      case '13n':
        return <CloudSnow className={`${className} text-white`} />; // Snow
      case '50d':
      case '50n':
        return <CloudFog className={`${className} text-gray-300`} />; // Mist
      default:
        return <Sun className={`${className} text-yellow-400`} />;
    }
  };

  return getIcon();
};

export { 
  Sunrise, Sunset, Volume2, VolumeX, 
  Droplets, Thermometer, Eye, Gauge, Activity, Umbrella, Clock, Waves,
  RefreshCw, Zap
};