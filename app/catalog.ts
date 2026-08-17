export type CatalogGarment = {
  key: string;
  name: string;
  category: "上衣" | "下装" | "外套" | "鞋子";
  color: string;
  colorName: string;
  meta: string;
  warmth: number;
  styleTags: string[];
  sceneTags: string[];
  weatherTags: string[];
};

export const virtualCatalog: CatalogGarment[] = [
  { key: "oat-knit", name: "燕麦色针织衫", category: "上衣", color: "#d9c8ad", colorName: "燕麦色", meta: "柔软 · 15—22℃", warmth: 3, styleTags: ["简约通勤", "温柔松弛"], sceneTags: ["上班", "约会", "休闲"], weatherTags: ["常规"] },
  { key: "blue-shirt", name: "浅蓝条纹衬衫", category: "上衣", color: "#b8cbd4", colorName: "浅蓝", meta: "通勤 · 春秋", warmth: 2, styleTags: ["简约通勤", "清爽休闲"], sceneTags: ["上班", "约会", "休闲"], weatherTags: ["常规"] },
  { key: "white-tee", name: "米白基础 T 恤", category: "上衣", color: "#eeeae2", colorName: "米白", meta: "轻薄 · 百搭", warmth: 1, styleTags: ["清爽休闲", "街头感"], sceneTags: ["休闲", "运动"], weatherTags: ["炎热", "常规"] },
  { key: "black-knit", name: "黑色修身针织", category: "上衣", color: "#343432", colorName: "黑色", meta: "利落 · 叠穿", warmth: 2, styleTags: ["简约通勤", "法式复古"], sceneTags: ["上班", "约会"], weatherTags: ["常规"] },
  { key: "cream-coat", name: "奶油白风衣", category: "外套", color: "#e7ddca", colorName: "奶油白", meta: "防风 · 小雨", warmth: 3, styleTags: ["简约通勤", "法式复古"], sceneTags: ["上班", "约会", "休闲"], weatherTags: ["小雨", "大风"] },
  { key: "gray-blazer", name: "灰色轻薄西装", category: "外套", color: "#858681", colorName: "灰色", meta: "轻通勤 · 不严肃", warmth: 2, styleTags: ["简约通勤", "清爽休闲"], sceneTags: ["上班", "约会"], weatherTags: ["常规"] },
  { key: "gray-trouser", name: "深灰直筒裤", category: "下装", color: "#595b5c", colorName: "深灰", meta: "利落 · 通勤", warmth: 2, styleTags: ["简约通勤"], sceneTags: ["上班", "约会", "休闲"], weatherTags: ["小雨", "常规"] },
  { key: "blue-jeans", name: "蓝色直筒牛仔裤", category: "下装", color: "#66819b", colorName: "牛仔蓝", meta: "休闲 · 百搭", warmth: 2, styleTags: ["清爽休闲", "街头感"], sceneTags: ["休闲", "约会"], weatherTags: ["小雨", "常规"] },
  { key: "pink-skirt", name: "雾粉半身裙", category: "下装", color: "#d6aaa6", colorName: "雾粉", meta: "温柔 · 约会", warmth: 2, styleTags: ["温柔松弛", "法式复古"], sceneTags: ["约会", "休闲"], weatherTags: ["常规"] },
  { key: "black-loafer", name: "黑色乐福鞋", category: "鞋子", color: "#242321", colorName: "黑色", meta: "舒适 · 通勤", warmth: 1, styleTags: ["简约通勤", "法式复古"], sceneTags: ["上班", "约会"], weatherTags: ["小雨", "常规"] },
  { key: "white-sneaker", name: "白色运动鞋", category: "鞋子", color: "#eeeae2", colorName: "米白", meta: "轻便 · 日常", warmth: 1, styleTags: ["清爽休闲", "街头感"], sceneTags: ["休闲", "运动", "上班"], weatherTags: ["常规"] },
  { key: "brown-boot", name: "棕色短靴", category: "鞋子", color: "#745b48", colorName: "棕色", meta: "防滑 · 秋冬", warmth: 2, styleTags: ["法式复古", "简约通勤"], sceneTags: ["上班", "约会", "休闲"], weatherTags: ["小雨", "大风"] },
];

export const defaultCatalogKeys = ["oat-knit", "blue-shirt", "cream-coat", "gray-trouser", "blue-jeans", "black-loafer", "white-sneaker", "pink-skirt"];
