export type CatalogGarment = {
  key: string;
  image: string;
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
  { key: "oat-knit", image: "/demo-wardrobe/15.jpg", name: "字母印花连帽卫衣", category: "上衣", color: "#eee9dc", colorName: "浅麻白色", meta: "棉针织 · 偏凉天气", warmth: 3, styleTags: ["清爽休闲", "街头感"], sceneTags: ["休闲", "运动", "上班", "上课"], weatherTags: ["偏凉", "常规"] },
  { key: "blue-shirt", image: "/demo-wardrobe/07.jpg", name: "樱桃小丸子印花短袖 T 恤", category: "上衣", color: "#f2f1ed", colorName: "白色", meta: "纯棉 · 炎热天气", warmth: 1, styleTags: ["清爽休闲", "街头感"], sceneTags: ["上课", "约会", "逛街", "休闲", "旅行"], weatherTags: ["炎热", "常规"] },
  { key: "white-tee", image: "/demo-wardrobe/05.jpg", name: "卡通印花短袖 T 恤", category: "上衣", color: "#292927", colorName: "黑色", meta: "纯棉 · 日常休闲", warmth: 1, styleTags: ["清爽休闲", "街头感"], sceneTags: ["逛街", "约会", "休闲", "上课", "旅行"], weatherTags: ["炎热", "常规"] },
  { key: "black-knit", image: "/demo-wardrobe/02.jpg", name: "基础 Logo 印花长袖 T 恤", category: "上衣", color: "#f2f1ed", colorName: "白色", meta: "纯棉 · 春秋", warmth: 2, styleTags: ["简约通勤", "清爽休闲"], sceneTags: ["上课", "逛街", "休闲", "上班", "旅行"], weatherTags: ["常规", "偏凉"] },
  { key: "cream-coat", image: "/demo-wardrobe/01.jpg", name: "连帽工装夹克", category: "外套", color: "#77717a", colorName: "紫灰色", meta: "工装 · 日常防风", warmth: 3, styleTags: ["清爽休闲", "街头感"], sceneTags: ["休闲", "逛街", "户外", "旅行", "聚会"], weatherTags: ["常规", "偏凉", "小雨"] },
  { key: "gray-blazer", image: "/demo-wardrobe/06.jpg", name: "毛绒翻领刺绣夹克", category: "外套", color: "#355b92", colorName: "宝蓝色", meta: "棉斜纹 · 保暖", warmth: 4, styleTags: ["街头感", "法式复古"], sceneTags: ["约会", "聚会", "逛街", "休闲", "旅行"], weatherTags: ["寒冷", "偏凉"] },
  { key: "gray-trouser", image: "/demo-wardrobe/09.jpg", name: "做旧工装牛仔裤", category: "下装", color: "#9bb6c5", colorName: "浅水洗蓝", meta: "牛仔布 · 水洗渐变", warmth: 2, styleTags: ["街头感", "法式复古"], sceneTags: ["逛街", "休闲", "运动", "上课", "旅行"], weatherTags: ["常规", "偏凉"] },
  { key: "blue-jeans", image: "/demo-wardrobe/11.jpg", name: "棕色直筒牛仔裤", category: "下装", color: "#765747", colorName: "棕色", meta: "牛仔布 · 直筒", warmth: 2, styleTags: ["简约通勤", "法式复古"], sceneTags: ["逛街", "约会", "休闲", "上班", "上课"], weatherTags: ["常规", "偏凉"] },
  { key: "pink-skirt", image: "/demo-wardrobe/12.jpg", name: "徽章装饰休闲短裤", category: "下装", color: "#292927", colorName: "黑色", meta: "纯棉 · 炎热天气", warmth: 1, styleTags: ["清爽休闲", "街头感"], sceneTags: ["逛街", "休闲", "运动", "上课", "旅行"], weatherTags: ["炎热", "常规"] },
  { key: "black-loafer", image: "/demo-wardrobe/04.jpg", name: "棕色休闲板鞋", category: "鞋子", color: "#70574a", colorName: "棕色", meta: "反绒皮革 · 拼接", warmth: 2, styleTags: ["清爽休闲", "法式复古"], sceneTags: ["上课", "约会", "逛街", "休闲", "旅行"], weatherTags: ["常规"] },
  { key: "white-sneaker", image: "/demo-wardrobe/14.jpg", name: "绿白拼色低帮板鞋", category: "鞋子", color: "#5e735e", colorName: "绿色", meta: "反绒皮 · 拼色", warmth: 2, styleTags: ["清爽休闲", "街头感"], sceneTags: ["逛街", "约会", "休闲", "上课", "旅行"], weatherTags: ["常规"] },
  { key: "brown-boot", image: "/demo-wardrobe/03.jpg", name: "棕色高帮帆布鞋", category: "鞋子", color: "#865942", colorName: "棕色", meta: "帆布 · 高帮", warmth: 2, styleTags: ["清爽休闲", "街头感"], sceneTags: ["上课", "约会", "逛街", "休闲", "旅行"], weatherTags: ["常规"] },
  { key: "cargo-pants", image: "/demo-wardrobe/08.jpg", name: "侧拉链束脚工装裤", category: "下装", color: "#65705a", colorName: "军绿色", meta: "工装 · 束脚", warmth: 2, styleTags: ["街头感", "清爽休闲"], sceneTags: ["休闲", "逛街", "运动", "户外"], weatherTags: ["常规", "偏凉"] },
  { key: "track-jacket", image: "/demo-wardrobe/10.jpg", name: "串标立领运动外套", category: "外套", color: "#292927", colorName: "黑色", meta: "针织 · 运动休闲", warmth: 3, styleTags: ["清爽休闲", "街头感"], sceneTags: ["休闲", "运动", "逛街", "上课", "旅行"], weatherTags: ["常规", "偏凉", "小雨"] },
  { key: "brown-lowtop", image: "/demo-wardrobe/13.jpg", name: "棕白拼色低帮板鞋", category: "鞋子", color: "#70574a", colorName: "棕色", meta: "反绒面革 · 拼接", warmth: 2, styleTags: ["清爽休闲", "法式复古"], sceneTags: ["上课", "约会", "逛街", "休闲", "旅行"], weatherTags: ["常规"] },
  { key: "gradient-hoodie", image: "/demo-wardrobe/16.jpg", name: "渐变连帽卫衣", category: "上衣", color: "#756a70", colorName: "灰紫色", meta: "纯棉 · 渐变晕染", warmth: 3, styleTags: ["清爽休闲", "街头感"], sceneTags: ["休闲", "运动", "上班", "上课"], weatherTags: ["偏凉", "常规"] },
];

export const defaultCatalogKeys = virtualCatalog.map((item) => item.key);
