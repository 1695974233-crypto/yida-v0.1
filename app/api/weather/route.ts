export const dynamic = "force-dynamic";

import { resolveKnownWeatherCity } from "../../../lib/weather-cities";

type GeocodingResponse = {
  results?: Array<{ name: string; latitude: number; longitude: number; admin1?: string; country?: string }>;
};

type ForecastResponse = {
  current?: {
    temperature_2m: number;
    apparent_temperature: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
  };
};

function weatherDescription(code: number) {
  if (code === 0) return { condition: "晴", icon: "☀️" };
  if (code <= 3) return { condition: code === 1 ? "大致晴朗" : "多云", icon: "⛅" };
  if (code === 45 || code === 48) return { condition: "有雾", icon: "🌫️" };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { condition: "有雨", icon: "🌧️" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { condition: "有雪", icon: "🌨️" };
  if (code >= 95) return { condition: "雷雨", icon: "⛈️" };
  return { condition: "天气变化", icon: "🌤️" };
}

function validCoordinate(value: string | null, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const cityQuery = search.get("city")?.trim().slice(0, 40);
    let latitude = validCoordinate(search.get("latitude"), -90, 90);
    let longitude = validCoordinate(search.get("longitude"), -180, 180);
    let city = search.get("name")?.trim().slice(0, 40) || "当前位置";

    if (cityQuery) {
      const knownCity = resolveKnownWeatherCity(cityQuery);
      if (knownCity) {
        latitude = knownCity.latitude;
        longitude = knownCity.longitude;
        city = knownCity.name;
      } else {
        const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
        geoUrl.searchParams.set("name", cityQuery);
        geoUrl.searchParams.set("count", "1");
        geoUrl.searchParams.set("language", "zh");
        geoUrl.searchParams.set("format", "json");
        const geoResponse = await fetch(geoUrl, { signal: AbortSignal.timeout(10_000) });
        if (!geoResponse.ok) throw new Error("城市查询暂时不可用");
        const match = (await geoResponse.json() as GeocodingResponse).results?.[0];
        if (!match) return Response.json({ error: "没有找到这个城市，请换一个名称" }, { status: 404 });
        latitude = match.latitude;
        longitude = match.longitude;
        city = [match.name, match.admin1].filter(Boolean).join(" · ");
      }
    }

    if (latitude === null || longitude === null) {
      return Response.json({ error: "请提供当前位置或城市名称" }, { status: 400 });
    }

    latitude = Number(latitude.toFixed(2));
    longitude = Number(longitude.toFixed(2));
    const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
    weatherUrl.searchParams.set("latitude", String(latitude));
    weatherUrl.searchParams.set("longitude", String(longitude));
    weatherUrl.searchParams.set("current", "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m");
    weatherUrl.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum");
    weatherUrl.searchParams.set("forecast_days", "1");
    weatherUrl.searchParams.set("timezone", "auto");
    const weatherResponse = await fetch(weatherUrl, { signal: AbortSignal.timeout(12_000) });
    if (!weatherResponse.ok) throw new Error("天气服务暂时不可用");
    const forecast = await weatherResponse.json() as ForecastResponse;
    if (!forecast.current) throw new Error("天气数据暂时不完整");
    const description = weatherDescription(forecast.current.weather_code);

    return Response.json({
      city,
      latitude,
      longitude,
      temperature: Math.round(forecast.current.temperature_2m),
      apparentTemperature: Math.round(forecast.current.apparent_temperature),
      precipitation: Math.max(forecast.current.precipitation, forecast.daily?.precipitation_sum?.[0] ?? 0),
      windSpeed: Math.round(forecast.current.wind_speed_10m),
      weatherCode: forecast.current.weather_code,
      temperatureMax: Math.round(forecast.daily?.temperature_2m_max?.[0] ?? forecast.current.temperature_2m),
      temperatureMin: Math.round(forecast.daily?.temperature_2m_min?.[0] ?? forecast.current.temperature_2m),
      ...description,
    }, { headers: { "Cache-Control": "public, max-age=600" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "天气获取失败" }, { status: 502 });
  }
}
