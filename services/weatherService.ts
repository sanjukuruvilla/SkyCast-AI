import axios from 'axios';
import { CurrentWeather, ForecastResponse, Unit, ForecastItem, HourlyItem } from '../types';

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const AQI_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

// Helper to map WMO codes to OWM-style icon codes that our UI expects
const getIconCode = (wmoCode: number, isDay: number): string => {
  const suffix = isDay ? 'd' : 'n';
  
  // WMO Code mapping
  if (wmoCode === 0) return `01${suffix}`;
  if (wmoCode === 1) return `02${suffix}`;
  if (wmoCode === 2) return `03${suffix}`;
  if (wmoCode === 3) return `04${suffix}`;
  if (wmoCode === 45 || wmoCode === 48) return `50${suffix}`;
  if (wmoCode >= 51 && wmoCode <= 57) return `09${suffix}`;
  if (wmoCode >= 61 && wmoCode <= 67) return `10${suffix}`;
  if (wmoCode >= 80 && wmoCode <= 82) return `09${suffix}`;
  if ((wmoCode >= 71 && wmoCode <= 77) || (wmoCode >= 85 && wmoCode <= 86)) return `13${suffix}`;
  if (wmoCode >= 95 && wmoCode <= 99) return `11${suffix}`;

  return `01${suffix}`;
};

const getDescription = (wmoCode: number): string => {
  const codes: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Depositing rime fog',
    51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
    56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
    61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
    66: 'Light freezing rain', 67: 'Heavy freezing rain',
    71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
    85: 'Slight snow showers', 86: 'Heavy snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail'
  };
  return codes[wmoCode] || 'Unknown';
};

// OpenMeteo Geocoding
const getCoordinates = async (city: string) => {
  const response = await axios.get(GEO_URL, {
    params: {
      name: city,
      count: 1,
      language: 'en',
      format: 'json'
    }
  });
  
  if (!response.data.results || response.data.results.length === 0) {
    throw new Error(`City '${city}' not found.`);
  }
  
  return response.data.results[0];
};

export const getCurrentWeather = async (
  city: string, 
  _apiKey: string, 
  unit: Unit
): Promise<CurrentWeather> => {
  try {
    const location = await getCoordinates(city);
    const { latitude, longitude, name, country } = location;

    // Parallel fetch: Weather + Air Quality
    const [weatherResponse, aqiResponse] = await Promise.all([
      axios.get(WEATHER_URL, {
        params: {
          latitude,
          longitude,
          current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,surface_pressure,dew_point_2m',
          daily: 'sunrise,sunset,uv_index_max',
          temperature_unit: unit === Unit.FAHRENHEIT ? 'fahrenheit' : 'celsius',
          wind_speed_unit: 'ms',
          timezone: 'auto'
        }
      }),
      axios.get(AQI_URL, {
        params: {
          latitude,
          longitude,
          current: 'us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone',
          timezone: 'auto'
        }
      })
    ]);

    const current = weatherResponse.data.current;
    const daily = weatherResponse.data.daily;
    const aqi = aqiResponse.data.current;
    const todayIndex = 0;

    return {
      coord: { lon: longitude, lat: latitude },
      weather: [{
        id: current.weather_code,
        main: getDescription(current.weather_code),
        description: getDescription(current.weather_code),
        icon: getIconCode(current.weather_code, current.is_day)
      }],
      base: 'stations',
      main: {
        temp: current.temperature_2m,
        feels_like: current.apparent_temperature,
        temp_min: current.temperature_2m, 
        temp_max: current.temperature_2m,
        pressure: current.surface_pressure,
        humidity: current.relative_humidity_2m
      },
      visibility: 10000, // OpenMeteo simplifies visibility in basic plan, defaulting for now or using custom logic
      wind: {
        speed: current.wind_speed_10m,
        deg: current.wind_direction_10m
      },
      clouds: { all: current.cloud_cover },
      dt: current.time,
      sys: {
        type: 1,
        id: 0,
        country: country || 'XX',
        sunrise: new Date(daily.sunrise[todayIndex]).getTime() / 1000,
        sunset: new Date(daily.sunset[todayIndex]).getTime() / 1000
      },
      // Extended fields
      uv_index: daily.uv_index_max[todayIndex],
      precipitation: current.precipitation,
      dew_point: current.dew_point_2m,
      aqi: {
        us_aqi: aqi.us_aqi,
        pm2_5: aqi.pm2_5,
        pm10: aqi.pm10,
        co: aqi.carbon_monoxide,
        no2: aqi.nitrogen_dioxide,
        so2: aqi.sulphur_dioxide,
        o3: aqi.ozone
      },
      timezone: weatherResponse.data.utc_offset_seconds,
      id: location.id,
      name: name,
      cod: 200
    };

  } catch (error: any) {
    console.error("Weather fetch error:", error);
    throw new Error(error.message || 'Failed to fetch weather data');
  }
};

