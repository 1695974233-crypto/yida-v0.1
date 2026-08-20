export type KnownWeatherCity = { name: string; latitude: number; longitude: number };

const knownCities: Record<string, KnownWeatherCity> = {
  北京: { name: "北京", latitude: 39.9, longitude: 116.41 },
  上海: { name: "上海", latitude: 31.23, longitude: 121.47 },
  天津: { name: "天津", latitude: 39.09, longitude: 117.2 },
  重庆: { name: "重庆", latitude: 29.56, longitude: 106.55 },
  广州: { name: "广州", latitude: 23.13, longitude: 113.26 },
  深圳: { name: "深圳", latitude: 22.54, longitude: 114.06 },
  杭州: { name: "杭州", latitude: 30.27, longitude: 120.16 },
  南京: { name: "南京", latitude: 32.06, longitude: 118.8 },
  苏州: { name: "苏州", latitude: 31.3, longitude: 120.58 },
  成都: { name: "成都", latitude: 30.57, longitude: 104.07 },
  武汉: { name: "武汉", latitude: 30.59, longitude: 114.3 },
  西安: { name: "西安", latitude: 34.34, longitude: 108.94 },
  长沙: { name: "长沙", latitude: 28.23, longitude: 112.94 },
  郑州: { name: "郑州", latitude: 34.75, longitude: 113.62 },
  济南: { name: "济南", latitude: 36.67, longitude: 116.98 },
  青岛: { name: "青岛", latitude: 36.07, longitude: 120.38 },
  沈阳: { name: "沈阳", latitude: 41.8, longitude: 123.43 },
  大连: { name: "大连", latitude: 38.91, longitude: 121.61 },
  长春: { name: "长春", latitude: 43.82, longitude: 125.32 },
  哈尔滨: { name: "哈尔滨", latitude: 45.8, longitude: 126.53 },
  昆明: { name: "昆明", latitude: 25.04, longitude: 102.71 },
  贵阳: { name: "贵阳", latitude: 26.65, longitude: 106.63 },
  南宁: { name: "南宁", latitude: 22.82, longitude: 108.37 },
  海口: { name: "海口", latitude: 20.04, longitude: 110.2 },
  三亚: { name: "三亚", latitude: 18.25, longitude: 109.51 },
  福州: { name: "福州", latitude: 26.07, longitude: 119.3 },
  厦门: { name: "厦门", latitude: 24.48, longitude: 118.09 },
  南昌: { name: "南昌", latitude: 28.68, longitude: 115.86 },
  合肥: { name: "合肥", latitude: 31.82, longitude: 117.23 },
  石家庄: { name: "石家庄", latitude: 38.04, longitude: 114.51 },
  太原: { name: "太原", latitude: 37.87, longitude: 112.55 },
  呼和浩特: { name: "呼和浩特", latitude: 40.84, longitude: 111.75 },
  兰州: { name: "兰州", latitude: 36.06, longitude: 103.83 },
  西宁: { name: "西宁", latitude: 36.62, longitude: 101.78 },
  银川: { name: "银川", latitude: 38.49, longitude: 106.23 },
  乌鲁木齐: { name: "乌鲁木齐", latitude: 43.83, longitude: 87.62 },
  拉萨: { name: "拉萨", latitude: 29.65, longitude: 91.14 },
  香港: { name: "香港", latitude: 22.32, longitude: 114.17 },
  澳门: { name: "澳门", latitude: 22.2, longitude: 113.54 },
  台北: { name: "台北", latitude: 25.03, longitude: 121.57 },
};

export function resolveKnownWeatherCity(value: string) {
  const normalized = value.trim().replace(/[\s市]+$/g, "");
  return knownCities[normalized] ?? null;
}