export const getForecast = async (
  city: string, 
  _apiKey: string, 
  unit: Unit
): Promise<ForecastResponse> => {
  try {
    const location = await getCoordinates(city);
    const { latitude, longitude, name, country } = location;

    const response = await axios.get(WEATHER_URL, {
      params: {
        latitude,
        longitude,
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max',
        hourly: 'temperature_2m,weather_code,is_day,precipitation_probability', 
        temperature_unit: unit === Unit.FAHRENHEIT ? 'fahrenheit' : 'celsius',
        wind_speed_unit: 'ms',
        timezone: 'auto'
      }
    });

    const daily = response.data.daily;
    const hourly = response.data.hourly;
    const list: ForecastItem[] = [];
    const hourlyList: HourlyItem[] = [];

    // Map daily arrays to ForecastItem list (5 days)
    for (let i = 0; i < Math.min(daily.time.length, 5); i++) {
       const dateObj = new Date(daily.time[i]);
       const unixTime = Math.floor(dateObj.getTime() / 1000) + 43200; // noon

       list.push({
         dt: unixTime,
         main: {
           temp: (daily.temperature_2m_max[i] + daily.temperature_2m_min[i]) / 2, 
           feels_like: daily.temperature_2m_max[i],
           temp_min: daily.temperature_2m_min[i],
           temp_max: daily.temperature_2m_max[i],
           pressure: 1013,
           sea_level: 1013,
           grnd_level: 1013,
           humidity: 50, 
           temp_kf: 0
         },
         weather: [{
           id: daily.weather_code[i],
           main: getDescription(daily.weather_code[i]),
           description: getDescription(daily.weather_code[i]),
           icon: getIconCode(daily.weather_code[i], 1)
         }],
         clouds: { all: 0 },
         wind: { speed: 0, deg: 0, gust: 0 },
         visibility: 10000,
         pop: daily.precipitation_probability_max?.[i] || 0,
         dt_txt: `${daily.time[i]} 12:00:00`
       });
    }

    // Map hourly data (next 24 hours)
    const now = new Date();
    const currentHourStr = now.toISOString().slice(0, 13);
    
    const foundIndex = hourly.time.findIndex((t: string) => t.startsWith(currentHourStr));
    let startIndex = foundIndex !== -1 ? foundIndex : 0;

    for (let i = startIndex; i < startIndex + 24 && i < hourly.time.length; i++) {
        hourlyList.push({
            dt: new Date(hourly.time[i]).getTime() / 1000,
            temp: hourly.temperature_2m[i],
            weather: [{
                id: hourly.weather_code[i],
                main: getDescription(hourly.weather_code[i]),
                description: '',
                icon: getIconCode(hourly.weather_code[i], hourly.is_day[i])
            }],
            pop: hourly.precipitation_probability?.[i]
        });
    }

    return {
      cod: "200",
      message: 0,
      cnt: list.length,
      list: list,
      hourly: hourlyList,
      city: {
        id: location.id,
        name: name,
        coord: { lat: latitude, lon: longitude },
        country: country,
        population: 0,
        timezone: response.data.utc_offset_seconds,
        sunrise: 0,
        sunset: 0
      }
    };

  } catch (error: any) {
    throw new Error(error.message || 'Failed to fetch forecast data');
  }
};

export const getIconUrl = (iconCode: string) => 
  `https://openweathermap.org/img/wn/${iconCode}@2x.png`;